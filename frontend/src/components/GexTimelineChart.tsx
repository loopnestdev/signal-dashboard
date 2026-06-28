import { useState } from 'react';
import { C } from '../lib/colors';
import type { GexRawLevel } from '../types/market';

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${s}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(0)}K`;
  return `${s}$${abs.toFixed(0)}`;
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

interface DateGroup {
  date: string;
  ts: number;
  pos?: GexRawLevel; // highest positive GEX in range
  neg?: GexRawLevel; // most negative GEX in range
}

export function GexTimelineChart({
  rawLevels,
  currentPrice,
  callWall,
  putWall,
}: {
  rawLevels: GexRawLevel[];
  currentPrice: number;
  callWall?: number | null;
  putWall?: number | null;
}) {
  const [hovered, setHovered] = useState<{ level: GexRawLevel; mx: number; my: number } | null>(null);

  if (!rawLevels.length || !currentPrice) return null;

  // Filter to ±30% of current price; skip entries without an expiry date
  const priceWindow = currentPrice * 0.30;
  const inRange = rawLevels.filter(l =>
    l.expiry.length > 0 &&
    l.strike >= currentPrice - priceWindow &&
    l.strike <= currentPrice + priceWindow,
  );
  if (!inRange.length) return null;

  // Group by expiry date — best positive and best negative GEX per date
  const byDate = new Map<string, { pos: GexRawLevel[]; neg: GexRawLevel[] }>();
  inRange.forEach(l => {
    const k = l.expiry.slice(0, 10);
    if (!byDate.has(k)) byDate.set(k, { pos: [], neg: [] });
    const g = byDate.get(k)!;
    if (l.net_gex >= 0) g.pos.push(l);
    else g.neg.push(l);
  });

  const groups: DateGroup[] = Array.from(byDate.entries())
    .map(([date, { pos, neg }]) => ({
      date,
      ts: new Date(date).getTime(),
      pos: pos.length ? pos.reduce((b, l) => l.net_gex > b.net_gex ? l : b) : undefined,
      neg: neg.length ? neg.reduce((b, l) => l.net_gex < b.net_gex ? l : b) : undefined,
    }))
    .sort((a, b) => a.ts - b.ts);

  if (!groups.length) return null;

  // Layout
  const W = 800, H = 280;
  const PAD = { top: 24, right: 60, bottom: 38, left: 74 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // X scale — from today to last expiry
  const now     = Date.now();
  const lastTs  = Math.max(...groups.map(g => g.ts));
  const xEnd    = Math.max(lastTs + 14 * 86400000, now + 30 * 86400000);
  const xScale  = (t: number) => PAD.left + ((t - now) / (xEnd - now)) * cW;

  // Y scale
  const allStrikes = groups.flatMap(g =>
    [g.pos?.strike, g.neg?.strike].filter((v): v is number => v != null),
  );
  const allY = [...allStrikes, currentPrice];
  if (callWall) allY.push(callWall);
  if (putWall)  allY.push(putWall);
  const rawRange = Math.max(...allY) - Math.min(...allY);
  const yPad  = Math.max(rawRange * 0.30, currentPrice * 0.04);
  const yMin  = Math.min(...allY) - yPad;
  const yMax  = Math.max(...allY) + yPad;
  const yScale = (p: number) => PAD.top + cH - ((p - yMin) / (yMax - yMin)) * cH;
  const cpY    = yScale(currentPrice);

  // Y ticks
  const yStep = niceStep(yMax - yMin);
  const yTicks: number[] = [];
  { let y = Math.ceil(yMin / yStep) * yStep; while (y <= yMax) { yTicks.push(y); y += yStep; } }

  // X month ticks
  const xTicks: number[] = [];
  {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    while (d.getTime() < xEnd) { xTicks.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
  }

  // Dot size proportional to |netGex|
  const maxAbs = Math.max(...inRange.map(l => Math.abs(l.net_gex)), 1);
  const dotR = (v: number) => Math.min(5 + (Math.abs(v) / maxAbs) * 12, 18);

  // Connecting lines (same fork / merge / pair pattern as FlowTimelineChart)
  const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; color: string }> = [];
  groups.slice(0, -1).forEach((from, i) => {
    const to = groups[i + 1];
    type Lvl = GexRawLevel | undefined;
    const froms = ([from.pos, from.neg] as Lvl[]).filter((e): e is GexRawLevel => e !== undefined);
    const tos   = ([to.pos,   to.neg  ] as Lvl[]).filter((e): e is GexRawLevel => e !== undefined);
    if (!froms.length || !tos.length) return;

    const col = (l: GexRawLevel) => (l.net_gex >= 0 ? C.bull : C.bear) as string;

    if (froms.length === 1) {
      tos.forEach((dst, di) => lines.push({
        key: `l${i}-${di}`,
        x1: xScale(from.ts), y1: yScale(froms[0].strike),
        x2: xScale(to.ts),   y2: yScale(dst.strike),
        color: col(dst),
      }));
    } else if (tos.length === 1) {
      froms.forEach((src, si) => lines.push({
        key: `l${i}-${si}`,
        x1: xScale(from.ts), y1: yScale(src.strike),
        x2: xScale(to.ts),   y2: yScale(tos[0].strike),
        color: col(tos[0]),
      }));
    } else {
      if (from.pos && to.pos) lines.push({ key: `l${i}-p`, x1: xScale(from.ts), y1: yScale(from.pos.strike), x2: xScale(to.ts), y2: yScale(to.pos.strike), color: C.bull as string });
      if (from.neg && to.neg) lines.push({ key: `l${i}-n`, x1: xScale(from.ts), y1: yScale(from.neg.strike), x2: xScale(to.ts), y2: yScale(to.neg.strike), color: C.bear as string });
    }
  });

  // Dots
  const dots = groups.flatMap(g =>
    ([g.pos, g.neg] as (GexRawLevel | undefined)[])
      .filter((e): e is GexRawLevel => e !== undefined)
      .map(e => ({ e, x: xScale(g.ts), y: yScale(e.strike) })),
  );

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
        GEX STRIKE MAP BY EXPIRY
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: '10px', color: C.inkMute }}>
        <span><span style={{ color: C.bull as string }}>●</span> Positive GEX (dealers long gamma — dampen)</span>
        <span><span style={{ color: C.bear as string }}>●</span> Negative GEX (dealers short gamma — amplify)</span>
        <span>dot size = GEX magnitude · dashed line = dominant level across expiries</span>
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

        {/* Call / Put Wall reference lines */}
        {callWall && xScale(groups[0].ts) > PAD.left && (
          <>
            <line x1={PAD.left} y1={yScale(callWall)} x2={PAD.left + cW} y2={yScale(callWall)}
              stroke={C.bull as string} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} />
            <text x={PAD.left + cW + 3} y={yScale(callWall) + 3.5} fontSize={7} fill={C.bull as string}>CW</text>
          </>
        )}
        {putWall && (
          <>
            <line x1={PAD.left} y1={yScale(putWall)} x2={PAD.left + cW} y2={yScale(putWall)}
              stroke={C.bear as string} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.35} />
            <text x={PAD.left + cW + 3} y={yScale(putWall) + 3.5} fontSize={7} fill={C.bear as string}>PW</text>
          </>
        )}

        {/* Current price */}
        <line x1={PAD.left} y1={cpY} x2={PAD.left + cW} y2={cpY}
          stroke={C.inkSec as string} strokeWidth={1.2} strokeDasharray="6 3" strokeOpacity={0.7} />
        <text x={PAD.left - 6} y={cpY - 4} textAnchor="end" fontSize={8} fontWeight={600} fill={C.inkSec as string}>
          ${currentPrice.toFixed(2)}
        </text>
        <text x={PAD.left + cW + 3} y={cpY + 3.5} fontSize={7} fill={C.inkMute as string}>NOW</text>

        {/* Connecting lines */}
        {lines.map(l => (
          <line key={l.key}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.55} />
        ))}

        {/* Dots */}
        {dots.map(({ e, x, y }, idx) => {
          const col   = (e.net_gex >= 0 ? C.bull : C.bear) as string;
          const r     = dotR(e.net_gex);
          const above = y < cpY;
          return (
            <g key={idx} style={{ cursor: 'pointer' }}
              onMouseEnter={ev => setHovered({ level: e, mx: ev.clientX, my: ev.clientY })}
              onMouseMove={ev  => setHovered(h => h ? { ...h, mx: ev.clientX, my: ev.clientY } : null)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle cx={x} cy={y} r={r} fill={`${col}22`} stroke={col} strokeWidth={1.5} />
              <text x={x} y={above ? y - r - 5 : y + r + 11}
                textAnchor="middle" fontSize={8} fontWeight={500} fill={col}
                style={{ pointerEvents: 'none' }}>
                {pct(e.strike, currentPrice)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: 'fixed', left: hovered.mx + 14, top: hovered.my - 16,
          background: C.canvas as string, border: `1px solid ${C.border as string}`,
          borderRadius: 8, padding: '10px 14px', fontSize: '11px',
          color: C.inkSec as string, lineHeight: 1.7, zIndex: 500,
          pointerEvents: 'none', boxShadow: C.s2 as string, minWidth: 210,
        }}>
          <div style={{ fontWeight: 700, fontSize: '12px', color: hovered.level.net_gex >= 0 ? C.bull as string : C.bear as string, marginBottom: 5 }}>
            {hovered.level.net_gex >= 0 ? 'Positive GEX — Dampen' : 'Negative GEX — Amplify'}
          </div>
          <div>Strike <strong>${hovered.level.strike.toLocaleString()}</strong> ({pct(hovered.level.strike, currentPrice)})</div>
          {hovered.level.expiry && (
            <div>Expiry {new Date(hovered.level.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          )}
          <div>Net GEX <strong style={{ color: hovered.level.net_gex >= 0 ? C.bull as string : C.bear as string }}>{fmtGex(hovered.level.net_gex)}</strong></div>
        </div>
      )}
    </div>
  );
}
