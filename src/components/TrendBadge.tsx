import type { Direction } from '../data/stocks';

const config: Record<Direction, { label: string; color: string; dot: string }> = {
  rise:    { label: 'Rise',    color: '#16a34a', dot: '#22c55e' },
  fall:    { label: 'Fall',    color: '#dc2626', dot: '#ef4444' },
  neutral: { label: 'Hold',   color: '#6b7280', dot: '#9ca3af' },
};

interface HorizonCellProps {
  period: string;
  direction: Direction;
  confidence: number;
}

export default function HorizonCell({ period, direction, confidence }: HorizonCellProps) {
  const c = config[direction];
  return (
    <div className="flex flex-col gap-0.5" style={{ minWidth: 52 }}>
      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {period}
      </span>
      <div className="flex items-center gap-1">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{c.label}</span>
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af' }}>{confidence}% conf.</span>
    </div>
  );
}
