import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchUnusualFlow } from '../lib/api';
import type { ScoredFlowEvent, UnusualFlowResponse, FlowDirection } from '../types/stock';
import { FlowDirectionChart } from './FlowDirectionChart';

function fmt(n: number, prefix = '', suffix = ''): string {
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M${suffix}`;
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(0)}K${suffix}`;
  return `${prefix}${n.toFixed(0)}${suffix}`;
}

function dirColor(d: FlowDirection) {
  return d === 'BULLISH' ? C.bull : d === 'BEARISH' ? C.bear : C.inkMute;
}
function dirBg(d: FlowDirection) {
  return d === 'BULLISH' ? C.bullBg : d === 'BEARISH' ? C.bearBg : C.canvasSoft;
}
function dirBorder(d: FlowDirection) {
  return d === 'BULLISH' ? C.bullBorder : d === 'BEARISH' ? C.bearBorder : C.border;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Backtest stat strip ───────────────────────────────────────────────────────

function BacktestStrip({ events }: { events: ScoredFlowEvent[] }) {
  const now = new Date();
  const currentPrice = events[0]?.flow_events.underlying_price;
  if (!currentPrice || events.length === 0) return null;

  const past = events.filter(e => new Date(e.flow_events.expiry) < now);
  if (past.length === 0) return null;

  // Approximate win: bullish = current price > strike; bearish = current price < strike
  const wins = past.filter(e => {
    const strike = e.flow_events.strike;
    return (e.flow_direction === 'BULLISH' && currentPrice > strike) ||
           (e.flow_direction === 'BEARISH' && currentPrice < strike);
  });

  const winRate = past.length > 0 ? Math.round((wins.length / past.length) * 100) : 0;
  const winColor = winRate >= 60 ? C.bull : winRate >= 40 ? C.warn : C.bear;

  return (
    <div style={{
      marginTop: 16, padding: '10px 14px',
      background: C.canvasSoft, border: `1px solid ${C.border}`,
      borderRadius: 8, display: 'flex', gap: 24, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', alignSelf: 'center' }}>
        BACKTEST (approx.)
      </div>
      <Stat label="Tracked" value={String(past.length)} color={C.inkSec} />
      <Stat label="Win Rate" value={`${winRate}%`} color={winColor} />
      <Stat label="Wins" value={String(wins.length)} color={C.bull} />
      <div style={{ fontSize: '10px', color: C.inkMute, alignSelf: 'center', fontStyle: 'italic' }}>
        Based on current price vs strike — approximate
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: C.inkMute }}>{label}</div>
      <div className="tnum" style={{ fontSize: '15px', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

// ── Flow event row ────────────────────────────────────────────────────────────

function FlowRow({ event }: { event: ScoredFlowEvent }) {
  const fe = event.flow_events;
  const isBull = event.flow_direction === 'BULLISH';
  const isBear = event.flow_direction === 'BEARISH';
  const typeColor = fe.option_type === 'CALL' ? C.bull : C.bear;

  return (
    <div style={{
      background: C.canvasSoft, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Type badge */}
        <span style={{
          fontSize: '11px', fontWeight: 600, color: typeColor,
          background: fe.option_type === 'CALL' ? C.bullBg : C.bearBg,
          border: `1px solid ${fe.option_type === 'CALL' ? C.bullBorder : C.bearBorder}`,
          borderRadius: 9999, padding: '2px 8px',
        }}>
          {fe.option_type}
        </span>

        {/* Direction */}
        <span style={{
          fontSize: '11px', color: dirColor(event.flow_direction),
          background: dirBg(event.flow_direction),
          border: `1px solid ${dirBorder(event.flow_direction)}`,
          borderRadius: 9999, padding: '2px 8px',
        }}>
          {event.flow_direction}
        </span>

        {/* Strike · Expiry */}
        <span className="tnum" style={{ fontSize: '12px', color: C.inkSec, fontWeight: 500 }}>
          ${fe.strike.toLocaleString()} · {fmtDate(fe.expiry)}
        </span>

        {/* DTE */}
        <span style={{
          fontSize: '11px', color: fe.dte <= 3 ? C.warn : C.inkMute,
          background: fe.dte <= 3 ? C.warnBg : 'transparent',
          borderRadius: 4, padding: fe.dte <= 3 ? '1px 5px' : 0,
        }}>
          {fe.dte}d
        </span>

        {/* Tags */}
        {fe.is_sweep && (
          <span style={{ fontSize: '10px', color: C.warn, background: C.warnBg, borderRadius: 4, padding: '1px 5px' }}>
            SWEEP
          </span>
        )}
        {event.tag_mega_premium && (
          <span style={{ fontSize: '10px', color: C.primary, background: C.primaryBg, borderRadius: 4, padding: '1px 5px' }}>
            MEGA
          </span>
        )}
        {event.near_gamma_pin && (
          <span style={{ fontSize: '10px', color: C.inkMute, background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px' }}>
            GEX PIN
          </span>
        )}

        {/* Conviction + score */}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.inkMute }}>
          conv <span className="tnum" style={{ color: C.inkSec, fontWeight: 600 }}>{event.conviction_score}</span>
          {' · '}
          score <span className="tnum" style={{ color: isBull ? C.bull : isBear ? C.bear : C.inkMute, fontWeight: 600 }}>
            {event.flow_score > 0 ? '+' : ''}{event.flow_score}
          </span>
        </span>
      </div>

      {/* Premium · Vol · OI */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: C.inkMute }}>
          Premium <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fmt(fe.premium_size, '$')}</span>
        </span>
        <span style={{ fontSize: '11px', color: C.inkMute }}>
          Vol/OI <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fe.volume_oi_ratio?.toFixed(1) ?? '—'}</span>
        </span>
        <span style={{ fontSize: '11px', color: C.inkMute }}>
          IV <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fe.iv != null ? `${(fe.iv * 100).toFixed(0)}%` : '—'}</span>
        </span>
        {event.confirms_signal && (
          <span style={{ fontSize: '11px', color: C.bull }}>✓ confirms signal</span>
        )}
      </div>

      {/* Rationale */}
      {event.rationale_short && (
        <div style={{ fontSize: '11px', color: C.inkMute, lineHeight: 1.5 }}>
          {event.rationale_short}
        </div>
      )}

      {/* Direction chart */}
      <FlowDirectionChart event={event} />
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface Props {
  ticker: string;
}

export function UnusualFlowSection({ ticker }: Props) {
  const [data, setData] = useState<UnusualFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUnusualFlow(ticker);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { void load(); }, [load]);

  const summary = data?.summary;
  const events = data?.events ?? [];

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: 4 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 600 }}>
          UNUSUAL FLOW
        </span>

        {summary && (
          <>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              color: dirColor(summary.marketBias),
              background: dirBg(summary.marketBias),
              border: `1px solid ${dirBorder(summary.marketBias)}`,
              borderRadius: 9999, padding: '2px 10px',
            }}>
              {summary.marketBias}
            </span>
            <span style={{ fontSize: '11px', color: C.inkMute }}>
              {fmt(summary.totalPremium, '$')} total · avg conv {summary.avgConviction}
            </span>
            <span style={{ fontSize: '11px', color: C.bull }}>{summary.bullishCount}↑</span>
            <span style={{ fontSize: '11px', color: C.bear }}>{summary.bearishCount}↓</span>
          </>
        )}

        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '3px 10px', fontSize: '11px',
            color: loading ? C.inkMute : C.inkSec, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
      </div>

      {/* Content */}
      {error ? (
        <div style={{ fontSize: '13px', color: C.bear, padding: '12px 0' }}>
          Failed to load unusual flow: {error}
        </div>
      ) : loading && events.length === 0 ? (
        <div style={{ fontSize: '13px', color: C.inkMute, padding: '20px 0', textAlign: 'center' }}>
          Loading curated flow for {ticker}…
        </div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: '13px', color: C.inkMute, padding: '20px 0', textAlign: 'center' }}>
          No high-conviction unusual flow found for {ticker}.
          <div style={{ fontSize: '11px', marginTop: 4, opacity: 0.7 }}>
            Requires Signa.ai paid plan with curated flow access.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(e => <FlowRow key={e.id || e.curated_id} event={e} />)}
          </div>
          <BacktestStrip events={events} />
        </>
      )}
    </div>
  );
}
