import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { C } from '../lib/colors';
import type { MoatData, MoatPeer, MoatScenario } from '../hooks/useMoatData';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null, suffix = 'x'): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}${suffix}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

const SCENARIO_COLORS: Record<string, string> = {
  Bear: 'var(--c-bear)',
  Base: 'var(--c-primary)',
  Bull: 'var(--c-bull)',
};

// ── peer bar chart ─────────────────────────────────────────────────────────────

function PeerChart({ peers, activeTicker }: { peers: MoatPeer[]; activeTicker: string }) {
  const data = peers
    .filter(p => p.ps_ratio != null || p.ev_ebitda != null)
    .map(p => ({ name: p.ticker, ps: p.ps_ratio, evebitda: p.ev_ebitda }));

  if (!data.length) return null;

  return (
    <div>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', marginBottom: 8 }}>
        PEER COMPARISON — P/S RATIO
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} barSize={20} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--c-ink-mute)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--c-ink-mute)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--c-canvas)',
              border: `1px solid var(--c-border)`,
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--c-ink)',
              boxShadow: 'var(--c-s1)',
            }}
            formatter={(v) => [typeof v === 'number' ? `${v.toFixed(1)}x` : '—', 'P/S']}
          />
          <Bar dataKey="ps" radius={[3, 3, 0, 0]}>
            {data.map(entry => (
              <Cell
                key={entry.name}
                fill={entry.name === activeTicker ? 'var(--c-primary)' : 'var(--c-border)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── scenario cards ─────────────────────────────────────────────────────────────

function ScenarioCard({ s, currentPrice }: { s: MoatScenario; currentPrice?: number }) {
  const color = SCENARIO_COLORS[s.label] ?? C.inkMute;
  const upPct = s.upside_percent;

  return (
    <div style={{
      background: C.canvasSoft, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '12px 14px',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: '11px', fontWeight: 400, color, letterSpacing: '0.06em' }}>
          {s.label.toUpperCase()}
        </span>
        <span style={{
          fontSize: '15px', fontWeight: 500, color,
          fontFeatureSettings: '"tnum"', letterSpacing: '-0.3px',
        }}>
          ${s.target_price.toFixed(0)}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: C.inkMute, marginBottom: 6, fontFeatureSettings: '"tnum"' }}>
        {upPct >= 0 ? '+' : ''}{upPct.toFixed(1)}% vs current
        {s.comp_ticker && ` · ${s.comp_multiple.toFixed(1)}x ${s.comp_ticker}`}
      </div>
      {s.rationale && (
        <div style={{ fontSize: '11px', color: C.inkSec, lineHeight: 1.5, fontWeight: 300 }}>
          {s.rationale}
        </div>
      )}
    </div>
  );
}

// ── peer table ─────────────────────────────────────────────────────────────────

function PeerTable({ peers, activeTicker }: { peers: MoatPeer[]; activeTicker: string }) {
  if (!peers.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            {['Ticker', 'P/S', 'EV/EBITDA', 'Gross Margin', 'YoY Growth'].map(h => (
              <th key={h} style={{
                textAlign: h === 'Ticker' ? 'left' : 'right',
                padding: '6px 8px', fontWeight: 400, fontSize: '10px',
                color: C.inkMute, letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`,
              }}>
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {peers.map(p => {
            const isMain = p.ticker === activeTicker;
            return (
              <tr key={p.ticker} style={{
                background: isMain ? C.primaryBg : 'none',
              }}>
                <td style={{
                  padding: '6px 8px', color: isMain ? C.primary : C.inkSec,
                  fontWeight: isMain ? 400 : 300, borderBottom: `1px solid ${C.border}`,
                }}>
                  {p.ticker}
                  {isMain && <span style={{ marginLeft: 4, fontSize: '9px', color: C.primary }}>●</span>}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.inkSec, fontFeatureSettings: '"tnum"', borderBottom: `1px solid ${C.border}` }}>
                  {fmt(p.ps_ratio)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.inkSec, fontFeatureSettings: '"tnum"', borderBottom: `1px solid ${C.border}` }}>
                  {fmt(p.ev_ebitda)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFeatureSettings: '"tnum"', borderBottom: `1px solid ${C.border}`,
                  color: p.gross_margin != null ? (p.gross_margin >= 50 ? C.bull : p.gross_margin >= 20 ? C.inkSec : C.bear) : C.inkMute }}>
                  {fmtPct(p.gross_margin)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFeatureSettings: '"tnum"', borderBottom: `1px solid ${C.border}`,
                  color: p.yoy_growth != null ? (p.yoy_growth >= 15 ? C.bull : p.yoy_growth >= 0 ? C.inkSec : C.bear) : C.inkMute }}>
                  {fmtPct(p.yoy_growth)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

interface Props {
  ticker: string;
  data: MoatData | null;
  loading: boolean;
  currentPrice?: number;
}

export function MoatPanel({ ticker, data, loading, currentPrice }: Props) {
  const hasData = !loading && data != null;
  const isEmpty = !loading && data == null;

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: C.s1,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${C.border}`,
        background: C.canvasSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.10em', fontWeight: 400 }}>
          MOAT RESEARCH
        </span>
        {hasData && data!.score != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '11px', color: C.inkMute }}>Score</span>
            <span style={{
              fontSize: '13px', fontWeight: 500, color: C.primary,
              background: C.primaryBg, border: `1px solid ${C.primaryBorder}`,
              borderRadius: 9999, padding: '2px 10px',
              fontFeatureSettings: '"tnum"',
            }}>
              {data!.score.toFixed(1)} / 10
            </span>
          </div>
        )}
        {hasData && data!.updatedAt && (
          <span style={{ fontSize: '11px', color: C.inkMute, marginLeft: 'auto' }}>
            {new Date(data!.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div style={{ padding: '20px 24px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: C.inkMute, fontSize: '13px' }}>
            Loading moat research…
          </div>
        )}

        {isEmpty && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '13px', color: C.inkMute }}>No moat research for {ticker}</div>
            <div style={{ fontSize: '11px', color: C.inkMute, marginTop: 4, opacity: 0.7 }}>
              Research this stock in Moat Finder to populate this panel
            </div>
          </div>
        )}

        {hasData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Thesis */}
            {data!.thesis && (
              <div style={{
                background: C.canvasSoft, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '12px 14px',
                fontSize: '13px', color: C.inkSec, lineHeight: 1.65, fontWeight: 300,
              }}>
                {data!.thesis}
              </div>
            )}

            {/* Peer chart + table */}
            {data!.peers.length > 0 && (
              <div>
                <PeerChart peers={data!.peers} activeTicker={ticker} />
                <div style={{ marginTop: 16 }}>
                  <PeerTable peers={data!.peers} activeTicker={ticker} />
                </div>
              </div>
            )}

            {/* Scenarios */}
            {data!.scenarios.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', marginBottom: 10 }}>
                  PRICE SCENARIOS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  {data!.scenarios.map(s => (
                    <ScenarioCard key={s.label} s={s} currentPrice={currentPrice} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
