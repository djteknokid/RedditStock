import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import YahooFinanceLib from 'yahoo-finance2';

const YahooFinance = (YahooFinanceLib as any).default ?? YahooFinanceLib;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const MOVE_THRESHOLD = 1.0; // ±1% counts as directional move

type Direction = 'rise' | 'fall' | 'neutral';
type Verdict = 'correct' | 'wrong' | 'neutral_call';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const yesterday = await redis.get<any>('buzzd:stocks:yesterday');
    const today = await redis.get<any>('buzzd:stocks');

    if (!yesterday?.stocks?.length) {
      return res.status(200).json({
        status: 'no_history',
        message: 'No previous snapshot yet. Check back after the next cron run.',
        todayCount: today?.stocks?.length ?? 0,
      });
    }

    // Fetch current prices for all yesterday's tickers in parallel
    const tickers = yesterday.stocks.map((s: any) => s.ticker);
    const priceResults = await Promise.all(tickers.map(getCurrentPrice));
    const currentPrices: Record<string, number> = {};
    tickers.forEach((t: string, i: number) => {
      if (priceResults[i] != null) currentPrices[t] = priceResults[i]!;
    });

    // Score each prediction
    const results = yesterday.stocks.map((s: any) => {
      const predicted: Direction = s.predictions?.oneDay?.direction ?? 'neutral';
      const confidence: number = s.predictions?.oneDay?.confidence ?? 50;
      const priceAtPrediction = s.priceAtSnapshot ?? null; // populated going forward
      const currentPrice = currentPrices[s.ticker] ?? null;

      let actualPct: number | null = null;
      if (priceAtPrediction && currentPrice) {
        actualPct = ((currentPrice - priceAtPrediction) / priceAtPrediction) * 100;
      }

      const verdict: Verdict | 'pending' = actualPct !== null ? score(predicted, actualPct) : 'pending';

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

    // Summary stats — only score non-neutral calls where we have price data
    const scoreable = results.filter((r: any) => r.verdict === 'correct' || r.verdict === 'wrong');
    const correct = scoreable.filter((r: any) => r.verdict === 'correct').length;
    const accuracy = scoreable.length > 0 ? Math.round((correct / scoreable.length) * 100) : null;

    // Pattern breakdown: what signals correlate with correct calls?
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

    return res.status(200).json({
      status: 'ok',
      snapshotTime: yesterday.updatedAt,
      summary: {
        total: results.length,
        directionalCalls: scoreable.length + wrongCalls.length,
        correct,
        wrong: wrongCalls.length,
        neutralCalls: neutralCount,
        pending: pendingCount,
        accuracy,
        avgConfidenceCorrect,
        avgConfidenceWrong,
      },
      results,
    });
  } catch (err) {
    console.error('Evaluate error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
