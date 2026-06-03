import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const cached = await redis.get('buzzd:stocks');
    if (cached) {
      return res.status(200).json(cached);
    }
    // Cache is empty — trigger a fresh analysis
    return res.status(202).json({ status: 'building', message: 'First run — data is being generated. Check back in 60 seconds.' });
  } catch (err) {
    console.error('Redis read error:', err);
    return res.status(500).json({ error: 'Cache unavailable' });
  }
}
