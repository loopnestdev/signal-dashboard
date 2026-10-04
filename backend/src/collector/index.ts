import { flushApiUsage } from '../lib/apiUsage.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { isSupabaseAdminConfigured } from '../lib/supabaseRest.js';
import { runJob } from './jobs.js';
import { dueJobs } from './schedule.js';

const TICK_MS = 30_000;
const USAGE_FLUSH_MS = 5 * 60_000;

export function isCollectorEnabled(): boolean {
  return process.env.COLLECTOR_ENABLED === 'true' && isSupabaseAdminConfigured() && Boolean(process.env.SIGNA_API_KEY);
}

// startCollector:
//   - API usage is flushed whenever Supabase admin is configured, so dashboard browsing counts toward the quota view
//   - Jobs only run when COLLECTOR_ENABLED=true; enable it on exactly one deployment (Railway) or calls are doubled
//   - Jobs run one at a time through a promise chain; a missed slot is not back-filled (Signa only serves live data)
export function startCollector(): void {
  if (isSupabaseAdminConfigured()) {
    setInterval(() => void flushApiUsage(), USAGE_FLUSH_MS).unref();
  }
  if (!isCollectorEnabled()) {
    console.log('[collector] disabled (set COLLECTOR_ENABLED=true with SUPABASE_SERVICE_ROLE_KEY + SIGNA_API_KEY to enable)');
    return;
  }

  const ran = new Set<string>();
  let currentDate = '';
  let queue: Promise<unknown> = Promise.resolve();

  const tick = () => {
    const clock = toEtClock(new Date());
    if (clock.date !== currentDate) {
      ran.clear();
      currentDate = clock.date;
    }
    for (const due of dueJobs(clock.date, clock.minute, ran)) {
      ran.add(due.key);
      queue = queue.then(() => runJob(due.job, clock.date)).catch(err => console.warn('[collector] job crashed:', err));
    }
  };

  console.log('[collector] enabled');
  tick();
  setInterval(tick, TICK_MS).unref();
}
