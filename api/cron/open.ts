import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import YahooFinanceLib from 'yahoo-finance2';

export const maxDuration = 30;

const YahooFinance = (YahooFinanceLib as any).default ?? YahooFinanceLib;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get current stock list from Redis
    const cached = await redis.get<{ stocks: { ticker: string }[] }>('buzzd:stocks');
    const tickers = cached?.stocks?.map(s => s.ticker) ?? [];

    if (tickers.length === 0) {
      return res.status(200).json({ status: 'no_tickers' });
    }

    // Fetch opening prices for all tickers in parallel
    const priceResults = await Promise.allSettled(
      tickers.map(ticker =>
        (yf as any).quote(ticker)
          .then((q: any) => ({ ticker, price: q.regularMarketPrice ?? null }))
          .catch(() => ({ ticker, price: null }))
      )
    );

    const prices: Record<string, number> = {};
    for (const result of priceResults) {
      if (result.status === 'fulfilled' && result.value.price !== null) {
        prices[result.value.ticker] = result.value.price;
      }
    }

    // Store with today's date key — kept for 7 days
    const dateKey = new Date().toISOString().slice(0, 10);
    await redis.set(`buzzd:prices:open:${dateKey}`, JSON.stringify({
      prices,
      capturedAt: new Date().toISOString(),
      tickers: Object.keys(prices),
    }), { ex: 7 * 86400 });

    console.log(`Opening bell snapshot: ${Object.keys(prices).length} tickers saved for ${dateKey}`);
    return res.status(200).json({ status: 'ok', date: dateKey, count: Object.keys(prices).length });
  } catch (err) {
    console.error('Open cron error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
