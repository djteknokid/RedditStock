import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import yahooFinance from 'yahoo-finance2';

export const maxDuration = 30;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const cached = await redis.get<{ stocks: { ticker: string }[] }>('buzzd:stocks');
    if (!cached || !cached.stocks?.length) {
      return res.status(200).json({ prices: {} });
    }

    const tickers = cached.stocks.map(s => s.ticker);

    const results = await Promise.allSettled(
      tickers.map(ticker =>
        yahooFinance.quote(ticker, { fields: ['regularMarketPrice', 'regularMarketChangePercent'] })
      )
    );

    const prices: Record<string, { price: number; changePercent: number }> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const q = result.value;
        prices[tickers[i]] = {
          price: q.regularMarketPrice ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
        };
      }
    });

    return res.status(200).json({ prices });
  } catch (err) {
    console.error('Prices error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
