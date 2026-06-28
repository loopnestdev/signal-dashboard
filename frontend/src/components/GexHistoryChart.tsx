import { useState } from 'react';
import { C } from '../lib/colors';
import type { GexHistoryPoint } from '../types/market';

function niceStep(range: number): number {
  if (range < 5)    return 1;
  if (range < 20)   return 5;
  if (range < 50)   return 10;
  if (range < 150)  return 20;
  if (range < 400)  return 50;
  if (range < 1000) return 100;
  return 200;
}

export function GexHistoryChart({
  history,
  currentPrice,
}: {
  history: GexHistoryPoint[];
  currentPrice: number;
}) {
  const [hovered, setHovered] = useState<{ point: GexHistoryPoint; mx: number; my: number } | null>(null);

  // Need at least 2 points to draw meaningful lines
  if (history.length < 2) return null;

  const W = 800, H = 220;
  const PAD = { top: 20, right: 84, bottom: 36, left: 74 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  // X scale — time
  const times = history.map(h => new Date(h.captured_at).getTime());
  const xMin  = Math.min(...times);
  const xMax  = Math.max(...times);
  const xSpan = Math.max(xMax - xMin, 3_600_000); // at least 1 h span
  const xScale = (t: number) => PAD.left + ((t - xMin) / xSpan) * cW;

  // Y scale — all price levels in history + current price
  const allValues = history.flatMap(h =>
    ([h.call_wall, h.gamma_flip, h.put_wall, h.current_price] as (number | null)[])
      .filter((v): v is number => v != null),
  );
  allValues.push(currentPrice);
  const yMin   = Math.min(...allValues);
  const yMax   = Math.max(...allValues);
  const rawRange = yMax - yMin;
  const yPad   = Math.max(rawRange * 0.15, currentPrice * 0.02);
  const yMinP  = yMin - yPad;
  const yMaxP  = yMax + yPad;
  const yScale = (p: number) => PAD.top + cH - ((p - yMinP) / (yMaxP - yMinP)) * cH;
  const cpY    = yScale(currentPrice);

  // Y ticks
  const yStep  = niceStep(yMaxP - yMinP);
  const yTicks: number[] = [];
  { let y = Math.ceil(yMinP / yStep) * yStep; while (y <= yMaxP) { yTicks.push(y); y += yStep; } }

  // X ticks — evenly spaced, up to 6
  const tickStep = Math.max(1, Math.floor(history.length / 6));
  const xTickIndices = Array.from(
    { length: Math.ceil(history.length / tickStep) },
    (_, i) => Math.min(i * tickStep, history.length - 1),
  );

  // Build SVG path for a series (handles null gaps)
  function makePath(values: (number | null)[]): string {
    const segs: string[] = [];
    let seg = '';
    values.forEach((v, i) => {
      if (v == null) { if (seg) { segs.push(seg); seg = ''; } return; }
      const x = xScale(times[i]);
      const y = yScale(v);
      seg += seg ? ` L${x},${y}` : `M${x},${y}`;
    });
    if (seg) segs.push(seg);
    return segs.join(' ');
  }

  const callWallPath  = makePath(history.map(h => h.call_wall));
  const gammaFlipPath = makePath(history.map(h => h.gamma_flip));
  const putWallPath   = makePath(history.map(h => h.put_wall));
  const pricePath     = makePath(history.map(h => h.current_price));

  const last = history[history.length - 1];

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>
        KEY LEVEL HISTORY
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: '10px', color: C.inkMute }}>
        <span><span style={{ color: C.bull as string }}>—</span> Call Wall</span>
        <span><span style={{ color: C.warn as string }}>—</span> Gamma Flip</span>
        <span><span style={{ color: C.bear as string }}>—</span> Put Wall</span>
        <span><span style={{ color: C.inkSec as string }}>- -</span> Price</span>
        <span>· {history.length} snapshot{history.length !== 1 ? 's' : ''}</span>
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

        {/* X time labels */}
        {xTickIndices.map(i => (
          <text key={i} x={xScale(times[i])} y={H - 4}
            textAnchor="middle" fontSize={8} fill={C.inkMute as string}>
            {new Date(times[i]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

        {/* Left axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + cH}
          stroke={C.border as string} strokeWidth={1} />

        {/* Price path (behind everything, dashed) */}
        {pricePath && (
          <path d={pricePath} fill="none"
            stroke={C.inkSec as string} strokeWidth={1.2} strokeDasharray="5 3" strokeOpacity={0.45} />
        )}

        {/* Current price reference */}
        <line x1={PAD.left} y1={cpY} x2={PAD.left + cW} y2={cpY}
          stroke={C.primary as string} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} />
        <text x={PAD.left + cW + 3} y={cpY + 3.5} fontSize={7} fill={C.primary as string}>NOW</text>

        {/* Key level lines */}
        {putWallPath   && <path d={putWallPath}   fill="none" stroke={C.bear as string} strokeWidth={2} strokeOpacity={0.85} />}
        {gammaFlipPath && <path d={gammaFlipPath} fill="none" stroke={C.warn as string} strokeWidth={2} strokeOpacity={0.85} />}
        {callWallPath  && <path d={callWallPath}  fill="none" stroke={C.bull as string} strokeWidth={2} strokeOpacity={0.85} />}

        {/* Latest value labels on right edge */}
        {last.call_wall  != null && (
          <text x={PAD.left + cW + 4} y={yScale(last.call_wall)  + 3.5} fontSize={8} fontWeight={600} fill={C.bull  as string}>${last.call_wall.toLocaleString()}</text>
        )}
        {last.gamma_flip != null && (
          <text x={PAD.left + cW + 4} y={yScale(last.gamma_flip) + 3.5} fontSize={8} fontWeight={600} fill={C.warn  as string}>${last.gamma_flip.toLocaleString()}</text>
        )}
        {last.put_wall   != null && (
          <text x={PAD.left + cW + 4} y={yScale(last.put_wall)   + 3.5} fontSize={8} fontWeight={600} fill={C.bear  as string}>${last.put_wall.toLocaleString()}</text>
        )}

        {/* Hover capture strips — one per data point */}
        {history.map((point, i) => (
          <rect key={i}
            x={xScale(times[i]) - 6} y={PAD.top} width={12} height={cH}
            fill="transparent" style={{ cursor: 'crosshair' }}
            onMouseEnter={ev => setHovered({ point, mx: ev.clientX, my: ev.clientY })}
            onMouseMove={ev  => setHovered(h => h ? { ...h, mx: ev.clientX, my: ev.clientY } : null)}
          />
        ))}

        {/* Hover crosshair dot */}
        {hovered && (() => {
          const i   = history.indexOf(hovered.point);
          const x   = xScale(times[i]);
          return (
            <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + cH}
              stroke={C.inkMute as string} strokeWidth={1} strokeDasharray="3 2" strokeOpacity={0.5}
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}
      </svg>

      {/* Hover tooltip */}
      {hovered && (() => {
        const p  = hovered.point;
        const dt = new Date(p.captured_at).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
        return (
          <div style={{
            position: 'fixed', left: hovered.mx + 14, top: hovered.my - 16,
            background: C.canvas as string, border: `1px solid ${C.border as string}`,
            borderRadius: 8, padding: '10px 14px', fontSize: '11px',
            color: C.inkSec as string, lineHeight: 1.7, zIndex: 500,
            pointerEvents: 'none', boxShadow: C.s2 as string, minWidth: 200,
          }}>
            <div style={{ fontWeight: 600, fontSize: '10px', color: C.inkMute as string, marginBottom: 4 }}>{dt}</div>
            {p.call_wall  != null && <div>Call Wall  <strong style={{ color: C.bull  as string }}>${p.call_wall.toLocaleString()}</strong></div>}
            {p.gamma_flip != null && <div>Gamma Flip <strong style={{ color: C.warn  as string }}>${p.gamma_flip.toLocaleString()}</strong></div>}
            {p.put_wall   != null && <div>Put Wall   <strong style={{ color: C.bear  as string }}>${p.put_wall.toLocaleString()}</strong></div>}
            <div>Price <strong>${p.current_price.toFixed(2)}</strong></div>
          </div>
        );
      })()}
    </div>
  );
}
