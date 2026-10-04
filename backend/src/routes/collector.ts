import { Router } from 'express';
import { getFromCache, setToCache } from '../lib/cache.js';
import { pendingCalls, utcDay } from '../lib/apiUsage.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { countRows, isSupabaseAdminConfigured, selectRows } from '../lib/supabaseRest.js';
import { isCollectorEnabled } from '../collector/index.js';
import { activeSymbols } from '../collector/jobs.js';
import { JOB_NAMES, estimatedSignaCallsPerDay, jobSlots } from '../collector/schedule.js';
import { scannerConfig } from '../collector/scanner.js';

const router = Router();

const DATASETS = [
  { table: 'dp_prints', label: 'Dark pool prints (raw, 60 days)' },
  { table: 'dp_daily', label: 'Dark pool daily rollups' },
  { table: 'flow_alerts', label: 'Options flow alerts' },
  { table: 'curated_flow', label: 'Curated flow events' },
  { table: 'gex_daily', label: 'GEX snapshots' },
  { table: 'signal_snapshots', label: 'Signa signal snapshots' },
  { table: 'option_quotes', label: 'Option quotes' },
  { table: 'raw_flow', label: 'Large prints (market-wide)' },
  { table: 'scanner_candidates', label: 'Scanner candidates' },
];

interface RunRow {
  job: string;
  trade_date: string;
  started_at: string;
  status: string;
  api_calls: number;
  rows_written: number;
  message: string | null;
}

const fmtSlot = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

router.get('/collector/status', async (_req, res) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'Collector storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  const cached = getFromCache<object>('collector-status');
  if (cached) return res.json(cached);

  try {
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const [symbols, runs, usage, counts] = await Promise.all([
      activeSymbols(),
      selectRows<RunRow>('collector_runs', `select=job,trade_date,started_at,status,api_calls,rows_written,message&started_at=gte.${since}&order=started_at.desc&limit=1000`),
      selectRows<{ day: string; source: string; calls: number }>('api_usage', 'select=day,source,calls&order=day.desc&limit=60'),
      Promise.all(DATASETS.map(async d => ({ ...d, rows: await countRows(d.table).catch(() => null) }))),
    ]);

    const today = toEtClock(new Date()).date;
    const jobs = JOB_NAMES.map(job => {
      const last = runs.find(r => r.job === job) ?? null;
      return { job, slotsEt: jobSlots(job, today).map(fmtSlot), lastRun: last };
    });

    const byDate = new Map<string, { trade_date: string; rows: number; calls: number; errors: number }>();
    for (const r of runs) {
      const d = byDate.get(r.trade_date) ?? { trade_date: r.trade_date, rows: 0, calls: 0, errors: 0 };
      d.rows += r.rows_written;
      d.calls += r.api_calls;
      if (r.status === 'error') d.errors++;
      byDate.set(r.trade_date, d);
    }

    const day = utcDay();
    const signaToday = (usage.find(u => u.day === day && u.source === 'signa')?.calls ?? 0) + pendingCalls('signa');

    const payload = {
      enabled: isCollectorEnabled(),
      symbols,
      usage: {
        utcDay: day,
        signaToday,
        limit: Number(process.env.SIGNA_DAILY_LIMIT ?? 1000),
        reserve: Number(process.env.SIGNA_RESERVE_CALLS ?? 200),
        collectorEstimatePerDay: estimatedSignaCallsPerDay(symbols.length, scannerConfig().dpLookupsPerRun),
        history: usage.filter(u => u.source === 'signa').map(u => ({ day: u.day, calls: u.calls })).reverse(),
      },
      jobs,
      datasets: counts,
      daily: [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date)),
      recentErrors: runs.filter(r => r.status === 'error' || r.status === 'partial').slice(0, 10),
    };
    setToCache('collector-status', payload, 60);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'status failed';
    if (message.includes('PGRST205')) {
      return res.status(503).json({ error: 'Collector tables not found - run supabase/migrations/20261004_data_collector.sql in the Supabase SQL editor' });
    }
    console.warn('[collector] status failed:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
