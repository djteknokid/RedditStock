import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';

export const maxDuration = 60;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing'];
const POSTS_PER_SUB = 100;
const PAGES_PER_SUB = 5;
const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';

const SKIP = new Set([
  'DD','IMO','WSB','NYSE','IPO','ETF','CEO','SEC','FDA','ATH','YTD','AI','US','EU','UK',
  'FOR','THE','AND','BUT','OR','IT','MY','BE','IS','ON','IN','TO','AT','BY','IF','SO',
  'WE','NO','DO','UP','AM','AN','GO','OH','OK','OP','PE','EV','ER','RE','ED','TV',
  'ALL','ANY','ARE','CAN','DID','GET','GOT','HAS','HAD','HIM','HIS','HOW','ITS','LET',
  'MAY','NEW','NOT','NOW','OFF','OLD','OWN','SAY','SHE','TOO','USE','WAS','WHO','WHY',
  'WON','YES','YET','YOU','GDP','CPI','FED','BOJ','ECB','YOLO','FOMO','HODL','TBH',
  'IMO','FYI','EOD','EOW','AMA','TIL','ELI','ETA','PSA','TBA','TBD','TLDR',
]);

const KNOWN_TICKERS = new Set([
  'NVDA','TSLA','AAPL','MSFT','AMZN','GOOGL','GOOG','META','AMD','INTC',
  'GME','AMC','PLTR','MSTR','RIVN','SOFI','HOOD','COIN','RBLX',
  'SPY','QQQ','IWM','GLD','SLV','TLT','ARKK',
  'MRVL','MARA','RIOT','HUT','CLSK',
  'NFLX','DIS','UBER','LYFT','SNAP','PINS','RDDT',
  'NIO','LCID','XPEV',
  'F','GM',
  'BAC','JPM','GS','MS','WFC',
  'BABA','JD','PDD',
  'SMCI','ARM','AVGO','QCOM','MU','AMAT','ASML',
  'ORCL','CRM','NOW','SNOW','DDOG','CRWD','PANW','ZS','NET',
  'ABNB','BKNG',
  'WMT','TGT','COST',
  'XOM','CVX','OXY',
  'PFE','MRNA','BNTX','JNJ','LLY','ABBV',
]);

interface RawPost {
  id: string;
  title: string;
  selftext?: string;
  score: number;
  upvote_ratio: number;
  created_utc: number;
  subreddit: string;
  permalink: string;
}

interface TickerData {
  ticker: string;
  mentions: number;
  totalRatio: number;
  posts: RawPost[];
  subreddits: Set<string>;
}

function extractTickers(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    if (!SKIP.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); results.push(m[1]); }
  }
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (KNOWN_TICKERS.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); results.push(m[1]); }
  }
  return results;
}

async function fetchPosts(subreddit: string): Promise<RawPost[]> {
  const allPosts: RawPost[] = [];
  let lastId: string | null = null;

  for (let page = 0; page < PAGES_PER_SUB; page++) {
    try {
      const params = new URLSearchParams({ subreddit, limit: String(POSTS_PER_SUB) });
      if (lastId) params.set('after', lastId);
      const url = `${ARCTIC_SHIFT}?${params}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'buzzd.fyi/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error(`Arctic Shift ${subreddit} page ${page}: HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      const posts: RawPost[] = data.data ?? [];
      if (posts.length === 0) break;
      allPosts.push(...posts);
      lastId = posts[posts.length - 1].id ?? null;
      if (!lastId || posts.length < POSTS_PER_SUB) break;
    } catch (e) {
      console.error(`Arctic Shift ${subreddit} page ${page} error:`, String(e));
      break;
    }
  }

  console.log(`Arctic Shift ${subreddit}: ${allPosts.length} posts`);
  return allPosts;
}

function timeAgo(utc: number): string {
  const secs = Math.floor(Date.now() / 1000) - utc;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret so only Vercel can trigger this
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch posts from all subreddits in parallel
    console.log('Fetching Reddit posts...');
    const allPosts = (await Promise.all(SUBREDDITS.map(fetchPosts))).flat();
    console.log(`Fetched ${allPosts.length} total posts`);

    // 2. Count ticker mentions
    const tickerMap = new Map<string, TickerData>();
    for (const post of allPosts) {
      const text = `${post.title} ${post.selftext ?? ''}`;
      const tickers = extractTickers(text);
      const seenInPost = new Set<string>();
      for (const ticker of tickers) {
        if (seenInPost.has(ticker)) continue;
        seenInPost.add(ticker);
        if (!tickerMap.has(ticker)) {
          tickerMap.set(ticker, { ticker, mentions: 0, totalRatio: 0, posts: [], subreddits: new Set() });
        }
        const d = tickerMap.get(ticker)!;
        d.mentions++;
        d.totalRatio += post.upvote_ratio ?? 0.5;
        d.posts.push(post);
        d.subreddits.add(post.subreddit);
      }
    }

    // 3. Get top 50 by mentions
    const top10 = [...tickerMap.values()]
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 50);

    if (top10.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: allPosts.length, tickersFound: tickerMap.size });
    }

    // 4. Build context for GPT — top 3 posts per ticker (keep prompt size manageable)
    const context = top10.map(d => {
      const topPosts = d.posts
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 3)
        .map(p => `- [${p.subreddit}] "${p.title}"`)
        .join('\n');
      return `TICKER: ${d.ticker}\nMentions: ${d.mentions} across ${[...d.subreddits].join(', ')}\nTop posts:\n${topPosts}`;
    }).join('\n\n---\n\n');

    // 5. Call GPT
    console.log('Calling GPT...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a financial sentiment analyst. Analyze Reddit discussion data about stocks and return structured JSON.
For each ticker, analyze the post titles and discussion context to determine:
1. Why it's trending (plain English, 1-2 sentences, based on what people are actually saying)
2. Overall sentiment (bullish/bearish/mixed)
3. Sentiment score 0-100 (based on tone of discussion)
4. Price predictions for 1 day, 1 week, 1 month (rise/fall/neutral + confidence 0-100)
5. 24h price change estimate based on sentiment (a rough % number)

Return ONLY valid JSON in this exact format:
{
  "stocks": [
    {
      "ticker": "GME",
      "whyTrending": "...",
      "sentimentLabel": "bullish",
      "sentimentScore": 82,
      "priceChange24h": 4.2,
      "predictions": {
        "oneDay": { "direction": "rise", "confidence": 78 },
        "oneWeek": { "direction": "neutral", "confidence": 55 },
        "oneMonth": { "direction": "fall", "confidence": 61 }
      }
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Analyze these trending Reddit stock discussions and return JSON:\n\n${context}`,
        },
      ],
    });

    const gptResult = JSON.parse(completion.choices[0].message.content ?? '{}');
    console.log('GPT response received');

    // 6. Merge GPT analysis with our mention data
    const stocks = top10.map((d, i) => {
      const gpt = gptResult.stocks?.find((s: { ticker: string }) => s.ticker === d.ticker) ?? {};
      const avgRatio = d.totalRatio / d.mentions;
      const topPost = d.posts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const mostRecent = d.posts.sort((a, b) => b.created_utc - a.created_utc)[0];

      return {
        rank: i + 1,
        ticker: d.ticker,
        name: d.ticker,
        mentions: d.mentions,
        sentimentScore: gpt.sentimentScore ?? Math.round(avgRatio * 100),
        sentimentLabel: gpt.sentimentLabel ?? 'mixed',
        subreddits: [...d.subreddits].slice(0, 3),
        lastMentionAgo: timeAgo(mostRecent.created_utc),
        topPost: {
          quote: topPost.title,
          upvotes: topPost.score ?? 0,
          subreddit: topPost.subreddit,
        },
        whyTrending: gpt.whyTrending ?? `Mentioned ${d.mentions} times across ${d.subreddits.size} subreddits.`,
        predictions: gpt.predictions ?? {
          oneDay:   { direction: 'neutral', confidence: 50 },
          oneWeek:  { direction: 'neutral', confidence: 50 },
          oneMonth: { direction: 'neutral', confidence: 50 },
        },
        priceChange24h: gpt.priceChange24h ?? 0,
      };
    });

    // 7. Save to Redis with 2hr TTL
    await redis.set('buzzd:stocks', JSON.stringify({ stocks, updatedAt: new Date().toISOString() }), { ex: 7200 });
    console.log('Saved to Redis');

    return res.status(200).json({ status: 'ok', count: stocks.length });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
