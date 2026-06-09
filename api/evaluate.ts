import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import YahooFinanceLib from 'yahoo-finance2';

const YahooFinance = (YahooFinanceLib as any).default ?? YahooFinanceLib;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const MOVE_THRESHOLD = 1.0;

type Direction = 'rise' | 'fall' | 'neutral';
type Verdict = 'correct' | 'wrong' | 'neutral_call' | 'pending';

function score(predicted: Direction, actualPct: number): Verdict {
  if (predicted === 'neutral') return 'neutral_call';
  if (predicted === 'rise' && actualPct >= MOVE_THRESHOLD) return 'correct';
  if (predicted === 'fall' && actualPct <= -MOVE_THRESHOLD) return 'correct';
  return 'wrong';
}

async function getCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const q = await (yf as any).quote(ticker) as any;
    return q.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// Fetch next day's opening bell price for evaluation
// Looks for the opening bell snapshot taken the day after the prediction
async function getNextOpenPrice(ticker: string, predictionDate: string): Promise<number | null> {
  // Try the day after prediction first, then up to 3 days (for weekends/holidays)
  const base = new Date(predictionDate);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const key = `buzzd:prices:open:${d.toISOString().slice(0, 10)}`;
    const snap = await redis.get<{ prices: Record<string, number> }>(key);
    if (snap?.prices?.[ticker]) return snap.prices[ticker];
  }
  // No open snapshot found — fall back to current price
  return getCurrentPrice(ticker);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Return the full evaluation series log
    if (req.query.series === '1') {
      const log = await redis.get<any[]>('buzzd:eval:log') ?? [];
      return res.status(200).json({ status: 'ok', series: log });
    }

    const yesterday = await redis.get<any>('buzzd:stocks:yesterday');
    const today = await redis.get<any>('buzzd:stocks');

    if (!yesterday?.stocks?.length) {
      return res.status(200).json({
        status: 'no_history',
        message: 'No previous snapshot yet. Check back after the next cron run.',
        todayCount: today?.stocks?.length ?? 0,
      });
    }

    // Convert UTC timestamp to ET date — cron runs at 2pm ET (18:00 UTC) so this is correct for normal runs.
    // Avoids late-night manual runs (after midnight UTC) being attributed to the next calendar day.
    const predictionDate = yesterday.updatedAt
      ? new Date(new Date(yesterday.updatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })).toISOString().slice(0, 10)
      : '';
    const tickers = yesterday.stocks.map((s: any) => s.ticker);

    // Use next day's opening bell price if available, otherwise current price
    const priceResults = await Promise.all(tickers.map((t: string) => getNextOpenPrice(t, predictionDate)));
    const evalPrices: Record<string, number> = {};
    tickers.forEach((t: string, i: number) => {
      if (priceResults[i] != null) evalPrices[t] = priceResults[i]!;
    });

    // Score each prediction
    const results = yesterday.stocks.map((s: any) => {
      const predicted: Direction = s.predictions?.oneDay?.direction ?? 'neutral';
      const confidence: number = s.predictions?.oneDay?.confidence ?? 50;
      const priceAtPrediction = s.priceAtSnapshot ?? null;
      const evalPrice = evalPrices[s.ticker] ?? null;

      let actualPct: number | null = null;
      if (priceAtPrediction && evalPrice) {
        actualPct = ((evalPrice - priceAtPrediction) / priceAtPrediction) * 100;
      }

      const verdict: Verdict = actualPct !== null ? score(predicted, actualPct) : 'pending';

      return {
        ticker: s.ticker,
        name: s.name,
        predicted,
        confidence,
        catalyst: s.catalyst ?? null,
        sentimentScore: s.sentimentScore,
        velocityScore: s.velocityScore,
        actualPct: actualPct !== null ? Math.round(actualPct * 100) / 100 : null,
        verdict,
        snapshotTime: yesterday.updatedAt,
      };
    });

    const scoreable = results.filter((r: any) => r.verdict === 'correct' || r.verdict === 'wrong');
    const correct = scoreable.filter((r: any) => r.verdict === 'correct').length;
    const accuracy = scoreable.length > 0 ? Math.round((correct / scoreable.length) * 100) : null;

    const correctCalls = scoreable.filter((r: any) => r.verdict === 'correct');
    const wrongCalls = scoreable.filter((r: any) => r.verdict === 'wrong');

    const avgConfidenceCorrect = correctCalls.length
      ? Math.round(correctCalls.reduce((s: number, r: any) => s + r.confidence, 0) / correctCalls.length)
      : null;
    const avgConfidenceWrong = wrongCalls.length
      ? Math.round(wrongCalls.reduce((s: number, r: any) => s + r.confidence, 0) / wrongCalls.length)
      : null;

    const neutralCount = results.filter((r: any) => r.verdict === 'neutral_call').length;
    const pendingCount = results.filter((r: any) => r.verdict === 'pending').length;

    const summary = {
      total: results.length,
      directionalCalls: scoreable.length,
      correct,
      wrong: wrongCalls.length,
      neutralCalls: neutralCount,
      pending: pendingCount,
      accuracy,
      avgConfidenceCorrect,
      avgConfidenceWrong,
    };

    // Append to rolling eval log if this snapshot isn't already recorded
    if (predictionDate && scoreable.length > 0) {
      const log: any[] = (await redis.get<any[]>('buzzd:eval:log')) ?? [];
      const alreadyLogged = log.some(e => e.date === predictionDate);
      if (!alreadyLogged) {
        log.push({
          date: predictionDate,
          snapshotTime: yesterday.updatedAt,
          summary,
          results,
        });
        // Keep last 30 days
        const trimmed = log.slice(-30);
        await redis.set('buzzd:eval:log', JSON.stringify(trimmed), { ex: 90 * 86400 });
      }
    }

    return res.status(200).json({
      status: 'ok',
      snapshotTime: yesterday.updatedAt,
      summary,
      results,
    });
  } catch (err) {
    console.error('Evaluate error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
