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

const APIFY_RUN_URL =
  'https://api.apify.com/v2/acts/harshmaur~reddit-scraper-pro/run-sync-get-dataset-items';

const STOCKTWITS_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';

interface ApifyPost {
  id: string;
  title: string;
  body?: string;
  upVotes?: number;
  score?: number;
  scorePerHour?: number;
  commentsPerHour?: number;
  flair?: string;
  createdAt?: string;
  communityName?: string;
  url?: string;
}

interface StockTwitsMessage {
  body: string;
  created_at: string;
  sentiment?: { basic: 'Bullish' | 'Bearish' } | null;
}

interface StockTwitsSentiment {
  bullish: number;
  bearish: number;
  total: number;
  messages: string[];
}

async function fetchApifyPosts(): Promise<ApifyPost[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(`${APIFY_RUN_URL}?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [
          { url: 'https://www.reddit.com/r/wallstreetbets/hot/' },
          { url: 'https://www.reddit.com/r/stocks/hot/' },
        ],
        searchPosts: false,
        crawlCommentsPerPost: false,
        maxPostsCount: 50,
        fastMode: true,
        proxy: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Apify returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
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

    const bullishTerms = /\b(bull|bullish|calls?|long|buy|buying|bought|moon|rocket|squeeze|breakout|upside|pumping|ripping|going up|load(ing|ed)|accumulate|earnings play|dip buy|green|up|higher|hold(ing)?|strong|love|great|good|nice)\b|🚀|📈|💎|🟢|🔥|⬆️/i;
    const bearishTerms = /\b(bear|bearish|puts?|short|sell|selling|sold|dump(ing)?|crash|downside|collapse|drop(ping)?|overvalued|going down|exit|bail|red|down|lower|weak|hate|bad|worst|avoid|warning|careful|caution)\b|📉|🔴|💀|🩳|⬇️|😬|🤮/i;

    for (const m of msgs) {
      if (m.sentiment?.basic === 'Bullish') bullish++;
      else if (m.sentiment?.basic === 'Bearish') bearish++;
      else if (m.body) {
        const hasBull = bullishTerms.test(m.body);
        const hasBear = bearishTerms.test(m.body);
        if (hasBull && !hasBear) bullish++;
        else if (hasBear && !hasBull) bearish++;
      }
      if (m.body && bodies.length < 8) bodies.push(m.body.replace(/\n+/g, ' ').trim().slice(0, 120));
    }

    return { bullish, bearish, total: msgs.length, messages: bodies };
  } catch {
    return { bullish: 0, bearish: 0, total: 0, messages: [] };
  }
}

const SKIP = new Set([
  'DD','IMO','WSB','NYSE','IPO','ETF','CEO','SEC','FDA','ATH','YTD','AI','US','EU','UK',
  'FOR','THE','AND','BUT','OR','IT','MY','BE','IS','ON','IN','TO','AT','BY','IF','SO',
  'WE','NO','DO','UP','AM','AN','GO','OH','OK','OP','PE','EV','ER','RE','ED','TV',
  'ALL','ANY','ARE','CAN','DID','GET','GOT','HAS','HAD','HIM','HIS','HOW','ITS','LET',
  'MAY','NEW','NOT','NOW','OFF','OLD','OWN','SAY','SHE','TOO','USE','WAS','WHO','WHY',
  'WON','YES','YET','YOU','GDP','CPI','FED','BOJ','ECB','YOLO','FOMO','HODL','TBH',
  'FYI','EOD','EOW','AMA','TIL','ETA','PSA','TBA','TBD','TLDR','CALLS','PUTS','ITM',
  'OTM','ATM','DTE','IV','OI','SPX','NDX','RUT','VIX','FOMC','JPM','Q1','Q2','Q3','Q4',
  'GTC','EOY','AH','PM','TA','DD','PT','SL','TP','RR','PNL','PL','YOY','QOQ','MOM',
  'HODL','BTFD','BTFP','RIPS','DIPS','BULL','BEAR','MOON','DUMP','PUMP','BAGS','LOSS',
  'GAIN','PLAY','YOLO','FOMO','APES','GANG','HOLD','SOLD','BUY','SELL','LONG','SHORT',
  'THIS','THAT','THEY','THEM','THEN','THAN','WHEN','WHAT','WITH','FROM','HAVE','BEEN',
  'WILL','JUST','LIKE','MORE','ALSO','EVEN','ONLY','OVER','BACK','INTO','WELL','WANT',
  'NEED','KNOW','GOOD','MAKE','LOOK','TIME','YEAR','WEEK','LAST','NEXT','SOME','MOST',
  'MANY','MUCH','VERY','SAME','TAKE','GIVE','COME','TELL','SHOW','HIGH','LATE','HARD',
  'BTC','ETH','SOL','XRP','DOGE','SHIB','LINK','DOT','ADA','MATIC','AVAX','UNI',
  'YT','YTD','IG','DM','PM','AM','HR','HRS','WK','MO','YR',
  'EDIT','TLDR','IMHO','IMO','AFAIK','IIRC','TIL','AMA','ELI5',
  'HOT','NEW','TOP','BEST','RISING','CONTROVERSIAL',
]);

const COMPANY_TO_TICKER: Record<string, string> = {
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
  'openai': 'MSFT',
  'chatgpt': 'MSFT',
  'spy': 'SPY', 'qqq': 'QQQ', 'iwm': 'IWM',
  'marathon': 'MARA', 'riot': 'RIOT', 'riot platforms': 'RIOT',
  'marvell': 'MRVL',
  'ast spacemobile': 'ASTS', 'ast': 'ASTS',
  'rocket lab': 'RKLB', 'rocketlab': 'RKLB',
  'intuitive machines': 'LUNR',
  'spacex': 'SPCX',
  'ibm': 'IBM',
};

function extractTickers(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  // $TICKER pattern — highest confidence
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    if (!SKIP.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); results.push(m[1]); }
  }

  // Bare ALL-CAPS 2-5 letter words
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (!SKIP.has(m[1]) && !seen.has(m[1]) && /^[A-Z]+$/.test(m[1])) {
      seen.add(m[1]); results.push(m[1]);
    }
  }

  // Company name / nickname matching
  const lower = text.toLowerCase();
  const phrases = Object.keys(COMPANY_TO_TICKER).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (lower.includes(phrase)) {
      const ticker = COMPANY_TO_TICKER[phrase];
      if (!seen.has(ticker)) { seen.add(ticker); results.push(ticker); }
    }
  }

  return results;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

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

interface TickerAggregate {
  ticker: string;
  posts: ApifyPost[];
  totalScorePerHour: number;
  maxScorePerHour: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch hot posts from WSB + r/stocks via Apify residential proxy
    console.log('Fetching Reddit hot posts via Apify...');
    const apifyPosts = await fetchApifyPosts();
    console.log(`Apify returned ${apifyPosts.length} posts`);

    if (apifyPosts.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: 0 });
    }

    // 2. Extract tickers from each post, aggregate by ticker
    const tickerMap = new Map<string, TickerAggregate>();

    for (const post of apifyPosts) {
      const titleTickers = extractTickers(post.title ?? '');
      const bodyTickers = extractTickers(post.body ?? '');

      // Title mention required; body tickers only count if they're also in the title
      if (titleTickers.length === 0) continue;
      const tickers = [...new Set([...titleTickers, ...bodyTickers.filter(t => titleTickers.includes(t))])];
      const seenInPost = new Set<string>();

      for (const ticker of tickers) {
        if (seenInPost.has(ticker)) continue;
        seenInPost.add(ticker);

        if (!tickerMap.has(ticker)) {
          tickerMap.set(ticker, { ticker, posts: [], totalScorePerHour: 0, maxScorePerHour: 0 });
        }
        const agg = tickerMap.get(ticker)!;
        agg.posts.push(post);
        const sph = post.scorePerHour ?? 0;
        agg.totalScorePerHour += sph;
        if (sph > agg.maxScorePerHour) agg.maxScorePerHour = sph;
      }
    }

    // 3. Score by scorePerHour velocity (Apify computes this — replaces Arctic Shift velocity)
    const scored = [...tickerMap.values()]
      .filter(d => d.posts.length >= 1) // at least one title mention
      .map(d => {
        // Primary signal: total scorePerHour across all posts mentioning this ticker
        const velocity = d.totalScorePerHour > 0
          ? d.totalScorePerHour
          : d.posts.length * 10; // fallback if scorePerHour not available
        return { ...d, velocity };
      })
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 40);

    console.log(`Top tickers by scorePerHour: ${scored.slice(0, 8).map(d => `${d.ticker}(${d.velocity.toFixed(0)})`).join(', ')}`);

    if (scored.length === 0) {
      return res.status(200).json({ status: 'no_data', postsCount: apifyPosts.length });
    }

    // 4. Fetch earnings dates + StockTwits sentiment in parallel
    console.log('Fetching earnings dates and StockTwits sentiment...');
    const [earningsResults, stocktwitsResults] = await Promise.all([
      Promise.all(scored.map(d => getEarningsContext(d.ticker))),
      Promise.all(scored.map(d => fetchStockTwits(d.ticker))),
    ]);
    const earningsByTicker = new Map(scored.map((d, i) => [d.ticker, earningsResults[i]]));
    const stocktwitsByTicker = new Map(scored.map((d, i) => [d.ticker, stocktwitsResults[i]]));

    // Quality filter: keep tickers with meaningful signal from at least one source
    const qualified = scored.filter(d => {
      const st = stocktwitsByTicker.get(d.ticker)!;
      const hasRedditVelocity = d.velocity >= 6 || d.posts.length >= 2;
      const hasStockTwitsSignal = (st.bullish + st.bearish) >= 5;
      return hasRedditVelocity || hasStockTwitsSignal;
    }).slice(0, 30);

    console.log(`StockTwits coverage: ${stocktwitsResults.filter(s => s.total > 0).length}/${scored.length}`);
    console.log(`Qualified tickers (${qualified.length}): ${qualified.map(d => d.ticker).join(', ')}`);

    // 5. Build GPT context — Reddit posts + StockTwits + earnings
    const context = qualified.map(d => {
      const topPosts = d.posts
        .sort((a, b) => (b.scorePerHour ?? b.score ?? 0) - (a.scorePerHour ?? a.score ?? 0))
        .slice(0, 15)
        .map(p => {
          const body = (p.body ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
          const sub = p.communityName ?? 'reddit';
          const sph = p.scorePerHour != null ? ` ↑${p.scorePerHour.toFixed(0)}/hr` : '';
          return `  - [r/${sub}${sph}] ${p.title}${body ? ` | ${body}` : ''}`;
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
        `Reddit: ${d.posts.length} posts | Total scorePerHour: ${d.velocity.toFixed(0)} | Peak scorePerHour: ${d.maxScorePerHour.toFixed(0)}`,
        stLine,
        `Earnings: ${earningsByTicker.get(d.ticker) ?? 'Unknown'}`,
        `Reddit top posts:`,
        topPosts,
        stMessages,
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');

    // 6. GPT-4o analysis
    console.log('Sending to GPT-4o...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a forward-looking financial signal analyst. Each ticker comes with TWO independent data sources:
1. Reddit posts — tells you WHY it's trending and what narrative is driving discussion. The "scorePerHour" field is the post's upvote velocity — a high scorePerHour means this post is gaining traction fast right now.
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
    if (gptResult.stocks?.[0]) {
      console.log('GPT sample:', JSON.stringify(gptResult.stocks[0]).slice(0, 300));
    }

    const gptByTicker = new Map<string, any>();
    for (const s of gptResult.stocks ?? []) {
      if (s.ticker) gptByTicker.set(s.ticker.toUpperCase(), s);
    }

    function normalizeDirection(d: string): 'rise' | 'fall' | 'neutral' {
      const s = (d ?? '').toLowerCase();
      if (s === 'rise' || s === 'up' || s === 'bullish') return 'rise';
      if (s === 'fall' || s === 'down' || s === 'bearish') return 'fall';
      return 'neutral';
    }
    function normalizePrediction(p: any) {
      return { direction: normalizeDirection(p?.direction), confidence: Math.round(p?.confidence ?? 50) };
    }
    function oneDayFromSentiment(sentimentScore: number, velocity: number): { direction: 'rise' | 'fall' | 'neutral'; confidence: number } {
      if (sentimentScore >= 70) return { direction: 'rise', confidence: Math.round(Math.min(50 + (sentimentScore - 70) * 1.5 + Math.log1p(velocity) * 3, 85)) };
      if (sentimentScore <= 35) return { direction: 'fall', confidence: Math.round(Math.min(50 + (35 - sentimentScore) * 1.5 + Math.log1p(velocity) * 3, 85)) };
      const conf = sentimentScore >= 55 ? 45 : sentimentScore <= 45 ? 45 : 40;
      return { direction: 'neutral', confidence: conf };
    }

    const stocks = qualified.map((d, i) => {
      const gpt = gptByTicker.get(d.ticker) ?? gptResult.stocks?.[i] ?? {};
      const topPost = d.posts.sort((a, b) => (b.scorePerHour ?? b.score ?? 0) - (a.scorePerHour ?? a.score ?? 0))[0];
      const mostRecent = d.posts.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
      const subreddits = [...new Set(d.posts.map(p => p.communityName ?? 'wallstreetbets'))].slice(0, 3);
      const allTopPosts = d.posts
        .sort((a, b) => (b.scorePerHour ?? b.score ?? 0) - (a.scorePerHour ?? a.score ?? 0))
        .slice(0, 20)
        .map(p => ({
          quote: p.title,
          upvotes: p.upVotes ?? p.score ?? 0,
          subreddit: p.communityName ?? 'wallstreetbets',
          ago: p.createdAt ? timeAgo(p.createdAt) : 'recently',
          url: p.url ?? `https://reddit.com/r/${p.communityName ?? 'wallstreetbets'}`,
        }));

      return {
        rank: i + 1,
        ticker: d.ticker,
        name: gpt.name ?? d.ticker,
        mentions: d.posts.length,
        totalMentions: d.posts.length,
        velocityScore: Math.round(d.velocity),
        sentimentScore: gpt.sentimentScore ?? 50,
        sentimentLabel: gpt.sentimentLabel ?? 'mixed',
        sentimentReasoning: gpt.sentimentReasoning ?? '',
        subreddits,
        lastMentionAgo: mostRecent?.createdAt ? timeAgo(mostRecent.createdAt) : 'recently',
        topPost: topPost
          ? { quote: topPost.title, upvotes: topPost.upVotes ?? topPost.score ?? 0, subreddit: topPost.communityName ?? 'wallstreetbets' }
          : { quote: 'Trending on Reddit', upvotes: 0, subreddit: 'wallstreetbets' },
        allTopPosts,
        stocktwits: (() => {
          const st = stocktwitsByTicker.get(d.ticker)!;
          return st.total > 0 ? { bullish: st.bullish, bearish: st.bearish, total: st.total } : null;
        })(),
        whyTrending: gpt.whyTrending ?? `Trending on Reddit with ${d.velocity.toFixed(0)} scorePerHour.`,
        catalyst: gpt.catalyst ?? null,
        predictions: (() => {
          const sentScore = gpt.sentimentScore ?? 50;
          const rawOneDay = gpt.predictions ? normalizePrediction(gpt.predictions.oneDay) : { direction: 'neutral' as const, confidence: 50 };
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
        priceAtSnapshot: null as number | null,
      };
    });

    // 7. Attach today's opening bell price (or current price fallback)
    const dateKey = new Date().toISOString().slice(0, 10);
    const openSnapshot = await redis.get<{ prices: Record<string, number> }>(`buzzd:prices:open:${dateKey}`);
    const openPrices = openSnapshot?.prices ?? {};

    const snapshotPrices = await Promise.all(
      stocks.map(s => {
        if (openPrices[s.ticker]) return Promise.resolve(openPrices[s.ticker]);
        return (yf as any).quote(s.ticker).then((q: any) => q.regularMarketPrice ?? null).catch(() => null);
      })
    );
    stocks.forEach((s, i) => { s.priceAtSnapshot = snapshotPrices[i]; });
    console.log(`Price snapshot: ${Object.keys(openPrices).length > 0 ? 'using opening bell prices' : 'fallback to current prices'}`);

    // 8. Split top 10 bullish + top 10 bearish
    const bullish = [...stocks].sort((a, b) => b.sentimentScore - a.sentimentScore).slice(0, 10);
    const bearish = [...stocks].sort((a, b) => a.sentimentScore - b.sentimentScore).slice(0, 10);
    const bearishOnly = bearish.filter(s => !bullish.find(b => b.ticker === s.ticker));
    const finalStocks = [
      ...bullish.map((s, i) => ({ ...s, rank: i + 1, group: 'bullish' as const })),
      ...bearishOnly.map((s, i) => ({ ...s, rank: i + 1, group: 'bearish' as const })),
    ];

    // 9. Archive previous snapshot, save new one
    const previous = await redis.get<any>('buzzd:stocks');
    if (previous?.stocks?.length) {
      await redis.set('buzzd:stocks:yesterday', JSON.stringify(previous), { ex: 90000 * 2 });
    }
    await redis.set('buzzd:stocks', JSON.stringify({ stocks: finalStocks, updatedAt: new Date().toISOString() }), { ex: 90000 });
    console.log(`Saved ${finalStocks.length} stocks (${bullish.length} bullish, ${bearishOnly.length} bearish) to Redis`);

    return res.status(200).json({ status: 'ok', count: stocks.length, postsAnalyzed: apifyPosts.length });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
