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

function dotColor(e: ScoredFlowEvent): string {
  return e.flow_events.option_type === 'CALL' ? (C.bull as string) : (C.bear as string);
}

function dotR(score: number): number {
  return Math.min(5 + Math.abs(score) * 1.5, 20);
}

interface DateGroup {
  date: string;
  ts: number;
  call?: ScoredFlowEvent; // best CALL (highest flow_score)
  put?: ScoredFlowEvent;  // best PUT (most-negative flow_score)
}

interface ChartLine {
  key: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

export function FlowTimelineChart({
  events,
  currentPrice,
}: {
  events: ScoredFlowEvent[];
  currentPrice: number;
}) {
  const [hovered, setHovered] = useState<ScoredFlowEvent | null>(null);
  const [mouse, setMouse]     = useState({ x: 0, y: 0 });

  if (!events.length || !currentPrice) return null;

  // ── Group by expiry: best CALL + best PUT per date ────────────────────────
  const byDate = new Map<string, { calls: ScoredFlowEvent[]; puts: ScoredFlowEvent[] }>();
  events.forEach(e => {
    const k = e.flow_events.expiry.slice(0, 10);
    if (!byDate.has(k)) byDate.set(k, { calls: [], puts: [] });
    const g = byDate.get(k)!;
    if (e.flow_events.option_type === 'CALL') g.calls.push(e);
    else g.puts.push(e);
  });

  const groups: DateGroup[] = Array.from(byDate.entries())
    .map(([date, { calls, puts }]) => ({
      date,
      ts: new Date(date).getTime(),
      // best CALL = highest positive score
      call: calls.length ? calls.reduce((b, e) => e.flow_score > b.flow_score ? e : b) : undefined,
      // best PUT = most-negative score (strongest bearish)
      put:  puts.length  ? puts.reduce((b, e)  => e.flow_score < b.flow_score ? e : b) : undefined,
    }))
    .sort((a, b) => a.ts - b.ts);

  // ── Layout ────────────────────────────────────────────────────────────────
  const W = 800, H = 280;
  const PAD = { top: 24, right: 56, bottom: 38, left: 74 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // ── X scale ───────────────────────────────────────────────────────────────
  const now = Date.now();
  const lastTs  = Math.max(...groups.map(g => g.ts));
  const xEnd    = Math.max(lastTs + 14 * 86400000, now + 92 * 86400000);
  const xScale  = (t: number) => PAD.left + ((t - now) / (xEnd - now)) * cW;

  // ── Y scale ───────────────────────────────────────────────────────────────
  const allStrikes = groups.flatMap(g =>
    [g.call?.flow_events.strike, g.put?.flow_events.strike].filter((v): v is number => v != null)
  );
  const allY   = [...allStrikes, currentPrice];
  const rawRange = Math.max(...allY) - Math.min(...allY);
  const yPad   = Math.max(rawRange * 0.3, currentPrice * 0.04);
  const yMin   = Math.min(...allY) - yPad;
  const yMax   = Math.max(...allY) + yPad;
  const yScale = (p: number) => PAD.top + cH - ((p - yMin) / (yMax - yMin)) * cH;
  const cpY    = yScale(currentPrice);

  // ── Axes ──────────────────────────────────────────────────────────────────
  const yStep  = niceStep(yMax - yMin);
  const yTicks: number[] = [];
  { let y = Math.ceil(yMin / yStep) * yStep; while (y <= yMax) { yTicks.push(y); y += yStep; } }

  const xTicks: number[] = [];
  {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    while (d.getTime() < xEnd) { xTicks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
  }

  // ── Build connecting lines ────────────────────────────────────────────────
  //
  // Rule 1 — CALL chain: connect consecutive CALL dots (same direction)
  // Rule 2 — PUT chain:  connect consecutive PUT dots (same direction)
  // Rule 3 — Fork:  when the PREVIOUS date had only ONE direction and the CURRENT
  //          date introduces BOTH, draw an extra dashed line from the prev dot
  //          to the new opposing-direction dot (colour of the destination).
  //
  const lines: ChartLine[] = [];

  // Helpers
  const callGroups = groups.filter(g => g.call);
  const putGroups  = groups.filter(g => g.put);

  callGroups.slice(0, -1).forEach((from, i) => {
    const to = callGroups[i + 1];
    lines.push({
      key: `call-chain-${i}`,
      x1: xScale(from.ts), y1: yScale(from.call!.flow_events.strike),
      x2: xScale(to.ts),   y2: yScale(to.call!.flow_events.strike),
      color: C.bull as string,
    });
  });

  putGroups.slice(0, -1).forEach((from, i) => {
    const to = putGroups[i + 1];
    lines.push({
      key: `put-chain-${i}`,
      x1: xScale(from.ts), y1: yScale(from.put!.flow_events.strike),
      x2: xScale(to.ts),   y2: yScale(to.put!.flow_events.strike),
      color: C.bear as string,
    });
  });

  // Fork lines: when a date introduces BOTH directions, connect from the prev
  // date's single dot to the newly-appearing opposing dot.
  groups.forEach((g, i) => {
    if (!g.call || !g.put) return;  // not a conflict date
    if (i === 0) return;            // no predecessor
    const prev = groups[i - 1];

    // Prev had only CALL → fork to the new PUT
    if (prev.call && !prev.put) {
      lines.push({
        key: `fork-call-to-put-${i}`,
        x1: xScale(prev.ts), y1: yScale(prev.call.flow_events.strike),
        x2: xScale(g.ts),    y2: yScale(g.put.flow_events.strike),
        color: C.bear as string,
      });
    }
    // Prev had only PUT → fork to the new CALL
    else if (prev.put && !prev.call) {
      lines.push({
        key: `fork-put-to-call-${i}`,
        x1: xScale(prev.ts), y1: yScale(prev.put.flow_events.strike),
        x2: xScale(g.ts),    y2: yScale(g.call.flow_events.strike),
        color: C.bull as string,
      });
    }
  });

  // ── Dots to render (one CALL + one PUT per date, at most) ─────────────────
  const dots = groups.flatMap(g =>
    ([g.call, g.put] as (ScoredFlowEvent | undefined)[])
      .filter((e): e is ScoredFlowEvent => e !== undefined)
      .map(e => ({ e, x: xScale(g.ts), y: yScale(e.flow_events.strike) }))
  );

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
        FLOW TARGET MAP
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: '10px', color: C.inkMute }}>
        <span><span style={{ color: C.bull as string }}>●</span> CALL (bullish)</span>
        <span><span style={{ color: C.bear as string }}>●</span> PUT (bearish)</span>
        <span>dot size = Radon signal strength · dashed line = flow path between expiry dates</span>
        <span>— — current price</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Grid */}
        {yTicks.map(yv => (
          <line key={yv}
            x1={PAD.left} y1={yScale(yv)} x2={PAD.left + cW} y2={yScale(yv)}
            stroke={C.border as string} strokeWidth={0.5} strokeOpacity={0.5} />
        ))}

        {/* Y labels */}
        {yTicks.map(yv => (
          <text key={yv} x={PAD.left - 6} y={yScale(yv) + 3.5}
            textAnchor="end" fontSize={9} fill={C.inkMute as string}>
            ${yv >= 1000 ? yv.toLocaleString() : yv}
          </text>
        ))}

        {/* X month labels */}
        {xTicks.map(t => (
          <text key={t} x={xScale(t)} y={H - 6}
            textAnchor="middle" fontSize={9} fill={C.inkMute as string}>
            {new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          </text>
        ))}

        {/* Left axis + TODAY */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
          stroke={C.border as string} strokeWidth={1} />
        <text x={PAD.left + 3} y={PAD.top + cH + 13} fontSize={8} fill={C.inkMute as string}>
          TODAY
        </text>

        {/* Current price reference */}
        <line x1={PAD.left} y1={cpY} x2={PAD.left + cW} y2={cpY}
          stroke={C.inkSec as string} strokeWidth={1.2} strokeDasharray="6 3" strokeOpacity={0.7} />
        <text x={PAD.left - 6} y={cpY - 4}
          textAnchor="end" fontSize={8} fontWeight={600} fill={C.inkSec as string}>
          ${currentPrice.toFixed(2)}
        </text>
        <text x={PAD.left + cW + 3} y={cpY + 3.5} fontSize={7} fill={C.inkMute as string}>
          NOW
        </text>

        {/* Connecting dashed lines (drawn before dots so dots sit on top) */}
        {lines.map(l => (
          <line key={l.key}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.55} />
        ))}

        {/* Dots */}
        {dots.map(({ e, x, y }) => {
          const r   = dotR(e.flow_score);
          const col = dotColor(e);
          const above = y < cpY;
          return (
            <g key={e.event_id || e.id || e.curated_id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={ev => { setHovered(e); setMouse({ x: ev.clientX, y: ev.clientY }); }}
              onMouseMove={ev => setMouse({ x: ev.clientX, y: ev.clientY })}
              onMouseLeave={() => setHovered(null)}
            >
              <circle cx={x} cy={y} r={r} fill={col + '22'} stroke={col} strokeWidth={1.5} />
              <text x={x} y={above ? y - r - 5 : y + r + 11}
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
        const col = dotColor(hovered);
        return (
          <div style={{
            position: 'fixed', left: mouse.x + 14, top: mouse.y - 16,
            background: C.canvas as string, border: `1px solid ${C.border as string}`,
            borderRadius: 8, padding: '10px 14px', fontSize: '11px',
            color: C.inkSec as string, lineHeight: 1.7, zIndex: 500,
            pointerEvents: 'none', boxShadow: C.s2 as string,
            minWidth: 210, maxWidth: 290,
          }}>
            <div style={{ fontWeight: 700, fontSize: '12px', color: col, marginBottom: 5 }}>
              {hovered.flow_events.option_type} · {hovered.flow_direction}
            </div>
            <div>Strike <strong>${hovered.flow_events.strike.toLocaleString()}</strong> ({pct(hovered.flow_events.strike, currentPrice)})</div>
            <div>
              Expiry{' '}
              {new Date(hovered.flow_events.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' · '}{hovered.flow_events.dte}d
            </div>
            <div>
              Radon Score{' '}
              <strong style={{ color: col }}>
                {hovered.flow_score > 0 ? '+' : ''}{hovered.flow_score} / 10
              </strong>
            </div>
            <div>Conv {hovered.conviction_score} · Premium {fmtPremium(hovered.flow_events.premium_size)}</div>
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
