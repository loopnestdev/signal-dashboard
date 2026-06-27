import { useState } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { C } from '../lib/colors';
import type { ScoredFlowEvent } from '../types/stock';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtPrice(n: number): string {
  return n >= 1000 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
}

// ── Mini inline SVG card ──────────────────────────────────────────────────────

function MiniChart({ event, onClick }: { event: ScoredFlowEvent; onClick: () => void }) {
  const fe = event.flow_events;
  const isBull = event.flow_direction === 'BULLISH';
  const isBear = event.flow_direction === 'BEARISH';
  const color = isBull ? C.bull : isBear ? C.bear : C.inkMute;
  const bg = isBull ? C.bullBg : isBear ? C.bearBg : C.canvasSoft;
  const border = isBull ? C.bullBorder : isBear ? C.bearBorder : C.border;

  const current = fe.underlying_price;
  const strike = fe.strike;
  const pctDiff = ((strike - current) / current) * 100;
  const absPct = Math.abs(pctDiff);

  return (
    <button
      onClick={onClick}
      style={{
        background: bg, border: `1px solid ${border}`, borderRadius: 8,
        padding: '8px 12px', cursor: 'pointer', textAlign: 'left', width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      {/* SVG arrow */}
      <svg width="60" height="28" viewBox="0 0 60 28" style={{ flexShrink: 0 }}>
        <line x1="4" y1="14" x2="52" y2="14" stroke={C.border} strokeWidth="1.5" />
        {/* current price dot */}
        <circle cx="4" cy="14" r="3" fill={C.inkMute} />
        {/* strike dot + arrow */}
        {isBull ? (
          <>
            <circle cx="52" cy="6" r="3" fill={color} />
            <line x1="8" y1="13" x2="49" y2="7" stroke={color} strokeWidth="1.5" />
            <polygon points="52,6 46,5 47,11" fill={color} />
          </>
        ) : isBear ? (
          <>
            <circle cx="52" cy="22" r="3" fill={color} />
            <line x1="8" y1="15" x2="49" y2="21" stroke={color} strokeWidth="1.5" />
            <polygon points="52,22 46,19 47,25" fill={color} />
          </>
        ) : (
          <>
            <circle cx="52" cy="14" r="3" fill={color} />
            <line x1="8" y1="14" x2="49" y2="14" stroke={color} strokeWidth="1.5" />
            <polygon points="52,14 46,11 46,17" fill={color} />
          </>
        )}
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="tnum" style={{ fontSize: '12px', color, fontWeight: 600 }}>
            {fmtPrice(strike)}
          </span>
          <span style={{ fontSize: '11px', color: C.inkMute }}>
            {pctDiff >= 0 ? '+' : ''}{absPct.toFixed(1)}% {isBull ? 'above' : isBear ? 'below' : 'at'} current
          </span>
        </div>
        <div style={{ fontSize: '11px', color: C.inkMute }}>
          Exp {fmtDate(fe.expiry)} · {fe.dte}d · click to expand
        </div>
      </div>
    </button>
  );
}

// ── Full Recharts chart ───────────────────────────────────────────────────────

function FullChart({ event, onClose }: { event: ScoredFlowEvent; onClose: () => void }) {
  const fe = event.flow_events;
  const isBull = event.flow_direction === 'BULLISH';
  const isBear = event.flow_direction === 'BEARISH';
  const color = isBull ? C.bull : isBear ? C.bear : C.inkMute;

  const current = fe.underlying_price;
  const strike = fe.strike;

  // Build a simple projected path: 5 points from today → expiry
  const today = new Date();
  const expiry = new Date(fe.expiry);
  const totalDays = Math.max(fe.dte, 1);
  const priceRange = Math.abs(strike - current) * 1.5 || current * 0.05;
  const low = Math.min(current, strike) - priceRange * 0.3;
  const high = Math.max(current, strike) + priceRange * 0.3;

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const progress = i / 5;
    const d = new Date(today.getTime() + progress * totalDays * 86400000);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // Linear projection from current to strike
    const projected = current + (strike - current) * progress;
    return { label, projected: Math.round(projected * 100) / 100 };
  });

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '16px', marginTop: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: '12px', color: C.inkMute, letterSpacing: '0.06em' }}>
            {fe.option_type} · STRIKE {fmtPrice(strike)} · EXP {fmtDate(fe.expiry)}
          </span>
          <div className="tnum" style={{ fontSize: '13px', color, fontWeight: 600, marginTop: 2 }}>
            {event.flow_direction} · Score {event.flow_score > 0 ? '+' : ''}{event.flow_score}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '3px 10px', fontSize: '11px', color: C.inkMute, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: C.inkMute as string }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[Math.round(low), Math.round(high)]}
            tick={{ fontSize: 10, fill: C.inkMute as string }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={v => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: C.canvas as string,
              border: `1px solid ${C.border as string}`,
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Projected']}
          />
          <ReferenceLine y={current} stroke={C.inkMute as string} strokeDasharray="4 2" label={{ value: 'Now', position: 'insideTopLeft', fontSize: 10, fill: C.inkMute as string }} />
          <ReferenceLine y={strike} stroke={color as string} strokeDasharray="4 2" label={{ value: 'Strike', position: 'insideTopRight', fontSize: 10, fill: color as string }} />
          <Area
            type="monotone"
            dataKey="projected"
            stroke={color as string}
            strokeWidth={2}
            fill={isBull ? 'rgba(34,197,94,0.08)' : isBear ? 'rgba(239,68,68,0.08)' : 'rgba(100,100,100,0.06)'}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 10, fontSize: '11px', color: C.inkMute, lineHeight: 1.5 }}>
        {event.rationale_short}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function FlowDirectionChart({ event }: { event: ScoredFlowEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <MiniChart event={event} onClick={() => setExpanded(e => !e)} />
      {expanded && <FullChart event={event} onClose={() => setExpanded(false)} />}
    </div>
  );
}
