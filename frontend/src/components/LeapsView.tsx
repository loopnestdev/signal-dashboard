import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C } from '../lib/colors';
import { fetchLeaps, fetchLeapsRun, fetchLeapsRuns, startLeapsBacktest } from '../lib/api';
import { fmtCap, fmtLevel, mergeNamedCurves, positionReturnPct, positionStatus, sortScreen } from '../lib/leaps';
import { fmtPct, fmtUsd } from '../lib/performance';
import { supabase } from '../lib/supabase';
import type { LeapsBook, LeapsContract, LeapsMarketState, LeapsPosition, LeapsResponse, LeapsRunDetail, LeapsRunsResponse, LeapsScreenRow } from '../types/leaps';
import { InfoTip } from './InfoTip';

const BOOKS: Record<LeapsBook, { name: string; short: string; color: string; tip: string }> = {
  L1: { name: 'L1 - Deep ITM (0.75 delta)', short: 'L1 deep ITM', color: C.primary, tip: 'Moves almost like the stock, little time decay. Needs a bigger stock move to reach +100%.' },
  L2: { name: 'L2 - At the money (0.50 delta)', short: 'L2 ATM', color: C.warn, tip: 'Balance of cost and leverage. +100% usually needs a ~25-35% stock rise.' },
  L3: { name: 'L3 - Out of the money (0.30 delta)', short: 'L3 OTM', color: C.inkSec, tip: 'Cheap with the most leverage. Reaches +100% fastest but expires worthless more often.' },
};
const BOOK_IDS: LeapsBook[] = ['L1', 'L2', 'L3'];

const STATE: Record<LeapsMarketState, { label: string; color: string; note: string }> = {
  correction: { label: 'Correction - buying window', color: C.bull, note: 'SPY is 10%+ below its 52-week high: full-size entries (10% of the book each).' },
  pullback: { label: 'Pullback - half size', color: C.warn, note: 'SPY is 5-10% below its high with VIX > 20 or a weak market score: half-size entries (5% each).' },
  normal: { label: 'Waiting - market not down', color: C.inkMute, note: 'No new entries. The list below shows names that would qualify once SPY is 5-10%+ off its high.' },
};

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };
const th = { ...label, textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const };
const td = { fontSize: '13px', color: C.inkSec, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const };
const sub = { fontSize: '11px', color: C.inkMute, marginTop: 2 };
const pnlColor = (n: number | null | undefined) => (n == null || n === 0 ? C.inkSec : n > 0 ? C.bull : C.bear);
const money = (n: number | null | undefined) => (n == null ? '-' : `$${Number(n).toFixed(2)}`);
const token = async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null);

function Card({ title, tip, right, children }: { title: string; tip?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: C.s1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={label}>{title}{tip && <InfoTip tip={tip} />}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({ name, value, color, tip }: { name: string; value: string; color?: string; tip: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: '10px' }}>{name}<InfoTip tip={tip} /></div>
      <div className="tnum" style={{ fontSize: '15px', fontWeight: 600, color: color ?? C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function BookTabs({ value, onChange }: { value: LeapsBook; onChange: (b: LeapsBook) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {BOOK_IDS.map(b => (
        <button key={b} onClick={() => onChange(b)} title={BOOKS[b].tip} style={{
          borderRadius: 9999, padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${value === b ? BOOKS[b].color : C.border}`, background: value === b ? C.canvasSoft : C.canvas,
          color: value === b ? C.ink : C.inkSec,
        }}>{BOOKS[b].short}</button>
      ))}
    </div>
  );
}

function Chip({ ok, text, title }: { ok: boolean | null; text: string; title: string }) {
  const color = ok === true ? C.bull : ok === false ? C.bear : C.inkMute;
  return <span title={title} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 9999, border: `1px solid ${color}`, color, marginRight: 4 }}>{text}</span>;
}

function MarketCard({ data }: { data: LeapsResponse }) {
  const m = data.market;
  if (!m) {
    return (
      <Card title="Market condition" tip="LEAPS rules section 2.">
        <div style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.6 }}>
          No screen yet. The collector's <span className="tnum">leaps</span> job runs after each close (close + 45 min, Railway only),
          or run <span className="tnum">npm run collect -- leaps</span> in <span className="tnum">backend/</span>.
        </div>
      </Card>
    );
  }
  const st = STATE[m.state];
  return (
    <Card title="Market condition" tip="LEAPS rules section 2. New LEAPS are only bought while the market is down." right={<span className="tnum" style={{ fontSize: '12px', color: C.inkMute }}>as of {m.trade_date}</span>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ borderRadius: 9999, padding: '4px 12px', fontSize: '13px', fontWeight: 700, color: st.color, border: `1px solid ${st.color}` }}>{st.label}</span>
        <span style={{ fontSize: '13px', color: C.inkSec }}>{st.note}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginTop: 14 }}>
        <Stat name="SPY off high" value={`${Number(m.spy_off_high_pct).toFixed(1)}%`} color={Number(m.spy_off_high_pct) >= 5 ? C.warn : undefined} tip="How far SPY's close is below its highest close of the last 52 weeks. 10%+ = correction, 5-10% = pullback (with VIX or market score)." />
        <Stat name="VIX" value={m.vix == null ? '-' : Number(m.vix).toFixed(1)} tip="Above 20 turns a 5-10% dip into a pullback." />
        <Stat name="Market score" value={m.market_score == null ? '-' : String(m.market_score)} tip="The dashboard's Market Quality Score. Below 60 also turns a 5-10% dip into a pullback." />
        <Stat name="SPY / 52w high" value={`$${Number(m.spy_close).toFixed(2)} / $${Number(m.spy_high_52w).toFixed(2)}`} tip="SPY close and its 52-week closing high." />
      </div>
    </Card>
  );
}

function LevelsCell({ levels, price, kind }: { levels: LeapsContract['levels']; price: number | null; kind: 'be' | 'double' }) {
  if (!levels) return <span>-</span>;
  if (kind === 'be') {
    return (
      <div>
        <div className="tnum" style={{ color: C.ink }}>{fmtLevel(levels.breakEvenToday, price)}</div>
        <div className="tnum" style={sub}>at expiry {fmtLevel(levels.breakEvenExpiry, price)}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="tnum" style={{ color: C.ink }}>{fmtLevel(levels.doubleToday, price)}</div>
      <div className="tnum" style={sub}>in 6 mo {fmtLevel(levels.doubleIn6m, price)}</div>
      <div className="tnum" style={sub}>at expiry {fmtLevel(levels.doubleExpiry, price)}</div>
    </div>
  );
}

const LEVEL_TIPS = {
  be: 'Stock price at which the option is worth what you paid (commissions included). "Today" assumes the same IV right now; "at expiry" = strike + premium.',
  double: 'Stock price at which the option is worth 2x what you paid (the half-sale trigger). Today, after 6 months (the runner\'s minimum hold), and at expiry. Assumes IV stays the same.',
  limit: 'The order to place right after the fill: a limit sell for half the contracts at 2x the premium per share.',
};

function ProposedTable({ rows, book, state, onAnalyze }: { rows: LeapsScreenRow[]; book: LeapsBook; state: LeapsMarketState; onAnalyze: (t: string) => void }) {
  const list = sortScreen(rows).filter(r => r.contracts?.[book]);
  if (!list.length) {
    return <div style={{ fontSize: '13px', color: C.inkMute }}>No eligible name is 15%+ below its 52-week high right now.</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1180 }}>
        <thead>
          <tr>
            <th style={th}>Ticker<InfoTip tip="Click to open the stock on the Dashboard." /></th>
            <th style={th}>Price<InfoTip tip="Close and distance below the 52-week high (needs 15%+)." /></th>
            <th style={th}>Contract<InfoTip tip="First standard monthly expiry 15-27 months out, call nearest this book's delta." /></th>
            <th style={{ ...th, textAlign: 'right' }}>Ask<InfoTip tip="Premium per share (x100 per contract). Paper fills buy at the next close's ask." /></th>
            <th style={{ ...th, textAlign: 'right' }}>2 contracts<InfoTip tip="Cost of the minimum 2 contracts incl. commission. The badge shows whether a $25k book could buy 2 within its per-position limit." /></th>
            <th style={th}>Break-even<InfoTip tip={LEVEL_TIPS.be} /></th>
            <th style={th}>+100% stock price<InfoTip tip={LEVEL_TIPS.double} /></th>
            <th style={{ ...th, textAlign: 'right' }}>Sell limit<InfoTip tip={LEVEL_TIPS.limit} /></th>
            <th style={th}>Signa<InfoTip tip="Recorded only, never blocks an entry. DP = dark pool buy share >= 55% (3 sessions); FLOW = calls >= 1.5x puts (5 sessions); LEAPS = a $250k+ call print expiring 1+ year out (10 sessions). Grey = no stored data (untracked name)." /></th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map(r => {
            const c = r.contracts![book]!;
            const conf = r.confirmation;
            return (
              <tr key={r.symbol}>
                <td style={td}>
                  <button onClick={() => onAnalyze(r.symbol)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: C.primary, fontSize: '13px' }}>{r.symbol}</button>
                  <div style={sub}>{fmtCap(r.market_cap)}</div>
                </td>
                <td className="tnum" style={td}>{money(r.price)}<div style={{ ...sub, color: C.bear }}>-{Number(r.off_high_pct).toFixed(1)}%</div></td>
                <td className="tnum" style={td}>
                  {c.strike != null ? `${c.strike}C ${c.expiry}` : '-'}
                  <div style={sub}>{c.delta != null ? `Δ ${c.delta.toFixed(2)}` : ''}{c.iv != null ? ` · IV ${(c.iv * 100).toFixed(0)}%` : ''}{c.openInterest != null ? ` · OI ${c.openInterest.toLocaleString()}` : ''}</div>
                </td>
                <td className="tnum" style={{ ...td, textAlign: 'right' }}>{money(c.ask)}</td>
                <td className="tnum" style={{ ...td, textAlign: 'right' }}>
                  {fmtUsd(c.costFor2)}
                  {c.affordable25k != null && <div style={{ ...sub, color: c.affordable25k ? C.bull : C.warn }}>{c.affordable25k ? '$25k ok' : 'over $25k limit'}</div>}
                </td>
                <td style={td}><LevelsCell levels={c.levels} price={r.price} kind="be" /></td>
                <td style={td}><LevelsCell levels={c.levels} price={r.price} kind="double" /></td>
                <td className="tnum" style={{ ...td, textAlign: 'right', color: C.ink, fontWeight: 600 }}>{money(c.levels?.sellLimit)}</td>
                <td style={td}>
                  {conf ? (
                    <>
                      <Chip ok={conf.dpPass} text="DP" title={conf.dpBuyShare == null ? 'No dark pool data stored' : `Dark pool buy share ${(conf.dpBuyShare * 100).toFixed(0)}%`} />
                      <Chip ok={conf.flowPass} text="FLOW" title={conf.callRatio == null ? 'No flow alerts stored' : `Call / put premium ${conf.callRatio ?? 'calls only'}x`} />
                      <Chip ok={conf.printPass} text="LEAPS" title={`${conf.leapsPrints} long-dated call prints >= $250k`} />
                      {conf.confirmed && <div style={{ ...sub, color: C.bull, fontWeight: 700 }}>confirmed</div>}
                    </>
                  ) : '-'}
                </td>
                <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>
                  {!c.liquid ? <span style={{ color: C.warn }}>{c.reason}</span>
                    : r.candidate ? <span style={{ color: C.bull, fontWeight: 600 }}>{state === 'pullback' ? 'Buy (half size)' : 'Buy'}</span>
                    : <span style={{ color: C.inkMute }}>Qualifies when market is down</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionsTable({ positions, prices, onAnalyze }: { positions: LeapsPosition[]; prices: Map<string, number | null>; onAnalyze: (t: string) => void }) {
  if (!positions.length) return <div style={{ fontSize: '13px', color: C.inkMute }}>No paper LEAPS positions yet. Orders are placed after a close while the market is in a pullback or correction.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
        <thead>
          <tr>
            <th style={th}>Book</th>
            <th style={th}>Position</th>
            <th style={{ ...th, textAlign: 'right' }}>Qty<InfoTip tip="Contracts still open / bought." /></th>
            <th style={{ ...th, textAlign: 'right' }}>Entry → last<InfoTip tip="Premium paid per share and the latest recorded bid." /></th>
            <th style={{ ...th, textAlign: 'right' }}>Return<InfoTip tip="On premium paid, both halves included (sold half at its sale price), before commissions." /></th>
            <th style={th}>Break-even<InfoTip tip={LEVEL_TIPS.be} /></th>
            <th style={th}>+100% stock price<InfoTip tip={LEVEL_TIPS.double} /></th>
            <th style={{ ...th, textAlign: 'right' }}>Sell limit<InfoTip tip={LEVEL_TIPS.limit} /></th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const ret = positionReturnPct(p);
            const spot = prices.get(p.symbol) ?? null;
            return (
              <tr key={p.id}>
                <td style={{ ...td, color: BOOKS[p.book].color, fontWeight: 700 }}>{p.book}</td>
                <td className="tnum" style={td}>
                  <button onClick={() => onAnalyze(p.symbol)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: C.primary, fontSize: '13px' }}>{p.symbol}</button>
                  {' '}{p.strike}C {p.expiry}
                  <div style={sub}>signal {p.signal_date} · {p.market_state}{p.entry_date ? ` · filled ${p.entry_date}` : ''}</div>
                </td>
                <td className="tnum" style={{ ...td, textAlign: 'right' }}>{p.qty_open}/{p.qty}</td>
                <td className="tnum" style={{ ...td, textAlign: 'right' }}>{money(p.entry_price ?? p.meta.askAtSignal)} → {money(p.last_bid)}</td>
                <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(ret), fontWeight: 600 }}>{fmtPct(ret)}</td>
                <td style={td}><LevelsCell levels={p.levels} price={spot} kind="be" /></td>
                <td style={td}><LevelsCell levels={p.levels} price={spot} kind="double" /></td>
                <td className="tnum" style={{ ...td, textAlign: 'right', color: C.ink, fontWeight: 600 }}>
                  {p.half_date ? <span style={{ color: C.inkMute }}>done {p.half_date}</span> : money(p.levels?.sellLimit ?? (p.entry_price != null ? 2 * Number(p.entry_price) : null))}
                </td>
                <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{positionStatus(p)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClosedTable({ positions }: { positions: LeapsPosition[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
        <thead><tr>
          <th style={th}>Book</th><th style={th}>Position</th><th style={th}>Entry → exit</th>
          <th style={{ ...th, textAlign: 'right' }}>P&L</th><th style={th}>Reason</th>
        </tr></thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td style={{ ...td, color: BOOKS[p.book].color, fontWeight: 700 }}>{p.book}</td>
              <td className="tnum" style={td}>{p.symbol} {p.strike}C {p.expiry}</td>
              <td className="tnum" style={td}>{p.entry_date ?? '-'} → {p.exit_date ?? '-'}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(p.pnl), fontWeight: 600 }}>{p.status === 'closed' ? fmtUsd(p.pnl, true) : '-'}</td>
              <td style={td}>{p.exit_reason ?? p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UniverseTable({ rows }: { rows: LeapsScreenRow[] }) {
  const check = (r: LeapsScreenRow, key: string) => r.checks.find(c => c.key === key);
  const cell = (r: LeapsScreenRow, key: string) => {
    const c = check(r, key);
    if (!c) return <td style={td}>-</td>;
    return <td style={{ ...td, color: c.pass ? C.inkSec : C.bear }} title={c.detail}>{c.pass ? '✓ ' : '✗ '}{c.detail}</td>;
  };
  return (
    <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
        <thead><tr>
          <th style={th}>Ticker</th><th style={th}>Market cap</th><th style={th}>Profit (4 qtrs)</th><th style={th}>Revenue YoY</th>
          <th style={th}>Volatility<InfoTip tip="Stock IV30 / VIX; at most 2.25x (= 45% IV when VIX is 20)." /></th><th style={th}>Off 52w high</th>
        </tr></thead>
        <tbody>
          {[...rows].sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.symbol.localeCompare(b.symbol)).map(r => (
            <tr key={r.symbol}>
              <td style={{ ...td, fontWeight: 700, color: r.eligible ? C.ink : C.inkMute }}>{r.symbol}</td>
              {cell(r, 'marketCap')}{cell(r, 'profit')}{cell(r, 'revenue')}{cell(r, 'volatility')}{cell(r, 'offHigh')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquityChart({ details }: { details: Partial<Record<LeapsBook, LeapsRunDetail>> }) {
  const books = BOOK_IDS.filter(b => details[b]);
  const first = books.map(b => details[b]).find(Boolean);
  const rows = useMemo(() => mergeNamedCurves(
    Object.fromEntries(books.map(b => [b, details[b]!.equity])),
    first?.benchmark ?? [],
  ), [details, books, first]);
  if (!rows.length) return <div style={{ fontSize: '13px', color: C.inkMute }}>Loading curves...</div>;
  const axis = { fontSize: 11, fill: C.inkMute as string };
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => d.slice(0, 7)} minTickGap={40} stroke={C.border} />
          <YAxis tick={axis} width={72} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} stroke={C.border} />
          <Tooltip
            contentStyle={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: C.ink, fontWeight: 600 }}
            formatter={(v, name) => [fmtUsd(Number(v)), name === 'SPY' ? 'SPY (same start)' : BOOKS[name as LeapsBook]?.short ?? String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(name: string) => (name === 'SPY' ? 'SPY (same start)' : BOOKS[name as LeapsBook]?.short ?? name)} />
          {books.map(b => <Line key={b} type="monotone" dataKey={b} stroke={BOOKS[b].color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
          <Line type="monotone" dataKey="SPY" stroke={C.inkMute} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BacktestSection({ canRun }: { canRun: boolean }) {
  const [runs, setRuns] = useState<LeapsRunsResponse | null>(null);
  const [details, setDetails] = useState<Partial<Record<LeapsBook, LeapsRunDetail>>>({});
  const [book, setBook] = useState<LeapsBook>('L2');
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetchLeapsRuns();
      setRuns(r);
      setFrom(f => f || r.defaultFrom);
      setTo(t => t || r.lastSession);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'failed to load'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const running = runs?.job?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const latest = useMemo(() => (runs?.runs ?? []).filter(r => runs!.latest.includes(r.id)), [runs]);
  useEffect(() => {
    let cancelled = false;
    setDetails({});
    Promise.all(latest.map(r => fetchLeapsRun(r.id).then(d => [r.book, d] as const)))
      .then(entries => { if (!cancelled) setDetails(Object.fromEntries(entries)); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load run'); });
    return () => { cancelled = true; };
  }, [latest]);

  const run = async () => {
    try {
      await startLeapsBacktest({ from, to }, await token());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'failed to start'); }
  };

  const selected = details[book];
  const s = latest.find(r => r.book === book)?.summary;
  const input = { fontSize: '12px', padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.canvas, color: C.ink };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Backtest - modeled prices"
        tip="LEAPS rules section 9. No historical LEAPS quotes exist, so prices are Black-Scholes with IV = VIX x (stock vol / SPY vol), a 2% half-spread on each fill, fractional contracts. Signa data is not part of the backtest (no history). Treat results as a sanity check across ~4-5 drawdowns, not proof."
        right={canRun && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={input} />
            <span style={{ color: C.inkMute }}>→</span>
            <input type="date" value={to} max={runs?.lastSession} onChange={e => setTo(e.target.value)} style={input} />
            <button onClick={run} disabled={running || !from || !to} style={{ ...input, cursor: running ? 'default' : 'pointer', fontWeight: 600, background: C.primary, color: '#fff', border: 'none', opacity: running ? 0.6 : 1 }}>
              {running ? `Running${runs?.job?.step ? ` (${runs.job.step})` : ''}...` : 'Run backtest'}
            </button>
          </div>
        )}
      >
        {error && <div style={{ fontSize: '13px', color: C.bear, marginBottom: 10 }}>{error}</div>}
        {runs?.job?.state === 'failed' && <div style={{ fontSize: '13px', color: C.bear, marginBottom: 10 }}>Last run failed: {runs.job.error}</div>}
        {!latest.length ? (
          !error && <div style={{ fontSize: '13px', color: C.inkMute }}>{running ? 'Loading ~120 price histories, this takes a minute or two...' : 'No saved LEAPS backtest yet.'}</div>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: C.inkMute, marginBottom: 12 }} className="tnum">
              {latest[0].date_from} → {latest[0].date_to} · rules v{latest[0].rules_version} · ${Number(latest[0].starting_balance).toLocaleString()} per book
              {runs?.job?.missing?.length ? ` · no history: ${runs.job.missing.join(', ')}` : ''}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead><tr>
                  <th style={th}>Book</th>
                  <th style={{ ...th, textAlign: 'right' }}>Return</th>
                  <th style={{ ...th, textAlign: 'right' }}>CAGR<InfoTip tip="Compound yearly growth of the book, open positions at their marked value." /></th>
                  <th style={{ ...th, textAlign: 'right' }}>SPY</th>
                  <th style={{ ...th, textAlign: 'right' }}>Max DD</th>
                  <th style={{ ...th, textAlign: 'right' }}>Trades</th>
                  <th style={{ ...th, textAlign: 'right' }}>Win rate</th>
                  <th style={{ ...th, textAlign: 'right' }}>Hit +100%<InfoTip tip="Share of closed trades that reached the half-sale trigger." /></th>
                  <th style={{ ...th, textAlign: 'right' }}>Half P&L<InfoTip tip="Profit from the halves sold at +100%." /></th>
                  <th style={{ ...th, textAlign: 'right' }}>Runner P&L<InfoTip tip="Everything else: runners after the half sale plus positions that never reached +100%." /></th>
                  <th style={{ ...th, textAlign: 'right' }}>Avg hold</th>
                </tr></thead>
                <tbody>
                  {BOOK_IDS.map(b => {
                    const r = latest.find(x => x.book === b);
                    if (!r) return null;
                    const x = r.summary;
                    return (
                      <tr key={b} onClick={() => setBook(b)} style={{ cursor: 'pointer', background: book === b ? C.canvasSoft : undefined }}>
                        <td style={{ ...td, color: BOOKS[b].color, fontWeight: 700 }}>{BOOKS[b].name}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(x.returnPct), fontWeight: 600 }}>{fmtPct(x.returnPct)}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtPct(x.cagrPct)}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtPct(x.spyReturnPct)}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right', color: C.bear }}>{x.maxDrawdownPct}%</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{x.trades}{x.openAtEnd ? ` +${x.openAtEnd}` : ''}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{x.winRate == null ? '-' : `${x.winRate}%`}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{x.halfSaleRate == null ? '-' : `${x.halfSaleRate}%`}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(x.halfPnl) }}>{fmtUsd(x.halfPnl, true)}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(x.runnerPnl) }}>{fmtUsd(x.runnerPnl, true)}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{x.avgHoldDays == null ? '-' : `${x.avgHoldDays}d`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16 }}><EquityChart details={details} /></div>
          </>
        )}
      </Card>

      {s && (
        <div className="perf-grid-2">
          <Card title={`Drawdown episodes - ${BOOKS[book].short}`} tip="Each stretch of pullback/correction sessions (a new one starts after 60 normal sessions). Results are grouped by the episode a trade was bought in.">
            {s.episodes.length === 0 ? <div style={{ fontSize: '13px', color: C.inkMute }}>No down markets in this range.</div> : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={th}>Episode</th><th style={{ ...th, textAlign: 'right' }}>SPY worst</th><th style={{ ...th, textAlign: 'right' }}>Trades</th><th style={{ ...th, textAlign: 'right' }}>P&L</th></tr></thead>
                <tbody>{s.episodes.map(e => (
                  <tr key={e.id}>
                    <td className="tnum" style={td}>{e.id} → {e.end}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', color: C.bear }}>-{e.maxSpyOffHighPct}%</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right' }}>{e.trades}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(e.pnl), fontWeight: 600 }}>{fmtUsd(e.pnl, true)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <Card title="Exits and skips" tip="How trades ended, and why candidates were not bought (counted once per name per reason per month).">
            <div style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.8 }}>
              {Object.entries(s.exitReasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => <div key={r}><span className="tnum" style={{ color: C.ink, fontWeight: 600 }}>{n}</span> {r}</div>)}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
              {Object.entries(s.skips).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([r, n]) => <div key={r} style={{ color: C.inkMute }}><span className="tnum">{n}</span> {r}</div>)}
            </div>
          </Card>
        </div>
      )}

      {selected && (
        <Card title={`Backtest trades - ${BOOKS[book].short}`} tip="Modeled fills: buy at ask, sell at bid, next session's close. Prices are per share; qty is fractional.">
          <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead><tr>
                <th style={th}>Trade</th><th style={th}>Entry → exit</th><th style={{ ...th, textAlign: 'right' }}>Paid</th>
                <th style={th}>Half sold</th><th style={{ ...th, textAlign: 'right' }}>Exit</th><th style={{ ...th, textAlign: 'right' }}>P&L</th><th style={th}>Reason</th>
              </tr></thead>
              <tbody>{selected.trades.map(t => (
                <tr key={t.trade_id}>
                  <td className="tnum" style={{ ...td, color: C.ink, fontWeight: 600 }}>{t.symbol} {Number(t.strike).toFixed(2)}C {t.expiry}<div style={sub}>{t.market_state} · stock ${Number(t.entry_spot).toFixed(2)}</div></td>
                  <td className="tnum" style={td}>{t.entry_date} → {t.exit_date}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right' }}>{money(t.entry_price)}</td>
                  <td className="tnum" style={td}>{t.half_date ? `${t.half_date} @ ${money(t.half_price)}` : '-'}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right' }}>{money(t.exit_price)}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(Number(t.pnl)), fontWeight: 600 }}>{fmtUsd(Number(t.pnl), true)}</td>
                  <td style={td}>{t.exit_reason}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function LeapsView({ canRun, onAnalyze }: { canRun: boolean; onAnalyze: (ticker: string) => void }) {
  const [data, setData] = useState<LeapsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<LeapsBook>('L2');
  const [showUniverse, setShowUniverse] = useState(false);

  useEffect(() => {
    fetchLeaps().then(d => { setData(d); setError(null); }).catch(e => setError(e instanceof Error ? e.message : 'failed to load'));
  }, []);

  const open = (data?.positions ?? []).filter(p => p.status === 'open' || p.status === 'pending');
  const closed = (data?.positions ?? []).filter(p => p.status === 'closed' || p.status === 'cancelled');
  const eligible = (data?.screen ?? []).filter(r => r.eligible).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: C.ink }}>LEAPS</div>
        <div style={{ fontSize: '13px', color: C.inkSec, marginTop: 4, lineHeight: 1.5 }}>
          Long-dated calls (15-27 months) on large, profitable companies, bought only when the market is down. Sell half at +100%, let the rest run.
          Rules: <span className="tnum">docs/leaps-rules.md</span>{data ? ` v${data.rulesVersion}` : ''}.
        </div>
      </div>
      {error && <div style={{ fontSize: '13px', color: C.bear }}>{error}</div>}
      {data && <MarketCard data={data} />}

      {data && (
        <Card
          title={data.market?.state === 'normal' || !data.market ? 'Watchlist - qualifies when the market is down' : 'Proposed trades'}
          tip="Every eligible name 15%+ below its 52-week high, with the contract this book would buy and the price levels to watch. Levels are recalculated after every close."
          right={<BookTabs value={book} onChange={setBook} />}
        >
          <ProposedTable rows={data.screen} book={book} state={data.market?.state ?? 'normal'} onAnalyze={onAnalyze} />
          <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 10 }}>
            {eligible} of {data.screen.length} names pass the quality checks.{' '}
            <button onClick={() => setShowUniverse(v => !v)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: '12px' }}>
              {showUniverse ? 'Hide' : 'Show'} all checks
            </button>
          </div>
          {showUniverse && <div style={{ marginTop: 12 }}><UniverseTable rows={data.screen} /></div>}
        </Card>
      )}

      {data && (
        <Card title="Paper positions" tip="LEAPS rules section 10. Whole contracts (at least 2), filled at the next close: buy at ask, sell at bid. Break-even and +100% levels use the actual fill price.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            {data.books.map(b => (
              <div key={b.book} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: BOOKS[b.book].color }}>{BOOKS[b.book].name}</div>
                <div className="tnum" style={{ fontSize: '18px', fontWeight: 600, color: pnlColor(b.equity - b.startingBalance), marginTop: 4 }}>{fmtUsd(b.equity)}</div>
                <div className="tnum" style={sub}>cash {fmtUsd(b.cash)} · {b.openCount} open · {b.closed} closed ({b.wins} won) · realized {fmtUsd(b.realizedPnl, true)}</div>
              </div>
            ))}
          </div>
          <PositionsTable positions={open} prices={new Map(data.screen.map(r => [r.symbol, r.price]))} onAnalyze={onAnalyze} />
          {closed.length > 0 && <div style={{ marginTop: 16 }}><div style={{ ...label, marginBottom: 8 }}>Closed</div><ClosedTable positions={closed} /></div>}
        </Card>
      )}

      <BacktestSection canRun={canRun} />
    </div>
  );
}
