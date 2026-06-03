import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import YahooFinanceLib from 'yahoo-finance2';

export const maxDuration = 30;

const YahooFinance = (YahooFinanceLib as any).default ?? YahooFinanceLib;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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
      tickers.map(ticker => yf.quote(ticker))
    );

    const prices: Record<string, { price: number; changePercent: number }> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        const q = result.value as any;
        const price = q.regularMarketPrice ?? 0;
        const changePercent = q.regularMarketChangePercent ?? 0;
        if (price > 0) {
          prices[tickers[i]] = { price, changePercent };
        }
      }
    });

    return res.status(200).json({ prices });
  } catch (err) {
    console.error('Prices error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
