import { isUsTickerFormat, type Classification } from './parse.js';

export interface CompanyState {
  ticker: string;
  status: 'eligible' | 'excluded' | 'pending';
  reason: string | null;
  last_accession: string | null;
  facts_fetched_at: string | null;
}

export type SyncMode = 'new' | 'daily' | 'full';

export interface SyncPlan {
  check: { ticker: string; cik: number; name: string }[];   // need a submissions request
  exclude: { ticker: string; reason: string; cik: number | null; name: string | null }[];  // decided without SEC filing data
  removed: string[];                                          // no longer in moat-finder
}

export const NON_US_REASON = 'non-US listing';
export const NOT_SEC_REASON = 'not in SEC ticker list (non-US or not an SEC filer)';
export const REMOVED_REASON = 'removed from moat-finder';

// planSync:
//   - 'new' only looks at moat tickers never seen before or re-added after removal (what a page load triggers)
//   - 'daily' and 'full' re-check every moat ticker; a ticker that drops out of moat-finder is excluded but keeps its quarters
//   - Exchange-suffixed tickers and tickers SEC does not list are excluded without any per-company request
export function planSync(
  moatTickers: string[],
  known: CompanyState[],
  secTickers: Map<string, { cik: number; name: string }>,
  mode: SyncMode,
): SyncPlan {
  const knownByTicker = new Map(known.map(k => [k.ticker, k]));
  const moat = [...new Set(moatTickers.map(t => t.trim().toUpperCase()).filter(Boolean))].sort();
  const plan: SyncPlan = { check: [], exclude: [], removed: [] };
  for (const ticker of moat) {
    const prev = knownByTicker.get(ticker);
    if (mode === 'new' && prev && prev.reason !== REMOVED_REASON) continue;
    if (!isUsTickerFormat(ticker)) {
      plan.exclude.push({ ticker, reason: NON_US_REASON, cik: null, name: null });
      continue;
    }
    const sec = secTickers.get(ticker);
    if (!sec) plan.exclude.push({ ticker, reason: NOT_SEC_REASON, cik: null, name: null });
    else plan.check.push({ ticker, ...sec });
  }
  if (mode !== 'new') {
    const inMoat = new Set(moat);
    plan.removed = known.filter(k => !inMoat.has(k.ticker) && k.reason !== REMOVED_REASON).map(k => k.ticker);
  }
  return plan;
}

// Company facts (~2-4 MB) are downloaded only when a new 10-Q/10-K appeared, the last download never happened,
// or a full resync was asked for.
export function needsFacts(prev: CompanyState | undefined, cls: Classification, mode: SyncMode): boolean {
  if (cls.status !== 'eligible') return false;
  if (mode === 'full' || !prev?.facts_fetched_at) return true;
  return prev.last_accession !== cls.lastAccession;
}
