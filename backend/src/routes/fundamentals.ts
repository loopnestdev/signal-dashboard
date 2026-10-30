import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import { getFromCache, setToCache } from '../lib/cache.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { isSupabaseAdminConfigured, selectAll, selectRows } from '../lib/supabaseRest.js';
import { fcfFor, type FcfRow, type StoredCashQuarter } from '../fundamentals/fcf.js';
import { leverageFor, rankLeverage, type LeverageRow, type StoredQuarter } from '../fundamentals/leverage.js';
import { REMOVED_REASON } from '../fundamentals/plan.js';
import { secUserAgent } from '../fundamentals/secClient.js';
import { currentSync, moatTickers, startSync } from '../fundamentals/sync.js';

const router = Router();

// Stops a page that keeps polling from re-triggering a sync that keeps failing (e.g. SEC throttling this IP).
const NEW_SYNC_COOLDOWN_MS = 2 * 60_000;

interface CompanyRow {
  ticker: string;
  name: string | null;
  status: 'eligible' | 'excluded' | 'pending';
  reason: string | null;
  last_filed: string | null;
  last_form: string | null;
  checked_at: string | null;
}

interface LeverageTable {
  rows: LeverageRow[];
  stale: { ticker: string; periodEnd: string }[];
  fcf: FcfRow[] | null;
  fcfError: string | null;
  today: string;
}

const groupByTicker = <T extends { ticker: string }>(rows: T[]) => {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.ticker, [...(out.get(r.ticker) ?? []), r]);
  return out;
};

// fcfTable:
//   - Queried apart from the leverage columns so the leverage table keeps working before migration 20261031_sec_cash_flow.sql is run
//   - Companies whose latest quarter with cash flow figures is stale are left out, like the leverage table
async function fcfTable(companies: CompanyRow[], since: string, today: string): Promise<{ fcf: FcfRow[] | null; fcfError: string | null }> {
  try {
    const quarters = await selectAll<StoredCashQuarter>(
      'sec_quarters',
      `select=ticker,period_end,fiscal_year,fiscal_period,revenue,operating_cash_flow,capex,cash&period_end=gte.${since}&order=ticker,period_end`,
    );
    const byTicker = groupByTicker(quarters);
    const fcf = companies
      .filter(c => c.status === 'eligible')
      .map(c => fcfFor(c.ticker, c.name, byTicker.get(c.ticker) ?? [], today))
      .filter(r => r !== null && !r.stale) as FcfRow[];
    return { fcf, fcfError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    if (message.includes('42703') || message.includes('operating_cash_flow')) {
      return { fcf: null, fcfError: 'Cash flow columns not found - run supabase/migrations/20261031_sec_cash_flow.sql, then "Re-download all"' };
    }
    throw err;
  }
}

router.use('/fundamentals', (_req, res, next) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'Fundamentals storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  next();
});

// GET /api/fundamentals/leverage:
//   - Serves both Fundamentals tabs: operating leverage (`rows`) and free cash flow (`fcf`)
//   - Everything is read from the local sec_* tables; SEC is never called while the request waits
//   - A moat-finder ticker that has never been classified starts a background 'new' sync, and the page polls until it lands
router.get('/fundamentals/leverage', async (_req, res) => {
  try {
    const moat = getFromCache<string[]>('fundamentals-moat') ?? await moatTickers();
    setToCache('fundamentals-moat', moat, 60);
    const moatSet = new Set(moat.map(t => t.toUpperCase()));
    // sec_companies also holds the LEAPS candidate list; this page shows moat-finder tickers only.
    const companies = (await selectRows<CompanyRow>('sec_companies', 'select=ticker,name,status,reason,last_filed,last_form,checked_at&order=ticker'))
      .filter(c => moatSet.has(c.ticker));
    const known = new Map(companies.map(c => [c.ticker, c]));
    const unseen = [...new Set(moat.map(t => t.toUpperCase()))].filter(t => !known.has(t) || known.get(t)!.reason === REMOVED_REASON);
    const last = currentSync();
    const cooledDown = !last?.finishedAt || Date.now() - Date.parse(last.finishedAt) > NEW_SYNC_COOLDOWN_MS;
    if (unseen.length && secUserAgent() && cooledDown) startSync('new');

    const sync = currentSync();
    const cacheKey = `fundamentals-leverage-${sync?.finishedAt ?? 'none'}`;
    let table = sync?.state === 'running' ? undefined : getFromCache<LeverageTable>(cacheKey);
    if (!table) {
      const today = toEtClock(new Date()).date;
      const since = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
      const quarters = await selectAll<StoredQuarter>(
        'sec_quarters',
        `select=ticker,period_end,fiscal_year,fiscal_period,revenue,operating_income,derived,op_computed&period_end=gte.${since}&order=ticker,period_end`,
      );
      const byTicker = groupByTicker(quarters);
      const all = companies
        .filter(c => c.status === 'eligible')
        .map(c => leverageFor(c.ticker, c.name, byTicker.get(c.ticker) ?? [], today))
        .filter(r => r !== null);
      // A stale latest quarter (pre-revenue filer, overdue 10-Q) would be ranked on old numbers, so it is listed as skipped.
      const stale = all.filter(r => r.stale).map(r => ({ ticker: r.ticker, periodEnd: r.periodEnd }));
      table = { rows: rankLeverage(all.filter(r => !r.stale)), stale, ...(await fcfTable(companies, since, today)), today };
      if (sync?.state !== 'running') setToCache(cacheKey, table, 60);
    }

    const ranked = new Set(table.rows.map(r => r.ticker));
    const staleEnd = new Map(table.stale.map(s => [s.ticker, s.periodEnd]));
    const skipReason = (c: CompanyRow) =>
      c.reason ?? (staleEnd.has(c.ticker)
        ? `latest quarter with revenue + operating income ended ${staleEnd.get(c.ticker)}`
        : 'no revenue / operating income in SEC XBRL yet');
    res.json({
      rows: table.rows,
      fcf: table.fcf,
      fcfError: table.fcfError,
      today: table.today,
      skipped: companies
        .filter(c => c.status !== 'eligible' || !ranked.has(c.ticker))
        .filter(c => c.reason !== REMOVED_REASON)
        .map(c => ({ ticker: c.ticker, name: c.name, status: c.status, reason: skipReason(c) })),
      unseen,
      moatCount: moat.length,
      lastChecked: companies.map(c => c.checked_at).filter(Boolean).sort().pop() ?? null,
      sync,
      secConfigured: secUserAgent() !== null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'query failed';
    if (message.includes('PGRST205')) {
      return res.status(503).json({ error: 'Fundamentals tables not found - run supabase/migrations/20261021_sec_fundamentals.sql' });
    }
    console.warn('[fundamentals] query failed:', message);
    res.status(500).json({ error: message });
  }
});

// POST /api/fundamentals/sync {mode}: 'daily' re-checks every ticker for new filings; 'full' re-downloads every
// company's facts (after a quarter's reporting season, or to pick up restatements). Runs in the background.
router.post('/fundamentals/sync', requireAdmin, (req, res) => {
  const mode = req.body?.mode === 'full' ? 'full' : 'daily';
  if (!secUserAgent()) return res.status(503).json({ error: 'SEC_USER_AGENT is not set on the server' });
  const started = startSync(mode);
  if (!started) return res.status(409).json({ error: 'A fundamentals sync is already running', sync: currentSync() });
  res.status(202).json({ sync: started.job });
});

export default router;
