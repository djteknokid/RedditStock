import { useState, useEffect } from 'react';

type Verdict = 'correct' | 'wrong' | 'neutral_call' | 'pending';

interface EvalResult {
  ticker: string;
  name: string;
  predicted: 'rise' | 'fall' | 'neutral';
  confidence: number;
  catalyst: string | null;
  sentimentScore: number;
  actualPct: number | null;
  verdict: Verdict;
  snapshotTime: string;
}

interface DaySummary {
  total: number;
  directionalCalls: number;
  correct: number;
  wrong: number;
  neutralCalls: number;
  pending: number;
  accuracy: number | null;
  avgConfidenceCorrect: number | null;
  avgConfidenceWrong: number | null;
}

interface DayEntry {
  date: string;
  snapshotTime: string;
  summary: DaySummary;
  results: EvalResult[];
}

interface EvalData {
  status: string;
  message?: string;
  snapshotTime?: string;
  summary?: DaySummary;
  results?: EvalResult[];
}

function verdictBadge(v: Verdict) {
  if (v === 'correct') return <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12 }}>✓ Correct</span>;
  if (v === 'wrong') return <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>✗ Wrong</span>;
  if (v === 'neutral_call') return <span style={{ color: '#9ca3af', fontSize: 12 }}>— No call</span>;
  return <span style={{ color: '#d97706', fontSize: 12 }}>⏳ Pending</span>;
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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function AccuracyBadge({ accuracy }: { accuracy: number | null }) {
  if (accuracy === null) return <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>;
  const color = accuracy >= 60 ? '#16a34a' : accuracy >= 45 ? '#d97706' : '#dc2626';
  return <span style={{ color, fontWeight: 700, fontSize: 15 }}>{accuracy}%</span>;
}

function ResultsTable({ results }: { results: EvalResult[] }) {
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'neutral_call'>('all');
  const filtered = filter === 'all' ? results : results.filter(r => r.verdict === filter);

  return (
    <div style={{ marginTop: 12 }}>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['all', 'correct', 'wrong', 'neutral_call'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5, border: '1px solid',
            cursor: 'pointer',
            background: filter === f ? '#111' : '#fff',
            color: filter === f ? '#fff' : '#6b7280',
            borderColor: filter === f ? '#111' : '#e5e7eb',
          }}>
            {f === 'all' ? `All (${results.length})`
              : f === 'correct' ? `✓ ${results.filter(r => r.verdict === 'correct').length}`
              : f === 'wrong' ? `✗ ${results.filter(r => r.verdict === 'wrong').length}`
              : `— ${results.filter(r => r.verdict === 'neutral_call').length}`}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Ticker', 'Predicted', 'Conf', 'Sent', 'Actual Move', 'Verdict', 'Catalyst'].map((h, i) => (
              <th key={h} style={{
                fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.06em',
                textTransform: 'uppercase', padding: '6px 8px',
                textAlign: i === 0 || i === 6 ? 'left' : 'center',
                borderBottom: '1px solid #f3f4f6',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={r.ticker} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '8px', fontWeight: 700, color: '#111' }}>
                {r.ticker}
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{r.name}</div>
              </td>
              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: directionColor(r.predicted), textTransform: 'capitalize' }}>
                {r.predicted}
              </td>
              <td style={{ padding: '8px', textAlign: 'center', color: '#374151' }}>{r.confidence}%</td>
              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600,
                color: r.sentimentScore >= 70 ? '#16a34a' : r.sentimentScore >= 45 ? '#d97706' : '#dc2626' }}>
                {r.sentimentScore}%
              </td>
              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600,
                color: pctColor(r.actualPct), fontVariantNumeric: 'tabular-nums' }}>
                {r.actualPct !== null
                  ? `${r.actualPct >= 0 ? '+' : ''}${r.actualPct.toFixed(2)}%`
                  : <span style={{ color: '#d1d5db' }}>—</span>}
              </td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{verdictBadge(r.verdict)}</td>
              <td style={{ padding: '8px', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.catalyst ?? <span style={{ color: '#d1d5db' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayRow({ entry, isExpanded, onToggle }: { entry: DayEntry; isExpanded: boolean; onToggle: () => void }) {
  const { summary } = entry;
  const hasData = summary.directionalCalls > 0;

  return (
    <div style={{ borderBottom: '1px solid #f3f4f6' }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 20 }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
      >
        {/* Date */}
        <div style={{ width: 130, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{fmtDate(entry.snapshotTime)}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtTime(entry.snapshotTime)}</div>
        </div>

        {/* Accuracy */}
        <div style={{ width: 70, flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Accuracy</div>
          <AccuracyBadge accuracy={summary.accuracy} />
        </div>

        {/* Calls breakdown */}
        <div style={{ width: 120, flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Calls</div>
          {hasData
            ? <span style={{ fontSize: 12 }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{summary.correct}✓</span>
                {' · '}
                <span style={{ color: '#dc2626', fontWeight: 600 }}>{summary.wrong}✗</span>
                {' · '}
                <span style={{ color: '#9ca3af' }}>{summary.neutralCalls}—</span>
              </span>
            : <span style={{ color: '#9ca3af', fontSize: 12 }}>no calls</span>
          }
        </div>

        {/* Mini accuracy bar */}
        <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
          {summary.accuracy !== null && (
            <div style={{
              width: `${summary.accuracy}%`, height: '100%', borderRadius: 3,
              background: summary.accuracy >= 60 ? '#22c55e' : summary.accuracy >= 45 ? '#f59e0b' : '#ef4444',
              transition: 'width 0.4s ease',
            }} />
          )}
        </div>

        {/* Pending indicator */}
        {summary.pending > 0 && (
          <span style={{ fontSize: 11, color: '#d97706', flexShrink: 0 }}>⏳ {summary.pending} pending</span>
        )}

        {/* Expand chevron */}
        <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {/* Expanded results */}
      {isExpanded && (
        <div style={{ padding: '0 20px 16px', background: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
          <ResultsTable results={entry.results} />
        </div>
      )}
    </div>
  );
}

export default function EvaluatePage() {
  const [today, setToday] = useState<EvalData | null>(null);
  const [series, setSeries] = useState<DayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/api/evaluate').then(r => r.json()),
      fetch('/api/evaluate?series=1').then(r => r.json()),
    ]).then(([todayData, seriesData]) => {
      setToday(todayData);
      // Merge today into series if not already logged
      const log: DayEntry[] = seriesData.series ?? [];
      setSeries([...log].reverse()); // newest first
      setLoading(false);
      // Auto-expand the most recent day
      if (log.length > 0) setExpandedDates(new Set([log[log.length - 1].date]));
    }).catch(() => setLoading(false));
  }, []);

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>Loading evaluation...</span>
    </div>
  );

  // Overall stats across all logged days
  const allScoreable = series.flatMap(d => d.results.filter(r => r.verdict === 'correct' || r.verdict === 'wrong'));
  const allCorrect = allScoreable.filter(r => r.verdict === 'correct').length;
  const overallAccuracy = allScoreable.length > 0 ? Math.round(allCorrect / allScoreable.length * 100) : null;

  return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 700, color: '#111', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            ← buzzd.fyi
          </a>
          <span style={{ color: '#e5e7eb' }}>|</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Prediction Evaluation</span>
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
            Predictions made at 2pm ET · Scored against next day 9:30am open
          </span>
        </div>
      </header>

      <div style={{ padding: '24px 28px', maxWidth: 900, width: '100%', margin: '0 auto' }}>

        {/* Overall summary cards */}
        {series.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              {
                label: 'Overall Accuracy',
                value: overallAccuracy !== null ? `${overallAccuracy}%` : '—',
                sub: `${allCorrect} correct / ${allScoreable.length} total calls`,
                color: overallAccuracy !== null
                  ? overallAccuracy >= 60 ? '#16a34a' : overallAccuracy >= 45 ? '#d97706' : '#dc2626'
                  : '#111',
              },
              {
                label: 'Days Tracked',
                value: series.length,
                sub: `${series.filter(d => d.summary.accuracy !== null).length} with scored calls`,
                color: '#111',
              },
              {
                label: 'Best Day',
                value: (() => {
                  const best = series.filter(d => d.summary.accuracy !== null).sort((a, b) => (b.summary.accuracy ?? 0) - (a.summary.accuracy ?? 0))[0];
                  return best ? `${best.summary.accuracy}%` : '—';
                })(),
                sub: (() => {
                  const best = series.filter(d => d.summary.accuracy !== null).sort((a, b) => (b.summary.accuracy ?? 0) - (a.summary.accuracy ?? 0))[0];
                  return best ? fmtDate(best.snapshotTime) : 'no data yet';
                })(),
                color: '#16a34a',
              },
              {
                label: 'Today\'s Snapshot',
                value: today?.summary?.accuracy !== null && today?.summary?.accuracy !== undefined ? `${today.summary.accuracy}%` : '—',
                sub: today?.snapshotTime ? fmtTime(today.snapshotTime) : 'not yet run',
                color: '#111',
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

        {/* Series list */}
        {series.length === 0 && today?.status === 'no_history' ? (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 8 }}>No evaluation data yet</div>
            <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 360, margin: '0 auto' }}>
              Predictions are made at 2pm ET and scored against the next morning's opening bell price. Check back tomorrow.
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Daily Results</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{series.length} day{series.length !== 1 ? 's' : ''} · click to expand</span>
            </div>
            {series.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No completed evaluation days yet.
              </div>
            ) : (
              series.map(entry => (
                <DayRow
                  key={entry.date}
                  entry={entry}
                  isExpanded={expandedDates.has(entry.date)}
                  onToggle={() => toggleDate(entry.date)}
                />
              ))
            )}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#d1d5db', textAlign: 'center' }}>
          Correct = predicted direction matched ±1% vs next day open · Not financial advice
        </div>
      </div>
    </div>
  );
}
