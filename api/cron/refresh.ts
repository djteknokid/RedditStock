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

// Well-known tickers to always filter out as noise words
const SKIP = new Set([
  'DD','IMO','WSB','NYSE','IPO','ETF','CEO','SEC','FDA','ATH','YTD','AI','US','EU','UK',
  'FOR','THE','AND','BUT','OR','IT','MY','BE','IS','ON','IN','TO','AT','BY','IF','SO',
  'WE','NO','DO','UP','AM','AN','GO','OH','OK','OP','PE','EV','ER','RE','ED','TV',
  'ALL','ANY','ARE','CAN','DID','GET','GOT','HAS','HAD','HIM','HIS','HOW','ITS','LET',
  'MAY','NEW','NOT','NOW','OFF','OLD','OWN','SAY','SHE','TOO','USE','WAS','WHO','WHY',
  'WON','YES','YET','YOU','GDP','CPI','FED','BOJ','ECB','YOLO','FOMO','HODL','TBH',
  'FYI','EOD','EOW','AMA','TIL','ETA','PSA','TBA','TBD','TLDR','CALLS','PUTS','ITM',
  'OTM','ATM','DTE','IV','OI','SPX','NDX','RUT','VIX','FOMC','JPM','Q1','Q2','Q3','Q4',
]);

// Company name / nickname → ticker mapping
// Keys are lowercase for case-insensitive matching
const COMPANY_TO_TICKER: Record<string, string> = {
  // Big tech
  'nvidia': 'NVDA', 'jensen': 'NVDA', 'jensen huang': 'NVDA',
  'apple': 'AAPL', 'iphone': 'AAPL', 'tim cook': 'AAPL',
  'microsoft': 'MSFT', 'msft': 'MSFT', 'msoft': 'MSFT', 'azure': 'MSFT', 'satya': 'MSFT',
  'google': 'GOOGL', 'alphabet': 'GOOGL', 'sundar': 'GOOGL', 'gemini': 'GOOGL',
  'amazon': 'AMZN', 'aws': 'AMZN', 'andy jassy': 'AMZN',
  'meta': 'META', 'facebook': 'META', 'zuckerberg': 'META', 'zuck': 'META', 'instagram': 'META', 'whatsapp': 'META',
  'tesla': 'TSLA', 'elon': 'TSLA', 'elon musk': 'TSLA', 'cybertruck': 'TSLA',
  'amd': 'AMD', 'lisa su': 'AMD',
  'intel': 'INTC',
  'netflix': 'NFLX',
  'disney': 'DIS',
  'uber': 'UBER',
  'palantir': 'PLTR', 'alex karp': 'PLTR',
  'coinbase': 'COIN',
  'robinhood': 'HOOD',
  'microstrategy': 'MSTR', 'michael saylor': 'MSTR', 'saylor': 'MSTR',
  'rivian': 'RIVN',
  'sofi': 'SOFI',
  'gamestop': 'GME', 'game stop': 'GME',
  'amc': 'AMC',
  'snowflake': 'SNOW',
  'crowdstrike': 'CRWD',
  'datadog': 'DDOG',
  'salesforce': 'CRM',
  'oracle': 'ORCL',
  'servicenow': 'NOW',
  'arm': 'ARM', 'arm holdings': 'ARM',
  'broadcom': 'AVGO',
  'qualcomm': 'QCOM',
  'micron': 'MU',
  'applied materials': 'AMAT',
  'asml': 'ASML',
  'shopify': 'SHOP',
  'spotify': 'SPOT',
  'airbnb': 'ABNB',
  'booking': 'BKNG',
  'walmart': 'WMT',
  'target': 'TGT',
  'costco': 'COST',
  'exxon': 'XOM',
  'chevron': 'CVX',
  'pfizer': 'PFE',
  'moderna': 'MRNA',
  'johnson': 'JNJ',
  'eli lilly': 'LLY', 'lilly': 'LLY',
  'abbvie': 'ABBV',
  'jpmorgan': 'JPM', 'jp morgan': 'JPM', 'jamie dimon': 'JPM',
  'goldman': 'GS', 'goldman sachs': 'GS',
  'bank of america': 'BAC', 'bofa': 'BAC',
  'wells fargo': 'WFC',
  'morgan stanley': 'MS',
  'alibaba': 'BABA', 'baba': 'BABA',
  'nio': 'NIO',
  'lucid': 'LCID',
  'xpeng': 'XPEV',
  'reddit': 'RDDT',
  'snap': 'SNAP', 'snapchat': 'SNAP',
  'pinterest': 'PINS',
  'blackrock': 'BLK',
  'openai': 'MSFT', // OpenAI is private, discussions often correlate to MSFT
  'chatgpt': 'MSFT',
  'spy': 'SPY', 'qqq': 'QQQ', 'iwm': 'IWM',
  'marathon': 'MARA', 'riot': 'RIOT', 'riot platforms': 'RIOT',
  'marvell': 'MRVL',
};

interface RawPost {
  id: string;
  title: string;
  selftext?: string;
  score: number;
  upvote_ratio: number;
  created_utc: number;
  subreddit: string;
}

interface TickerMentions {
  ticker: string;
  recentPosts: RawPost[];   // last 48h
  olderPosts: RawPost[];    // days 3-7
  allPosts: RawPost[];
}

async function fetchSubredditPosts(subreddit: string, afterTs: number): Promise<RawPost[]> {
  const allPosts: RawPost[] = [];
  let beforeTs: number | null = null;

  for (let page = 0; page < 5; page++) {
    try {
      const params = new URLSearchParams({ subreddit, limit: '100', after: String(afterTs) });
      if (beforeTs) params.set('before', String(beforeTs));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${ARCTIC_SHIFT}?${params}`, {
        headers: { 'User-Agent': 'buzzd.fyi/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) break;
      const data = await res.json();
      const posts: RawPost[] = data.data ?? [];
      if (posts.length === 0) break;
      allPosts.push(...posts);
      beforeTs = posts[posts.length - 1].created_utc ?? null;
      if (!beforeTs || posts.length < 100) break;
    } catch (e) {
      console.error(`r/${subreddit} page ${page}:`, String(e));
      break;
    }
  }

  return allPosts;
}

function extractTickers(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  // $TICKER pattern — highest confidence
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    if (!SKIP.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); results.push(m[1]); }
  }

  // Bare ALL-CAPS 2-5 letter words that look like tickers
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (!SKIP.has(m[1]) && !seen.has(m[1]) && /^[A-Z]+$/.test(m[1])) {
      seen.add(m[1]); results.push(m[1]);
    }
  }

  // Company name / nickname matching (case-insensitive)
  const lower = text.toLowerCase();
  // Check multi-word phrases first (longer matches take priority)
  const phrases = Object.keys(COMPANY_TO_TICKER).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (lower.includes(phrase)) {
      const ticker = COMPANY_TO_TICKER[phrase];
      if (!seen.has(ticker)) { seen.add(ticker); results.push(ticker); }
    }
  }

  return results;
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
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 86400;
    const twoDaysAgo = now - 2 * 86400;

    // 1. Fetch 7 days of posts from all subreddits in parallel
    console.log('Fetching 7-day posts from 10 subreddits...');
    const allPosts = (await Promise.all(SUBREDDITS.map(s => fetchSubredditPosts(s, sevenDaysAgo)))).flat();
    console.log(`Total posts: ${allPosts.length}`);

    if (allPosts.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: 0 });
    }

    // 2. Count mentions per ticker, split by time window
    const tickerMap = new Map<string, TickerMentions>();

    for (const post of allPosts) {
      const text = `${post.title} ${post.selftext ?? ''}`;
      const tickers = extractTickers(text);
      const seenInPost = new Set<string>();

      for (const ticker of tickers) {
        if (seenInPost.has(ticker)) continue;
        seenInPost.add(ticker);

        if (!tickerMap.has(ticker)) {
          tickerMap.set(ticker, { ticker, recentPosts: [], olderPosts: [], allPosts: [] });
        }
        const d = tickerMap.get(ticker)!;
        d.allPosts.push(post);
        if (post.created_utc >= twoDaysAgo) {
          d.recentPosts.push(post);
        } else {
          d.olderPosts.push(post);
        }
      }
    }

    // 3. Score by velocity (spike detection) not raw mentions
    // Velocity = recentMentions / (olderMentions/5 * 2 + 1)
    // This normalizes older mentions to a 2-day baseline for fair comparison
    // Unknown stocks with sudden spikes score high; NVDA baseline stays low
    const scored = [...tickerMap.values()]
      .filter(d => d.recentPosts.length >= 2) // need at least 2 recent mentions
      .map(d => {
        const recentCount = d.recentPosts.length;
        const olderDailyAvg = d.olderPosts.length / 5; // avg per day over older window
        const baseline = olderDailyAvg * 2 + 1; // expected 2-day count
        const velocity = recentCount / baseline;
        // Boost unknown stocks (fewer total mentions = more surprising)
        const unknownBonus = d.allPosts.length < 50 ? 2.5 : d.allPosts.length < 200 ? 1.5 : 1.0;
        const score = velocity * unknownBonus;
        return { ...d, recentCount, olderCount: d.olderPosts.length, velocity, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    console.log(`Top spiking tickers: ${scored.slice(0, 5).map(d => `${d.ticker}(v=${d.velocity.toFixed(1)})`).join(', ')}`);

    if (scored.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: allPosts.length });
    }

    // 4. Build rich context for GPT — top posts per ticker with body excerpts
    const context = scored.map(d => {
      const topPosts = d.allPosts
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 20)
        .map(p => {
          const body = (p.selftext ?? '').replace(/\n+/g, ' ').trim().slice(0, 150);
          return `  - [r/${p.subreddit} ↑${p.score}] ${p.title}${body ? ` | ${body}` : ''}`;
        })
        .join('\n');

      return [
        `TICKER: ${d.ticker}`,
        `Recent mentions (last 48h): ${d.recentCount} | Older mentions (days 3-7): ${d.olderCount} | Velocity score: ${d.velocity.toFixed(2)}x`,
        `Top posts:`,
        topPosts,
      ].join('\n');
    }).join('\n\n---\n\n');

    // 5. Send to GPT-4o with full context
    console.log('Sending to GPT-4o...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a financial sentiment analyst specializing in Reddit retail investor behavior.

You will receive data about stocks ranked by MENTION VELOCITY — how much MORE they are being discussed in the last 48 hours compared to their baseline. A stock with a 5x velocity score is being discussed 5 times more than usual, which is highly significant even if the raw count is small.

For each ticker, analyze the actual post titles and body excerpts to determine:

1. **whyTrending**: 2-3 sentences explaining SPECIFICALLY why this stock is spiking RIGHT NOW. Reference actual events, catalysts, or narratives from the posts. Do not be generic. If it's earnings, say earnings. If it's a short squeeze setup, explain why. If it's a macro event, name it.

2. **sentimentLabel**: "bullish" | "bearish" | "mixed" — based on the actual tone of the posts

3. **sentimentScore**: 0-100. Be precise and evidence-based:
   - 80-100: Strong bullish consensus, multiple posts with clear upside thesis
   - 60-79: Mostly bullish with some skepticism
   - 40-59: Genuinely mixed or uncertain
   - 20-39: Mostly bearish, skeptical, or cautionary
   - 0-19: Strong bearish consensus, short thesis, or warning posts

4. **sentimentReasoning**: 1 sentence explaining WHY you gave that specific score (e.g. "7 of the top 10 posts express a short squeeze thesis with specific options data")

5. **priceChange24h**: sentiment-implied 24h move estimate as % (e.g. 3.2 or -1.8)

6. **predictions**: { oneDay, oneWeek, oneMonth } each with direction ("rise"|"fall"|"neutral") and confidence 0-100

Return JSON: { "stocks": [ { "ticker", "name", "whyTrending", "sentimentLabel", "sentimentScore", "sentimentReasoning", "priceChange24h", "predictions" } ] }

Keep the same order as the input (velocity-ranked).`,
        },
        {
          role: 'user',
          content: `Analyze these velocity-ranked Reddit stock discussions:\n\n${context}`,
        },
      ],
    });

    const gptResult = JSON.parse(completion.choices[0].message.content ?? '{}');
    console.log(`GPT analyzed ${gptResult.stocks?.length ?? 0} stocks`);
    // Log first stock to verify predictions shape
    if (gptResult.stocks?.[0]) {
      console.log('GPT sample:', JSON.stringify(gptResult.stocks[0]).slice(0, 300));
    }

    // Build a lookup map by ticker for fast matching
    const gptByTicker = new Map<string, any>();
    for (const s of gptResult.stocks ?? []) {
      if (s.ticker) gptByTicker.set(s.ticker.toUpperCase(), s);
    }

    // 6. Merge into final shape
    function normalizeDirection(d: string): 'rise' | 'fall' | 'neutral' {
      const s = (d ?? '').toLowerCase();
      if (s === 'rise' || s === 'up' || s === 'bullish') return 'rise';
      if (s === 'fall' || s === 'down' || s === 'bearish') return 'fall';
      return 'neutral';
    }
    function normalizePrediction(p: any) {
      return { direction: normalizeDirection(p?.direction), confidence: p?.confidence ?? 50 };
    }
    const stocks = scored.map((d, i) => {
      const gpt = gptByTicker.get(d.ticker) ?? gptResult.stocks?.[i] ?? {};
      const topPost = d.allPosts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const mostRecent = d.allPosts.sort((a, b) => b.created_utc - a.created_utc)[0];
      const subreddits = [...new Set(d.allPosts.map(p => p.subreddit))].slice(0, 3);

      return {
        rank: i + 1,
        ticker: d.ticker,
        name: gpt.name ?? d.ticker,
        mentions: d.recentCount,
        totalMentions: d.allPosts.length,
        velocityScore: Math.round(d.velocity * 10) / 10,
        sentimentScore: gpt.sentimentScore ?? 50,
        sentimentLabel: gpt.sentimentLabel ?? 'mixed',
        sentimentReasoning: gpt.sentimentReasoning ?? '',
        subreddits,
        lastMentionAgo: mostRecent ? timeAgo(mostRecent.created_utc) : 'recently',
        topPost: topPost
          ? { quote: topPost.title, upvotes: topPost.score ?? 0, subreddit: topPost.subreddit }
          : { quote: 'Trending on Reddit', upvotes: 0, subreddit: 'wallstreetbets' },
        whyTrending: gpt.whyTrending ?? `Mention volume spiked ${d.velocity.toFixed(1)}x in the last 48 hours.`,
        predictions: gpt.predictions ? {
          oneDay:   normalizePrediction(gpt.predictions.oneDay),
          oneWeek:  normalizePrediction(gpt.predictions.oneWeek),
          oneMonth: normalizePrediction(gpt.predictions.oneMonth),
        } : {
          oneDay:   { direction: 'neutral', confidence: 50 },
          oneWeek:  { direction: 'neutral', confidence: 50 },
          oneMonth: { direction: 'neutral', confidence: 50 },
        },
        priceChange24h: gpt.priceChange24h ?? 0,
      };
    });

    // 7. Save to Redis
    await redis.set('buzzd:stocks', JSON.stringify({ stocks, updatedAt: new Date().toISOString() }), { ex: 90000 });
    console.log(`Saved ${stocks.length} stocks to Redis`);

    return res.status(200).json({ status: 'ok', count: stocks.length, postsAnalyzed: allPosts.length });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
