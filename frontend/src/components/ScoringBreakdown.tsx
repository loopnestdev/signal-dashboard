import { C, scoreColor } from '../lib/colors';
import type { CategoryScore } from '../types/market';

interface Props {
  categories: Record<string, CategoryScore>;
  totalScore: number;
}

const ORDER = ['volatility', 'trend', 'breadth', 'momentum', 'macro'] as const;

export function ScoringBreakdown({ categories, totalScore }: Props) {
  const totalColor = scoreColor(totalScore);

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px', boxShadow: C.s1,
    }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.10em', fontWeight: 400, marginBottom: 20 }}>
        SCORING BREAKDOWN
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ORDER.map(key => {
          const cat = categories[key];
          if (!cat) return null;
          const contribution = (cat.score * cat.weight) / 100;
          const color = scoreColor(cat.score);

          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '13px', color: C.ink, fontWeight: 400 }}>{cat.label}</span>
                  <span style={{
                    background: C.canvasSoft, border: `1px solid ${C.border}`,
                    borderRadius: 9999, padding: '1px 8px',
                    fontSize: '11px', color: C.inkMute, fontWeight: 400,
                  }}>
                    ×{(cat.weight / 100).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: C.inkMute, fontFeatureSettings: '"tnum"' }}>
                    {Math.round(cat.score)}/100
                  </span>
                  <span style={{ fontSize: '13px', color, fontWeight: 500, fontFeatureSettings: '"tnum"', minWidth: 32, textAlign: 'right' }}>
                    +{contribution.toFixed(1)}
                  </span>
                </div>
              </div>
              <div style={{ background: C.border, borderRadius: 4, height: 5, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, width: `${cat.score}%`,
                  background: color, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '12px', color: C.inkMute, letterSpacing: '0.06em' }}>TOTAL</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: '30px', fontWeight: 400, color: totalColor, fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em' }}>
            {totalScore}
          </span>
          <span style={{ fontSize: '15px', color: C.inkMute }}>/100</span>
        </div>
      </div>

      {/* Thresholds reference */}
      <div style={{
        marginTop: 12, padding: '10px 12px',
        background: C.canvasSoft, borderRadius: 8,
        border: `1px solid ${C.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
      }}>
        {[
          ['80–100', C.bull,   'Full size'],
          ['60–79',  C.warn,   'Half size'],
          ['<60',    C.bear,   'Stay flat'],
        ].map(([range, color, label]) => (
          <div key={range} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color, fontWeight: 500 }}>{range}</div>
            <div style={{ fontSize: '10px', color: C.inkMute, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
