import { selectRows, selectRowsIn, updateRows, upsertRows } from '../lib/supabaseRest.js';
import { classifyFiler, parseQuarters } from './parse.js';
import { needsFacts, planSync, REMOVED_REASON, type CompanyState, type SyncMode } from './plan.js';
import { fetchCompanyFacts, fetchSubmissions, fetchTickerMap } from './secClient.js';

export interface SyncResult {
  status: 'ok' | 'partial' | 'error';
  secCalls: number;
  checked: number;
  factsFetched: string[];
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

// syncFundamentals:
//   - Requests run one at a time through the SEC client's ~4 req/s queue; a full run over ~100 filers is ~200 requests
//   - A company's last_accession only advances after its quarters are stored, so a failed download is retried next run
async function syncFundamentals(mode: SyncMode, onProgress?: (done: number, total: number, ticker: string) => void): Promise<SyncResult> {
  const [moat, known] = await Promise.all([moatTickers(), knownCompanies()]);
  const knownBy = new Map(known.map(k => [k.ticker, k]));
  const needsMap = mode !== 'new' || moat.some(t => !knownBy.has(t.toUpperCase()) || knownBy.get(t.toUpperCase())!.reason === REMOVED_REASON);
  if (!needsMap) {
    return { status: 'ok', secCalls: 0, checked: 0, factsFetched: [], quarterRows: 0, added: [], failed: [], message: 'no new moat-finder tickers' };
  }
  const secTickers = await fetchTickerMap();
  let secCalls = 1;
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
  const failed: string[] = [];
  let quarterRows = 0;
  for (const [i, c] of plan.check.entries()) {
    onProgress?.(i, plan.check.length, c.ticker);
    try {
      const cls = classifyFiler(await fetchSubmissions(c.cik));
      secCalls++;
      const prev = knownBy.get(c.ticker);
      const fetchFacts = needsFacts(prev, cls, mode);
      await upsertRows('sec_companies', [{
        ticker: c.ticker, cik: c.cik, name: c.name, status: cls.status, reason: cls.reason,
        last_accession: cls.status === 'eligible' && fetchFacts ? prev?.last_accession ?? null : cls.lastAccession,
        last_filed: cls.lastFiled, last_form: cls.lastForm, checked_at: now(),
      }], 'merge', 'ticker');
      if (!fetchFacts) continue;

      const facts = await fetchCompanyFacts(c.cik);
      secCalls++;
      const rows = parseQuarters(facts).map(q => ({ ...q, ticker: c.ticker, updated_at: now() }));
      quarterRows += await upsertRows('sec_quarters', rows, 'merge', 'ticker,period_end');
      await updateRows('sec_companies', `ticker=eq.${c.ticker}`, { last_accession: cls.lastAccession, facts_fetched_at: now() });
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
    factsFetched.length ? `refreshed ${factsFetched.length} (${factsFetched.slice(0, 20).join(', ')}${factsFetched.length > 20 ? ', ...' : ''})` : 'no new filings',
    plan.removed.length ? `removed ${plan.removed.join(', ')}` : '',
    failed.length ? `failed: ${failed.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return { status, secCalls, checked: plan.check.length, factsFetched, quarterRows, added, failed, message };
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
