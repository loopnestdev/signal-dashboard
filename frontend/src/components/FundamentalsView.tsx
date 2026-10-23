import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { C } from '../lib/colors';
import { fetchLeverage, startFundamentalsSync } from '../lib/api';
import { fmtMargin, fmtMoney, fmtRatioPct, sortLeverage, type LeverageSortKey } from '../lib/fundamentals';
import { supabase } from '../lib/supabase';
import type { LeverageResponse, LeverageRow } from '../types/market';
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
  { key: 'opMargin', title: 'Op margin (yr ago)', tip: 'Operating income as a share of revenue this quarter, and in brackets the same quarter a year earlier.', align: 'right' },
  { key: 'revYoY', title: 'Rev YoY', tip: 'Revenue growth vs the same quarter a year earlier.', align: 'right' },
  { key: 'incrementalMargin', title: 'Incremental margin', tip: 'Of each extra dollar of revenue vs a year ago, how much became operating income. 90% means costs barely grew while sales did. Blank when revenue did not grow.', align: 'right' },
  { key: 'dol', title: 'DOL', tip: 'Degree of operating leverage: % growth in operating income divided by % growth in revenue. 3x = profit grew three times as fast as sales. n/m when last year\'s operating income was a loss or under 1% of revenue, or revenue fell.', align: 'right' },
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

export function FundamentalsView({ canSync, onAnalyze }: { canSync: boolean; onAnalyze: (ticker: string) => void }) {
  const [data, setData] = useState<LeverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: LeverageSortKey; asc: boolean }>({ key: 'operatingIncome', asc: false });
  const [open, setOpen] = useState<string | null>(null);

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
          Operating leverage of the stocks researched in moat-finder: how much of each company's revenue growth turned into operating profit in its latest quarter, from SEC filings.
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
              <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
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
                          <td className="tnum" style={{ ...td, textAlign: 'right' }}>
                            <span style={{ color: C.ink }}>{fmtMargin(r.opMargin)}</span>{' '}
                            <span style={{ color: signColor(change), fontSize: '12px' }}>({fmtMargin(r.opMarginYearAgo)})</span>
                          </td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: signColor(r.revYoY) }}>{fmtRatioPct(r.revYoY, true)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', color: C.ink }}>{fmtRatioPct(r.incrementalMargin)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right' }}>{r.dol == null ? 'n/m' : `${r.dol.toFixed(1)}x`}</td>
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

      {data && skippedByReason.length > 0 && (
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
