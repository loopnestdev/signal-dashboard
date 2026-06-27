import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchGammaGex } from '../lib/api';
import type { GexData } from '../types/market';

function GexCard({ data, onAnalyze }: { data: GexData; onAnalyze: (t: string) => void }) {
  const { symbol, current_price, gamma_flip, call_wall, put_wall, above_flip, net_gex } = data;
  const hasLevels = gamma_flip != null || call_wall != null || put_wall != null;

  const aboveFlip = above_flip ?? (gamma_flip != null ? current_price > gamma_flip : null);
  const regime = aboveFlip === true ? 'ABOVE FLIP' : aboveFlip === false ? 'BELOW FLIP' : null;
  const regimeCol = aboveFlip === true ? C.bull : aboveFlip === false ? C.bear : C.inkMute;
  const regimeBg  = aboveFlip === true ? 'rgba(34,197,94,0.1)' : aboveFlip === false ? 'rgba(239,68,68,0.1)' : C.canvasSoft;

  // Build a simple scale: put_wall … current_price … call_wall
  const lo = Math.min(...[put_wall, gamma_flip, current_price].filter((v): v is number => v != null));
  const hi = Math.max(...[call_wall, gamma_flip, current_price].filter((v): v is number => v != null));
  const range = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / range) * 100;

  const fmtGex = (v: number | null) =>
    v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', boxShadow: C.s1, flex: '1 1 260px', minWidth: 240 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <button
            onClick={() => onAnalyze(symbol)}
            style={{ background: 'none', border: 'none', padding: 0, color: C.primary as string, fontWeight: 700, fontSize: '18px', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.02em' }}
          >
            {symbol}
          </button>
          <div className="tnum" style={{ fontSize: '13px', color: C.inkSec as string, marginTop: 1 }}>
            ${current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        {regime && (
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em',
            padding: '3px 9px', borderRadius: 9999,
            background: regimeBg, color: regimeCol as string,
            border: `1px solid ${regimeCol}33`,
          }}>
            {regime}
          </span>
        )}
      </div>

      {/* Key levels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
        {[
          { label: 'Call Wall', value: call_wall, color: C.bull },
          { label: 'Gamma Flip', value: gamma_flip, color: C.warn },
          { label: 'Put Wall', value: put_wall, color: C.bear },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: C.inkMute as string }}>{label}</span>
            <span className="tnum" style={{ fontSize: '12px', fontWeight: 600, color: value != null ? color as string : C.inkMute as string }}>
              {value != null ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 0 })}` : '—'}
            </span>
          </div>
        ))}
        {net_gex != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: '11px', color: C.inkMute as string }}>Net GEX</span>
            <span className="tnum" style={{ fontSize: '12px', fontWeight: 600, color: net_gex >= 0 ? C.bull as string : C.bear as string }}>
              {fmtGex(net_gex)}
            </span>
          </div>
        )}
      </div>

      {/* Visual scale */}
      {hasLevels && (
        <div style={{ position: 'relative', height: 28, marginTop: 8 }}>
          {/* Track */}
          <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 4, background: C.border, borderRadius: 2 }} />
          {/* Zones */}
          {call_wall != null && current_price != null && (
            <div style={{
              position: 'absolute', top: 12, height: 4,
              left: `${pct(current_price)}%`, right: `${100 - pct(call_wall)}%`,
              background: `${C.bull}44`, borderRadius: 2,
            }} />
          )}
          {put_wall != null && current_price != null && (
            <div style={{
              position: 'absolute', top: 12, height: 4,
              left: `${pct(put_wall)}%`, right: `${100 - pct(current_price)}%`,
              background: `${C.bear}44`, borderRadius: 2,
            }} />
          )}
          {/* Markers */}
          {call_wall != null && (
            <div title={`Call Wall $${call_wall}`} style={{ position: 'absolute', top: 6, left: `${pct(call_wall)}%`, width: 3, height: 16, background: C.bull, borderRadius: 2, transform: 'translateX(-50%)' }} />
          )}
          {gamma_flip != null && (
            <div title={`Gamma Flip $${gamma_flip}`} style={{ position: 'absolute', top: 4, left: `${pct(gamma_flip)}%`, width: 2, height: 20, background: C.warn, borderRadius: 1, transform: 'translateX(-50%)' }} />
          )}
          {put_wall != null && (
            <div title={`Put Wall $${put_wall}`} style={{ position: 'absolute', top: 6, left: `${pct(put_wall)}%`, width: 3, height: 16, background: C.bear, borderRadius: 2, transform: 'translateX(-50%)' }} />
          )}
          {/* Current price */}
          <div style={{ position: 'absolute', top: 2, left: `${pct(current_price)}%`, transform: 'translateX(-50%)' }}>
            <div style={{ width: 4, height: 24, background: C.primary, borderRadius: 2 }} />
          </div>
        </div>
      )}

      {/* Regime note */}
      <div style={{ marginTop: 10, fontSize: '11px', color: C.inkMute as string, lineHeight: 1.4 }}>
        {aboveFlip === true
          ? 'Positive gamma: dealers buy dips / sell rallies → dampening effect on moves'
          : aboveFlip === false
          ? 'Negative gamma: dealers amplify moves in both directions → higher volatility'
          : 'Flip level unavailable — check back during market hours'}
      </div>
    </div>
  );
}

export function GammaView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [gex, setGex] = useState<{ spy: GexData | null; qqq: GexData | null; iwm: GexData | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchGammaGex();
      setGex(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
            Gamma / GEX
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Key market structure levels where dealer hedging creates pinning or amplification
          </p>
        </div>
        <button
          onClick={() => { void load(); }}
          disabled={loading}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999,
            padding: '6px 14px', fontSize: '12px', color: C.inkMute,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ fontSize: '11px', color: C.inkMute, marginBottom: 20 }}>
        <span style={{ color: C.primary as string, fontWeight: 600 }}>▌</span> current price &nbsp;
        <span style={{ color: C.bull as string, fontWeight: 600 }}>▌</span> call wall &nbsp;
        <span style={{ color: C.warn as string, fontWeight: 600 }}>▌</span> gamma flip &nbsp;
        <span style={{ color: C.bear as string, fontWeight: 600 }}>▌</span> put wall
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && !gex ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading GEX data…</div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {gex && [gex.spy, gex.qqq, gex.iwm].map(d => d && (
            <GexCard key={d.symbol} data={d} onAnalyze={onAnalyze} />
          ))}
          {gex && !gex.spy && !gex.qqq && !gex.iwm && (
            <div style={{ padding: '32px', color: C.inkMute, fontSize: '13px' }}>
              GEX data unavailable — data is only populated during market hours
            </div>
          )}
        </div>
      )}
    </div>
  );
}
