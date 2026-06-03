import { useState, useEffect } from 'react';
import { stocks as fallbackStocks } from './data/stocks';
import { fetchTrendingStocks } from './data/reddit';
import type { StockEntry } from './data/stocks';
import StockTable from './components/StockTable';
import DetailPanel from './components/DetailPanel';
import AboutPage from './AboutPage';

export default function App() {
  const [stocks, setStocks] = useState<StockEntry[]>(fallbackStocks);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('loading...');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const selectedStock = stocks.find(s => s.ticker === selectedTicker) ?? null;

  useEffect(() => {
    if (window.location.pathname === '/about') return;
    fetchTrendingStocks()
      .then(data => {
        if (data.length > 0) {
          setStocks(data);
          setSelectedTicker(data[0].ticker);
        }
        setLastUpdated('just now');
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load live data — showing cached data');
        setSelectedTicker(fallbackStocks[0].ticker);
        setLoading(false);
      });
  }, []);

  function handleSelect(ticker: string) {
    setSelectedTicker(prev => prev === ticker ? null : ticker);
  }

  if (window.location.pathname === '/about') return <AboutPage />;

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
              buzzd.fyi
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading ? (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Scanning Reddit...</span>
            ) : error ? (
              <span style={{ fontSize: 12, color: '#f59e0b' }}>{error}</span>
            ) : (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Updated {lastUpdated}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Page heading */}
      <div style={{ padding: '24px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', marginBottom: 3 }}>
          Most talked stocks this week
        </h1>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          Ranked by Reddit mention volume · r/wallstreetbets · r/stocks · r/investing · Click any row for details
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
          position: 'relative',
        }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(255,255,255,0.8)', zIndex: 10,
              borderRadius: 10,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Scanning r/wallstreetbets, r/stocks, r/investing...</div>
              </div>
            </div>
          )}
          <StockTable
            stocks={stocks}
            selectedTicker={selectedTicker}
            onSelect={handleSelect}
          />
        </div>

        {/* Detail pane */}
        {selectedStock && (
          <div style={{
            width: 360, flexShrink: 0, background: '#ffffff',
            borderRadius: 10, border: '1px solid #e5e7eb',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <DetailPanel
              stock={selectedStock}
              onClose={() => setSelectedTicker(null)}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0 28px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#d1d5db' }}>
          Data sourced from Reddit via Arctic Shift · Not financial advice ·{' '}
          <a href="/about" style={{ color: '#9ca3af', textDecoration: 'underline' }}>About & Disclaimer</a>
        </p>
      </div>
    </div>
  );
}
