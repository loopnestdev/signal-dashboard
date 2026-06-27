import { useState } from 'react';
import { C } from '../lib/colors';
import type { ScoredFlowEvent } from '../types/stock';

function fmtPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(strike: number, current: number): string {
  const p = ((strike - current) / current) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
}

function niceStep(range: number): number {
  if (range < 50)   return 5;
  if (range < 150)  return 20;
  if (range < 400)  return 50;
  if (range < 1000) return 100;
  return 200;
}

export function FlowTimelineChart({
  events,
  currentPrice,
}: {
  events: ScoredFlowEvent[];
  currentPrice: number;
}) {
  const [hovered, setHovered] = useState<ScoredFlowEvent | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  if (!events.length || !currentPrice) return null;

  // ── Layout ───────────────────────────────────────────────────────────────
  const W = 800, H = 280;
  const PAD = { top: 24, right: 56, bottom: 38, left: 74 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // ── X scale: now → max(last expiry + 2 weeks, 3 months) ─────────────────
  const now = Date.now();
  const lastExpiry = Math.max(...events.map(e => new Date(e.flow_events.expiry).getTime()));
  const xEnd = Math.max(lastExpiry + 14 * 86400000, now + 92 * 86400000);
  const xScale = (t: number) => PAD.left + ((t - now) / (xEnd - now)) * cW;

  // ── Y scale ───────────────────────────────────────────────────────────────
  const strikes = events.map(e => e.flow_events.strike);
  const allY = [...strikes, currentPrice];
  const rawYRange = Math.max(...allY) - Math.min(...allY);
  const yPad = Math.max(rawYRange * 0.3, currentPrice * 0.04);
  const yMin = Math.min(...allY) - yPad;
  const yMax = Math.max(...allY) + yPad;
  const yScale = (p: number) => PAD.top + cH - ((p - yMin) / (yMax - yMin)) * cH;
  const cpY = yScale(currentPrice);

  // ── Dot helpers ───────────────────────────────────────────────────────────
  const dotR = (score: number) => Math.min(5 + Math.abs(score) * 1.5, 20);
  const dotColor = (e: ScoredFlowEvent): string =>
    e.flow_events.option_type === 'CALL' ? (C.bull as string) : (C.bear as string);

  // Horizontal offset for events sharing the same expiry date
  const byExpiry = new Map<string, ScoredFlowEvent[]>();
  events.forEach(e => {
    const k = e.flow_events.expiry.slice(0, 10);
    if (!byExpiry.has(k)) byExpiry.set(k, []);
    byExpiry.get(k)!.push(e);
  });
  const xJitter = (e: ScoredFlowEvent): number => {
    const k = e.flow_events.expiry.slice(0, 10);
    const grp = byExpiry.get(k)!;
    const i = grp.indexOf(e);
    return (i - (grp.length - 1) / 2) * 20;
  };

  // ── Y-axis ticks ──────────────────────────────────────────────────────────
  const yStep = niceStep(yMax - yMin);
  const yTicks: number[] = [];
  { let y = Math.ceil(yMin / yStep) * yStep; while (y <= yMax) { yTicks.push(y); y += yStep; } }

  // ── X-axis month ticks ────────────────────────────────────────────────────
  const xTicks: number[] = [];
  {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    while (d.getTime() < xEnd) { xTicks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
  }

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      {/* Section label */}
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
        FLOW TARGET MAP
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: '10px', color: C.inkMute }}>
        <span><span style={{ color: C.bull as string }}>●</span> CALL (bullish)</span>
        <span><span style={{ color: C.bear as string }}>●</span> PUT (bearish)</span>
        <span>dot size = signal strength (Radon −10 to +10)</span>
        <span>— — current price</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Horizontal grid */}
        {yTicks.map(yv => (
          <line key={yv}
            x1={PAD.left} y1={yScale(yv)} x2={PAD.left + cW} y2={yScale(yv)}
            stroke={C.border as string} strokeWidth={0.5} strokeOpacity={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(yv => (
          <text key={yv}
            x={PAD.left - 6} y={yScale(yv) + 3.5}
            textAnchor="end" fontSize={9} fill={C.inkMute as string}>
            ${yv >= 1000 ? yv.toLocaleString() : yv}
          </text>
        ))}

        {/* X-axis month labels */}
        {xTicks.map(t => (
          <text key={t}
            x={xScale(t)} y={H - 6}
            textAnchor="middle" fontSize={9} fill={C.inkMute as string}>
            {new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          </text>
        ))}

        {/* Left axis border + TODAY label */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
          stroke={C.border as string} strokeWidth={1} />
        <text x={PAD.left + 3} y={PAD.top + cH + 13}
          fontSize={8} fill={C.inkMute as string}>TODAY</text>

        {/* Current price reference line */}
        <line
          x1={PAD.left} y1={cpY} x2={PAD.left + cW} y2={cpY}
          stroke={C.inkSec as string} strokeWidth={1.2} strokeDasharray="6 3" strokeOpacity={0.75}
        />
        <text x={PAD.left - 6} y={cpY - 4}
          textAnchor="end" fontSize={8} fontWeight={600} fill={C.inkSec as string}>
          ${currentPrice.toFixed(2)}
        </text>
        <text x={PAD.left + cW + 3} y={cpY + 3.5}
          fontSize={7} fill={C.inkMute as string}>NOW</text>

        {/* Lollipop sticks + dots */}
        {events.map((e, i) => {
          const cx = xScale(new Date(e.flow_events.expiry).getTime()) + xJitter(e);
          const cy = yScale(e.flow_events.strike);
          const r  = dotR(e.flow_score);
          const col = dotColor(e);
          const above = cy < cpY;  // dot is above the current-price line

          return (
            <g key={e.id || e.curated_id || i}
              style={{ cursor: 'pointer' }}
              onMouseEnter={ev => { setHovered(e); setMouse({ x: ev.clientX, y: ev.clientY }); }}
              onMouseMove={ev => setMouse({ x: ev.clientX, y: ev.clientY })}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Dashed stick from current-price line to circle edge */}
              <line
                x1={cx} y1={cpY}
                x2={cx} y2={cy + (above ? r + 1 : -(r + 1))}
                stroke={col} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.4}
              />

              {/* Dot */}
              <circle cx={cx} cy={cy} r={r}
                fill={col + '22'} stroke={col} strokeWidth={1.5} />

              {/* % label — above dot if strike > current, below if strike < current */}
              <text
                x={cx} y={above ? cy - r - 5 : cy + r + 11}
                textAnchor="middle" fontSize={8} fontWeight={500} fill={col}
                style={{ pointerEvents: 'none' }}>
                {pct(e.flow_events.strike, currentPrice)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (() => {
        const col = (hovered.flow_events.option_type === 'CALL' ? C.bull : C.bear) as string;
        return (
          <div style={{
            position: 'fixed',
            left: mouse.x + 14,
            top: mouse.y - 16,
            background: C.canvas as string,
            border: `1px solid ${C.border as string}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '11px',
            color: C.inkSec as string,
            lineHeight: 1.7,
            zIndex: 500,
            pointerEvents: 'none',
            boxShadow: C.s2 as string,
            minWidth: 210,
            maxWidth: 290,
          }}>
            <div style={{ fontWeight: 700, fontSize: '12px', color: col, marginBottom: 5 }}>
              {hovered.flow_events.option_type} · {hovered.flow_direction}
            </div>
            <div>
              Strike{' '}
              <strong>${hovered.flow_events.strike.toLocaleString()}</strong>
              {' '}({pct(hovered.flow_events.strike, currentPrice)})
            </div>
            <div>
              Expiry{' '}
              {new Date(hovered.flow_events.expiry).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}{' '}
              · {hovered.flow_events.dte}d
            </div>
            <div>
              Radon Score{' '}
              <strong style={{ color: col }}>
                {hovered.flow_score > 0 ? '+' : ''}{hovered.flow_score} / 10
              </strong>
            </div>
            <div>
              Conv {hovered.conviction_score}
              {' · '}
              Premium {fmtPremium(hovered.flow_events.premium_size)}
            </div>
            {hovered.rationale_short && (
              <div style={{ marginTop: 5, color: C.inkMute as string, fontSize: '10px', lineHeight: 1.5 }}>
                {hovered.rationale_short}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
