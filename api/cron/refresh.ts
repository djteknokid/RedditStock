import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';

export const maxDuration = 60;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SUBREDDITS = [
  'wallstreetbets', 'stocks', 'investing',
  'options', 'pennystocks', 'stockmarket',
  'Superstonk', 'valueinvesting', 'RobinHoodPennyStocks', 'dividends',
];

const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const SEVEN_DAYS_AGO = () => Math.floor(Date.now() / 1000) - 7 * 86400;

interface RawPost {
  id: string;
  title: string;
  selftext?: string;
  score: number;
  upvote_ratio: number;
  created_utc: number;
  subreddit: string;
}

async function fetchSubredditPosts(subreddit: string): Promise<RawPost[]> {
  const allPosts: RawPost[] = [];
  const after = SEVEN_DAYS_AGO();
  let beforeTs: number | null = null;

  for (let page = 0; page < 5; page++) {
    try {
      const params = new URLSearchParams({ subreddit, limit: '100', after: String(after) });
      if (beforeTs) params.set('before', String(beforeTs));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${ARCTIC_SHIFT}?${params}`, {
        headers: { 'User-Agent': 'buzzd.fyi/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) { console.error(`r/${subreddit} page ${page}: HTTP ${res.status}`); break; }
      const data = await res.json();
      const posts: RawPost[] = data.data ?? [];
      if (posts.length === 0) break;
      allPosts.push(...posts);
      beforeTs = posts[posts.length - 1].created_utc ?? null;
      if (!beforeTs || posts.length < 100) break;
    } catch (e) {
      console.error(`r/${subreddit} page ${page} error:`, String(e));
      break;
    }
  }

  console.log(`r/${subreddit}: ${allPosts.length} posts`);
  return allPosts;
}

function timeAgo(utc: number): string {
  const secs = Math.floor(Date.now() / 1000) - utc;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch posts from all subreddits in parallel
    console.log('Fetching Reddit posts (7-day window)...');
    const allPosts = (await Promise.all(SUBREDDITS.map(fetchSubredditPosts))).flat();
    console.log(`Total posts fetched: ${allPosts.length}`);

    if (allPosts.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: 0 });
    }

    // 2. Build a deduplicated list of post titles for GPT
    // Include subreddit and score for context, truncate long titles
    const postLines = allPosts
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 2000)
      .map(p => `[r/${p.subreddit}|score:${p.score}] ${p.title.slice(0, 120)}`)
      .join('\n');

    // 3. GPT-first: let the model identify what's being discussed
    console.log(`Sending ${Math.min(allPosts.length, 2000)} posts to GPT-4o...`);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a financial analyst specializing in Reddit retail investor sentiment.

You will receive a list of Reddit post titles from stock-related subreddits.
Your job is to identify the top 50 most-discussed publicly traded companies/ETFs and analyze sentiment.

IMPORTANT: Recognize companies by ANY name used — ticker symbols ($TSLA, TSLA), company names (Tesla, Apple, Nvidia),
nicknames (meme stock, the EV maker, Elon's car company), product names (iPhone, ChatGPT→MSFT/OPENAI),
CEO names (Elon→TSLA, Jensen→NVDA, Gensler→SEC context).

For each company return:
- ticker: official stock ticker (e.g. "TSLA")
- name: full company name (e.g. "Tesla, Inc.")
- mentions: estimated mention count based on frequency in the posts
- sentimentLabel: "bullish" | "bearish" | "mixed"
- sentimentScore: 0-100 (based on tone — bullish=high, bearish=low)
- whyTrending: 1-2 sentences explaining WHY it's being discussed right now, based on what the posts actually say
- priceChange24h: estimated 24h sentiment-implied move as a % (e.g. 3.2 or -1.8)
- predictions: { oneDay, oneWeek, oneMonth } each with direction ("rise"|"fall"|"neutral") and confidence (0-100)

Return JSON: { "stocks": [ ...50 items sorted by mentions desc... ] }`,
        },
        {
          role: 'user',
          content: `Analyze these ${Math.min(allPosts.length, 2000)} Reddit posts and identify the top 50 most-discussed stocks:\n\n${postLines}`,
        },
      ],
    });

    const gptResult = JSON.parse(completion.choices[0].message.content ?? '{}');
    console.log(`GPT identified ${gptResult.stocks?.length ?? 0} stocks`);

    if (!gptResult.stocks?.length) {
      return res.status(200).json({ status: 'no_data', postsCount: allPosts.length });
    }

    // 4. Build a lookup of posts by what subreddits mentioned them (for top post display)
    // We'll attach top posts by finding posts that likely mention the ticker/company
    const stocksByTicker = new Map<string, RawPost[]>();
    for (const stock of gptResult.stocks) {
      const ticker = stock.ticker.toUpperCase();
      const name = (stock.name ?? '').toLowerCase();
      const shortName = name.split(' ')[0]; // "tesla" from "Tesla, Inc."
      const matching = allPosts.filter(p => {
        const text = (p.title + ' ' + (p.selftext ?? '')).toLowerCase();
        return text.includes(ticker.toLowerCase()) ||
               text.includes(shortName) ||
               text.includes(`$${ticker.toLowerCase()}`);
      });
      stocksByTicker.set(ticker, matching.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));
    }

    // 5. Merge into final shape
    const stocks = gptResult.stocks.slice(0, 50).map((gpt: any, i: number) => {
      const ticker = gpt.ticker.toUpperCase();
      const matchedPosts = stocksByTicker.get(ticker) ?? [];
      const topPost = matchedPosts[0];
      const mostRecent = matchedPosts.sort((a, b) => b.created_utc - a.created_utc)[0];
      const subredditsFound = [...new Set(matchedPosts.map(p => p.subreddit))].slice(0, 3);

      return {
        rank: i + 1,
        ticker,
        name: gpt.name ?? ticker,
        mentions: gpt.mentions ?? 0,
        sentimentScore: gpt.sentimentScore ?? 50,
        sentimentLabel: gpt.sentimentLabel ?? 'mixed',
        subreddits: subredditsFound.length > 0 ? subredditsFound : ['wallstreetbets'],
        lastMentionAgo: mostRecent ? timeAgo(mostRecent.created_utc) : 'recently',
        topPost: topPost
          ? { quote: topPost.title, upvotes: topPost.score ?? 0, subreddit: topPost.subreddit }
          : { quote: `Trending on Reddit this week`, upvotes: 0, subreddit: 'wallstreetbets' },
        whyTrending: gpt.whyTrending ?? `Mentioned ${gpt.mentions} times across Reddit this week.`,
        predictions: gpt.predictions ?? {
          oneDay:   { direction: 'neutral', confidence: 50 },
          oneWeek:  { direction: 'neutral', confidence: 50 },
          oneMonth: { direction: 'neutral', confidence: 50 },
        },
        priceChange24h: gpt.priceChange24h ?? 0,
      };
    });

    // 6. Save to Redis with 25hr TTL (daily refresh)
    await redis.set('buzzd:stocks', JSON.stringify({ stocks, updatedAt: new Date().toISOString() }), { ex: 90000 });
    console.log(`Saved ${stocks.length} stocks to Redis`);

    return res.status(200).json({ status: 'ok', count: stocks.length, postsAnalyzed: allPosts.length });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
