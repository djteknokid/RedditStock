// Pull live data from buzzd.fyi and save a local snapshot for evaluation
// Usage: node scripts/snapshot.mjs

import { writeFileSync } from 'fs';
import { mkdirSync } from 'fs';

const API = 'https://buzzd.fyi/api/stocks';
const OUT_DIR = './snapshots';

const res = await fetch(API);
const data = await res.json();

if (!data.stocks?.length) {
  console.error('No stocks in response:', data);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// Full snapshot
const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
const filename = `${OUT_DIR}/snapshot-${ts}.json`;
writeFileSync(filename, JSON.stringify(data, null, 2));

// Human-readable summary
console.log(`\n📊 buzzd.fyi snapshot — ${data.updatedAt}`);
console.log(`   ${data.stocks.length} stocks | saved to ${filename}\n`);
console.log('Rank  Ticker  1Day            Conf  Sentiment  Catalyst');
console.log('─'.repeat(80));

for (const s of data.stocks) {
  const od = s.predictions?.oneDay ?? {};
  const dir = (od.direction ?? 'neutral').padEnd(8);
  const conf = String(od.confidence ?? 0).padStart(3) + '%';
  const sent = String(s.sentimentScore ?? 0).padStart(3) + '%';
  const catalyst = (s.catalyst ?? '—').slice(0, 35);
  const rank = String(s.rank).padStart(2);
  const ticker = s.ticker.padEnd(6);
  console.log(`${rank}.   ${ticker}  ${dir}  ${conf}   ${sent}      ${catalyst}`);
}

console.log('\n');
