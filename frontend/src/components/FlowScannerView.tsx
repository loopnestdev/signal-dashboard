import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { C } from '../lib/colors';
import { fetchScanner } from '../lib/api';
import type { ScannerCandidate, ScannerResponse } from '../types/market';
import { InfoTip } from './InfoTip';

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };

function Card({ title, tip, children, right }: { title: string; tip?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: C.s1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={label}>{title}{tip && <InfoTip tip={tip} />}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Pill({ text, color, bg, border }: { text: string; color: string; bg?: string; border?: string }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 9999,
      color, background: bg ?? 'transparent', border: `1px solid ${border ?? color}`, whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

const COLUMNS: Array<{ label: string; tip: string; right?: boolean }> = [
  { label: 'Symbol', tip: 'Ticker. Click it to open the full analysis on the Dashboard.' },
  { label: 'Score', tip: 'Radon discovery score, 0-100. The line underneath shows the points from each part: DP = dark pool strength (max 30), Sus = days in a row dark pool leaned the same way (max 20), Conf = options and dark pool agree (20), V/OI = new positions being opened (max 15), Sw = sweeps (max 15). Green = passes the filters and reaches the promotion score.' },
  { label: 'Options', tip: 'Direction of today\'s large prints ($500K+, 7+ days to expiry). CALLS = at least 1.5x more call prints than put prints, PUTS = the reverse, MIXED = neither. Counts prints, not dollars, as Radon does.' },
  { label: 'Dark pool', tip: 'Off-exchange (dark pool) buying vs selling over the last 3 sessions: the share of volume traded at or above the bid-ask midpoint, i.e. buyer-initiated. ACCUM = 55%+ buying, DISTRIB = 45% or less. "x2d" = the same direction 2 days in a row.' },
  { label: 'Confl.', tip: 'Confluence: Yes when options and dark pool point the same way (calls + accumulation, or puts + distribution). Worth 20 points, Radon\'s strongest single signal.' },
  { label: 'Prints C/P', tip: 'Number of large call / put prints today that count toward the score ($500K+ premium, 7+ days to expiry).', right: true },
  { label: 'Sweeps', tip: 'Orders split across several exchanges to fill immediately, a sign of urgency. 1 sweep = half points, 2 or more = full points.', right: true },
  { label: 'Vol/OI', tip: 'Average contracts traded vs contracts already open. Above 1 means most of the volume is new positions opened today. 2 = half points, 4+ = full points.', right: true },
  { label: 'Premium', tip: 'Total dollars spent on the qualifying large prints today.', right: true },
  { label: 'Price', tip: 'Stock price at the time of the most recent large print.', right: true },
  { label: 'Signa', tip: 'Direction if this ticker is in Signa\'s 30-model technical scan today. Shown as a second opinion only; not part of the score.' },
  { label: 'Status', tip: 'CORE = always collected. PROMOTED = added to data collection by the scanner for 14 days. Otherwise the reason it was not: a failed filter, below the promotion score, or squeezed out by the 12-name cap.' },
];

const fmtMoney = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function biasPill(bias: ScannerCandidate['options_bias']) {
  if (bias === 'BULLISH') return <Pill text="CALLS" color={C.bull} bg={C.bullBg} border={C.bullBorder} />;
  if (bias === 'BEARISH') return <Pill text="PUTS" color={C.bear} bg={C.bearBg} border={C.bearBorder} />;
  return <Pill text="MIXED" color={C.inkMute} border={C.border} />;
}

function dpCell(c: ScannerCandidate) {
  if (c.dp_direction === 'NO_DATA') return <span style={{ color: C.inkMute }}>no data</span>;
  const color = c.dp_direction === 'ACCUMULATION' ? C.bull : c.dp_direction === 'DISTRIBUTION' ? C.bear : C.inkSec;
  const short = c.dp_direction === 'ACCUMULATION' ? 'ACCUM' : c.dp_direction === 'DISTRIBUTION' ? 'DISTRIB' : 'NEUTRAL';
  return (
    <span className="tnum" style={{ color }}>
      {short} {c.dp_buy_ratio != null ? `${Math.round(c.dp_buy_ratio * 100)}%` : ''}
      {c.dp_sustained_days > 1 && <span style={{ color: C.inkMute }}> x{c.dp_sustained_days}d</span>}
    </span>
  );
}

function statusCell(c: ScannerCandidate, core: Set<string>, threshold: number) {
  if (core.has(c.symbol)) return <Pill text="CORE" color={C.primary} border={C.primaryBorder} bg={C.primaryBg} />;
  if (c.promoted) return <Pill text="PROMOTED" color={C.bull} bg={C.bullBg} border={C.bullBorder} />;
  if (!c.passed_filters) return <span style={{ color: C.inkMute, fontSize: '12px' }}>{c.rejected_reason}</span>;
  if (c.score < threshold) return <span style={{ color: C.inkMute, fontSize: '12px' }}>below {threshold}</span>;
  return <span style={{ color: C.warn, fontSize: '12px' }}>over cap</span>;
}

function ScoreCell({ c, threshold }: { c: ScannerCandidate; threshold: number }) {
  const b = c.breakdown;
  const color = c.score >= threshold && c.passed_filters ? C.bull : c.score >= threshold ? C.warn : C.inkMute;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="tnum" style={{ fontWeight: 600, color: C.ink, width: 34 }}>{c.score.toFixed(0)}</span>
        <div style={{ flex: 1, height: 5, borderRadius: 9999, background: C.canvasSoft, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, c.score)}%`, height: '100%', background: color }} />
        </div>
      </div>
      <div className="tnum" style={{ fontSize: '10px', color: C.inkMute, marginTop: 3, whiteSpace: 'nowrap' }}
        title="Radon weights: dark pool strength 30, sustained days 20, confluence 20, vol/OI 15, sweeps 15">
        DP {b.dp_strength} · Sus {b.dp_sustained} · Conf {b.confluence} · V/OI {b.vol_oi} · Sw {b.sweeps}
      </div>
    </div>
  );
}

export function FlowScannerView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [data, setData] = useState<ScannerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchScanner());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const core = new Set(data?.core ?? []);
  const threshold = data?.config.promoteScore ?? 45;
  const passed = data?.candidates.filter(c => c.passed_filters) ?? [];
  const visible = showRejected ? data?.candidates ?? [] : passed;

  const cell = { padding: '9px 10px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', color: C.inkSec, textAlign: 'left' as const, whiteSpace: 'nowrap' as const, verticalAlign: 'middle' as const };
  const head = { ...cell, ...label, fontSize: '10px' };
  const num = { ...cell, textAlign: 'right' as const };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>Flow Scanner</h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Radon discovery score on large options prints + dark pool. Names scoring {threshold}+ that pass the filters are added to data collection automatically.
          </p>
        </div>
        <button
          onClick={() => { void load(); }}
          disabled={loading}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999, padding: '6px 14px', fontSize: '12px',
            color: C.inkMute, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && !data && <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading scanner...</div>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title={data.tradeDate ? `Candidates - ${data.tradeDate}` : 'Candidates'}
            tip="Every ticker with large options prints this session, scored with Radon's discovery formula. Latest run wins; the scanner runs at 11:45, 14:45 and 16:30 New York time. Tick 'show filtered out' to include tickers that failed a filter." 
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '12px', color: C.inkMute, flexWrap: 'wrap' }}>
                {data.runAt && <span>last run {fmtTime(data.runAt)}</span>}
                <span className="tnum">{data.candidates.length} scored · {passed.length} tradeable · {data.promoted.length}/{data.config.maxPromoted} promoted</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} />
                  show filtered out
                </label>
              </div>
            }
          >
            {data.candidates.length === 0 ? (
              <div style={{ fontSize: '13px', color: C.inkMute, lineHeight: 1.6 }}>
                No scan yet. The scanner runs at 11:45, 14:45 and 16:30 ET on trading days, after the large-print feed is pulled.
              </div>
            ) : visible.length === 0 ? (
              <div style={{ fontSize: '13px', color: C.inkMute }}>Nothing passed the filters this session. Tick "show filtered out" to see why.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr>
                      {COLUMNS.map(col => (
                        <th key={col.label} style={col.right ? { ...head, textAlign: 'right' } : head}>
                          {col.label}<InfoTip tip={col.tip} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(c => (
                      <tr key={c.symbol} style={{ opacity: c.passed_filters ? 1 : 0.6 }}>
                        <td style={cell}>
                          <button onClick={() => onAnalyze(c.symbol)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {c.symbol}
                          </button>
                        </td>
                        <td style={cell}><ScoreCell c={c} threshold={threshold} /></td>
                        <td style={cell}>{biasPill(c.options_bias)}</td>
                        <td style={cell}>{dpCell(c)}</td>
                        <td style={{ ...cell, color: c.confluence ? C.bull : C.inkMute }}>{c.confluence ? 'Yes' : '-'}</td>
                        <td className="tnum" style={num}>{c.calls}/{c.puts}</td>
                        <td className="tnum" style={num}>{c.sweeps}</td>
                        <td className="tnum" style={num}>{c.avg_vol_oi.toFixed(2)}</td>
                        <td className="tnum" style={num}>{fmtMoney(c.total_premium)}</td>
                        <td className="tnum" style={num}>{c.underlying_price != null ? `$${c.underlying_price.toFixed(2)}` : '-'}</td>
                        <td style={{ ...cell, fontSize: '12px', color: c.signa_direction === 'BULLISH' ? C.bull : c.signa_direction === 'BEARISH' ? C.bear : C.inkMute }}>
                          {c.signa_direction ?? '-'}
                        </td>
                        <td style={cell}>{statusCell(c, core, threshold)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="collector-grid">
            <Card
              title={`Promoted by scanner (${data.promoted.length}/${data.config.maxPromoted})`}
              tip={`Tickers the scanner added to data collection (hourly flow, dark pool every 30 min, daily GEX). Each stays ${data.config.promotionDays} days and is renewed whenever it qualifies again; the lowest scores drop out above the ${data.config.maxPromoted}-name cap. Promotion is for collecting data, not a buy signal.`}
            >
              {data.promoted.length === 0 ? (
                <div style={{ fontSize: '13px', color: C.inkMute }}>None yet. Promoted names get hourly dark pool, flow and daily GEX collection for {data.config.promotionDays} days, renewed each time they qualify again.</div>
              ) : data.promoted.map(p => (
                <div key={p.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <button onClick={() => onAnalyze(p.symbol)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>{p.symbol}</button>
                  <span className="tnum" style={{ color: C.inkSec }}>score {p.last_score != null ? Number(p.last_score).toFixed(0) : '-'}</span>
                  <span className="tnum" style={{ color: C.inkMute }}>until {p.expires_at ?? '-'}</span>
                </div>
              ))}
              <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 12 }}>
                Permanent core ({data.core.length}): <span className="tnum">{data.core.join(' ')}</span>
              </div>
            </Card>

            <Card
              title="Signa 30-model scan (technical cross-check)"
              tip="Signa's own ranked list of the strongest bullish and bearish technical setups (score and grade), refreshed overnight and recorded at 09:15 New York time. Independent of options flow; useful to see when both agree."
            >
              {data.signa.bullish.length + data.signa.bearish.length === 0 ? (
                <div style={{ fontSize: '13px', color: C.inkMute }}>Recorded at 09:15 ET on trading days.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {(['bullish', 'bearish'] as const).map(dir => (
                    <div key={dir}>
                      <div style={{ ...label, fontSize: '10px', color: dir === 'bullish' ? C.bull : C.bear, marginBottom: 6 }}>{dir}</div>
                      {data.signa[dir].map(s => (
                        <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0' }}>
                          <button onClick={() => onAnalyze(s.symbol)} style={{ background: 'none', border: 'none', padding: 0, color: C.inkSec, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>{s.symbol}</button>
                          <span className="tnum" style={{ color: C.inkMute }}>{s.score ?? '-'} {s.grade ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div style={{ fontSize: '12px', color: C.inkMute, lineHeight: 1.6 }}>
            Filters: prints of {fmtMoney(data.config.minPremium)}+ with {data.config.minDte}+ days to expiry, at least {fmtMoney(data.config.minTotalPremium)} total,
            price ${data.config.minPrice}+{data.config.minOpenInterest > 0 ? `, open interest ${data.config.minOpenInterest.toLocaleString()}+` : ''}, index options excluded.
            Scores are research signals for the backtest, not trade recommendations.
          </div>
        </div>
      )}
    </div>
  );
}
