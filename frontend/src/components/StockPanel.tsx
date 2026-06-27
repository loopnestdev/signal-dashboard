import { useState } from 'react';
import { C, changeColor } from '../lib/colors';
import type { StockResponse, StockDecision, MovingAverages, FibLevel } from '../types/stock';
import type { WatchlistGroup } from '../hooks/useWatchlist';
import { SignaCard } from './SignaCard';

export type StockTab = 'signal' | 'technical' | 'options' | 'fundamentals' | 'moat';

const TABS: { id: StockTab; label: string }[] = [
  { id: 'signal',       label: 'Signal' },
  { id: 'technical',    label: 'Technical' },
  { id: 'options',      label: 'Options' },
  { id: 'moat',         label: 'Moat' },
  { id: 'fundamentals', label: 'Fundamentals' },
];

interface Props {
  data: StockResponse | null;
  loading: boolean;
  error: string | null;
  activeTicker: string | null;
  activeTab: StockTab;
  onTabChange: (tab: StockTab) => void;
  watchlistGroups: WatchlistGroup[];
  activeWatchlistGroup: string;
  getGroupsForTicker: (ticker: string) => string[];
  onWatch: (ticker: string, groupName: string) => void;
  onUnwatch: (ticker: string, groupName: string) => void;
}

// ── MA heat bar ───────────────────────────────────────────────────────────────
function MABar({ label, maValue, price }: { label: string; maValue: number | null; price: number }) {
  if (maValue === null) return null;
  const pct = ((price - maValue) / maValue) * 100;
  const above = price >= maValue;
  const color = above ? C.bull : C.bear;
  const halfW = Math.min(Math.abs(pct) * 3, 48);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '70px 85px 1fr 72px',
      gap: 10, alignItems: 'center', padding: '6px 10px',
      background: above ? C.bullBg : C.bearBg,
      borderRadius: 7,
      border: `1px solid ${above ? C.bullBorder : C.bearBorder}`,
    }}>
      <span style={{ fontSize: '11px', color: C.inkMute, fontWeight: 400 }}>{label}</span>
      <span className="tnum" style={{ fontSize: '13px', color: C.inkSec, fontWeight: 400 }}>
        ${maValue.toFixed(2)}
      </span>
      <div style={{ position: 'relative', height: 6, background: C.border, borderRadius: 3 }}>
        <div style={{
          position: 'absolute', top: 0, height: '100%', width: 1,
          background: C.inkMute, left: '50%', transform: 'translateX(-50%)', zIndex: 1,
        }} />
        {above ? (
          <div style={{
            position: 'absolute', left: '50%', top: 0, height: '100%',
            width: `${halfW}%`, background: color, borderRadius: '0 3px 3px 0',
            transition: 'width 0.8s ease',
          }} />
        ) : (
          <div style={{
            position: 'absolute', right: '50%', top: 0, height: '100%',
            width: `${halfW}%`, background: color, borderRadius: '3px 0 0 3px',
            transition: 'width 0.8s ease',
          }} />
        )}
      </div>
      <span className="tnum" style={{ fontSize: '12px', color, textAlign: 'right', fontWeight: 500 }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

// ── Fibonacci row ─────────────────────────────────────────────────────────────
function FibRow({ level, price }: { level: FibLevel; price: number }) {
  const isNear = Math.abs((price - level.price) / level.price) < 0.015;
  const isAbove = price > level.price;
  const color = isNear ? C.warn : isAbove ? C.bull : C.bear;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 85px 1fr',
      gap: 10, alignItems: 'center', padding: '5px 10px',
      background: isNear ? C.warnBg : C.canvasSoft,
      borderRadius: 6,
      border: `1px solid ${isNear ? C.warnBorder : C.border}`,
    }}>
      <span style={{ fontSize: '11px', color: C.inkMute }}>{level.label}</span>
      <span className="tnum" style={{ fontSize: '12px', color, fontWeight: 500 }}>
        ${level.price.toFixed(2)}
      </span>
      <span style={{ fontSize: '11px', color: isNear ? C.warn : C.inkMute }}>
        {isNear ? '← near current' : isAbove ? 'support' : 'resistance'}
      </span>
    </div>
  );
}

// ── decision badge ────────────────────────────────────────────────────────────
function decisionBadge(d: StockDecision) {
  const map: Record<StockDecision, { label: string; color: string; bg: string; border: string }> = {
    YES_BUY:   { label: 'BULLISH',  color: C.bull,    bg: C.bullBg,    border: C.bullBorder },
    YES_SHORT: { label: 'BEARISH',  color: C.bear,    bg: C.bearBg,    border: C.bearBorder },
    CAUTION:   { label: 'CAUTION',  color: C.warn,    bg: C.warnBg,    border: C.warnBorder },
    NO:        { label: 'AVOID',    color: C.inkMute, bg: C.canvasSoft, border: C.border },
  };
  return map[d];
}

// ─────────────────────────────────────────────────────────────────────────────
export function StockPanel({
  data, loading, error, activeTicker,
  activeTab, onTabChange,
  watchlistGroups, activeWatchlistGroup, getGroupsForTicker, onWatch, onUnwatch,
}: Props) {
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  if (loading) {
    return (
      <div style={{
        background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '32px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', minHeight: 140, boxShadow: C.s1,
      }}>
        <span style={{ fontSize: '13px', color: C.inkMute }}>
          Fetching {activeTicker ?? ''}…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: C.bearBg, border: `1px solid ${C.bearBorder}`,
        borderRadius: 12, padding: '20px 24px', boxShadow: C.s1,
      }}>
        <div style={{ fontSize: '14px', color: C.bear, fontWeight: 500 }}>
          Failed to load {activeTicker ?? 'ticker'}
        </div>
        <div style={{ fontSize: '13px', color: C.inkMute, marginTop: 4 }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const badge = decisionBadge(data.decision);
  const priceColor = changeColor(data.change1d);
  const ma = data.movingAverages;
  const savedInGroups = getGroupsForTicker(data.symbol);
  const isWatched = savedInGroups.length > 0;

  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.s2, overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '20px 24px', background: C.canvasSoft }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '22px', fontWeight: 600, color: C.ink, letterSpacing: '-0.5px' }}>
                {data.symbol}
              </span>
              <span style={{
                fontSize: '11px', fontWeight: 500, color: badge.color,
                background: badge.bg, border: `1px solid ${badge.border}`,
                borderRadius: 9999, padding: '3px 10px', letterSpacing: '0.04em',
              }}>
                {badge.label}
              </span>
              {data.exchange && (
                <span style={{
                  fontSize: '11px', color: C.inkMute, background: C.canvasSoft,
                  border: `1px solid ${C.border}`, borderRadius: 9999, padding: '2px 8px',
                }}>
                  {data.exchange}
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: C.inkSec, marginTop: 4, fontWeight: 300 }}>
              {data.name}
            </div>
            {data.sector && (
              <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 2 }}>
                {data.sector}{data.sectorEtf ? ` · ${data.sectorEtf}` : ''}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div className="tnum" style={{ fontSize: '22px', fontWeight: 600, color: C.ink, letterSpacing: '-0.5px' }}>
              ${data.price.toFixed(2)}
            </div>
            <div className="tnum" style={{ fontSize: '13px', color: priceColor }}>
              {data.change1d >= 0 ? '+' : ''}{data.change1d.toFixed(2)}%
            </div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowGroupPicker(p => !p)}
                style={{
                  background: isWatched ? C.warnBg : C.canvas,
                  border: `1px solid ${isWatched ? C.warnBorder : C.border}`,
                  borderRadius: 9999, padding: '5px 14px',
                  fontSize: '12px', fontWeight: 400, cursor: 'pointer',
                  color: isWatched ? C.warn : C.inkMute,
                  boxShadow: C.s1, display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {isWatched ? `★ Saved (${savedInGroups.join(', ')})` : '☆ Save to Watchlist'}
              </button>

              {showGroupPicker && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                  background: C.canvas, border: `1px solid ${C.border}`,
                  borderRadius: 10, boxShadow: C.s2, zIndex: 50,
                  minWidth: 160, padding: '6px 0', overflow: 'hidden',
                }}>
                  <div style={{ padding: '4px 12px 6px', fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em' }}>
                    SAVE TO LIST
                  </div>
                  {watchlistGroups.map(g => {
                    const inGroup = savedInGroups.includes(g.name);
                    return (
                      <button
                        key={g.name}
                        onClick={() => {
                          if (inGroup) onUnwatch(data.symbol, g.name);
                          else onWatch(data.symbol, g.name);
                          setShowGroupPicker(false);
                        }}
                        style={{
                          width: '100%', textAlign: 'left',
                          background: inGroup ? C.warnBg : 'none',
                          border: 'none', borderRadius: 0,
                          padding: '7px 14px', cursor: 'pointer',
                          fontSize: '13px',
                          color: inGroup ? C.warn : C.inkSec,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        {g.name}
                        {inGroup && <span style={{ fontSize: '11px' }}>★</span>}
                      </button>
                    );
                  })}
                  <div onClick={() => setShowGroupPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{
        display: 'flex',
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.canvasSoft,
        overflowX: 'auto',
        paddingLeft: 8,
      }}>
        {TABS.map(t => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              style={{
                padding: '9px 16px',
                border: 'none',
                borderBottom: `2px solid ${active ? C.primary : 'transparent'}`,
                background: 'none',
                color: active ? C.primary : C.inkMute,
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'color 0.12s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── SIGNAL TAB ── */}
      {activeTab === 'signal' && (
        <>
          {data.signa ? (
            <div style={{ padding: '0 24px' }}>
              <SignaCard signa={data.signa} currentPrice={data.price} />
            </div>
          ) : (
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: C.inkMute }}>No signal data for {data.symbol}</div>
              <div style={{ fontSize: '11px', color: C.inkMute, marginTop: 4, opacity: 0.7 }}>
                Requires Signa.ai API key
              </div>
            </div>
          )}

          {/* Composite score / analysis */}
          {data.analysis && (
            <div style={{
              margin: '0 24px 24px',
              background: C.canvasSoft, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '14px 16px',
            }}>
              <pre style={{
                margin: 0, fontSize: '12px', color: C.inkSec,
                fontFamily: 'inherit', whiteSpace: 'pre-wrap',
                lineHeight: 1.65, fontWeight: 300,
              }}>
                {data.analysis}
              </pre>
            </div>
          )}
        </>
      )}

      {/* ── TECHNICAL TAB ── */}
      {activeTab === 'technical' && (
        <>
          {/* Moving Averages */}
          {ma && (
            <div style={{ padding: '0 24px 20px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, padding: '16px 0 10px' }}>
                MOVING AVERAGES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <MABar label="EMA 5"   maValue={ma.ema5}   price={data.price} />
                <MABar label="EMA 21"  maValue={ma.ema21}  price={data.price} />
                <MABar label="EMA 55"  maValue={ma.ema55}  price={data.price} />
                <MABar label="SMA 200" maValue={ma.sma200} price={data.price} />
              </div>
            </div>
          )}

          {/* Fibonacci */}
          {data.fibonacci && data.fibonacci.length > 0 && (
            <div style={{ padding: '0 24px 20px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, padding: '16px 0 10px' }}>
                FIBONACCI LEVELS — 52-WEEK RANGE
              </div>
              <div className="fib-grid">
                <div>
                  <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 6, letterSpacing: '0.05em' }}>RETRACEMENT</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.fibonacci.filter(l => !l.isExtension).map(l => (
                      <FibRow key={l.label} level={l} price={data.price} />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 6, letterSpacing: '0.05em' }}>EXTENSIONS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.fibonacci.filter(l => l.isExtension).map(l => (
                      <FibRow key={l.label} level={l} price={data.price} />
                    ))}
                  </div>
                  <div style={{
                    marginTop: 8, padding: '8px 10px',
                    background: C.primaryBg, border: `1px solid ${C.primaryBorder}`,
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 3 }}>CURRENT PRICE</div>
                    <div className="tnum" style={{ fontSize: '15px', color: C.primary, fontWeight: 600 }}>
                      ${data.price.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Technicals grid */}
          <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600, padding: '16px 0 10px' }}>
              TECHNICALS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {data.metrics.map(m => {
                const color = m.direction === 'up' ? C.bull : m.direction === 'down' ? C.bear : C.inkMute;
                return (
                  <div key={m.label} style={{
                    background: C.canvasSoft, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '11px', color: C.inkMute }}>{m.label}</span>
                      <span className="tnum" style={{ fontSize: '13px', color, fontWeight: 500 }}>
                        {m.direction === 'up' ? '▲ ' : m.direction === 'down' ? '▼ ' : '— '}{m.value}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: C.inkMute, fontWeight: 300 }}>{m.note}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
