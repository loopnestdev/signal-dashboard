import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../lib/colors';
import { fetchDarkPool, fetchUnusualFlow } from '../lib/api';
import { FlowTimelineChart } from './FlowTimelineChart';
import type { DpPrint } from '../types/market';
import type { ScoredFlowEvent } from '../types/stock';

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

// ── Column tooltip ────────────────────────────────────────────────────────────

function ColTip({ label, tip }: { label: string; tip: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top - 8, left: r.left });
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label}
      <span
        ref={btnRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setPos(null)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 13, height: 13, borderRadius: '50%',
          border: `1px solid ${C.border}`, color: C.inkMute as string,
          fontSize: '8px', cursor: 'default', lineHeight: 1, flexShrink: 0,
        }}
      >
        ?
      </span>
      {pos && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          transform: 'translateY(-100%)',
          background: C.canvas as string, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '8px 11px', fontSize: '11px',
          color: C.inkSec as string, lineHeight: 1.5, zIndex: 9999,
          pointerEvents: 'none', boxShadow: C.s2 as string,
          width: 220, fontWeight: 400, letterSpacing: 0,
        }}>
          {tip}
        </div>,
        document.body,
      )}
    </span>
  );
}

const COL_TIPS: Record<string, string> = {
  Direction: 'Inferred from NBBO position: price at the ask = aggressive buyer (BULL), at the bid = aggressive seller (BEAR). Dark pool prints are stock trades — no CALL/PUT or strike price exists here.',
  Ticker:    'The stock symbol being traded off-exchange. Click to load full analysis in the Dashboard.',
  'Print Price': 'The execution price of this block trade, off the lit exchange.',
  'Block Size': 'Number of shares traded in this single off-exchange print. Large blocks (1K+) suggest institutional activity.',
  Premium:   'Total dollar value of the print: price × shares. Larger premium = more significant institutional commitment.',
  NBBO:      'National Best Bid and Offer — shows where in the bid-ask spread this block was executed. "At ask" = buyer initiated; "at bid" = seller initiated.',
  Time:      'When the print was executed off-exchange.',
};

// ── Options flow chart for a filtered ticker ──────────────────────────────────

function TickerFlowChart({ ticker, currentPrice }: { ticker: string; currentPrice: number }) {
  const [events, setEvents] = useState<ScoredFlowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const prevTicker = useRef('');

  useEffect(() => {
    if (prevTicker.current === ticker) return;
    prevTicker.current = ticker;
    setLoading(true);
    setEvents([]);
    fetchUnusualFlow(ticker)
      .then(d => setEvents(d.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ padding: '16px 0', fontSize: '12px', color: C.inkMute }}>
        Loading options flow for {ticker}…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div style={{ padding: '16px 0', fontSize: '12px', color: C.inkMute }}>
        No curated options flow data available for {ticker}.
      </div>
    );
  }

  return <FlowTimelineChart events={events} currentPrice={currentPrice} />;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DarkPoolView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [prints, setPrints] = useState<DpPrint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [filterTicker, setFilterTicker] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchDarkPool();
      const sorted = [...(data.prints ?? [])].sort(
        (a, b) => Math.abs(b.dp_score) - Math.abs(a.dp_score) || b.premium - a.premium,
      );
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

  const tickerInput = filterTicker.trim().toUpperCase();
  const visible = tickerInput ? prints.filter(p => p.ticker === tickerInput) : prints;

  // Current price proxy: most recent print price for the filtered ticker
  const filteredPrice = tickerInput
    ? (prints.find(p => p.ticker === tickerInput)?.price ?? 0)
    : 0;

  // Unique ticker suggestions derived from prints
  const uniqueTickers = [...new Set(prints.map(p => p.ticker))].slice(0, 20);

  const totalPremium = prints.reduce((s, p) => s + p.premium, 0);
  const bullish = prints.filter(p => p.dp_direction === 'BULLISH');
  const bearish = prints.filter(p => p.dp_direction === 'BEARISH');

  return (
    <div>
      {/* Header */}
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

      {/* Ticker filter */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value.toUpperCase())}
              placeholder="Filter by ticker…"
              style={{
                background: C.canvasSoft, border: `1px solid ${C.borderInput ?? C.border}`,
                borderRadius: 8, padding: '6px 10px 6px 10px', fontSize: '12px',
                color: C.ink as string, outline: 'none', width: 160,
                fontFamily: 'inherit',
              }}
            />
            {filterTicker && (
              <button
                onClick={() => setFilterTicker('')}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: C.inkMute as string,
                  cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Quick-select chips */}
          {!filterTicker && uniqueTickers.slice(0, 10).map(t => (
            <button
              key={t}
              onClick={() => setFilterTicker(t)}
              style={{
                padding: '4px 10px', borderRadius: 9999, fontSize: '11px',
                border: `1px solid ${C.border}`, background: 'none',
                color: C.inkMute as string, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}

          {filterTicker && (
            <span style={{ fontSize: '12px', color: C.inkMute }}>
              {visible.length} print{visible.length !== 1 ? 's' : ''} for <strong style={{ color: C.ink as string }}>{tickerInput}</strong>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && prints.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading dark pool data…</div>
      ) : (
        <>
          <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.s1, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {(Object.keys(COL_TIPS) as string[]).map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                        <ColTip label={h} tip={COL_TIPS[h]} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, idx) => {
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
                            onClick={() => setFilterTicker(p.ticker)}
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
                  {visible.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>
                        {tickerInput ? `No dark pool prints found for ${tickerInput}` : 'No dark pool prints available'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Options flow chart for filtered ticker */}
          {tickerInput && (
            <div style={{
              background: C.canvas, border: `1px solid ${C.border}`,
              borderRadius: 12, boxShadow: C.s1, padding: '20px 24px', marginTop: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em' }}>
                  OPTIONS FLOW · {tickerInput}
                </div>
                <button
                  onClick={() => onAnalyze(tickerInput)}
                  style={{
                    background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999,
                    padding: '3px 10px', fontSize: '11px', color: C.primary as string,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Full analysis →
                </button>
              </div>
              <p style={{ fontSize: '12px', color: C.inkMute, marginTop: 2, marginBottom: 14 }}>
                Curated options flow with strike prices and expiry dates — complements the equity block prints above
              </p>
              <TickerFlowChart ticker={tickerInput} currentPrice={filteredPrice} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
