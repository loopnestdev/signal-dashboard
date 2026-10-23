import { selectRows, selectRowsIn, updateRows, upsertRows } from '../lib/supabaseRest.js';
import { parseInstanceFacts } from './instance.js';
import { classifyFiler, factAccessions, mergeFacts, parseQuarters, periodicFilingsMissing, USED_CONCEPTS } from './parse.js';
import { needsFacts, planSync, REMOVED_REASON, type CompanyState, type SyncMode } from './plan.js';
import { fetchCompanyFacts, fetchFilingInstance, fetchSubmissions, fetchTickerMap, secRequestCount } from './secClient.js';

export interface SyncResult {
  status: 'ok' | 'partial' | 'error';
  secCalls: number;
  checked: number;
  factsFetched: string[];
  lagging: string[];
  quarterRows: number;
  added: string[];
  failed: string[];
  message: string;
}

export async function moatTickers(): Promise<string[]> {
  const rows = await selectRowsIn<{ ticker_symbol: string }>('moat', 'research_reports', 'select=ticker_symbol&order=ticker_symbol');
  return rows.map(r => r.ticker_symbol);
}

export const knownCompanies = () =>
  selectRows<CompanyState>('sec_companies', 'select=ticker,status,reason,last_accession,facts_fetched_at&order=ticker');

// Newest filings missing from companyfacts that are read from EDGAR directly per company per run.
const MAX_INSTANCE_FILLS = 2;

// syncFundamentals:
//   - Requests run one at a time through the SEC client's ~4 req/s queue; a full run over ~100 filers is ~200 requests
//   - last_accession only advances once companyfacts contains that filing, so a failed download or SEC's companyfacts lag is retried next run
//   - While companyfacts lags, the missing 10-Q/10-K figures are read from the filing's own XBRL instance on EDGAR
async function syncFundamentals(mode: SyncMode, onProgress?: (done: number, total: number, ticker: string) => void): Promise<SyncResult> {
  const [moat, known] = await Promise.all([moatTickers(), knownCompanies()]);
  const knownBy = new Map(known.map(k => [k.ticker, k]));
  const needsMap = mode !== 'new' || moat.some(t => !knownBy.has(t.toUpperCase()) || knownBy.get(t.toUpperCase())!.reason === REMOVED_REASON);
  if (!needsMap) {
    return { status: 'ok', secCalls: 0, checked: 0, factsFetched: [], lagging: [], quarterRows: 0, added: [], failed: [], message: 'no new moat-finder tickers' };
  }
  const startRequests = secRequestCount();
  const secTickers = await fetchTickerMap();
  const plan = planSync(moat, known, secTickers, mode);
  const now = () => new Date().toISOString();
  const added = [...plan.exclude, ...plan.check].map(p => p.ticker).filter(t => !knownBy.has(t));

  if (plan.exclude.length) {
    await upsertRows('sec_companies', plan.exclude.map(e => ({
      ticker: e.ticker, cik: e.cik, name: e.name, status: 'excluded', reason: e.reason, checked_at: now(),
    })), 'merge', 'ticker');
  }
  if (plan.removed.length) {
    await updateRows('sec_companies', `ticker=in.(${plan.removed.map(t => `"${t}"`).join(',')})`, { status: 'excluded', reason: REMOVED_REASON });
  }

  const factsFetched: string[] = [];
  const lagging: string[] = [];
  const failed: string[] = [];
  let quarterRows = 0;
  for (const [i, c] of plan.check.entries()) {
    onProgress?.(i, plan.check.length, c.ticker);
    try {
      const submissions = await fetchSubmissions(c.cik);
      const cls = classifyFiler(submissions);
      const prev = knownBy.get(c.ticker);
      const fetchFacts = needsFacts(prev, cls, mode);
      await upsertRows('sec_companies', [{
        ticker: c.ticker, cik: c.cik, name: c.name, status: cls.status, reason: cls.reason,
        last_accession: cls.status === 'eligible' && fetchFacts ? prev?.last_accession ?? null : cls.lastAccession,
        last_filed: cls.lastFiled, last_form: cls.lastForm, checked_at: now(),
      }], 'merge', 'ticker');
      if (!fetchFacts) continue;

      let facts = await fetchCompanyFacts(c.cik);
      const { accessions, latestFiled } = factAccessions(facts);
      const caughtUp = cls.lastAccession != null && accessions.has(cls.lastAccession);
      if (!caughtUp) {
        lagging.push(c.ticker);
        for (const filing of periodicFilingsMissing(submissions, accessions, latestFiled).slice(0, MAX_INSTANCE_FILLS)) {
          const xml = await fetchFilingInstance(c.cik, filing.accession, filing.primaryDocument);
          if (xml) facts = mergeFacts(facts, parseInstanceFacts(xml, filing, USED_CONCEPTS));
        }
      }
      const rows = parseQuarters(facts).map(q => ({ ...q, ticker: c.ticker, updated_at: now() }));
      quarterRows += await upsertRows('sec_quarters', rows, 'merge', 'ticker,period_end');
      // Not caught up -> no accession, so the next daily run downloads again until companyfacts has the filing.
      await updateRows('sec_companies', `ticker=eq.${c.ticker}`, { last_accession: caughtUp ? cls.lastAccession : null, facts_fetched_at: now() });
      factsFetched.push(c.ticker);
    } catch (err) {
      failed.push(c.ticker);
      console.warn(`[fundamentals] ${c.ticker}:`, err instanceof Error ? err.message : err);
    }
  }
  onProgress?.(plan.check.length, plan.check.length, '');

  const status = failed.length === 0 ? 'ok' : failed.length === plan.check.length ? 'error' : 'partial';
  const message = [
    `${mode}: ${plan.check.length} checked, ${plan.exclude.length} excluded without lookup`,
    added.length ? `added ${added.join(', ')}` : '',
    lagging.length ? `companyfacts behind EDGAR (read from filings): ${lagging.join(', ')}` : '',
    factsFetched.length ? `refreshed ${factsFetched.length} (${factsFetched.slice(0, 20).join(', ')}${factsFetched.length > 20 ? ', ...' : ''})` : 'no new filings',
    plan.removed.length ? `removed ${plan.removed.join(', ')}` : '',
    failed.length ? `failed: ${failed.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return { status, secCalls: secRequestCount() - startRequests, checked: plan.check.length, factsFetched, lagging, quarterRows, added, failed, message };
}

// One sync at a time per process: the collector's daily run, a page-load 'new' check and an admin full resync share it.
export interface SyncJob {
  state: 'running' | 'done' | 'failed';
  mode: SyncMode;
  startedAt: string;
  finishedAt: string | null;
  done: number;
  total: number;
  current: string | null;
  result: SyncResult | null;
  error: string | null;
}

let job: SyncJob | null = null;
let running: Promise<SyncResult> | null = null;

export const currentSync = (): SyncJob | null => job;

export function startSync(mode: SyncMode): { job: SyncJob; promise: Promise<SyncResult> } | null {
  if (running) return null;
  const j: SyncJob = { state: 'running', mode, startedAt: new Date().toISOString(), finishedAt: null, done: 0, total: 0, current: null, result: null, error: null };
  job = j;
  const promise = syncFundamentals(mode, (done, total, ticker) => { j.done = done; j.total = total; j.current = ticker || null; });
  running = promise;
  promise
    .then(r => { j.result = r; j.state = 'done'; })
    .catch(err => { j.error = err instanceof Error ? err.message : String(err); j.state = 'failed'; console.warn('[fundamentals] sync failed:', err); })
    .finally(() => { j.finishedAt = new Date().toISOString(); j.current = null; running = null; });
  return { job: j, promise };
}
