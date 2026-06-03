import type { StockEntry, Direction, SentimentLabel } from './stocks';

const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing'];
const POSTS_PER_SUB = 500;
const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';

// Well-known tickers we detect even without the $ prefix
const KNOWN_TICKERS = new Set([
  'NVDA','TSLA','AAPL','MSFT','AMZN','GOOGL','GOOG','META','AMD','INTC',
  'GME','AMC','PLTR','MSTR','RIVN','SOFI','BBBY','HOOD','COIN','RBLX',
  'SPY','QQQ','SPX','VIX','ARKK','GLD','SLV','TLT','IWM',
  'MRVL','MARA','RIOT','HUT','CLSK','BITF','CIFR',
  'NFLX','DIS','UBER','LYFT','SNAP','PINS','TWTR','RDDT',
  'NIO','LCID','XPEV','FSR','HYLN',
  'F','GM','FORD',
  'BAC','JPM','GS','MS','WFC','C',
  'BABA','JD','PDD','KWEB',
  'SMCI','ARM','AVGO','QCOM','MU','AMAT','LRCX','ASML',
  'ORCL','CRM','NOW','SNOW','DDOG','CRWD','PANW','ZS','NET',
  'ABNB','BKNG','EXPE','MAR','HLT',
  'WMT','TGT','COST','AMZN',
  'XOM','CVX','OXY','BP',
  'PFE','MRNA','BNTX','JNJ','LLY','ABBV',
  'BTC','ETH',
]);

const SKIP = new Set([
  'DD','IMO','WSB','NYSE','IPO','ETF','CEO','SEC','FDA','ATH','YTD','AI','US','EU','UK',
  'FOR','THE','AND','BUT','OR','IT','MY','BE','IS','ON','IN','TO','AT','BY','IF','SO',
  'WE','NO','DO','UP','AM','AN','GO','OH','OK','OP','PE','EV','ER','RE','ED','TV',
  'ALL','ANY','ARE','CAN','DID','GET','GOT','HAS','HAD','HIM','HIS','HOW','ITS','LET',
  'MAY','NEW','NOT','NOW','OFF','OLD','OWN','SAY','SHE','TOO','USE','WAS','WHO','WHY',
  'WON','YES','YET','YOU','CEO','CFO','COO','CTO','GDP','CPI','FED','BOJ','ECB',
]);

interface RawPost {
  title: string;
  selftext: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  permalink: string;
  author: string;
}

interface TickerData {
  ticker: string;
  mentions: number;
  totalScore: number;
  totalRatio: number;
  posts: RawPost[];
  subreddits: Set<string>;
}

function extractTickers(text: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  // $TICKER pattern — most reliable signal
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    const t = m[1];
    if (!SKIP.has(t) && !seen.has(t)) { results.push(t); seen.add(t); }
  }

  // Known tickers mentioned without $ (e.g. "NVDA is printing")
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const t = m[1];
    if (KNOWN_TICKERS.has(t) && !seen.has(t)) { results.push(t); seen.add(t); }
  }

  return results;
}

function timeAgo(utc: number): string {
  const secs = Math.floor(Date.now() / 1000) - utc;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function inferDirection(ratio: number, score: number): Direction {
  if (ratio >= 0.75 && score > 100) return 'rise';
  if (ratio <= 0.45) return 'fall';
  return 'neutral';
}

function inferSentimentLabel(ratio: number): SentimentLabel {
  if (ratio >= 0.70) return 'bullish';
  if (ratio <= 0.45) return 'bearish';
  return 'mixed';
}

async function fetchSubredditPosts(subreddit: string): Promise<RawPost[]> {
  const url = `${ARCTIC_SHIFT}?subreddit=${subreddit}&limit=${POSTS_PER_SUB}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data as RawPost[]) ?? [];
}

export async function fetchTrendingStocks(): Promise<StockEntry[]> {
  // Fetch all subreddits in parallel
  const allPostsArrays = await Promise.all(SUBREDDITS.map(fetchSubredditPosts));
  const allPosts = allPostsArrays.flat();

  // Count ticker mentions
  const tickerMap = new Map<string, TickerData>();

  for (const post of allPosts) {
    const text = post.title + ' ' + (post.selftext ?? '');
    const tickers = extractTickers(text);
    const seen = new Set<string>();

    for (const ticker of tickers) {
      if (seen.has(ticker)) continue;
      seen.add(ticker);

      if (!tickerMap.has(ticker)) {
        tickerMap.set(ticker, {
          ticker,
          mentions: 0,
          totalScore: 0,
          totalRatio: 0,
          posts: [],
          subreddits: new Set(),
        });
      }
      const d = tickerMap.get(ticker)!;
      d.mentions++;
      d.totalScore += post.score ?? 0;
      d.totalRatio += post.upvote_ratio ?? 0.5;
      d.posts.push(post);
      d.subreddits.add(post.subreddit);
    }
  }

  // Sort by mention count, take top 10
  const sorted = [...tickerMap.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10);

  // Build StockEntry objects
  return sorted.map((d, i) => {
    const avgRatio = d.totalRatio / d.mentions;
    const sentimentScore = Math.round(avgRatio * 100);
    // Pick the most upvoted post as the top post
    const topPost = d.posts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const mostRecent = d.posts.sort((a, b) => b.created_utc - a.created_utc)[0];

    const oneDay = inferDirection(avgRatio, d.totalScore);
    const oneWeek: Direction = avgRatio >= 0.65 ? 'rise' : avgRatio <= 0.40 ? 'fall' : 'neutral';
    const oneMonth: Direction = d.mentions >= 8 ? 'rise' : d.mentions <= 3 ? 'fall' : 'neutral';

    return {
      rank: i + 1,
      ticker: d.ticker,
      name: d.ticker,
      mentions: d.mentions,
      sentimentScore,
      sentimentLabel: inferSentimentLabel(avgRatio),
      subreddits: [...d.subreddits].slice(0, 3),
      lastMentionAgo: timeAgo(mostRecent.created_utc),
      topPost: {
        quote: topPost.title,
        upvotes: topPost.score ?? 0,
        subreddit: topPost.subreddit,
      },
      whyTrending: `Mentioned ${d.mentions} times across ${d.subreddits.size} subreddit${d.subreddits.size > 1 ? 's' : ''} in the last 24 hours. Community sentiment is ${inferSentimentLabel(avgRatio)} with an average ${sentimentScore}% upvote ratio.`,
      predictions: {
        oneDay:   { direction: oneDay,   confidence: Math.round(50 + Math.abs(avgRatio - 0.5) * 80) },
        oneWeek:  { direction: oneWeek,  confidence: Math.round(45 + Math.abs(avgRatio - 0.5) * 70) },
        oneMonth: { direction: oneMonth, confidence: Math.round(40 + (d.mentions / 20) * 30) },
      },
      priceChange24h: 0,
    } satisfies StockEntry;
  });
}
