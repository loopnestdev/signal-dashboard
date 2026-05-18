import type { CategoryScore } from '../types/market';

interface Props {
  category: CategoryScore;
}

const INTERP_COLOR: Record<string, string> = {
  healthy:   '#11ff99',
  neutral:   '#ffc53d',
  weakening: '#ff801f',
  'risk-off': '#ff2047',
};

const DIR_SYMBOL: Record<string, string> = {
  up: '↑', down: '↓', flat: '→',
};

const DIR_COLOR: Record<string, string> = {
  up: '#11ff99', down: '#ff2047', flat: '#a1a4a5',
};

export function MetricPanel({ category }: Props) {
  const interpColor = INTERP_COLOR[category.interpretation];
  const pct = category.score;
  const barColor = pct >= 70 ? '#11ff99' : pct >= 50 ? '#ffc53d' : pct >= 30 ? '#ff801f' : '#ff2047';

  return (
    <div
      style={{
        background: '#0a0a0c',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(252,253,255,0.40)', letterSpacing: '0.10em', marginBottom: 4 }}>
            {category.label.toUpperCase()}
          </div>
          <div style={{ fontSize: '28px', fontWeight: '500', color: barColor, lineHeight: 1 }}>
            {Math.round(category.score)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            background: `${interpColor}18`,
            border: `1px solid ${interpColor}44`,
            borderRadius: 9999,
            padding: '3px 10px',
            fontSize: '11px',
            color: interpColor,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {category.interpretation}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(252,253,255,0.30)', marginTop: 4 }}>
            {category.weight}% weight
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 3, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', borderRadius: 4,
            width: `${pct}%`,
            background: barColor,
            boxShadow: `0 0 8px ${barColor}`,
            transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {category.metrics.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(252,253,255,0.40)', letterSpacing: '0.04em' }}>{m.label}</div>
              <div style={{ fontSize: '11px', color: 'rgba(252,253,255,0.55)', marginTop: 2 }}>{m.note}</div>
            </div>
            <span style={{ fontSize: '13px', color: DIR_COLOR[m.direction], fontWeight: '500', paddingTop: 1 }}>
              {DIR_SYMBOL[m.direction]}
            </span>
            <span style={{ fontSize: '13px', color: '#fcfdff', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: '500' }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
