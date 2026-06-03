import type { StockEntry, Direction } from '../data/stocks';
import HorizonCell from './TrendBadge';
import MentionSource from './SubredditPill';
import TopPostSnippet from './TopPostSnippet';

interface StockCardProps {
  stock: StockEntry;
  isHero?: boolean;
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function verdictColor(d: Direction): string {
  return d === 'rise' ? '#16a34a' : d === 'fall' ? '#dc2626' : '#6b7280';
}

function verdictWord(d: Direction): string {
  return d === 'rise' ? 'Rising' : d === 'fall' ? 'Falling' : 'Holding';
}

export default function StockCard({ stock, isHero = false }: StockCardProps) {
  const primaryDir = stock.predictions.oneDay.direction;
  const priceUp = stock.priceChange24h >= 0;

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 12,
        border: isHero ? '1.5px solid #e5e7eb' : '1px solid #e5e7eb',
        padding: isHero ? '24px 28px' : '18px 24px',
        boxShadow: isHero ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = isHero ? '0 2px 12px rgba(0,0,0,0.06)' : 'none'; }}
    >
      {/* Top row: rank + ticker + name + price + mentions */}
      <div className="flex items-baseline gap-3 flex-wrap" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', minWidth: 20 }}>#{stock.rank}</span>

        <span style={{ fontSize: isHero ? 24 : 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
          {stock.ticker}
        </span>

        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}>{stock.name}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: priceUp ? '#16a34a' : '#dc2626' }}>
            {priceUp ? '+' : ''}{stock.priceChange24h}% today
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmt(stock.mentions)} mentions</span>
          <span style={{ fontSize: 11, color: '#d1d5db' }}>{stock.lastMentionAgo}</span>
        </div>
      </div>

      {/* Sources row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {stock.subreddits.map(s => <MentionSource key={s} name={s} />)}
      </div>

      {/* Analysis — the dominant section */}
      <p style={{ fontSize: 14, color: '#374151', lineHeight: '1.6', marginBottom: 14 }}>
        {stock.whyTrending}
      </p>

      {/* Top post */}
      <div style={{ marginBottom: 18 }}>
        <TopPostSnippet
          quote={stock.topPost.quote}
          upvotes={stock.topPost.upvotes}
          subreddit={stock.topPost.subreddit}
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f3f4f6', marginBottom: 14 }} />

      {/* Prediction row — the verdict */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* Primary verdict — dominant */}
        <div style={{ marginRight: 24 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            Outlook
          </div>
          <div style={{ fontSize: isHero ? 20 : 16, fontWeight: 700, color: verdictColor(primaryDir), letterSpacing: '-0.01em' }}>
            {verdictWord(primaryDir)}
          </div>
        </div>

        {/* Horizon breakdown */}
        <div style={{ display: 'flex', gap: 20 }}>
          <HorizonCell period="1 day"  direction={stock.predictions.oneDay.direction}   confidence={stock.predictions.oneDay.confidence} />
          <HorizonCell period="1 week" direction={stock.predictions.oneWeek.direction}  confidence={stock.predictions.oneWeek.confidence} />
          <HorizonCell period="1 mo"   direction={stock.predictions.oneMonth.direction} confidence={stock.predictions.oneMonth.confidence} />
        </div>

        {/* Sentiment score — far right, minimal */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            Sentiment
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: stock.sentimentScore >= 70 ? '#16a34a' : stock.sentimentScore >= 45 ? '#d97706' : '#dc2626' }}>
            {stock.sentimentScore}%
          </div>
        </div>
      </div>
    </div>
  );
}
