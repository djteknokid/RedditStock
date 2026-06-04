import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';
import YahooFinanceLib from 'yahoo-finance2';

export const maxDuration = 60;

const YahooFinance = (YahooFinanceLib as any).default ?? YahooFinanceLib;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SUBREDDITS = [
  'wallstreetbets', 'stocks', 'investing',
  'options', 'pennystocks', 'stockmarket',
  'Superstonk', 'valueinvesting', 'RobinHoodPennyStocks', 'dividends',
  'investing_discussion', 'StockMarket', 'Daytrading', 'thetagang',
  'Vitards', 'SecurityAnalysis', 'finance',
];

const ARCTIC_SHIFT = 'https://arctic-shift.photon-reddit.com/api/posts/search';
const STOCKTWITS_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';

interface StockTwitsMessage {
  body: string;
  created_at: string;
  sentiment?: { basic: 'Bullish' | 'Bearish' } | null;
}

interface StockTwitsSentiment {
  bullish: number;
  bearish: number;
  total: number;
  messages: string[]; // top 8 message bodies for GPT context
}

async function fetchStockTwits(ticker: string): Promise<StockTwitsSentiment> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${STOCKTWITS_BASE}/${ticker}.json?limit=30`, {
      headers: { 'User-Agent': 'buzzd.fyi/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return { bullish: 0, bearish: 0, total: 0, messages: [] };
    const data = await res.json();
    const msgs: StockTwitsMessage[] = data.messages ?? [];

    let bullish = 0;
    let bearish = 0;
    const bodies: string[] = [];

    for (const m of msgs) {
      if (m.sentiment?.basic === 'Bullish') bullish++;
      else if (m.sentiment?.basic === 'Bearish') bearish++;
      if (m.body && bodies.length < 8) bodies.push(m.body.replace(/\n+/g, ' ').trim().slice(0, 120));
    }

    return { bullish, bearish, total: msgs.length, messages: bodies };
  } catch {
    return { bullish: 0, bearish: 0, total: 0, messages: [] };
  }
}

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
  // Trading jargon
  'GTC','EOY','AH','PM','TA','DD','PT','SL','TP','RR','PNL','PL','YOY','QOQ','MOM',
  'HODL','BTFD','BTFP','RIPS','DIPS','BULL','BEAR','MOON','DUMP','PUMP','BAGS','LOSS',
  'GAIN','PLAY','YOLO','FOMO','APES','GANG','HOLD','SOLD','BUY','SELL','LONG','SHORT',
  // Common words that look like tickers
  'THIS','THAT','THEY','THEM','THEN','THAN','WHEN','WHAT','WITH','FROM','HAVE','BEEN',
  'WILL','JUST','LIKE','MORE','ALSO','EVEN','ONLY','OVER','BACK','INTO','WELL','WANT',
  'NEED','KNOW','GOOD','MAKE','LOOK','TIME','YEAR','WEEK','LAST','NEXT','SOME','MOST',
  'MANY','MUCH','VERY','SAME','TAKE','GIVE','COME','TELL','SHOW','HIGH','LATE','HARD',
  // Non-equity tickers that appear in finance subs
  'BTC','ETH','SOL','XRP','DOGE','SHIB','LINK','DOT','ADA','MATIC','AVAX','UNI',
  'YT','YTD','IG','DM','PM','AM','HR','HRS','WK','MO','YR',
  'EDIT','TLDR','IMHO','IMO','AFAIK','IIRC','TIL','AMA','ELI5',
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

// Returns a human-readable earnings proximity string for GPT context
async function getEarningsContext(ticker: string): Promise<string> {
  try {
    const cal = await (yf as any).quoteSummary(ticker, { modules: ['calendarEvents'] }) as any;
    const dates: number[] = cal?.calendarEvents?.earnings?.earningsDate ?? [];
    if (!dates.length) return 'No upcoming earnings date found.';

    const now = Date.now();
    const upcoming = dates
      .map((d: any) => new Date(typeof d === 'object' && d.raw ? d.raw * 1000 : d).getTime())
      .filter(t => t > now)
      .sort((a, b) => a - b);

    if (!upcoming.length) return 'Earnings already passed this cycle.';

    const daysAway = Math.round((upcoming[0] - now) / 86400000);
    const dateStr = new Date(upcoming[0]).toISOString().slice(0, 10);

    if (daysAway === 0) return `EARNINGS TODAY (${dateStr}) — extreme volatility expected.`;
    if (daysAway === 1) return `EARNINGS TOMORROW (${dateStr}) — high impact on 1-day prediction.`;
    if (daysAway <= 7) return `Earnings in ${daysAway} days (${dateStr}) — elevated near-term risk.`;
    if (daysAway <= 30) return `Earnings in ${daysAway} days (${dateStr}) — within 1-month window.`;
    return `Next earnings ~${daysAway} days away (${dateStr}) — no imminent catalyst.`;
  } catch {
    return 'Earnings date unavailable.';
  }
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
    // Only count a ticker if it appears in the POST TITLE — body mentions are too noisy
    const tickerMap = new Map<string, TickerMentions>();

    for (const post of allPosts) {
      const titleTickers = extractTickers(post.title);          // title only — high signal
      const bodyTickers = extractTickers(post.selftext ?? '');  // body — only counts if also in title
      // A ticker must appear in the title to be attributed to this post
      const tickers = titleTickers.length > 0
        ? [...new Set([...titleTickers, ...bodyTickers.filter(t => titleTickers.includes(t))])]
        : []; // post with no ticker in title is ignored entirely
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
    const scored = [...tickerMap.values()]
      .filter(d => d.recentPosts.length >= 5) // raised floor: need real discussion
      .map(d => {
        const recentCount = d.recentPosts.length;
        const olderDailyAvg = d.olderPosts.length / 5;
        const baseline = olderDailyAvg * 2 + 1;
        const velocity = recentCount / baseline;
        const unknownBonus = d.allPosts.length < 50 ? 2.5 : d.allPosts.length < 200 ? 1.5 : 1.0;
        const score = velocity * unknownBonus;
        return { ...d, recentCount, olderCount: d.olderPosts.length, velocity, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30); // top 30 only — more focused, less noise

    console.log(`Top spiking tickers: ${scored.slice(0, 5).map(d => `${d.ticker}(v=${d.velocity.toFixed(1)})`).join(', ')}`);

    if (scored.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: allPosts.length });
    }

    // 4. Fetch earnings dates + StockTwits sentiment in parallel for all scored tickers
    console.log('Fetching earnings dates and StockTwits sentiment...');
    const [earningsResults, stocktwitsResults] = await Promise.all([
      Promise.all(scored.map(d => getEarningsContext(d.ticker))),
      Promise.all(scored.map(d => fetchStockTwits(d.ticker))),
    ]);
    const earningsByTicker = new Map(scored.map((d, i) => [d.ticker, earningsResults[i]]));
    const stocktwitsByTicker = new Map(scored.map((d, i) => [d.ticker, stocktwitsResults[i]]));

    // Log StockTwits coverage
    const stCovered = stocktwitsResults.filter(s => s.total > 0).length;
    console.log(`StockTwits: ${stCovered}/${scored.length} tickers have data`);

    // 5. Build rich context for GPT — Reddit posts + StockTwits sentiment + earnings per ticker
    const context = scored.map(d => {
      const topPosts = d.allPosts
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 15)
        .map(p => {
          const body = (p.selftext ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
          return `  - [r/${p.subreddit} ↑${p.score}] ${p.title}${body ? ` | ${body}` : ''}`;
        })
        .join('\n');

      const st = stocktwitsByTicker.get(d.ticker)!;
      const stLine = st.total > 0
        ? `StockTwits: ${st.bullish} Bullish / ${st.bearish} Bearish / ${st.total - st.bullish - st.bearish} no-label (${st.total} msgs)`
        : 'StockTwits: no data';
      const stMessages = st.messages.length > 0
        ? `StockTwits messages:\n${st.messages.map(m => `  - ${m}`).join('\n')}`
        : '';

      return [
        `TICKER: ${d.ticker}`,
        `Reddit: ${d.recentCount} mentions (48h) | ${d.olderCount} older (days 3-7) | Velocity: ${d.velocity.toFixed(2)}x`,
        stLine,
        `Earnings: ${earningsByTicker.get(d.ticker) ?? 'Unknown'}`,
        `Reddit top posts:`,
        topPosts,
        stMessages,
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');

    // 6. Send to GPT-4o with full context
    console.log('Sending to GPT-4o...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a forward-looking financial signal analyst. Each ticker comes with TWO independent data sources:
1. Reddit posts — tells you WHY it's trending and what narrative is driving discussion
2. StockTwits sentiment — Bullish/Bearish counts from traders who explicitly labeled their conviction

Use both sources together. StockTwits Bullish/Bearish ratio is a strong directional signal because traders choose the label deliberately. Reddit posts explain the narrative behind the numbers.

CRITICAL RULE: Ignore backward-looking statements entirely.
- IGNORE: "MU went up 5% today", "I made money on this", "it already mooned", "great earnings last quarter"
- FOCUS ON: future expectations, upcoming catalysts, thesis statements, options positioning, price targets, warnings

Each ticker includes an "Earnings:" line with the next earnings date from Yahoo Finance. This is GROUND TRUTH — use it as the primary driver of the 1-day prediction:
- EARNINGS TODAY or TOMORROW → high confidence move expected. Direction based on sentiment (bullish = rise, bearish = fall). Confidence 75-90%.
- EARNINGS IN 2-7 DAYS → elevated uncertainty. Posts about "loading up before earnings" or "dumping before earnings" are key signals.
- EARNINGS IN 8-30 DAYS → earnings are the 1-month signal, not the 1-day signal.
- NO EARNINGS SOON → 1-day prediction based on momentum, StockTwits ratio, and crowd positioning.

SIGNALS TO EXTRACT (forward-looking only):
- StockTwits ratio: >60% Bullish = meaningful signal. >75% Bullish = strong signal. Same logic inverted for Bearish.
- Upcoming catalysts: earnings next week, FDA decision pending, contract announcement expected
- Options positioning: "bought calls", "loading puts", specific strike/expiry mentioned
- Price targets: "this hits $50 EOW", "PT $200 by July"
- Crowd positioning: "everyone is buying", "whales accumulating", "institutions dumping"
- Risk warnings: "dump before earnings", "exit now", "don't hold through FDA"

For each ticker return:

1. **whyTrending**: 2-3 sentences on the SPECIFIC UPCOMING CATALYST or narrative driving discussion. Name the event, date if mentioned, and what investors are betting on.

2. **sentimentLabel**: "bullish" | "bearish" | "mixed"

3. **sentimentScore**: 0-100 based on FORWARD expectations. Weight StockTwits ratio heavily if available (it's explicit conviction). Weight Reddit narrative for context.
   - 80-100: Strong consensus that stock will rise
   - 60-79: Mostly bullish with some hedging
   - 40-59: Genuinely split
   - 20-39: Mostly bearish expectations
   - 0-19: Strong consensus it will fall

4. **sentimentReasoning**: 1 sentence citing specific evidence from BOTH sources (e.g. "StockTwits 18/24 Bullish; 4 Reddit posts mention earnings June 10 with bull thesis")

5. **catalyst**: The single most important upcoming event.

6. **priceChange24h**: forward sentiment-implied expected move in next 24h as %.

7. **predictions**: IMPORTANT — do NOT default to neutral/50. Make a real call.
   - oneDay: Use StockTwits ratio + earnings timing as primary signal. If StockTwits is 70%+ Bullish with no earnings headwind → rise 65-75%.
   - oneWeek: Post-earnings drift or catalyst resolution.
   - oneMonth: Longer thesis.
   - direction: "rise" | "fall" | "neutral" (use neutral sparingly)
   - confidence: 0-100 (avoid 50 unless truly no information)

Return JSON: { "stocks": [ { "ticker", "name", "whyTrending", "sentimentLabel", "sentimentScore", "sentimentReasoning", "catalyst", "priceChange24h", "predictions" } ] }

Keep the same order as the input (velocity-ranked).`,
        },
        {
          role: 'user',
          content: `Analyze these velocity-ranked stock discussions from Reddit + StockTwits:\n\n${context}`,
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
    // When GPT returns neutral/50, derive from sentimentScore so we always make a real call
    function oneDayFromSentiment(sentimentScore: number, velocity: number): { direction: 'rise' | 'fall' | 'neutral'; confidence: number } {
      if (sentimentScore >= 70) return { direction: 'rise', confidence: Math.min(50 + (sentimentScore - 70) * 1.5 + velocity * 2, 85) };
      if (sentimentScore <= 35) return { direction: 'fall', confidence: Math.min(50 + (35 - sentimentScore) * 1.5 + velocity * 2, 85) };
      // 36-69: genuinely mixed — neutral is honest, but widen confidence based on how close to edges
      const conf = sentimentScore >= 55 ? 45 : sentimentScore <= 45 ? 45 : 40;
      return { direction: 'neutral', confidence: conf };
    }
    const stocks = scored.map((d, i) => {
      const gpt = gptByTicker.get(d.ticker) ?? gptResult.stocks?.[i] ?? {};
      const topPost = d.allPosts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const mostRecent = d.allPosts.sort((a, b) => b.created_utc - a.created_utc)[0];
      const subreddits = [...new Set(d.allPosts.map(p => p.subreddit))].slice(0, 3);
      const allTopPosts = d.allPosts
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 20)
        .map(p => ({
          quote: p.title,
          upvotes: p.score ?? 0,
          subreddit: p.subreddit,
          ago: timeAgo(p.created_utc),
          url: `https://reddit.com/r/${p.subreddit}/comments/${p.id}`,
        }));

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
        allTopPosts,
        stocktwits: (() => {
          const st = stocktwitsByTicker.get(d.ticker)!;
          return st.total > 0 ? { bullish: st.bullish, bearish: st.bearish, total: st.total } : null;
        })(),
        whyTrending: gpt.whyTrending ?? `Mention volume spiked ${d.velocity.toFixed(1)}x in the last 48 hours.`,
        catalyst: gpt.catalyst ?? null,
        predictions: (() => {
          const sentScore = gpt.sentimentScore ?? 50;
          const rawOneDay = gpt.predictions ? normalizePrediction(gpt.predictions.oneDay) : { direction: 'neutral' as const, confidence: 50 };
          // If GPT hedged to neutral/50 on 1-day, override with sentiment-derived call
          const oneDay = (rawOneDay.direction === 'neutral' && rawOneDay.confidence === 50)
            ? oneDayFromSentiment(sentScore, d.velocity)
            : rawOneDay;
          return {
            oneDay,
            oneWeek:  gpt.predictions ? normalizePrediction(gpt.predictions.oneWeek)  : { direction: 'neutral' as const, confidence: 50 },
            oneMonth: gpt.predictions ? normalizePrediction(gpt.predictions.oneMonth) : { direction: 'neutral' as const, confidence: 50 },
          };
        })(),
        priceChange24h: gpt.priceChange24h ?? 0,
        priceAtSnapshot: null as number | null, // filled in below
      };
    });

    // 7. Fetch current prices so evaluate can compute actual move later
    const snapshotPrices = await Promise.all(
      stocks.map(s => (yf as any).quote(s.ticker).then((q: any) => q.regularMarketPrice ?? null).catch(() => null))
    );
    stocks.forEach((s, i) => { s.priceAtSnapshot = snapshotPrices[i]; });

    // 8. Save to Redis — archive previous snapshot before overwriting
    const previous = await redis.get<any>('buzzd:stocks');
    if (previous?.stocks?.length) {
      await redis.set('buzzd:stocks:yesterday', JSON.stringify(previous), { ex: 90000 * 2 });
    }
    await redis.set('buzzd:stocks', JSON.stringify({ stocks, updatedAt: new Date().toISOString() }), { ex: 90000 });
    console.log(`Saved ${stocks.length} stocks to Redis`);

    return res.status(200).json({ status: 'ok', count: stocks.length, postsAnalyzed: allPosts.length });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
