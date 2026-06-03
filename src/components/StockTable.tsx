import type { StockEntry, Direction } from '../data/stocks';

interface PriceData {
  price: number;
  changePercent: number;
  change5d: number;
}

interface StockTableProps {
  stocks: StockEntry[];
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  prices: Record<string, PriceData>;
}

function directionChip(d: Direction, confidence: number) {
  const cfg = ({
    rise:    { label: 'Rise', color: '#16a34a', bg: '#f0fdf4' },
    fall:    { label: 'Fall', color: '#dc2626', bg: '#fef2f2' },
    neutral: { label: 'Hold', color: '#6b7280', bg: '#f9fafb' },
  } as Record<string, { label: string; color: string; bg: string }>)[d] ?? { label: 'Hold', color: '#6b7280', bg: '#f9fafb' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: cfg.color,
      background: cfg.bg, borderRadius: 4, padding: '2px 6px',
    }}>
      {cfg.label}
      <span style={{ fontWeight: 400, color: cfg.color, opacity: 0.7 }}>{confidence}%</span>
    </span>
  );
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const COL_WIDTHS = {
  rank:      36,
  ticker:    80,
  price:     90,
  change:    80,
  mentions:  80,
  sentiment: 72,
  oneDay:    88,
  oneWeek:   88,
  oneMonth:  88,
};

const HEADER_STYLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#9ca3af',
  letterSpacing: '0.07em', textTransform: 'uppercase',
  padding: '0 8px 10px', textAlign: 'left', whiteSpace: 'nowrap',
  borderBottom: '1px solid #e5e7eb',
};

const CELL_STYLE: React.CSSProperties = {
  padding: '11px 8px', fontSize: 13, verticalAlign: 'middle',
};

export default function StockTable({ stocks, selectedTicker, onSelect, prices }: StockTableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_WIDTHS.rank }} />
          <col style={{ width: COL_WIDTHS.ticker }} />
          <col />  {/* name — fills remaining space */}
          <col style={{ width: COL_WIDTHS.sentiment }} />
          <col style={{ width: 72 }} />  {/* spike */}
          <col style={{ width: COL_WIDTHS.mentions }} />
          <col style={{ width: COL_WIDTHS.oneDay }} />
          <col style={{ width: COL_WIDTHS.oneWeek }} />
          <col style={{ width: COL_WIDTHS.oneMonth }} />
          <col style={{ width: COL_WIDTHS.price }} />
          <col style={{ width: COL_WIDTHS.change }} />
          <col style={{ width: COL_WIDTHS.change }} />
        </colgroup>

        <thead>
          <tr>
            <th style={{ ...HEADER_STYLE, paddingLeft: 16 }}>#</th>
            <th style={HEADER_STYLE}>Ticker</th>
            <th style={HEADER_STYLE}>Company</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right' }}>Sentiment</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right' }}>48h Spike</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right' }}>Mentions</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>1 Day</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>1 Week</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'center' }}>1 Month</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right' }}>Price</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right' }}>Today</th>
            <th style={{ ...HEADER_STYLE, textAlign: 'right', paddingRight: 16 }}>5 Day</th>
          </tr>
        </thead>

        <tbody>
          {stocks.map((s, i) => {
            const isSelected = s.ticker === selectedTicker;
            const isEven = i % 2 === 0;
            const priceInfo = prices[s.ticker];
            const changePercent = priceInfo?.changePercent ?? s.priceChange24h;
            const priceUp = changePercent >= 0;
            // "already moved" = today's price already up >10% (the news is priced in)
            const alreadyMoved = Math.abs(changePercent) > 10;
            const notMovedYet = priceInfo && Math.abs(changePercent) <= 3 && s.sentimentScore >= 65;

            return (
              <tr
                key={s.ticker}
                onClick={() => onSelect(s.ticker)}
                style={{
                  background: isSelected ? '#f0f7ff' : isEven ? '#ffffff' : '#fafafa',
                  cursor: 'pointer',
                  outline: isSelected ? '1.5px solid #3b82f6' : 'none',
                  outlineOffset: -1,
                  transition: 'background 0.1s',
                  opacity: alreadyMoved ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = '#f5f5f3'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = isEven ? '#ffffff' : '#fafafa'; }}
              >
                {/* Rank */}
                <td style={{ ...CELL_STYLE, paddingLeft: 16, color: '#9ca3af', fontWeight: 500, fontSize: 12 }}>
                  {s.rank}
                </td>

                {/* Ticker */}
                <td style={{ ...CELL_STYLE }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>{s.ticker}</span>
                    {notMovedYet && (
                      <span title="High buzz, price hasn't moved yet" style={{
                        fontSize: 9, fontWeight: 700, color: '#7c3aed',
                        background: '#f5f3ff', borderRadius: 3, padding: '1px 4px',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>NEW</span>
                    )}
                    {alreadyMoved && (
                      <span title="Already moved significantly today" style={{
                        fontSize: 9, fontWeight: 600, color: '#9ca3af',
                        background: '#f3f4f6', borderRadius: 3, padding: '1px 4px',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>RAN</span>
                    )}
                  </div>
                </td>

                {/* Company */}
                <td style={{ ...CELL_STYLE, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </td>

                {/* Sentiment */}
                <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: s.sentimentScore >= 70 ? '#16a34a' : s.sentimentScore >= 45 ? '#d97706' : '#dc2626' }}>
                  {s.sentimentScore}%
                </td>

                {/* 48h spike */}
                <td style={{ ...CELL_STYLE, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {s.velocityScore != null && s.velocityScore > 1.2
                    ? <span style={{ fontWeight: 600, color: '#d97706' }}>{s.velocityScore.toFixed(1)}×</span>
                    : <span style={{ color: '#d1d5db' }}>—</span>
                  }
                </td>

                {/* Mentions */}
                <td style={{ ...CELL_STYLE, textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(s.mentions)}
                </td>

                {/* 1 day */}
                <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                  {directionChip(s.predictions.oneDay.direction, s.predictions.oneDay.confidence)}
                </td>

                {/* 1 week */}
                <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                  {directionChip(s.predictions.oneWeek.direction, s.predictions.oneWeek.confidence)}
                </td>

                {/* 1 month */}
                <td style={{ ...CELL_STYLE, textAlign: 'center' }}>
                  {directionChip(s.predictions.oneMonth.direction, s.predictions.oneMonth.confidence)}
                </td>

                {/* Price */}
                <td style={{ ...CELL_STYLE, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#111', fontWeight: 500 }}>
                  {priceInfo
                    ? `$${priceInfo.price < 10 ? priceInfo.price.toFixed(3) : priceInfo.price < 1000 ? priceInfo.price.toFixed(2) : priceInfo.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    : <span style={{ color: '#d1d5db' }}>—</span>
                  }
                </td>

                {/* Today's change */}
                <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: priceUp ? '#16a34a' : '#dc2626' }}>
                  {priceInfo
                    ? `${priceUp ? '+' : ''}${changePercent.toFixed(2)}%`
                    : <span style={{ color: '#d1d5db', fontWeight: 400 }}>—</span>
                  }
                </td>

                {/* 5 day change */}
                {(() => {
                  const c5 = priceInfo?.change5d ?? null;
                  const up5 = (c5 ?? 0) >= 0;
                  return (
                    <td style={{ ...CELL_STYLE, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', paddingRight: 16, color: up5 ? '#16a34a' : '#dc2626' }}>
                      {c5 != null
                        ? `${up5 ? '+' : ''}${c5.toFixed(2)}%`
                        : <span style={{ color: '#d1d5db', fontWeight: 400 }}>—</span>
                      }
                    </td>
                  );
                })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
