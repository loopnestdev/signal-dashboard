import { C } from '../lib/colors';
import type { SignaData } from '../types/stock';

interface Props {
  signa: SignaData;
  currentPrice: number;
}

function directionStyle(d: string): { color: string; bg: string; border: string } {
  const dir = d.toUpperCase();
  if (dir === 'LONG'  || dir === 'BUY'  || dir === 'BULLISH') return { color: C.bull, bg: C.bullBg, border: C.bullBorder };
  if (dir === 'SHORT' || dir === 'SELL' || dir === 'BEARISH') return { color: C.bear, bg: C.bearBg, border: C.bearBorder };
  return { color: C.warn, bg: C.warnBg, border: C.warnBorder };
}

function gradeStyle(g: string): { color: string; bg: string; border: string } {
  if (g === 'A+' || g === 'A') return { color: C.bull, bg: C.bullBg, border: C.bullBorder };
  if (g === 'B+' || g === 'B') return { color: C.warn, bg: C.warnBg, border: C.warnBorder };
  return { color: C.bear, bg: C.bearBg, border: C.bearBorder };
}

function riskStyle(r: string): { color: string } {
  const rv = r.toUpperCase();
  if (rv === 'LOW')      return { color: C.bull };
  if (rv === 'MODERATE') return { color: C.warn };
  return { color: C.bear };
}

function Pill({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      fontSize: '13px', fontWeight: 400, color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 9999, padding: '4px 12px',
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  );
}

function PriceCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '10px 8px',
      background: C.canvasSoft, borderRadius: 8, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.06em', marginBottom: 5, fontWeight: 400 }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px', fontWeight: 500, color: color ?? C.ink,
        fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
    </div>
  );
}

export function SignaCard({ signa, currentPrice }: Props) {
  const dStyle = directionStyle(signa.direction);
  const gStyle = gradeStyle(signa.grade);
  const rStyle = riskStyle(signa.riskRating);
  const allTriggers = [...signa.triggers, ...signa.signaTriggers];
  const earlyWarnings = signa.riskScore >= 5 ? signa.riskFactors : [];
  const bearishPatterns = signa.patterns.filter(p => p.type === 'bearish' && p.confidence > 0.5);
  const hasWarnings = earlyWarnings.length > 0 || bearishPatterns.length > 0;

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      padding: '20px 0',
    }}>
      {/* ── Status row: LONG / Grade / Stage / Confidence / Risk ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 10 }}>
          SIGNA.AI SIGNAL
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Direction — most prominent */}
          <Pill label={`● ${signa.direction}`} {...dStyle} />
          {/* Grade */}
          <Pill label={`Grade ${signa.grade}`} {...gStyle} />
          {/* Stage */}
          <span style={{
            fontSize: '13px', color: C.inkSec, background: C.canvasSoft,
            border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            Stage {signa.stage} — {signa.stageDescription}
          </span>
          {/* Confidence */}
          <span style={{
            fontSize: '13px', color: C.primary, background: C.primaryBg,
            border: `1px solid ${C.primaryBorder}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            {signa.confidence}% conf.
          </span>
          {/* Risk */}
          <span style={{
            fontSize: '13px', color: rStyle.color, background: C.canvasSoft,
            border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            Risk: {signa.riskRating}
          </span>
        </div>
      </div>

      {/* ── Price levels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        <PriceCell label="CURRENT"    value={`$${currentPrice.toFixed(2)}`} />
        <PriceCell label="BEST ENTRY" value={`$${signa.entry.toFixed(2)}`}  color={C.primary} />
        <PriceCell label="STOP LOSS"  value={signa.stop   > 0 ? `$${signa.stop.toFixed(2)}`   : '—'} color={C.bear} />
        <PriceCell label="TARGET"     value={signa.target > 0 ? `$${signa.target.toFixed(2)}` : '—'} color={C.bull} />
        <PriceCell
          label="R : R"
          value={signa.rr > 0 ? `${signa.rr.toFixed(1)}×` : '—'}
          color={signa.rr >= 2 ? C.bull : signa.rr >= 1 ? C.warn : C.bear}
        />
      </div>

      {/* ── Early Warnings ── */}
      {hasWarnings && (
        <div style={{
          background: C.warnBg, border: `1px solid ${C.warnBorder}`,
          borderRadius: 8, padding: '12px 14px', marginBottom: 14,
        }}>
          <div style={{ fontSize: '11px', color: C.warn, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
            ⚠ EARLY WARNINGS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {earlyWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: '13px', color: C.inkSec }}>· {w}</div>
            ))}
            {bearishPatterns.map((p, i) => (
              <div key={`bp-${i}`} style={{ fontSize: '13px', color: C.inkSec }}>
                · {p.name} ({(p.confidence * 100).toFixed(0)}% conf.) — {p.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Signal Checklist ── */}
      {allTriggers.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
            SIGNAL CHECKLIST ({allTriggers.length} triggered)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {allTriggers.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 12px',
                background: C.canvasSoft, border: `1px solid ${C.border}`,
                borderRadius: 7,
              }}>
                <span style={{ color: C.bull, fontSize: '12px', flexShrink: 0, marginTop: 1 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '13px', color: C.ink, fontWeight: 400 }}>{t.name}</span>
                    <span style={{ fontSize: '10px', color: C.inkMute, flexShrink: 0 }}>
                      {t.type === 'proprietary' ? 'SIGNA' : t.weight !== undefined ? `${(t.weight * 100).toFixed(0)}%` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 2, fontWeight: 300 }}>
                    {t.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
