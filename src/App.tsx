import { useState } from 'react';
import { stocks } from './data/stocks';
import StockTable from './components/StockTable';
import DetailPanel from './components/DetailPanel';

export default function App() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(stocks[0].ticker);
  const selectedStock = stocks.find(s => s.ticker === selectedTicker) ?? null;

  function handleSelect(ticker: string) {
    setSelectedTicker(prev => prev === ticker ? null : ticker);
  }

  return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ maxWidth: '100%', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, background: '#111',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
              RedditStock
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Updated 3 min ago</span>
          </div>
        </div>
      </header>

      {/* Page heading */}
      <div style={{ padding: '24px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', marginBottom: 3 }}>
          Most talked stocks this week
        </h1>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          Ranked by Reddit mention volume · AI sentiment &amp; trend analysis · Click any row for details
        </p>
      </div>

      {/* Body: table + panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 28px', gap: 12, minHeight: 0 }}>

        {/* Table pane */}
        <div style={{
          flex: selectedStock ? '1 1 0' : '1 1 auto',
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          overflow: 'auto',
          minWidth: 0,
          transition: 'flex 0.25s ease',
        }}>
          <StockTable
            stocks={stocks}
            selectedTicker={selectedTicker}
            onSelect={handleSelect}
          />
        </div>

        {/* Detail pane */}
        {selectedStock && (
          <div style={{
            width: 360,
            flexShrink: 0,
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <DetailPanel
              stock={selectedStock}
              onClose={() => setSelectedTicker(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
