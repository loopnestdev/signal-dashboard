import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchDarkPool } from '../lib/api';
import type { DpPrint } from '../types/market';

function fmtPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function nbboLabel(price: number, bid: number, ask: number): { label: string; color: string } {
  if (bid === 0 && ask === 0) return { label: '—', color: C.inkMute as string };
  const spread = ask - bid;
  const mid = (bid + ask) / 2;
  if (spread > 0 && price >= ask - spread * 0.1) return { label: 'at ask', color: C.bull as string };
  if (spread > 0 && price <= bid + spread * 0.1) return { label: 'at bid', color: C.bear as string };
  if (price > mid) return { label: 'near ask', color: C.bull as string };
  if (price < mid) return { label: 'near bid', color: C.bear as string };
  return { label: 'at mid', color: C.inkMute as string };
}

export function DarkPoolView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [prints, setPrints] = useState<DpPrint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchDarkPool();
      const sorted = [...(data.prints ?? [])].sort((a, b) => Math.abs(b.dp_score) - Math.abs(a.dp_score) || b.premium - a.premium);
      setPrints(sorted);
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

  const totalPremium = prints.reduce((s, p) => s + p.premium, 0);
  const bullish = prints.filter(p => p.dp_direction === 'BULLISH');
  const bearish = prints.filter(p => p.dp_direction === 'BEARISH');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
            Dark Pool
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Off-exchange institutional block prints · Radon-scored by NBBO positioning
            {lastUpdated > 0 && <span style={{ marginLeft: 8 }}>· just now</span>}
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

      {/* Summary strip */}
      {prints.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Premium', value: fmtPremium(totalPremium), color: C.ink },
            { label: 'Bullish Prints', value: String(bullish.length), color: C.bull },
            { label: 'Bearish Prints', value: String(bearish.length), color: C.bear },
            { label: 'Largest Print', value: fmtPremium(Math.max(...prints.map(p => p.premium))), color: C.ink },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', boxShadow: C.s1 }}>
              <div style={{ fontSize: '10px', color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
              <div className="tnum" style={{ fontSize: '16px', fontWeight: 600, color: color as string }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && prints.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading dark pool data…</div>
      ) : (
        <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.s1, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Direction', 'Ticker', 'Print Price', 'Block Size', 'Premium', 'NBBO', 'Time'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prints.map((p, idx) => {
                  const dirCol = p.dp_direction === 'BULLISH' ? C.bull : p.dp_direction === 'BEARISH' ? C.bear : C.inkMute;
                  const dirBg  = p.dp_direction === 'BULLISH' ? 'rgba(34,197,94,0.07)' : p.dp_direction === 'BEARISH' ? 'rgba(239,68,68,0.07)' : 'transparent';
                  const nbbo   = nbboLabel(p.price, p.nbbo_bid, p.nbbo_ask);
                  return (
                    <tr key={idx} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? 'transparent' : C.canvasSoft }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                            padding: '2px 7px', borderRadius: 9999,
                            background: dirBg, color: dirCol as string,
                            border: `1px solid ${dirCol}33`,
                          }}>
                            {p.dp_direction === 'NEUTRAL' ? 'NEU' : p.dp_direction.slice(0, 4)}
                          </span>
                          <span className="tnum" style={{ fontSize: '10px', color: dirCol as string, fontWeight: 600 }}>
                            {p.dp_score > 0 ? '+' : ''}{p.dp_score}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <button
                          onClick={() => onAnalyze(p.ticker)}
                          style={{ background: 'none', border: 'none', padding: 0, color: C.primary as string, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {p.ticker}
                        </button>
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', color: C.ink as string }}>
                        ${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', color: C.inkSec as string }}>
                        {p.size.toLocaleString()}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 600, color: dirCol as string }}>
                        {fmtPremium(p.premium)}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '11px', color: nbbo.color }}>
                        {nbbo.label}
                      </td>
                      <td className="tnum" style={{ padding: '9px 14px', fontSize: '11px', color: C.inkMute as string, whiteSpace: 'nowrap' }}>
                        {p.executed_at ? timeAgo(p.executed_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {prints.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>
                      No dark pool prints available
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
