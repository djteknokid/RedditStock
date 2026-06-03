import { useState, useEffect } from 'react';

type Verdict = 'correct' | 'wrong' | 'neutral_call' | 'pending';

interface EvalResult {
  ticker: string;
  name: string;
  predicted: 'rise' | 'fall' | 'neutral';
  confidence: number;
  catalyst: string | null;
  sentimentScore: number;
  velocityScore: number;
  actualPct: number | null;
  verdict: Verdict;
  snapshotTime: string;
}

interface EvalData {
  status: string;
  message?: string;
  snapshotTime?: string;
  summary?: {
    total: number;
    directionalCalls: number;
    correct: number;
    wrong: number;
    neutralCalls: number;
    pending: number;
    accuracy: number | null;
    avgConfidenceCorrect: number | null;
    avgConfidenceWrong: number | null;
  };
  results?: EvalResult[];
}

function verdictBadge(v: Verdict) {
  if (v === 'correct') return <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Correct</span>;
  if (v === 'wrong') return <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>✗ Wrong</span>;
  if (v === 'neutral_call') return <span style={{ color: '#9ca3af', fontSize: 13 }}>— No call</span>;
  return <span style={{ color: '#d97706', fontSize: 13 }}>⏳ Pending</span>;
}

function directionColor(d: string) {
  if (d === 'rise') return '#16a34a';
  if (d === 'fall') return '#dc2626';
  return '#9ca3af';
}

function pctColor(n: number | null) {
  if (n === null) return '#9ca3af';
  return n >= 1 ? '#16a34a' : n <= -1 ? '#dc2626' : '#6b7280';
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function EvaluatePage() {
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'neutral_call'>('all');

  useEffect(() => {
    fetch('/api/evaluate')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>Loading evaluation...</span>
    </div>
  );

  if (!data || data.status === 'no_history') return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>No history yet</div>
      <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 360, textAlign: 'center' }}>
        {data?.message ?? 'The evaluation page requires at least two cron runs to compare predictions against outcomes.'}
      </div>
      <a href="/" style={{ marginTop: 16, fontSize: 12, color: '#6b7280', textDecoration: 'underline' }}>← Back to dashboard</a>
    </div>
  );

  const { summary, results = [] } = data;
  const filtered = filter === 'all' ? results : results.filter(r => r.verdict === filter);

  return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 700, color: '#111', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            ← buzzd.fyi
          </a>
          <span style={{ color: '#e5e7eb' }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Prediction Evaluation</span>
          {data.snapshotTime && (
            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
              Predictions from {timeAgo(data.snapshotTime)}
            </span>
          )}
        </div>
      </header>

      <div style={{ padding: '24px 28px', maxWidth: 900, width: '100%', margin: '0 auto' }}>

        {/* Summary cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              {
                label: 'Accuracy',
                value: summary.accuracy !== null ? `${summary.accuracy}%` : '—',
                sub: `${summary.correct} correct / ${summary.correct + summary.wrong} calls`,
                color: summary.accuracy !== null
                  ? summary.accuracy >= 60 ? '#16a34a' : summary.accuracy >= 45 ? '#d97706' : '#dc2626'
                  : '#111',
              },
              {
                label: 'Directional Calls',
                value: summary.correct + summary.wrong,
                sub: `${summary.neutralCalls} no-calls (neutral/50%)`,
                color: '#111',
              },
              {
                label: 'Avg Confidence (Correct)',
                value: summary.avgConfidenceCorrect !== null ? `${summary.avgConfidenceCorrect}%` : '—',
                sub: `vs ${summary.avgConfidenceWrong ?? '—'}% on wrong calls`,
                color: '#16a34a',
              },
              {
                label: 'No-Call Rate',
                value: summary.total > 0 ? `${Math.round(summary.neutralCalls / summary.total * 100)}%` : '—',
                sub: `${summary.neutralCalls} of ${summary.total} stocks`,
                color: summary.neutralCalls / (summary.total || 1) > 0.4 ? '#dc2626' : '#6b7280',
              },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: card.color, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{card.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['all', 'correct', 'wrong', 'neutral_call'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, border: '1px solid',
                cursor: 'pointer',
                background: filter === f ? '#111' : '#fff',
                color: filter === f ? '#fff' : '#6b7280',
                borderColor: filter === f ? '#111' : '#e5e7eb',
              }}
            >
              {f === 'all' ? `All (${results.length})`
                : f === 'correct' ? `✓ Correct (${results.filter(r => r.verdict === 'correct').length})`
                : f === 'wrong' ? `✗ Wrong (${results.filter(r => r.verdict === 'wrong').length})`
                : `— No call (${results.filter(r => r.verdict === 'neutral_call').length})`}
            </button>
          ))}
        </div>

        {/* Results table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ticker', 'Predicted', 'Confidence', 'Sentiment', 'Actual Move', 'Verdict', 'Catalyst'].map((h, i) => (
                  <th key={h} style={{
                    fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.07em',
                    textTransform: 'uppercase', padding: i === 0 ? '10px 8px 10px 20px' : '10px 8px',
                    textAlign: i === 0 ? 'left' : i === 6 ? 'left' : 'center',
                    borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.ticker} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '11px 8px 11px 20px', fontWeight: 700, fontSize: 13, color: '#111' }}>
                    {r.ticker}
                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{r.name}</div>
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: directionColor(r.predicted), textTransform: 'capitalize' }}>
                      {r.predicted}
                    </span>
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12, color: '#374151' }}>
                    {r.confidence}%
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12,
                    color: r.sentimentScore >= 70 ? '#16a34a' : r.sentimentScore >= 45 ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                    {r.sentimentScore}%
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 13, fontWeight: 600,
                    color: pctColor(r.actualPct), fontVariantNumeric: 'tabular-nums' }}>
                    {r.actualPct !== null
                      ? `${r.actualPct >= 0 ? '+' : ''}${r.actualPct.toFixed(2)}%`
                      : <span style={{ color: '#d1d5db' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                    {verdictBadge(r.verdict)}
                  </td>
                  <td style={{ padding: '11px 20px 11px 8px', fontSize: 11, color: '#6b7280', maxWidth: 220 }}>
                    {r.catalyst ?? <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Why section — pattern breakdown */}
        {summary && (summary.correct + summary.wrong) >= 3 && (
          <div style={{ marginTop: 24, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Pattern Analysis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 8 }}>
                  ✓ What correct calls had in common
                </div>
                {results.filter(r => r.verdict === 'correct').map(r => (
                  <div key={r.ticker} style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                    <strong>{r.ticker}</strong> {r.confidence}% conf · {r.catalyst ?? 'no catalyst'} · sent {r.sentimentScore}%
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
                  ✗ What wrong calls had in common
                </div>
                {results.filter(r => r.verdict === 'wrong').map(r => (
                  <div key={r.ticker} style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                    <strong>{r.ticker}</strong> {r.confidence}% conf · {r.catalyst ?? 'no catalyst'} · sent {r.sentimentScore}% · actual {r.actualPct !== null ? `${r.actualPct > 0 ? '+' : ''}${r.actualPct.toFixed(2)}%` : '?'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#d1d5db', textAlign: 'center' }}>
          Correct = predicted direction matched ±1% actual move · Not financial advice
        </div>
      </div>
    </div>
  );
}
