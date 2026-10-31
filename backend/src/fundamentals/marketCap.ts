import { getDailyBarsWithSplits } from '../lib/yahooClient.js';
import { mapLimit, marketCapNow } from '../leaps/data.js';

// Live market caps for the Fundamentals tabs: newest SEC share count x the latest Yahoo price.

export interface SharesQuarter {
  ticker: string;
  period_end: string;
  diluted_shares: number | string | null;
}

const REFRESH_MS = 15 * 60_000;
const known = new Map<string, { cap: number | null; at: number }>();
let refreshing: Promise<void> | null = null;

// Bars are fetched from the share count's quarter end, so a split since then scales the filed count (Yahoo prices are split-adjusted).
async function refresh(jobs: [string, SharesQuarter[], string][]): Promise<void> {
  await mapLimit(jobs, 6, async ([ticker, quarters, since]) => {
    let cap: number | null = null;
    try {
      const { bars, splits } = await getDailyBarsWithSplits(ticker, { since });
      const price = bars[bars.length - 1]?.close;
      if (price) cap = marketCapNow(quarters, price, splits);
    } catch (err) {
      console.warn(`[fundamentals] price ${ticker}:`, err instanceof Error ? err.message : err);
    }
    known.set(ticker, { cap, at: Date.now() });
  });
}

// marketCaps:
//   - ~100 Yahoo requests take ~10 s, so the request waits only for tickers never priced in this process (first load after a restart)
//   - Caps older than 15 minutes are served as they are while one background refresh runs; a failed price is kept as null until then
export async function marketCaps(byTicker: Map<string, SharesQuarter[]>): Promise<Map<string, number | null>> {
  const jobs: [string, SharesQuarter[], string][] = [];
  let missing = false;
  for (const [ticker, quarters] of byTicker) {
    const withShares = quarters.filter(q => q.diluted_shares != null && Number(q.diluted_shares) > 0);
    const since = withShares[withShares.length - 1]?.period_end;
    const k = known.get(ticker);
    if (!since || (k && Date.now() - k.at < REFRESH_MS)) continue;
    if (!k) missing = true;
    jobs.push([ticker, withShares, since]);
  }
  if (jobs.length && !refreshing) refreshing = refresh(jobs).finally(() => { refreshing = null; });
  if (missing && refreshing) await refreshing;
  return new Map([...byTicker.keys()].map(t => [t, known.get(t)?.cap ?? null]));
}
