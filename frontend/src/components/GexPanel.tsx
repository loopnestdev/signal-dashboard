import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchStockGex } from '../lib/api';
import type { StockGexResponse } from '../types/market';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${s}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${s}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${s}$${(abs / 1e3).toFixed(0)}K`;
  return `${s}$${abs.toFixed(0)}`;
}

function fmtPrice(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── diverging bar chart ───────────────────────────────────────────────────────

interface Level { strike: number; net_gex: number }

interface ChartProps {
  levels: Level[];
  currentPrice: number;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  showAll: boolean;
}

function GexChart({ levels, currentPrice, gammaFlip, callWall, putWall, showAll }: ChartProps) {
  // Filter to ±20% proximity window
  const window = currentPrice * 0.20;
  const inRange = levels.filter(l => l.strike >= currentPrice - window && l.strike <= currentPrice + window);

  // Unusual threshold: |net_gex| > 5% of max in range
  const maxAbs = inRange.reduce((m, l) => Math.max(m, Math.abs(l.net_gex)), 0);
  const threshold = maxAbs * 0.05;
  const filtered = showAll ? inRange : inRange.filter(l => Math.abs(l.net_gex) >= threshold);

  // Sort descending (highest strike at top)
  const rows = [...filtered].sort((a, b) => b.strike - a.strike);

  if (!rows.length) {
    return (
      <div style={{ fontSize: '12px', color: C.inkMute, padding: '20px 0', textAlign: 'center' }}>
        No GEX levels found in ±20% range of current price.
      </div>
    );
  }

  // SVG layout
  const labelW = 64;
  const badgeW = 100;
  const svgW = 560;
  const rowH = 22;
  const padTop = 24; // extra room for axis labels above first row
  const padBot = 8;
  const svgH = rows.length * rowH + padTop + padBot;
  const barArea = svgW - labelW - badgeW;
  const centerX = labelW + barArea * 0.5;
  const barScale = (barArea * 0.48) / (maxAbs || 1);

  // Current price interpolated y
  const priceY = (() => {
    const above = rows.findIndex(l => l.strike <= currentPrice);
    if (above === -1) return padTop;
    if (above === 0) return padTop;
    const a = rows[above - 1]; // strike above price
    const b = rows[above];     // strike below price
    const frac = (a.strike - currentPrice) / (a.strike - b.strike);
    return padTop + (above - 1 + frac) * rowH + rowH / 2;
  })();

  const badge = (label: string, color: string) => (
    <rect rx="3" ry="3" height="13" width={label.length * 6 + 8} fill={`${color}22`} stroke={`${color}66`} strokeWidth={0.5} />
  );

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* Center zero line */}
      <line x1={centerX} y1={padTop - 4} x2={centerX} y2={svgH - padBot + 4} stroke={C.border as string} strokeWidth={1} />

      {rows.map((l, i) => {
        const y = padTop + i * rowH;
        const cy = y + rowH / 2;
        const barW = Math.abs(l.net_gex) * barScale;
        const isPos = l.net_gex >= 0;
        const barX = isPos ? centerX : centerX - barW;
        const barColor = isPos ? C.bull : C.bear;

        const isCallWall = callWall != null && l.strike === callWall;
        const isPutWall  = putWall  != null && l.strike === putWall;
        const isFlip     = gammaFlip != null && l.strike === gammaFlip;
        const isKey      = isCallWall || isPutWall || isFlip;
        const opacity    = isKey ? 1 : 0.65;

        return (
          <g key={l.strike}>
            {/* Row background highlight for key levels */}
            {isKey && (
              <rect x={0} y={y + 1} width={svgW} height={rowH - 2} fill={`${barColor as string}08`} rx={2} />
            )}

            {/* Strike label */}
            <text
              x={labelW - 6} y={cy + 4}
              textAnchor="end" fontSize={10}
              fill={isKey ? (C.ink as string) : (C.inkMute as string)}
              fontWeight={isKey ? 600 : 400}
              fontFamily="inherit"
            >
              {fmtPrice(l.strike)}
            </text>

            {/* Bar */}
            <rect
              x={barX} y={y + 5} width={Math.max(barW, 1)} height={rowH - 10}
              fill={barColor as string} opacity={opacity} rx={2}
            />

            {/* GEX value label on bar */}
            {barW > 30 && (
              <text
                x={isPos ? barX + 4 : centerX - barW + 4}
                y={cy + 3}
                fontSize={9} fill="white" opacity={0.85} fontFamily="inherit"
              >
                {fmtGex(l.net_gex)}
              </text>
            )}

            {/* Right-side badges */}
            {isCallWall && (
              <g transform={`translate(${svgW - badgeW + 4}, ${cy - 7})`}>
                {badge('CALL WALL', C.bull as string)}
                <text x={4} y={10} fontSize={8} fontWeight={700} fill={C.bull as string} fontFamily="inherit" letterSpacing="0.05em">
                  CALL WALL
                </text>
              </g>
            )}
            {isPutWall && (
              <g transform={`translate(${svgW - badgeW + 4}, ${cy - 7})`}>
                {badge('PUT WALL', C.bear as string)}
                <text x={4} y={10} fontSize={8} fontWeight={700} fill={C.bear as string} fontFamily="inherit" letterSpacing="0.05em">
                  PUT WALL
                </text>
              </g>
            )}
            {isFlip && !isCallWall && !isPutWall && (
              <g transform={`translate(${svgW - badgeW + 4}, ${cy - 7})`}>
                {badge('FLIP', C.warn as string)}
                <text x={4} y={10} fontSize={8} fontWeight={700} fill={C.warn as string} fontFamily="inherit" letterSpacing="0.05em">
                  FLIP
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Current price line */}
      <line
        x1={labelW} y1={priceY} x2={svgW - badgeW} y2={priceY}
        stroke={C.primary as string} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.85}
      />
      <text
        x={labelW + 3} y={priceY - 3}
        fontSize={9} fill={C.primary as string} fontFamily="inherit" fontWeight={600}
      >
        {fmtPrice(currentPrice)}
      </text>

      {/* Axis labels */}
      <text x={centerX - 2} y={padTop - 6} fontSize={8} fill={C.bear as string} textAnchor="end" fontFamily="inherit">
        ← negative GEX
      </text>
      <text x={centerX + 2} y={padTop - 6} fontSize={8} fill={C.bull as string} textAnchor="start" fontFamily="inherit">
        positive GEX →
      </text>
    </svg>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────

export function GexPanel({ ticker, currentPrice }: { ticker: string; currentPrice?: number }) {
  const [data, setData] = useState<StockGexResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchStockGex(ticker));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { void load(); }, [load]);

  const price = data?.current_price ?? currentPrice ?? 0;
  const aboveFlip = data?.above_flip ?? (data?.gamma_flip != null && price > 0 ? price > data.gamma_flip : null);
  const regimeCol = aboveFlip === true ? C.bull : aboveFlip === false ? C.bear : C.inkMute;
  const regimeBg  = aboveFlip === true ? 'rgba(34,197,94,0.1)' : aboveFlip === false ? 'rgba(239,68,68,0.1)' : C.canvasSoft;
  const regimeLabel  = aboveFlip === true ? 'ABOVE GAMMA FLIP' : aboveFlip === false ? 'BELOW GAMMA FLIP' : null;
  const regimeNote   = aboveFlip === true
    ? 'Price is above the gamma flip — dealers are long gamma and dampen moves (buy dips, sell rallies). Lower volatility expected.'
    : aboveFlip === false
    ? 'Price is below the gamma flip — dealers are short gamma and amplify moves in both directions. Higher volatility expected.'
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', marginBottom: 2 }}>
            GEX LEVELS · {ticker}
          </div>
          <div style={{ fontSize: '12px', color: C.inkMute }}>
            Dealer gamma exposure — unusual structural pins and walls
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data?.fromCache && data.capturedAt && (
            <span style={{ fontSize: '11px', color: C.inkMute }}>
              snapshot {timeAgo(data.capturedAt)}
            </span>
          )}
          <button
            onClick={() => void load()} disabled={loading}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 12px', fontSize: '11px', color: C.inkMute, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* Cache notice */}
      {data?.fromCache && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: C.inkMute, background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', marginBottom: 14 }}>
          <span style={{ opacity: 0.7 }}>🕐</span>
          Signa has no live GEX for {ticker} — showing last stored snapshot. Live price is current.
        </div>
      )}

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 8, padding: '10px 14px', color: C.bear, fontSize: '12px', marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: C.inkMute, fontSize: '12px' }}>
          Loading GEX for {ticker}…
        </div>
      ) : data ? (
        <>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 10, marginBottom: regimeNote ? 8 : 18, flexWrap: 'wrap', alignItems: 'center' }}>
            {regimeLabel && (
              <div style={{ background: regimeBg, border: `1px solid ${regimeCol}33`, borderRadius: 9999, padding: '4px 12px', fontSize: '11px', fontWeight: 700, color: regimeCol as string, letterSpacing: '0.06em' }}>
                {regimeLabel}
              </div>
            )}
            {[
              { label: 'Call Wall', value: data.call_wall, color: C.bull },
              { label: 'Gamma Flip', value: data.gamma_flip, color: C.warn },
              { label: 'Put Wall', value: data.put_wall, color: C.bear },
              { label: 'Net GEX', value: data.net_gex != null ? fmtGex(data.net_gex) : null, color: data.net_gex != null && data.net_gex >= 0 ? C.bull : C.bear },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: '11px' }}>
                <div style={{ color: C.inkMute as string, marginBottom: 2 }}>{label}</div>
                <div className="tnum" style={{ fontWeight: 600, color: value != null ? color as string : C.inkMute as string }}>
                  {typeof value === 'number' ? fmtPrice(value) : value ?? '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Regime note */}
          {regimeNote && (
            <div style={{ fontSize: '11px', color: regimeCol as string, background: regimeBg, border: `1px solid ${regimeCol}22`, borderRadius: 8, padding: '6px 12px', marginBottom: 16, lineHeight: 1.5 }}>
              {regimeNote}
            </div>
          )}

          {/* How to read */}
          <div style={{ padding: '8px 12px', background: C.canvasSoft, borderRadius: 8, fontSize: '11px', color: C.inkMute, lineHeight: 1.6, marginBottom: 14 }}>
            <strong style={{ color: C.inkSec as string }}>How to read: </strong>
            Green bars = positive GEX (dealers long gamma → dampen moves, pin price).
            Red bars = negative GEX (dealers short gamma → amplify moves).
            Longer bar = stronger structural effect. The{' '}
            <span style={{ color: C.warn as string }}>gamma flip</span> divides the two regimes.
          </div>

          {/* Filter toggle + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em' }}>
              UNUSUAL GEX LEVELS
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['Unusual', 'All'] as const).map(opt => {
                const active = opt === 'Unusual' ? !showAll : showAll;
                return (
                  <button key={opt} onClick={() => setShowAll(opt === 'All')} style={{
                    padding: '2px 10px', borderRadius: 9999, fontSize: '11px',
                    border: `1px solid ${active ? C.primary : C.border}`,
                    background: active ? C.primaryBg : 'none',
                    color: active ? C.primary as string : C.inkMute as string,
                    cursor: 'pointer',
                  }}>
                    {opt}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: '11px', color: C.inkMute }}>· ±20% of {fmtPrice(price)}</span>
          </div>

          {/* Bar chart */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 400 }}>
              <GexChart
                levels={data.levels}
                currentPrice={price}
                gammaFlip={data.gamma_flip}
                callWall={data.call_wall}
                putWall={data.put_wall}
                showAll={showAll}
              />
            </div>
          </div>

        </>
      ) : null}
    </div>
  );
}
