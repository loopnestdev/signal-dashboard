import { useState, useEffect, useCallback } from 'react';
import { C } from '../lib/colors';
import { fetchUnusualFlow } from '../lib/api';
import type { ScoredFlowEvent, UnusualFlowResponse, FlowDirection } from '../types/stock';
import { FlowDirectionChart } from './FlowDirectionChart';
import { FlowTimelineChart } from './FlowTimelineChart';

// ── Tooltip text ──────────────────────────────────────────────────────────────

const TIPS = {
  call: 'CALL — the buyer bets the stock price will go UP. Profits when the stock rises above the strike price before expiry.',
  put: 'PUT — the buyer bets the stock price will go DOWN. Profits when the stock falls below the strike price before expiry.',
  direction: 'Our scoring algorithm\'s verdict: whether the stacked evidence (option type, sweep urgency, vol/OI, signal confirmation, GEX) points bullish, bearish, or neutral.',
  strike: 'The target price the buyer is betting on. The option expires worthless if the stock never reaches this level by the deadline.',
  expiry: 'The deadline. If the stock hasn\'t reached the strike price by this date, the option expires worthless and the buyer loses their premium.',
  dte: 'Days To Expiry. Under 7 days means the buyer expects a move very soon — near-term catalyst. Longer DTE means the buyer is willing to wait. Very short DTE with large premium signals high urgency.',
  sweep: 'Sweep order: hits multiple exchanges simultaneously to fill fast, hiding the true size. Signals urgency — someone wants in NOW and doesn\'t care about showing their hand.',
  mega: 'Unusually large premium relative to typical flow for this ticker. Institutional-sized conviction — this is a serious bet.',
  gexPin: 'Near a Gamma Exposure pin level where market makers are forced to hedge aggressively, which can amplify or suppress price moves.',
  conv: 'Signa AI\'s conviction score (0–100). How confident their model is that this event is real signal vs noise. Above 70 is considered high.',
  score: 'Our direction score (range −10 to +10). Stacks evidence: option type (±2), sweep urgency (×1.5), vol/OI new-position check (±1), signal confirmation (±2), mega premium (±1), gamma pin (±1), negative GEX (±0.5). Score ≥ +2 = BULLISH, ≤ −2 = BEARISH.',
  premium: 'Total money spent on this single order. Bigger premium = more conviction. Institutional players don\'t risk $500K+ on a hunch — this is the most important field.',
  volOI: 'Volume ÷ Open Interest. Ratio > 1 means more contracts traded today than existed yesterday — someone opened a brand-new position. Ratio < 1 may just be existing holders trading, which is less significant.',
  iv: 'Implied Volatility — how expensive the option is relative to its historical norm. High IV means buyers are paying above-normal prices, signaling urgency or anticipation of a large move.',
  confirmsSignal: 'This flow agrees with Signa\'s independent stock technical signal — two separate systems pointing the same direction at the same time. Double confirmation.',
};

// ── Tooltip component ─────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 3, verticalAlign: 'middle' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          fontSize: '9px', color: C.inkMute, cursor: 'help',
          border: `1px solid ${C.border}`, borderRadius: '50%',
          width: 13, height: 13, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, userSelect: 'none', lineHeight: 1,
        }}
      >
        ?
      </span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: C.canvas, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '9px 12px',
          fontSize: '11px', color: C.inkSec, lineHeight: 1.6,
          width: 260, boxShadow: C.s2, zIndex: 300,
          whiteSpace: 'normal', pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

        {/* Type badge + tooltip */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontSize: '11px', fontWeight: 600, color: typeColor,
            background: fe.option_type === 'CALL' ? C.bullBg : C.bearBg,
            border: `1px solid ${fe.option_type === 'CALL' ? C.bullBorder : C.bearBorder}`,
            borderRadius: 9999, padding: '2px 8px',
          }}>
            {fe.option_type}
          </span>
          <Tip text={fe.option_type === 'CALL' ? TIPS.call : TIPS.put} />
        </span>

        {/* Direction badge + tooltip */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontSize: '11px', color: dirColor(event.flow_direction),
            background: dirBg(event.flow_direction),
            border: `1px solid ${dirBorder(event.flow_direction)}`,
            borderRadius: 9999, padding: '2px 8px',
          }}>
            {event.flow_direction}
          </span>
          <Tip text={TIPS.direction} />
        </span>

        {/* Strike · Expiry with tooltips */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span className="tnum" style={{ fontSize: '12px', color: C.inkSec, fontWeight: 500 }}>
            ${fe.strike.toLocaleString()}
          </span>
          <Tip text={TIPS.strike} />
          <span style={{ color: C.border }}>·</span>
          <span className="tnum" style={{ fontSize: '12px', color: C.inkSec, fontWeight: 500 }}>
            {fmtDate(fe.expiry)}
          </span>
          <Tip text={TIPS.expiry} />
        </span>

        {/* DTE + tooltip */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontSize: '11px', color: fe.dte <= 3 ? C.warn : C.inkMute,
            background: fe.dte <= 3 ? C.warnBg : 'transparent',
            borderRadius: 4, padding: fe.dte <= 3 ? '1px 5px' : 0,
          }}>
            {fe.dte}d
          </span>
          <Tip text={TIPS.dte} />
        </span>

        {/* Tags with tooltips */}
        {fe.is_sweep && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: '10px', color: C.warn, background: C.warnBg, borderRadius: 4, padding: '1px 5px' }}>
              SWEEP
            </span>
            <Tip text={TIPS.sweep} />
          </span>
        )}
        {event.tag_mega_premium && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: '10px', color: C.primary, background: C.primaryBg, borderRadius: 4, padding: '1px 5px' }}>
              MEGA
            </span>
            <Tip text={TIPS.mega} />
          </span>
        )}
        {event.near_gamma_pin && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: '10px', color: C.inkMute, background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px' }}>
              GEX PIN
            </span>
            <Tip text={TIPS.gexPin} />
          </span>
        )}

        {/* Conviction + score with tooltips */}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.inkMute, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          conv
          <Tip text={TIPS.conv} />
          <span className="tnum" style={{ color: C.inkSec, fontWeight: 600 }}>{event.conviction_score}</span>
          <span style={{ color: C.border, margin: '0 2px' }}>·</span>
          score
          <Tip text={TIPS.score} />
          <span className="tnum" style={{ color: isBull ? C.bull : isBear ? C.bear : C.inkMute, fontWeight: 600 }}>
            {event.flow_score > 0 ? '+' : ''}{event.flow_score}
          </span>
        </span>
      </div>

      {/* Premium · Vol/OI · IV · confirms signal */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: C.inkMute, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          Premium
          <Tip text={TIPS.premium} />
          <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fmt(fe.premium_size, '$')}</span>
        </span>
        <span style={{ fontSize: '11px', color: C.inkMute, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          Vol/OI
          <Tip text={TIPS.volOI} />
          <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fe.volume_oi_ratio?.toFixed(1) ?? '—'}</span>
        </span>
        <span style={{ fontSize: '11px', color: C.inkMute, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          IV
          <Tip text={TIPS.iv} />
          <span className="tnum" style={{ color: C.inkSec, fontWeight: 500 }}>{fe.iv != null ? `${(fe.iv * 100).toFixed(0)}%` : '—'}</span>
        </span>
        {event.confirms_signal && (
          <span style={{ fontSize: '11px', color: C.bull, display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            ✓ confirms signal
            <Tip text={TIPS.confirmsSignal} />
          </span>
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

const VISIBLE_MAX = 5;

interface Props {
  ticker: string;
  currentPrice?: number;
}

export function UnusualFlowSection({ ticker, currentPrice = 0 }: Props) {
  const [data, setData] = useState<UnusualFlowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShowAll(false);
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
  const visible = showAll ? events : events.slice(0, VISIBLE_MAX);
  const hasMore = events.length > VISIBLE_MAX;

  return (
    <div>
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
          {data?.fromCache && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '11px', color: C.inkMute,
              background: C.canvasSoft, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '6px 12px', marginBottom: 12,
            }}>
              <span style={{ opacity: 0.6 }}>🕐</span>
              Showing {data.historicalCount} stored event{data.historicalCount !== 1 ? 's' : ''} — Signa has no live flow for {ticker} right now. New events will be saved automatically when they appear.
            </div>
          )}
          <FlowTimelineChart events={events} currentPrice={currentPrice} />
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(e => <FlowRow key={e.id || e.curated_id} event={e} />)}
          </div>

          {hasMore && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                marginTop: 10, width: '100%',
                background: 'none', border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '8px 0',
                fontSize: '12px', color: C.inkMute, cursor: 'pointer',
              }}
            >
              {showAll
                ? `▲ Show top ${VISIBLE_MAX} only`
                : `▼ Show all ${events.length} flows (${events.length - VISIBLE_MAX} more)`}
            </button>
          )}

          <BacktestStrip events={events} />
        </>
      )}
    </div>
  );
}
