import type { StockEntry, Direction } from '../data/stocks';

interface DetailPanelProps {
  stock: StockEntry;
  onClose: () => void;
}

function verdictColor(d: Direction) {
  return ({ rise: '#16a34a', fall: '#dc2626', neutral: '#6b7280' } as Record<string, string>)[d] ?? '#6b7280';
}
function verdictWord(d: Direction) {
  return ({ rise: 'Rising', fall: 'Falling', neutral: 'Holding' } as Record<string, string>)[d] ?? 'Holding';
}
function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function HorizonRow({ period, direction, confidence }: { period: string; direction: Direction; confidence: number }) {
  const color = verdictColor(direction);
  const word = verdictWord(direction);
  const barColor = direction === 'rise' ? '#22c55e' : direction === 'fall' ? '#ef4444' : '#d1d5db';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 12, color: '#9ca3af', width: 52, flexShrink: 0 }}>{period}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color, width: 64, flexShrink: 0 }}>{word}</span>
      {/* confidence bar */}
      <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${confidence}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af', width: 36, textAlign: 'right', flexShrink: 0 }}>{confidence}%</span>
    </div>
  );
}

export default function DetailPanel({ stock, onClose }: DetailPanelProps) {
  const priceUp = stock.priceChange24h >= 0;
  const primaryDir = stock.predictions.oneDay.direction;

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      borderLeft: '1px solid #e5e7eb',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.03em' }}>
                {stock.ticker}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: priceUp ? '#16a34a' : '#dc2626' }}>
                {priceUp ? '+' : ''}{stock.priceChange24h}%
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{stock.name}</div>
            <a
              href={`https://www.google.com/finance/quote/${stock.ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: '#6b7280', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#111')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
            >
              View on Google Finance ↗
            </a>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 4, lineHeight: 1, fontSize: 18,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Headline verdict */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
              Outlook
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: verdictColor(primaryDir), letterSpacing: '-0.02em', lineHeight: 1 }}>
              {verdictWord(primaryDir)}
            </div>
          </div>
          <div style={{ marginLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
              Sentiment
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1,
              color: stock.sentimentScore >= 70 ? '#16a34a' : stock.sentimentScore >= 45 ? '#d97706' : '#dc2626' }}>
              {stock.sentimentScore}%
            </div>
          </div>
          <div style={{ marginLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>
              Mentions
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {fmt(stock.mentions)}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Sources */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Sources
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stock.subreddits.map(s => (
              <span key={s} style={{ fontSize: 12, color: '#374151', background: '#f3f4f6', borderRadius: 4, padding: '3px 8px' }}>
                r/{s}
              </span>
            ))}
          </div>
        </div>

        {/* Why trending */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Why Trending
          </div>
          <p style={{ fontSize: 14, color: '#374151', lineHeight: '1.65' }}>
            {stock.whyTrending}
          </p>
        </div>

        {/* Sentiment reasoning */}
        {stock.sentimentReasoning && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              Sentiment Basis
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: '1.6', fontStyle: 'italic' }}>
              {stock.sentimentReasoning}
            </p>
          </div>
        )}

        {/* Top post */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Top Post
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: '1.6', fontStyle: 'italic', marginBottom: 8 }}>
              "{stock.topPost.quote}"
            </p>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9ca3af' }}>
              <span>↑ {fmt(stock.topPost.upvotes)}</span>
              <span>r/{stock.topPost.subreddit}</span>
              <span>{stock.lastMentionAgo}</span>
            </div>
          </div>
        </div>

        {/* Predictions */}
        <div>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Predictions
          </div>
          <HorizonRow period="1 Day"   direction={stock.predictions.oneDay.direction}   confidence={stock.predictions.oneDay.confidence} />
          <HorizonRow period="1 Week"  direction={stock.predictions.oneWeek.direction}  confidence={stock.predictions.oneWeek.confidence} />
          <HorizonRow period="1 Month" direction={stock.predictions.oneMonth.direction} confidence={stock.predictions.oneMonth.confidence} />
        </div>
      </div>
    </div>
  );
}
