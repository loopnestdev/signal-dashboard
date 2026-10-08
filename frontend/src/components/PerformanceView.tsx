import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { C } from '../lib/colors';
import { deleteBacktestRun, fetchBacktestRun, fetchBacktestRuns, fetchFlowStudy, startReplay } from '../lib/api';
import { describeLegs, fmtPct, fmtUsd, mergeCurves } from '../lib/performance';
import { supabase } from '../lib/supabase';
import type { BacktestRunDetail, BacktestRunRow, BacktestRunsResponse, BookId, FlowStudyResponse } from '../types/market';
import { InfoTip } from './InfoTip';

const BOOKS: Record<BookId, { name: string; short: string; color: string; tip: string }> = {
  A: { name: 'Book A - Signa + flow options', short: 'A: Signa + flow', color: C.primary, tip: "Options on Signa's overnight direction when options flow and dark pool agree. Rules section 2." },
  B: { name: 'Book B - Radon options', short: 'B: Radon', color: C.warn, tip: 'Options on Flow Scanner names that pass all of Radon\'s checks (score, confluence, sustained dark pool, 2:1 payoff to the GEX target). Rules section 3.' },
  C: { name: 'Book C - Shares', short: 'C: Shares', color: C.inkSec, tip: "Shares only, using Signa's entry, stop and target levels. Rules section 4." },
};

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };
const th = { ...label, textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const };
const td = { fontSize: '13px', color: C.inkSec, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const };
const pnlColor = (n: number | null | undefined) => (n == null || n === 0 ? C.inkSec : n > 0 ? C.bull : C.bear);

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

const token = async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null);

function Stat({ name, value, color, tip }: { name: string; value: string; color?: string; tip: string }) {
  return (
    <div>
      <div style={{ ...label, fontSize: '10px' }}>{name}<InfoTip tip={tip} /></div>
      <div className="tnum" style={{ fontSize: '15px', fontWeight: 600, color: color ?? C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function BookCard({ run, active, onClick }: { run: BacktestRunRow; active: boolean; onClick: () => void }) {
  const s = run.summary;
  const book = BOOKS[run.book];
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} style={{
      textAlign: 'left', cursor: 'pointer', background: C.canvas, borderRadius: 14, padding: '16px 18px', boxShadow: C.s1,
      border: `1px solid ${active ? book.color : C.border}`, outline: active ? `1px solid ${book.color}` : 'none', color: C.ink, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 600 }}>
        <span style={{ width: 10, height: 10, borderRadius: 9999, background: book.color, flexShrink: 0 }} />
        {book.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
        <span className="tnum" style={{ fontSize: '24px', fontWeight: 600, color: pnlColor(s.returnPct) }}>{fmtPct(s.returnPct)}</span>
        <span className="tnum" style={{ fontSize: '12px', color: C.inkMute }}>SPY {fmtPct(s.spyReturnPct)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
        <Stat name="Trades" value={`${s.trades}${s.openAtEnd ? ` +${s.openAtEnd}` : ''}`} tip="Closed trades, plus positions still open at the end of the replay (+N)." />
        <Stat name="Win rate" value={s.winRate == null ? '-' : `${s.winRate}%`} tip="Share of closed trades that made money after costs." />
        <Stat name="Avg R" value={s.avgR == null ? '-' : `${s.avgR}R`} color={pnlColor(s.avgR)} tip="Average result as a multiple of the risk taken. +1R = made what was risked; -1R = lost all of it. Go-live needs above 0.2R." />
        <Stat name="Profit factor" value={s.profitFactor == null ? '-' : s.profitFactor === Infinity ? 'all wins' : String(s.profitFactor)} tip="Total won / total lost after costs. Go-live needs 1.3 or more." />
        <Stat name="Max drawdown" value={`${s.maxDrawdownPct}%`} color={s.maxDrawdownPct > 0 ? C.bear : undefined} tip="Largest fall from a high point of the book's balance (including open positions at their marked value)." />
        <Stat name="P&L" value={fmtUsd(s.totalPnl, true)} color={pnlColor(s.totalPnl)} tip="Realised profit or loss of closed trades after commissions. Open positions are not included." />
      </div>
    </div>
  );
}

function EquityChart({ details, books }: { details: Partial<Record<BookId, BacktestRunDetail>>; books: BookId[] }) {
  const firstDetail = books.map(b => details[b]).find(Boolean);
  const rows = useMemo(() => mergeCurves(
    Object.fromEntries(books.filter(b => details[b]).map(b => [b, details[b]!.equity])),
    firstDetail?.benchmark ?? [],
  ), [details, books, firstDetail]);
  if (rows.length === 0) return <div style={{ fontSize: '13px', color: C.inkMute }}>Loading curves...</div>;
  const axis = { fontSize: 11, fill: C.inkMute as string };
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} stroke={C.border} />
          <YAxis tick={axis} width={64} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`} stroke={C.border} />
          <Tooltip
            contentStyle={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: C.ink, fontWeight: 600 }}
            formatter={(v, name) => [fmtUsd(Number(v)), name === 'SPY' ? 'SPY (same start)' : BOOKS[name as BookId]?.short ?? String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(name: string) => (name === 'SPY' ? 'SPY (same start)' : BOOKS[name as BookId]?.short ?? name)} />
          {books.filter(b => details[b]).map(b => (
            <Line key={b} type="monotone" dataKey={b} stroke={BOOKS[b].color} strokeWidth={2} dot={rows.length < 25} isAnimationActive={false} />
          ))}
          <Line type="monotone" dataKey="SPY" stroke={C.inkMute} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GoLive({ checks }: { checks: BacktestRunRow['summary']['goLive'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {checks.map(c => {
        const [mark, color] = c.pass === true ? ['PASS', C.bull] : c.pass === false ? ['NOT YET', C.bear] : ['N/A', C.inkMute];
        return (
          <div key={c.check} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: '13px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 8px', borderRadius: 9999, color, border: `1px solid ${color}`, flexShrink: 0, minWidth: 54, textAlign: 'center' }}>{mark}</span>
            <span style={{ color: C.ink }}>{c.check}</span>
            <span className="tnum" style={{ color: C.inkMute, marginLeft: 'auto', textAlign: 'right' }}>{c.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function TradesTable({ detail }: { detail: BacktestRunDetail }) {
  if (detail.trades.length === 0) {
    return <div style={{ fontSize: '13px', color: C.inkMute }}>No closed trades in this replay.</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
        <thead>
          <tr>
            <th style={th}>Trade<InfoTip tip="Ticker and structure: strike(s), C/P and expiry for options (a spread shows long/short strikes), or the ticker for shares." /></th>
            <th style={th}>Dir<InfoTip tip="Bull = bets on a rise (calls, call spreads or shares). Bear = bets on a fall (puts or put spreads); the shares book is long only." /></th>
            <th style={th}>Entry → exit<InfoTip tip="Fill dates. Options fill at the next session's close (buy at ask, sell at bid); shares at the next open, or intraday at the stop/target." /></th>
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Risk<InfoTip tip="The most this trade could lose: premium paid for options, entry-to-stop x shares for stock." /></th>
            <th style={{ ...th, textAlign: 'right' }}>P&L<InfoTip tip="After commissions." /></th>
            <th style={{ ...th, textAlign: 'right' }}>R</th>
            <th style={th}>Exit reason</th>
            <th style={{ ...th, textAlign: 'right' }}>If held<InfoTip tip="For earnings exits: what the same trade would have made if held through the report and closed by its normal rules. Shows whether the earnings rule helps or hurts." /></th>
          </tr>
        </thead>
        <tbody>
          {detail.trades.map(t => (
            <tr key={t.trade_id}>
              <td style={{ ...td, color: C.ink, fontWeight: 600 }}>
                {describeLegs(t.symbol, t.legs)}
                {t.modeled_fills > 0 && <span title="At least one fill was priced by Black-Scholes because no quote was recorded that day" style={{ marginLeft: 6, fontSize: '10px', color: C.warn, fontWeight: 700 }}>MODELED</span>}
              </td>
              <td style={{ ...td, color: t.direction === 'BULLISH' ? C.bull : C.bear }}>{t.direction === 'BULLISH' ? 'Bull' : 'Bear'}</td>
              <td className="tnum" style={td}>{t.entry_date.slice(5)} → {t.exit_date.slice(5)}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right' }}>{Number(t.qty)}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtUsd(Number(t.risk))}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(Number(t.pnl)), fontWeight: 600 }}>{fmtUsd(Number(t.pnl), true)}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(Number(t.r_multiple)) }}>{Number(t.r_multiple).toFixed(2)}</td>
              <td style={td}>{t.exit_reason}</td>
              <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(t.shadow_pnl == null ? null : Number(t.shadow_pnl)) }}>
                {t.shadow_pnl == null ? '-' : fmtUsd(Number(t.shadow_pnl), true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkipsList({ skips }: { skips: Record<string, number> }) {
  const entries = Object.entries(skips).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <div style={{ fontSize: '13px', color: C.inkMute }}>No signals were skipped.</div>;
  const max = Math.max(...entries.map(e => e[1]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([reason, count]) => (
        <div key={reason} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 32px', gap: 10, alignItems: 'center', fontSize: '13px' }}>
          <span style={{ color: C.inkSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reason}>{reason}</span>
          <div style={{ height: 6, borderRadius: 9999, background: C.canvasSoft, overflow: 'hidden' }}>
            <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: C.primary }} />
          </div>
          <span className="tnum" style={{ color: C.ink, textAlign: 'right' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

function BookDetail({ detail }: { detail: BacktestRunDetail }) {
  const s = detail.run.summary;
  const open = detail.run.open_at_end ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="perf-grid-2">
        <Card title="Go-live checklist" tip="Rules section 7. Real money only when every check passes on both the replay and paper trading. N/A = not measurable yet.">
          <GoLive checks={s.goLive} />
        </Card>
        <Card title="Why signals were skipped" tip="Every signal the book saw but did not trade, grouped by reason. Lots of 'too expensive' or 'limit' skips mean the account size or limits are holding the strategy back.">
          <SkipsList skips={s.skipsByReason} />
          <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 14, lineHeight: 1.6 }}>
            Earnings exits: <span className="tnum">{s.earningsExits.count}</span>, P&L <span className="tnum">{fmtUsd(s.earningsExits.actualPnl, true)}</span>
            {s.earningsExits.shadowPnl != null && <> vs <span className="tnum">{fmtUsd(s.earningsExits.shadowPnl, true)}</span> if held</>}.
            {s.modeledFillShare != null && <> Modeled option fills: <span className="tnum">{s.modeledFillShare}%</span>.</>}
            {' '}Without its 2 best trades: <span className="tnum" style={{ color: pnlColor(s.pnlWithoutTop2) }}>{fmtUsd(s.pnlWithoutTop2, true)}</span>.
          </div>
        </Card>
      </div>
      <Card title={`Trades (${detail.trades.length})`} tip="Every closed trade in this replay, oldest first.">
        <TradesTable detail={detail} />
      </Card>
      {open.length > 0 && (
        <Card title={`Open at the end (${open.length})`} tip="Positions the replay still held on its last session, marked at that day's prices. Not counted in win rate or R.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {open.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: '13px', color: C.inkSec, flexWrap: 'wrap' }}>
                <span style={{ color: C.ink, fontWeight: 600 }}>{p.symbol}</span>
                <span>{p.kind} {p.direction === 'BULLISH' ? 'bull' : 'bear'} since {p.entryDate}</span>
                <span className="tnum" style={{ color: pnlColor(p.unrealizedPnl) }}>{fmtUsd(p.unrealizedPnl, true)} on {fmtUsd(p.risk)} risk</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function RunReplay({ data, onStarted }: { data: BacktestRunsResponse; onStarted: () => void }) {
  const [from, setFrom] = useState(data.dataFrom ?? data.lastSession);
  const [to, setTo] = useState(data.lastSession);
  const [books, setBooks] = useState<BookId[]>(['A', 'B', 'C']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = data.job?.state === 'running';
  const input = { padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.canvas, color: C.ink, fontSize: '13px' };

  const run = async () => {
    setBusy(true); setError(null);
    try {
      await startReplay({ from, to, books }, await token());
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the replay');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Run replay" tip={`Replays the recorded history under the current rules (v${data.rulesVersion}) and your saved Settings, then saves the result here. Runs on the server; takes about a second per session per book.`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: C.inkMute }}>
          From<input type="date" value={from} min={data.dataFrom ?? undefined} max={to} onChange={e => setFrom(e.target.value)} style={input} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', color: C.inkMute }}>
          To<input type="date" value={to} min={from} max={data.lastSession} onChange={e => setTo(e.target.value)} style={input} />
        </label>
        <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
          {(['A', 'B', 'C'] as BookId[]).map(b => (
            <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '13px', color: C.inkSec, cursor: 'pointer' }}>
              <input type="checkbox" checked={books.includes(b)} onChange={e => setBooks(e.target.checked ? [...books, b].sort() as BookId[] : books.filter(x => x !== b))} />
              {BOOKS[b].short}
            </label>
          ))}
        </div>
        <button onClick={run} disabled={busy || running || books.length === 0} style={{
          padding: '8px 16px', borderRadius: 9999, border: 'none', fontSize: '13px', fontWeight: 600,
          background: busy || running || books.length === 0 ? C.canvasSoft : C.primary, color: busy || running || books.length === 0 ? C.inkMute : C.onPrimary,
          cursor: busy || running ? 'default' : 'pointer',
        }}>
          {running ? `Running book ${data.job?.currentBook ?? ''}...` : busy ? 'Starting...' : 'Run replay'}
        </button>
      </div>
      {error && <div style={{ fontSize: '12px', color: C.bear, marginTop: 10 }}>{error}</div>}
      {data.job?.state === 'failed' && <div style={{ fontSize: '12px', color: C.bear, marginTop: 10 }}>Last replay failed: {data.job.error}</div>}
      <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 10, lineHeight: 1.6 }}>
        The last session in the range is only used to fill earlier decisions; nothing new is decided on it.
      </div>
    </Card>
  );
}

function RunHistory({ runs, selected, canRun, onView, onDeleted }: {
  runs: BacktestRunRow[]; selected: string[]; canRun: boolean; onView: (r: BacktestRunRow) => void; onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const remove = async (r: BacktestRunRow) => {
    if (!window.confirm(`Delete the Book ${r.book} replay ${r.date_from} → ${r.date_to}? This cannot be undone.`)) return;
    try {
      await deleteBacktestRun(r.id, await token());
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  return (
    <Card title={`Saved replays (${runs.length})`} tip="Every saved replay, newest first. Each keeps the rules version and settings it ran with, so results stay comparable after you change Settings.">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Ran</th><th style={th}>Book</th><th style={th}>Range</th><th style={th}>Rules</th>
              <th style={{ ...th, textAlign: 'right' }}>Trades</th><th style={{ ...th, textAlign: 'right' }}>Return</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id} style={{ background: selected.includes(r.id) ? C.primaryBg : undefined }}>
                <td style={td}>{new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ ...td, color: C.ink }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: BOOKS[r.book].color, marginRight: 6 }} />{BOOKS[r.book].short}</td>
                <td className="tnum" style={td}>{r.date_from} → {r.date_to}</td>
                <td className="tnum" style={td}>v{r.rules_version}</td>
                <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.summary.trades}</td>
                <td className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(r.summary.returnPct) }}>{fmtPct(r.summary.returnPct)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => onView(r)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>View</button>
                  {canRun && <button onClick={() => remove(r)} style={{ background: 'none', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: '13px', marginLeft: 6 }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div style={{ fontSize: '12px', color: C.bear, marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

const GROUP_LABEL: Record<string, { name: string; tip: string }> = {
  all: { name: 'All flow days', tip: 'Every ticker-day with enough flow premium. The baseline: a signal only matters if it beats this.' },
  'call-heavy': { name: 'Call-heavy', tip: 'Calls were at least the chosen share of the day\'s flow-alert premium. Bullish if these days beat the baseline.' },
  'put-heavy': { name: 'Put-heavy', tip: 'Puts were at least the chosen share of the day\'s premium. Bearish if these days do worse than the baseline (negative "vs all").' },
  mixed: { name: 'Mixed', tip: 'Neither side dominated.' },
  'call-heavy surge': { name: 'Call-heavy + surge', tip: 'Call-heavy AND total premium at least 2x the ticker\'s usual (median of its previous 20 flow days). Closest to a "record call volume" day. Needs 5+ earlier days per ticker.' },
  'put-heavy surge': { name: 'Put-heavy + surge', tip: 'Put-heavy AND at least 2x the ticker\'s usual premium.' },
};

function FlowStudy() {
  const [share, setShare] = useState(0.75);
  const [data, setData] = useState<FlowStudyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    fetchFlowStudy(share).then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed to load the flow study'));
  }, [share]);

  const cell = (n: number, mean: number | null, up: number | null, vsAll: number | null, bear: boolean) => {
    if (n === 0) return <span style={{ color: C.inkMute }}>-</span>;
    const right = vsAll == null ? null : bear ? vsAll < 0 : vsAll > 0;
    return (
      <div className="tnum" style={{ lineHeight: 1.4, opacity: n < (data?.minSample ?? 30) ? 0.55 : 1 }}>
        <div style={{ color: pnlColor(mean), fontWeight: 600 }}>{fmtPct(mean)}</div>
        <div style={{ fontSize: '11px', color: C.inkMute }}>
          up {up?.toFixed(0)}% · <span style={{ color: right == null ? C.inkMute : right ? C.bull : C.bear }}>vs all {fmtPct(vsAll)}</span> · n {n}
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Flow study: call-heavy vs put-heavy days"
      tip="After a ticker's options flow was mostly calls (or mostly puts), how did the stock do over the next 1, 5, 10 and 20 sessions, compared with all flow days? Uses the collector's flow-alert premium for tracked tickers, from 2 Oct 2026. Faded cells have fewer than 30 cases - treat them as noise."
      right={(
        <label style={{ fontSize: '12px', color: C.inkMute, display: 'flex', alignItems: 'center', gap: 6 }}>
          Heavy =
          <select value={share} onChange={e => setShare(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.canvas, color: C.ink, fontSize: '12px' }}>
            {[0.65, 0.7, 0.75, 0.8, 0.85].map(v => <option key={v} value={v}>{Math.round(v * 100)}%+ one side</option>)}
          </select>
        </label>
      )}
    >
      {error && <div style={{ fontSize: '13px', color: C.bear }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: '13px', color: C.inkMute }}>Loading (fetches daily prices for each ticker)...</div>}
      {data && (
        <>
          <div style={{ fontSize: '12px', color: C.inkSec, marginBottom: 12 }}>
            <span className="tnum">{data.flowDays}</span> ticker-days with at least <span className="tnum">{fmtUsd(data.config.minPremium)}</span> of flow,{' '}
            <span className="tnum">{data.symbols}</span> tickers, <span className="tnum">{data.from} → {data.to}</span>.
            {data.flowDays < 200 && ' Far too little history yet: expect meaningful numbers after about two months of collection.'}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Flow day</th>
                  {data.config.horizons.map(h => <th key={h} style={th}>Next {h} {h === 1 ? 'session' : 'sessions'}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.groups.map(g => (
                  <tr key={g.group}>
                    <td style={{ ...td, color: C.ink, fontWeight: 600 }}>
                      {GROUP_LABEL[g.group]?.name ?? g.group}<InfoTip tip={GROUP_LABEL[g.group]?.tip ?? ''} />
                      <div className="tnum" style={{ fontSize: '11px', color: C.inkMute, fontWeight: 400 }}>{g.days} days</div>
                    </td>
                    {g.stats.map(s => <td key={s.horizon} style={td}>{cell(s.n, s.meanPct, s.upPct, s.vsAllPct, g.group.startsWith('put'))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.events.length > 0 && (
            <>
              <div style={{ ...label, marginTop: 18, marginBottom: 8 }}>Recent one-sided days<InfoTip tip="The latest call-heavy and put-heavy ticker-days, biggest premium first within a day, with what the stock did after the flow day's close." /></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th><th style={th}>Ticker</th><th style={th}>Side</th>
                      <th style={{ ...th, textAlign: 'right' }}>Calls</th><th style={{ ...th, textAlign: 'right' }}>Premium</th>
                      {data.config.horizons.map(h => <th key={h} style={{ ...th, textAlign: 'right' }}>+{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map(e => (
                      <tr key={`${e.symbol}-${e.date}`}>
                        <td className="tnum" style={td}>{e.date}</td>
                        <td style={{ ...td, color: C.ink, fontWeight: 600 }}>{e.symbol}{e.surge && <span title="At least 2x this ticker's usual flow premium" style={{ marginLeft: 6, fontSize: '10px', color: C.warn, fontWeight: 700 }}>SURGE</span>}</td>
                        <td style={{ ...td, color: e.bucket === 'call-heavy' ? C.bull : C.bear }}>{e.bucket === 'call-heavy' ? 'Calls' : 'Puts'}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{e.callShare.toFixed(0)}%</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtUsd(e.totalPremium)}</td>
                        {data.config.horizons.map(h => (
                          <td key={h} className="tnum" style={{ ...td, textAlign: 'right', color: pnlColor(e.forward[h]) }}>{e.forward[h] == null ? '-' : fmtPct(e.forward[h])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

export function PerformanceView({ canRun }: { canRun: boolean }) {
  const [data, setData] = useState<BacktestRunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [details, setDetails] = useState<Record<string, BacktestRunDetail>>({});
  const [activeBook, setActiveBook] = useState<BookId | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchBacktestRuns());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load replays');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = data?.job?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  // After a replay finishes, jump back to the newest set.
  const lastFinished = data?.job?.finishedAt;
  useEffect(() => { if (lastFinished) setSelectedIds(null); }, [lastFinished]);

  const ids = selectedIds ?? data?.latest ?? [];
  const shown = useMemo(() => (data?.runs ?? []).filter(r => ids.includes(r.id)).sort((a, b) => a.book.localeCompare(b.book)), [data, ids]);

  useEffect(() => {
    for (const r of shown) {
      if (details[r.id]) continue;
      fetchBacktestRun(r.id)
        .then(d => setDetails(prev => ({ ...prev, [r.id]: d })))
        .catch(e => setError(e instanceof Error ? e.message : 'Failed to load replay'));
    }
  }, [shown, details]);

  const book = shown.find(r => r.book === activeBook) ? activeBook! : shown[0]?.book ?? null;
  const detailByBook = Object.fromEntries(shown.filter(r => details[r.id]).map(r => [r.book, details[r.id]])) as Partial<Record<BookId, BacktestRunDetail>>;
  const range = shown[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>Performance</h2>
        <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
          Replays of the three paper books over the recorded history, after costs. Results mean little until each book has about 30 closed trades (roughly mid-November).
        </p>
      </div>

      {error && <div style={{ fontSize: '13px', color: C.bear }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: '13px', color: C.inkMute }}>Loading...</div>}

      {data && canRun && <RunReplay data={data} onStarted={load} />}
      {data && !canRun && running && (
        <div style={{ fontSize: '13px', color: C.inkMute }}>A replay is running (book {data.job?.currentBook ?? '...'}).</div>
      )}

      {data && shown.length === 0 && (
        <Card title="No saved replays yet">
          <div style={{ fontSize: '13px', color: C.inkSec }}>{canRun ? 'Run a replay above to see the books here.' : 'An admin needs to run a replay first.'}</div>
        </Card>
      )}

      {range && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '13px', color: C.inkSec }}>
            <span className="tnum">{range.date_from} → {range.date_to}</span>
            <span className="tnum">· {range.summary.sessions} sessions · rules v{range.rules_version} · start {fmtUsd(Number(range.starting_balance))} per book</span>
            {selectedIds && (
              <button onClick={() => setSelectedIds(null)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Show latest replay</button>
            )}
          </div>
          <div className="perf-books">
            {shown.map(r => <BookCard key={r.id} run={r} active={r.book === book} onClick={() => setActiveBook(r.book)} />)}
          </div>
          <Card title="Equity curve" tip="Each book's balance after every session, with open positions marked at that day's prices. The dashed line is SPY bought with the same starting balance.">
            <EquityChart details={detailByBook} books={shown.map(r => r.book)} />
          </Card>
          {book && detailByBook[book] && (
            <>
              <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 9999, background: BOOKS[book].color }} />
                {BOOKS[book].name}<InfoTip tip={BOOKS[book].tip} />
              </div>
              <BookDetail detail={detailByBook[book]!} />
            </>
          )}
        </>
      )}

      {data && <FlowStudy />}

      {data && data.runs.length > 0 && (
        <RunHistory
          runs={data.runs}
          selected={ids}
          canRun={canRun}
          onView={r => { setSelectedIds([r.id]); setActiveBook(r.book); }}
          onDeleted={() => { setSelectedIds(null); load(); }}
        />
      )}
    </div>
  );
}
