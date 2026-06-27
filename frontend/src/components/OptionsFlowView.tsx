import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchOptionsFlow } from '../lib/api';
import type { MarketFlowItem } from '../types/market';

type Filter = 'ALL' | 'CALL' | 'PUT' | 'SWEEP';

function fmtPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function alertLabel(rule: string): string {
  return rule
    .replace('RepeatedHits', 'Repeated')
    .replace('AscendingFill', ' ↑')
    .replace('DescendingFill', ' ↓');
}

export function OptionsFlowView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [flow, setFlow] = useState<MarketFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchOptionsFlow();
      setFlow(data.flow ?? []);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 90_000);
    return () => clearInterval(id);
  }, [load]);

  const visible = flow.filter(item => {
    if (filter === 'CALL') return item.type === 'CALL';
    if (filter === 'PUT')  return item.type === 'PUT';
    if (filter === 'SWEEP') return item.has_sweep;
    return true;
  });

  const FILTERS: Filter[] = ['ALL', 'CALL', 'PUT', 'SWEEP'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
            Options Flow
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Market-wide unusual options flow via Unusual Whales
            {lastUpdated > 0 && <span style={{ marginLeft: 8 }}>· {timeAgo(lastUpdated)}</span>}
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 9999, fontSize: '12px',
            border: `1px solid ${filter === f ? C.primary : C.border}`,
            background: filter === f ? C.primaryBg : C.canvas,
            color: filter === f ? C.primary : C.inkMute,
            cursor: 'pointer', fontWeight: filter === f ? 600 : 400,
          }}>
            {f === 'SWEEP' ? '⚡ Sweep' : f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && flow.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading flow data…</div>
      ) : (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.s1, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Type', 'Ticker', 'Strike × Expiry', 'Premium', 'Volume', 'Vol/OI', 'Flags', 'Pattern', 'Time'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item, idx) => {
                  const isCall = item.type === 'CALL';
                  const col = isCall ? C.bull : C.bear;
                  const bg  = isCall ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)';
                  const dte = item.expiry
                    ? Math.max(0, Math.round((new Date(item.expiry).getTime() - Date.now()) / 86400000))
                    : null;
                  return (
                    <tr key={idx} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? 'transparent' : C.canvasSoft }}>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                          padding: '2px 7px', borderRadius: 9999,
                          background: bg, color: col as string,
                          border: `1px solid ${col}33`,
                        }}>
                          {item.type}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <button
                          onClick={() => onAnalyze(item.ticker)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.primary as string, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {item.ticker}
                        </button>
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', color: C.ink as string }}>
                        ${item.strike.toLocaleString()} · {item.expiry.slice(5)}{dte !== null && <span style={{ color: C.inkMute as string, fontSize: '11px' }}> ({dte}d)</span>}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 600, color: col as string }}>
                        {fmtPremium(item.premium)}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', color: C.inkSec as string }}>
                        {item.volume.toLocaleString()}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', color: item.vol_oi_ratio > 5 ? C.warn as string : C.inkSec as string }}>
                        {item.vol_oi_ratio.toFixed(1)}×
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {item.has_sweep && (
                          <span title="Sweep — urgency buy/sell across exchanges" style={{ fontSize: '13px' }}>⚡</span>
                        )}
                        {item.has_floor && (
                          <span title="Floor trade — exchange floor institutional block" style={{ fontSize: '11px', marginLeft: 2 }}>🏛</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '11px', color: C.inkMute as string }}>
                        {alertLabel(item.alert_rule)}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '11px', color: C.inkMute as string, whiteSpace: 'nowrap' }}>
                        {item.start_time ? timeAgo(item.start_time) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>
                      No flow matching current filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
