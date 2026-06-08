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

function accuracyColor(acc: number | null) {
  if (acc === null) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' };
  if (acc >= 60) return { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' };
  if (acc >= 45) return { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
  return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
}

function CalendarGrid({ series, selectedDate, onSelect }: {
  series: DayEntry[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const byDate = new Map(series.map(d => [d.date, d]));

  // Build calendar for the months we have data
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  // Show last 2 months + current
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {months.map(({ year, month }) => {
        const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells: (number | null)[] = [
          ...Array(firstDay).fill(null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        // Pad to complete last week
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={`${year}-${month}`}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, letterSpacing: '-0.01em' }}>
              {monthName}
            </div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textAlign: 'center', letterSpacing: '0.04em' }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const entry = byDate.get(dateStr);
                const isToday = dateStr === now.toISOString().slice(0, 10);
                const isSelected = dateStr === selectedDate;
                const isWeekend = (i % 7 === 0) || (i % 7 === 6);
                const isFuture = new Date(dateStr) > now;
                const colors = accuracyColor(entry?.summary.accuracy ?? null);

                return (
                  <div
                    key={dateStr}
                    onClick={() => entry && onSelect(dateStr)}
                    style={{
                      borderRadius: 8,
                      border: `1.5px solid ${isSelected ? '#3b82f6' : entry ? colors.border : isToday ? '#d1d5db' : 'transparent'}`,
                      background: isSelected ? '#eff6ff' : entry ? colors.bg : isWeekend || isFuture ? 'transparent' : '#fafafa',
                      padding: '8px 4px 6px',
                      textAlign: 'center',
                      cursor: entry ? 'pointer' : 'default',
                      opacity: isFuture ? 0.3 : isWeekend && !entry ? 0.4 : 1,
                      transition: 'all 0.1s',
                      minHeight: 56,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                    }}
                    onMouseEnter={e => { if (entry) (e.currentTarget as HTMLDivElement).style.opacity = '0.85'; }}
                    onMouseLeave={e => { if (entry) (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                  >
                    <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? '#3b82f6' : '#6b7280' }}>
                      {day}
                    </div>
                    {entry ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, lineHeight: 1 }}>
                          {entry.summary.accuracy !== null ? `${entry.summary.accuracy}%` : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: colors.text, opacity: 0.7 }}>
                          {entry.summary.correct}✓ {entry.summary.wrong}✗
                        </div>
                      </>
                    ) : isToday ? (
                      <div style={{ fontSize: 9, color: '#9ca3af' }}>today</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultsTable({ results }: { results: EvalResult[] }) {
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'neutral_call'>('all');
  const filtered = filter === 'all' ? results : results.filter(r => r.verdict === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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

export default function EvaluatePage() {
  const [series, setSeries] = useState<DayEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/evaluate').then(r => r.json()),
      fetch('/api/evaluate?series=1').then(r => r.json()),
    ]).then(([todayData, seriesData]) => {
      const log: DayEntry[] = seriesData.series ?? [];
      // Merge today's live data if not already in log
      if (todayData.status === 'ok' && todayData.results?.length > 0) {
        const todayDate = todayData.snapshotTime?.slice(0, 10);
        if (todayDate && !log.find(e => e.date === todayDate)) {
          log.push({ date: todayDate, snapshotTime: todayData.snapshotTime, summary: todayData.summary, results: todayData.results });
        }
      }
      setSeries(log);
      // Auto-select most recent day with data
      if (log.length > 0) setSelectedDate(log[log.length - 1].date);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</span>
    </div>
  );

  const selectedEntry = series.find(d => d.date === selectedDate) ?? null;
  const allScoreable = series.flatMap(d => d.results.filter(r => r.verdict === 'correct' || r.verdict === 'wrong'));
  const allCorrect = allScoreable.filter(r => r.verdict === 'correct').length;
  const overallAccuracy = allScoreable.length > 0 ? Math.round(allCorrect / allScoreable.length * 100) : null;
  const overallColors = accuracyColor(overallAccuracy);

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
            Predicted at 2pm ET · Scored vs next day 9:30am open
          </span>
        </div>
      </header>

      <div style={{ padding: '24px 28px', maxWidth: 1000, width: '100%', margin: '0 auto', flex: 1 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* Left: calendar + overall stat */}
          <div style={{ width: 320, flexShrink: 0 }}>

            {/* Overall accuracy */}
            <div style={{
              background: '#fff', borderRadius: 10, border: `1.5px solid ${overallColors.border}`,
              padding: '16px 20px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                Overall Accuracy
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: overallColors.text, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 4 }}>
                {overallAccuracy !== null ? `${overallAccuracy}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {allCorrect} correct / {allScoreable.length} calls · {series.length} day{series.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Calendar */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 16px 20px' }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>
                Archive
              </div>
              {series.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
                  No data yet. Check back after the first full trading day.
                </div>
              ) : (
                <CalendarGrid series={series} selectedDate={selectedDate} onSelect={setSelectedDate} />
              )}
            </div>
          </div>

          {/* Right: selected day detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedEntry ? (
              <div>
                {/* Day header */}
                <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
                        {fmtDate(selectedEntry.snapshotTime)}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        Snapshot at {fmtTime(selectedEntry.snapshotTime)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
                        color: accuracyColor(selectedEntry.summary.accuracy).text }}>
                        {selectedEntry.summary.accuracy !== null ? `${selectedEntry.summary.accuracy}%` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {selectedEntry.summary.correct} correct · {selectedEntry.summary.wrong} wrong · {selectedEntry.summary.neutralCalls} no-call
                      </div>
                    </div>
                  </div>
                  {/* Mini accuracy bar */}
                  <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                    {selectedEntry.summary.accuracy !== null && (
                      <div style={{
                        width: `${selectedEntry.summary.accuracy}%`, height: '100%', borderRadius: 3,
                        background: accuracyColor(selectedEntry.summary.accuracy).text,
                        transition: 'width 0.4s ease',
                      }} />
                    )}
                  </div>
                </div>

                {/* Results table */}
                <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                  <ResultsTable results={selectedEntry.results} />
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#9ca3af' }}>
                  {series.length === 0
                    ? 'No evaluation data yet. Predictions are made at 2pm ET and scored against the next morning\'s open.'
                    : 'Select a day from the calendar to see results.'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: '#d1d5db', textAlign: 'center' }}>
          Correct = predicted direction matched ±1% vs next day open · Not financial advice
        </div>
      </div>
    </div>
  );
}

