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

async function getQuoteData(ticker: string): Promise<{ price: number; changePercent: number; change5d: number; exchange: string } | null> {
  try {
    const [quote, chart] = await Promise.all([
      yf.quote(ticker) as Promise<any>,
      yf.chart(ticker, { period1: new Date(Date.now() - 7 * 86400000), interval: '1d' as any }).catch(() => null) as Promise<any>,
    ]);

    const price = quote.regularMarketPrice ?? 0;
    if (price === 0) return null;

    const changePercent = quote.regularMarketChangePercent ?? 0;

    let change5d = 0;
    const quotes = chart?.quotes ?? [];
    if (quotes.length >= 2) {
      const first = quotes[0].close ?? quotes[0].open ?? 0;
      const last = quotes[quotes.length - 1].close ?? 0;
      if (first > 0) change5d = (last - first) / first * 100;
    }

    // Map Yahoo exchange name to Google Finance exchange suffix
    const exch = (quote.fullExchangeName ?? quote.exchange ?? '').toUpperCase();
    let exchange = 'NASDAQ';
    if (exch.includes('NYSE') || exch === 'NYQ') exchange = 'NYSE';
    else if (exch.includes('NASDAQ') || exch.includes('NMS') || exch === 'NAS') exchange = 'NASDAQ';
    else if (exch.includes('ARCA') || exch === 'PCX') exchange = 'NYSEARCA';
    else if (exch.includes('AMEX') || exch === 'ASE') exchange = 'NYSEAMERICAN';
    else if (exch.includes('OTC') || exch === 'PNK') exchange = 'OTCMKTS';

    return { price, changePercent, change5d, exchange };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const cached = await redis.get<{ stocks: { ticker: string }[] }>('buzzd:stocks');
    if (!cached || !cached.stocks?.length) {
      return res.status(200).json({ prices: {} });
    }

    const tickers = cached.stocks.map(s => s.ticker);
    const results = await Promise.allSettled(tickers.map(getQuoteData));

    const prices: Record<string, { price: number; changePercent: number; change5d: number; exchange: string }> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        prices[tickers[i]] = result.value;
      }
    });

    return res.status(200).json({ prices });
  } catch (err) {
    console.error('Prices error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
