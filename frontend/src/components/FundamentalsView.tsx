import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { C } from '../lib/colors';
import { fetchLeverage, startFundamentalsSync } from '../lib/api';
import { fmtMargin, fmtMoney, fmtRatioPct, growingFcf, sortFcf, sortLeverage, type FcfSortKey, type LeverageSortKey } from '../lib/fundamentals';
import { supabase } from '../lib/supabase';
import type { FcfRow, LeverageResponse, LeverageRow } from '../types/market';
import { InfoTip } from './InfoTip';

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };
const th = { ...label, textAlign: 'left' as const, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const };
const td = { fontSize: '13px', color: C.inkSec, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const };
const signColor = (n: number | null) => (n == null || n === 0 ? C.inkSec : n > 0 ? C.bull : C.bear);

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

const COLUMNS: { key: LeverageSortKey; title: string; tip: string; align?: 'right' }[] = [
  { key: 'ticker', title: 'Ticker', tip: 'US-listed moat-finder tickers that file 10-Q/10-K with the SEC. Click a ticker to open it on the Dashboard; click the row for its last 8 quarters.' },
  { key: 'operatingIncome', title: 'Op income', tip: 'Operating income of the latest reported quarter (revenue minus operating costs), from the SEC filing.', align: 'right' },
  { key: 'marketCap', title: 'Mkt cap', tip: 'Market cap now: the newest share count filed with the SEC (diluted weighted average, adjusted for any split since) times the current share price. Refreshed every 15 minutes.', align: 'right' },
  { key: 'opMargin', title: 'Op margin (yr ago)', tip: 'Operating income as a share of revenue this quarter, and in brackets the same quarter a year earlier.', align: 'right' },
  { key: 'revYoY', title: 'Rev YoY', tip: 'Revenue growth vs the same quarter a year earlier.', align: 'right' },
  { key: 'incrementalMargin', title: 'Incremental margin', tip: 'Of each extra dollar of revenue vs a year ago, how much became operating income. 90% means costs barely grew while sales did. Blank when revenue did not grow.', align: 'right' },
  { key: 'dol', title: 'DOL', tip: 'Degree of operating leverage: % growth in operating income divided by % growth in revenue. 3x = profit grew three times as fast as sales. n/m when last year\'s operating income was a loss or under 1% of revenue, or revenue fell.', align: 'right' },
  { key: 'fcfYield', title: 'FCF yield', tip: 'Free cash flow yield: the last 4 quarters of free cash flow (operating cash flow minus capex) divided by market cap. 5% means the company generates 5 cents of free cash a year per dollar of share value. Blank without 4 consecutive quarters of cash flow figures.', align: 'right' },
  { key: 'rank', title: 'Leverage rank', tip: 'Rank by incremental margin (ties broken by margin expansion) among companies whose revenue grew. 1 = the most operating leverage in this list.', align: 'right' },
];

function History({ row }: { row: LeverageRow }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
      {row.history.map(q => (
        <div key={q.end} style={{ minWidth: 104, background: C.canvasSoft, borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '11px', color: C.inkMute }}>{q.label ?? q.end}</div>
          <div className="tnum" style={{ fontSize: '12px', color: C.inkSec, marginTop: 2 }}>Rev {fmtMoney(q.revenue)}</div>
          <div className="tnum" style={{ fontSize: '12px', color: C.inkSec }}>Op {fmtMoney(q.operatingIncome)}</div>
          <div className="tnum" style={{ fontSize: '13px', fontWeight: 600, color: signColor(q.margin) }}>{fmtMargin(q.margin)}</div>
        </div>
      ))}
    </div>
  );
}

function SyncControls({ data, onStarted }: { data: LeverageResponse; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = data.sync?.state === 'running';
  const start = async (mode: 'daily' | 'full') => {
    setBusy(true);
    setError(null);
    try {
      await startFundamentalsSync(mode, await token());
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setBusy(false);
    }
  };
  const btn = (primary: boolean) => ({
    padding: '7px 14px', borderRadius: 9999, fontSize: '13px', fontWeight: 600, cursor: running || busy ? 'default' : 'pointer',
    border: primary ? 'none' : `1px solid ${C.border}`,
    background: running || busy ? C.canvasSoft : primary ? C.primary : C.canvas,
    color: running || busy ? C.inkMute : primary ? C.onPrimary : C.inkSec,
  });
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button disabled={running || busy || !data.secConfigured} onClick={() => start('daily')} style={btn(true)}>Check for new filings</button>
      <button disabled={running || busy || !data.secConfigured} onClick={() => start('full')} style={btn(false)}>Re-download all</button>
      <InfoTip tip="Check for new filings: looks at every moat-finder ticker's newest SEC filing and downloads figures only where a new 10-Q/10-K appeared (the same check runs automatically at 07:00 New York time on trading days). Re-download all: fetches every company's full history again, e.g. after earnings season or to pick up restated numbers. Both are spaced to about 4 SEC requests per second." />
      {error && <span style={{ fontSize: '12px', color: C.bear }}>{error}</span>}
    </div>
  );
}

type Tab = 'leverage' | 'fcf';
const TABS: { id: Tab; label: string }[] = [
  { id: 'leverage', label: 'Operating leverage' },
  { id: 'fcf', label: 'Free cash flow' },
];

const FCF_COLUMNS: { key: FcfSortKey; title: string; tip: string; align?: 'right' }[] = [
  { key: 'ticker', title: 'Ticker', tip: 'US-listed moat-finder tickers that file 10-Q/10-K with the SEC. Click a ticker to open it on the Dashboard; click the row for its last 8 quarters.' },
  { key: 'fcf', title: 'FCF', tip: 'Free cash flow of the latest reported quarter: cash from operations minus capital expenditure (purchases of property and equipment).', align: 'right' },
  { key: 'fcfPrev', title: 'Prev quarter', tip: 'Free cash flow of the quarter just before.', align: 'right' },
  { key: 'qoq', title: 'QoQ', tip: 'Change in free cash flow vs the previous quarter. n/m when the previous quarter was zero or negative (the % is meaningless; the row still counts as growing if FCF went up).', align: 'right' },
  { key: 'yoy', title: 'YoY', tip: 'Change vs the same quarter a year earlier. Quarter-on-quarter cash flow is seasonal for many companies (bonuses, tax payments, inventory builds), so this is the steadier read.', align: 'right' },
  { key: 'streak', title: 'Streak', tip: 'How many quarters in a row free cash flow has risen, ending with the latest quarter.', align: 'right' },
  { key: 'fcfMargin', title: 'FCF margin', tip: 'Free cash flow as a share of revenue in the same quarter.', align: 'right' },
  { key: 'cash', title: 'Cash & equiv.', tip: 'Cash and cash equivalents on the balance sheet at the end of the latest quarter (excludes longer-dated marketable securities).', align: 'right' },
  { key: 'marketCap', title: 'Mkt cap', tip: 'Market cap now: the newest share count filed with the SEC (diluted weighted average, adjusted for any split since) times the current share price. Refreshed every 15 minutes.', align: 'right' },
  { key: 'fcfYield', title: 'FCF yield', tip: 'Free cash flow yield: the last 4 quarters of free cash flow (operating cash flow minus capex) divided by market cap. 5% means the company generates 5 cents of free cash a year per dollar of share value. Blank without 4 consecutive quarters of cash flow figures.', align: 'right' },
];

const FILTERS: { min: number; label: string }[] = [
  { min: 1, label: 'Growing QoQ' },
  { min: 2, label: '2+ quarters' },
  { min: 3, label: '3+ quarters' },
  { min: 0, label: 'All' },
];

function FcfHistory({ row }: { row: FcfRow }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0' }}>
      {row.history.map(q => (
        <div key={q.end} style={{ minWidth: 112, background: C.canvas, borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '11px', color: C.inkMute }}>{q.label ?? q.end}</div>
          <div className="tnum" style={{ fontSize: '13px', fontWeight: 600, color: signColor(q.fcf) }}>FCF {fmtMoney(q.fcf)}</div>
          <div className="tnum" style={{ fontSize: '12px', color: C.inkSec, marginTop: 2 }}>OCF {fmtMoney(q.operatingCashFlow)}</div>
          <div className="tnum" style={{ fontSize: '12px', color: C.inkSec }}>Capex {q.capex == null ? '-' : fmtMoney(q.capex)}</div>
          <div className="tnum" style={{ fontSize: '12px', color: C.inkMute }}>Cash {q.cash == null ? '-' : fmtMoney(q.cash)}</div>
        </div>
      ))}
    </div>
  );
}

function FcfTable({ data, canSync, onAnalyze }: { data: LeverageResponse; canSync: boolean; onAnalyze: (ticker: string) => void }) {
  const [sort, setSort] = useState<{ key: FcfSortKey; asc: boolean }>({ key: 'qoq', asc: false });
  const [minStreak, setMinStreak] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const all = data.fcf;
  const rows = useMemo(() => sortFcf(minStreak ? growingFcf(all, minStreak) : all, sort.key, sort.asc), [all, minStreak, sort]);
  const clickSort = (key: FcfSortKey) => setSort(s => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === 'ticker' }));
  const pill = (active: boolean) => ({
    padding: '4px 12px', borderRadius: 9999, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? C.primary : C.border}`, background: active ? C.primary : C.canvas, color: active ? C.onPrimary : C.inkSec,
  });

  return (
    <Card
      title="Free cash flow"
      tip="Free cash flow = cash from operations minus capital expenditure, from the cash flow statement in SEC filings. Filings report cash flow year to date, so each quarter is the difference between two year-to-date totals (Q4 = full year minus nine months)."
      right={
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(f => <button key={f.min} onClick={() => setMinStreak(f.min)} style={pill(minStreak === f.min)}>{f.label}</button>)}
        </div>
      }
    >
      {all.length === 0 ? (
        <div style={{ fontSize: '13px', color: C.inkSec }}>
          No cash flow figures stored yet.{canSync ? ' Use "Re-download all" once to load them for every company.' : ''}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '12px', color: C.inkMute, marginBottom: 8 }}>
            {rows.length} of {all.length} companies{minStreak ? ` with free cash flow up ${minStreak > 1 ? `${minStreak}+ quarters in a row` : 'vs the previous quarter'}` : ''}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  {FCF_COLUMNS.map(c => (
                    <th key={c.key} style={{ ...th, textAlign: c.align ?? 'left', cursor: 'pointer', color: sort.key === c.key ? C.ink : C.inkMute }} onClick={() => clickSort(c.key)}>
                      {c.title}{sort.key === c.key ? (sort.asc ? ' ↑' : ' ↓') : ''}<InfoTip tip={c.tip} />
                    </th>
                  ))}
                  <th style={th}>Quarter<InfoTip tip="Fiscal quarter and the date it ended. ‡ = the company tags no capital expenditure, so free cash flow equals operating cash flow." /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.ticker}>
                    <tr onClick={() => setOpen(o => (o === r.ticker ? null : r.ticker))} style={{ cursor: 'pointer', background: open === r.ticker ? C.canvasSoft : undefined }}>
                      <td className="tnum" style={{ ...td, color: C.inkMute }}>{i + 1}</td>
                      <td style={td} title={r.name ?? undefined}>
                        <button onClick={e => { e.stopPropagation(); onAnalyze(r.ticker); }} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {r.ticker}
                        </button>
                      </td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.fcf) }}>{fmtMoney(r.fcf)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.fcfPrev == null ? '-' : fmtMoney(r.fcfPrev)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.qoq ?? (r.growing ? 1 : null)), fontWeight: 600 }}>
                        {r.qoq != null ? fmtRatioPct(r.qoq, true) : r.fcfPrev != null ? 'n/m' : '-'}
                      </td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.yoy) }}>{fmtRatioPct(r.yoy, true)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: r.streak >= 2 ? C.ink : C.inkSec, fontWeight: r.streak >= 2 ? 700 : 400 }}>{r.streak}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtMargin(r.fcfMargin)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: C.ink }}>{r.cash == null ? '-' : fmtMoney(r.cash)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.marketCap == null ? '-' : fmtMoney(r.marketCap)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.fcfYield), fontWeight: 600 }} title={r.ttmFcf == null ? undefined : `Last 4 quarters FCF ${fmtMoney(r.ttmFcf)}`}>{fmtMargin(r.fcfYield)}</td>
                      <td className="tnum" style={{ ...td, color: C.inkMute, fontSize: '12px' }}>{r.periodLabel ?? ''}{r.noCapex ? '‡' : ''} · {r.periodEnd}</td>
                    </tr>
                    {open === r.ticker && (
                      <tr>
                        <td colSpan={FCF_COLUMNS.length + 2} style={{ ...td, whiteSpace: 'normal', background: C.canvasSoft }}>
                          <div style={{ fontSize: '12px', color: C.inkMute, marginBottom: 6 }}>{r.name} · last {r.history.length} quarters (free cash flow, operating cash flow, capex, cash)</div>
                          <FcfHistory row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

export function FundamentalsView({ canSync, onAnalyze }: { canSync: boolean; onAnalyze: (ticker: string) => void }) {
  const [data, setData] = useState<LeverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: LeverageSortKey; asc: boolean }>({ key: 'operatingIncome', asc: false });
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('leverage');

  const load = useCallback(async () => {
    try {
      setData(await fetchLeverage());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fundamentals');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = data?.sync?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const rows = useMemo(() => sortLeverage(data?.rows ?? [], sort.key, sort.asc), [data, sort]);
  const opOrder = useMemo(() => new Map(sortLeverage(data?.rows ?? [], 'operatingIncome').map((r, i) => [r.ticker, i + 1])), [data]);
  const skippedByReason = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of data?.skipped ?? []) m.set(s.reason, [...(m.get(s.reason) ?? []), s.ticker]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  const clickSort = (key: LeverageSortKey) =>
    setSort(s => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === 'ticker' }));

  const sync = data?.sync;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>Fundamentals</h2>
        <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
          SEC filings of the stocks researched in moat-finder: operating leverage (how much revenue growth turned into operating profit) and free cash flow growth, latest quarter.
        </p>
      </div>

      {error && <div style={{ fontSize: '13px', color: C.bear }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: '13px', color: C.inkMute }}>Loading...</div>}

      {data && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: '13px', color: C.inkSec }}>
          <span>
            {data.rows.length} ranked of {data.moatCount} moat-finder tickers
            {data.lastChecked && ` · filings checked ${new Date(data.lastChecked).toLocaleString()}`}
          </span>
          {canSync && <SyncControls data={data} onStarted={load} />}
        </div>
      )}
      {data && !data.secConfigured && (
        <div style={{ fontSize: '13px', color: C.warn }}>SEC_USER_AGENT is not set on the server, so new filings cannot be fetched. Stored quarters are still shown.</div>
      )}
      {running && sync && (
        <div style={{ fontSize: '13px', color: C.inkMute }}>
          {sync.mode === 'new' ? 'Adding new moat-finder tickers' : sync.mode === 'full' ? 'Re-downloading all companies' : 'Checking for new filings'}
          {sync.total ? ` · ${sync.done}/${sync.total}` : ''}{sync.current ? ` · ${sync.current}` : ''}...
        </div>
      )}
      {!running && sync?.state === 'failed' && <div style={{ fontSize: '13px', color: C.bear }}>Last sync failed: {sync.error}</div>}

      {data && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
          {TABS.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '9px 16px', border: 'none', borderBottom: `2px solid ${active ? C.primary : 'transparent'}`, background: 'none',
                color: active ? C.primary : C.inkMute, fontSize: '13px', fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {data && tab === 'fcf' && <FcfTable data={data} canSync={canSync} onAnalyze={onAnalyze} />}

      {data && tab === 'leverage' && (
        <Card
          title="Operating leverage"
          tip="Latest reported quarter vs the same quarter a year earlier. Companies report on different fiscal calendars, so the Quarter column shows which period each row is. Q4 is not filed on its own, so it is the annual report minus the first three quarters (marked Q4*)."
        >
          {rows.length === 0 ? (
            <div style={{ fontSize: '13px', color: C.inkSec }}>
              {running ? 'Downloading the first filings...' : canSync ? 'No quarters stored yet. Use "Re-download all" to load every company.' : 'No quarters stored yet.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    {COLUMNS.map(c => (
                      <th key={c.key} style={{ ...th, textAlign: c.align ?? 'left', cursor: 'pointer', color: sort.key === c.key ? C.ink : C.inkMute }} onClick={() => clickSort(c.key)}>
                        {c.title}{sort.key === c.key ? (sort.asc ? ' ↑' : ' ↓') : ''}<InfoTip tip={c.tip} />
                      </th>
                    ))}
                    <th style={th}>Quarter<InfoTip tip="Fiscal quarter and the date it ended. * = Q4 derived from the annual report. † = operating income computed from the income statement lines (revenue minus cost of revenue and operating expenses), because the company does not tag operating income in its filings." /></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const change = r.opMarginYearAgo == null ? null : r.opMargin - r.opMarginYearAgo;
                    const top = r.rank != null && r.rank <= 5;
                    return (
                      <Fragment key={r.ticker}>
                        <tr onClick={() => setOpen(o => (o === r.ticker ? null : r.ticker))} style={{ cursor: 'pointer', background: open === r.ticker ? C.canvasSoft : undefined }}>
                          <td className="tnum" style={{ ...td, color: C.inkMute }}>{opOrder.get(r.ticker)}</td>
                          <td style={td} title={r.name ?? undefined}>
                            <button onClick={e => { e.stopPropagation(); onAnalyze(r.ticker); }} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {r.ticker}
                            </button>
                          </td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.operatingIncome) }}>{fmtMoney(r.operatingIncome)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.marketCap == null ? '-' : fmtMoney(r.marketCap)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right' }}>
                            <span style={{ color: C.ink }}>{fmtMargin(r.opMargin)}</span>{' '}
                            <span style={{ color: signColor(change), fontSize: '12px' }}>({fmtMargin(r.opMarginYearAgo)})</span>
                          </td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.revYoY) }}>{fmtRatioPct(r.revYoY, true)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: C.ink }}>{fmtRatioPct(r.incrementalMargin)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.dol == null ? 'n/m' : `${r.dol.toFixed(1)}x`}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.fcfYield) }}>{fmtMargin(r.fcfYield)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: top ? C.ink : C.inkSec, fontWeight: top ? 700 : 400 }}>{r.rank ?? '-'}</td>
                          <td className="tnum" style={{ ...td, color: C.inkMute, fontSize: '12px' }}>
                            {r.periodLabel ?? ''}{r.derived ? '*' : ''}{r.opComputed ? '†' : ''} · {r.periodEnd}
                          </td>
                        </tr>
                        {open === r.ticker && (
                          <tr>
                            <td colSpan={COLUMNS.length + 2} style={{ ...td, whiteSpace: 'normal', background: C.canvasSoft }}>
                              <div style={{ fontSize: '12px', color: C.inkMute, marginBottom: 6 }}>{r.name} · last {r.history.length} quarters (revenue, operating income, margin)</div>
                              <History row={r} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {data && tab === 'leverage' && skippedByReason.length > 0 && (
        <Card title={`Not in the table (${data.skipped.length})`} tip="Moat-finder tickers that cannot be ranked. Non-US listings and ADRs (companies filing 20-F/40-F instead of 10-Q) are left out on purpose. The rest are re-checked every day and join the table once they file usable numbers.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {skippedByReason.map(([reason, tickers]) => (
              <div key={reason} style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.5 }}>
                <span style={{ color: C.ink, fontWeight: 600 }}>{reason}</span>
                <span className="tnum" style={{ color: C.inkMute }}> · {tickers.join(', ')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
