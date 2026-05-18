import type { Decision } from '../types/market';
import type { TradingMode } from '../types/market';

interface Props {
  decision: Decision;
  marketQualityScore: number;
  executionWindowScore: number;
  regime: string;
  mode: TradingMode;
}

const DECISION_CONFIG = {
  YES_BUY:  { label: 'YES — BUY',  color: '#11ff99', glow: 'rgba(17,255,153,0.28)',  bg: 'rgba(17,255,153,0.10)',  desc: 'Full position sizing · Press risk on breakouts' },
  YES_SELL: { label: 'YES — SELL', color: '#ff2047', glow: 'rgba(255,32,71,0.28)',   bg: 'rgba(255,32,71,0.10)',   desc: 'Short setups · Reduce long exposure' },
  CAUTION:  { label: 'CAUTION',    color: '#ffc53d', glow: 'rgba(255,197,61,0.28)',  bg: 'rgba(255,197,61,0.10)', desc: 'Half size · A+ setups only · Quick profits' },
  NO:       { label: 'NO',         color: '#ff2047', glow: 'rgba(255,32,71,0.22)',   bg: 'rgba(255,32,71,0.08)',  desc: 'Avoid trading · Preserve capital' },
};

const DAY_THRESHOLDS = { YES: 75, CAUTION: 55 };
const SWING_THRESHOLDS = { YES: 80, CAUTION: 60 };

function ScoreRing({ score, size = 160, label }: { score: number; size?: number; label: string }) {
  const r = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const dashoffset = circ - (pct / 100) * circ;
  const color = score >= 80 ? '#11ff99' : score >= 60 ? '#ffc53d' : '#ff2047';
  const cx = size / 2, cy = size / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
        {/* Score */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize={size < 140 ? '24' : '36'} fontWeight="500" fontFamily="'JetBrains Mono', monospace">
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(252,253,255,0.50)" fontSize="10" fontFamily="'Inter', sans-serif" letterSpacing="0.08em">
          / 100
        </text>
      </svg>
      <span style={{ fontSize: '11px', color: 'rgba(252,253,255,0.50)', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

export function HeroPanel({ decision, marketQualityScore, executionWindowScore, regime, mode }: Props) {
  const cfg = DECISION_CONFIG[decision];
  const thresholds = mode === 'day' ? DAY_THRESHOLDS : SWING_THRESHOLDS;
  const regimeLabel = { uptrend: '↑ UPTREND', downtrend: '↓ DOWNTREND', chop: '→ CONSOLIDATION' }[regime] ?? regime;

  return (
    <div
      style={{
        background: '#0a0a0c',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 12,
        padding: '36px 40px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 40,
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Atmospheric glow behind decision */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
        background: `radial-gradient(ellipse at 30% 50%, ${cfg.glow} 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* Left: decision */}
      <div style={{ position: 'relative' }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: '11px', color: 'rgba(252,253,255,0.40)', letterSpacing: '0.12em' }}>SHOULD I BE TRADING?</span>
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            background: cfg.bg,
            border: `1px solid ${cfg.color}`,
            borderRadius: 8,
            marginBottom: 20,
            boxShadow: `0 0 40px ${cfg.glow}`,
          }}
        >
          <span style={{ fontSize: '42px', fontWeight: '600', color: cfg.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {cfg.label}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: '14px', color: 'rgba(252,253,255,0.70)', fontFamily: "'Inter', sans-serif" }}>
            {cfg.desc}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 9999, padding: '4px 12px', fontSize: '12px', color: 'rgba(252,253,255,0.70)',
          }}>
            {regimeLabel}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 9999, padding: '4px 12px', fontSize: '12px', color: 'rgba(252,253,255,0.70)',
          }}>
            {mode === 'swing' ? '↻ SWING MODE' : '⚡ DAY MODE'}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 9999, padding: '4px 12px', fontSize: '12px',
            color: marketQualityScore >= thresholds.YES ? '#11ff99' : marketQualityScore >= thresholds.CAUTION ? '#ffc53d' : '#ff2047',
          }}>
            Threshold: {thresholds.YES}/{thresholds.CAUTION}
          </span>
        </div>
      </div>

      {/* Right: scores */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'center', position: 'relative' }}>
        <ScoreRing score={marketQualityScore} size={168} label="MARKET QUALITY" />
        <ScoreRing score={executionWindowScore} size={120} label="EXEC. WINDOW" />
      </div>
    </div>
  );
}
