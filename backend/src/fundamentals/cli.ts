// Manual run: npm run fundamentals -- [new|daily|full]
//   - new:   only moat-finder tickers never classified yet
//   - daily: re-check every ticker, download facts only for new 10-Q/10-K filings (what the 07:00 ET collector job runs)
//   - full:  re-download every company's facts (initial backfill, or after an earnings season)
import 'dotenv/config';
import { flushApiUsage } from '../lib/apiUsage.js';
import { startSync } from './sync.js';
import type { SyncMode } from './plan.js';

const mode = (process.argv[2] ?? 'daily') as SyncMode;
if (!['new', 'daily', 'full'].includes(mode)) {
  console.error('Usage: npm run fundamentals -- [new|daily|full]');
  process.exit(1);
}

let lastLogged = -1;
const started = startSync(mode)!;
const timer = setInterval(() => {
  const j = started.job;
  if (j.done !== lastLogged && j.total) {
    lastLogged = j.done;
    console.log(`[fundamentals] ${j.done}/${j.total} ${j.current ?? ''}`);
  }
}, 2_000);
const result = await started.promise.catch(err => {
  console.error(err instanceof Error ? err.message : err);
  return null;
});
clearInterval(timer);
if (result) console.log(`[fundamentals] ${result.status}: ${result.message} (SEC requests: ${result.secCalls}, quarter rows: ${result.quarterRows})`);
await flushApiUsage();
process.exit(result && result.status !== 'error' ? 0 : 1);
