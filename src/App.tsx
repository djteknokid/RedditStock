import { useState, useEffect } from 'react';
import { stocks as fallbackStocks } from './data/stocks';
import type { StockEntry } from './data/stocks';
import StockTable from './components/StockTable';
import DetailPanel from './components/DetailPanel';
import AboutPage from './AboutPage';
import EvaluatePage from './EvaluatePage';

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

interface PriceData { price: number; changePercent: number; change5d: number; exchange: string; }

export default function App() {
  const [stocks, setStocks] = useState<StockEntry[]>(fallbackStocks);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'loading' | 'live' | 'building' | 'error'>('loading');
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});

  const selectedStock = stocks.find(s => s.ticker === selectedTicker) ?? null;

  useEffect(() => {
    if (window.location.pathname === '/about') return;
    fetch('/api/stocks')
      .then(r => r.json())
      .then(data => {
        if (data.stocks?.length > 0) {
          setStocks(data.stocks);
          setSelectedTicker(data.stocks[0].ticker);
          setLastUpdated(timeAgo(data.updatedAt));
          setStatus('live');
        } else if (data.status === 'building') {
          setSelectedTicker(fallbackStocks[0].ticker);
          setStatus('building');
        } else {
          setSelectedTicker(fallbackStocks[0].ticker);
          setStatus('error');
        }
        setLoading(false);
      })
      .catch(() => {
        setSelectedTicker(fallbackStocks[0].ticker);
        setStatus('error');
        setLoading(false);
      });

    fetch('/api/prices')
      .then(r => r.json())
      .then(data => { if (data.prices) setPrices(data.prices); })
      .catch(() => {});
  }, []);

  function handleSelect(ticker: string) {
    setSelectedTicker(prev => prev === ticker ? null : ticker);
  }

  if (window.location.pathname === '/about') return <AboutPage />;
  if (window.location.pathname === '/evaluate') return <EvaluatePage />;

  const statusEl = {
    loading: <span style={{ fontSize: 12, color: '#9ca3af' }}>Scanning Reddit...</span>,
    building: <span style={{ fontSize: 12, color: '#f59e0b' }}>First run in progress — check back in 60s</span>,
    error: <span style={{ fontSize: 12, color: '#f59e0b' }}>Showing demo data</span>,
    live: (
      <>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Updated {lastUpdated}</span>
      </>
    ),
  }[status];

  return (
    <div style={{ height: '100svh', background: '#f5f5f3', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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
            {statusEl}
          </div>
        </div>
      </header>

      {/* Page heading */}
      <div style={{ padding: '24px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', marginBottom: 3 }}>
          Most talked stocks this week
        </h1>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          Ranked by Reddit mention velocity · AI analysis by GPT-4o · Click any row for details ·{' '}
          <span style={{ color: '#7c3aed', fontWeight: 600 }}>NEW</span> = buzz high, price flat ·{' '}
          <span style={{ color: '#9ca3af', fontWeight: 600 }}>RAN</span> = already moved today
        </p>
      </div>

      {/* Body: table + panel */}
      <div style={{ flex: 1, display: 'flex', padding: '0 28px 28px', gap: 12, minHeight: 0 }}>

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
                <div style={{ fontSize: 13, color: '#6b7280' }}>Loading Reddit analysis...</div>
              </div>
            </div>
          )}
          <StockTable
            stocks={stocks}
            selectedTicker={selectedTicker}
            onSelect={handleSelect}
            prices={prices}
          />
        </div>

        {/* Detail pane */}
        {selectedStock && (
          <div style={{
            width: 360, flexShrink: 0, background: '#ffffff',
            borderRadius: 10, border: '1px solid #e5e7eb',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            height: 'calc(100svh - 56px - 56px - 28px)',
            alignSelf: 'flex-start', position: 'sticky', top: 0,
          }}>
            <DetailPanel
              stock={selectedStock}
              onClose={() => setSelectedTicker(null)}
              exchange={prices[selectedStock.ticker]?.exchange}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0 28px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#d1d5db' }}>
          Reddit data via Arctic Shift · Analysis by GPT-4o · Not financial advice ·{' '}
          <a href="/evaluate" style={{ color: '#9ca3af', textDecoration: 'underline' }}>Evaluate predictions</a>
          {' · '}
          <a href="/about" style={{ color: '#9ca3af', textDecoration: 'underline' }}>About & Disclaimer</a>
        </p>
      </div>
    </div>
  );
}
