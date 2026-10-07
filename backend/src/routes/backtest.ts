import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { RULES_VERSION } from '../lib/settings.js';
import { deleteRows, isSupabaseAdminConfigured, selectAll, selectRows } from '../lib/supabaseRest.js';
import { getDailyBars } from '../lib/yahooClient.js';
import { barsRangeFor, benchmarkCurve, latestRunSet, parseRunRequest, type RunHeader } from '../backtest/report.js';
import { currentJob, startReplayJob } from '../backtest/runner.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_COLUMNS = 'id,created_at,book,rules_version,date_from,date_to,starting_balance,summary';

type RunRow = RunHeader & { starting_balance: number; summary: Record<string, unknown> };

function storageError(res: import('express').Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'query failed';
  if (message.includes('PGRST205')) {
    return res.status(503).json({ error: 'Backtest tables not found - run supabase/migrations/20261007_backtest_runs.sql' });
  }
  console.warn('[backtest] query failed:', message);
  return res.status(500).json({ error: message });
}

router.use('/backtest', (_req, res, next) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'Backtest storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  next();
});

router.get('/backtest/runs', async (_req, res) => {
  try {
    const [runs, [first]] = await Promise.all([
      selectRows<RunRow>('backtest_runs', `select=${RUN_COLUMNS}&order=created_at.desc&limit=60`),
      selectRows<{ trade_date: string }>('signal_snapshots', 'select=trade_date&order=trade_date.asc&limit=1'),
    ]);
    res.json({
      runs,
      latest: latestRunSet(runs).map(r => r.id),
      job: currentJob(),
      rulesVersion: RULES_VERSION,
      dataFrom: first?.trade_date ?? null,
      today: toEtClock(new Date()).date,
    });
  } catch (err) {
    storageError(res, err);
  }
});

router.get('/backtest/runs/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid run id' });
  try {
    const id = `run_id=eq.${req.params.id}`;
    const [[run], trades, equity] = await Promise.all([
      selectRows<RunRow & { skips: unknown[]; open_at_end: unknown[]; settings: unknown }>('backtest_runs', `select=*&id=eq.${req.params.id}`),
      selectAll<Record<string, unknown>>('backtest_trades', `select=*&${id}&order=trade_id`),
      selectAll<{ date: string; equity: number; cash: number; open_risk: number; open_positions: number }>('backtest_equity', `select=date,equity,cash,open_risk,open_positions&${id}&order=date`),
    ]);
    if (!run) return res.status(404).json({ error: 'run not found' });
    const spy = await getDailyBars('SPY', barsRangeFor(run.date_from, toEtClock(new Date()).date)).catch(() => []);
    const benchmark = benchmarkCurve(spy, equity.map(e => e.date), Number(run.starting_balance));
    res.json({ run, trades, equity, benchmark });
  } catch (err) {
    storageError(res, err);
  }
});

router.post('/backtest/run', requireAdmin, (req, res) => {
  const parsed = parseRunRequest(req.body, toEtClock(new Date()).date);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const job = startReplayJob(parsed.request, String(res.locals.adminEmail ?? 'unknown'));
  if (!job) return res.status(409).json({ error: 'A replay is already running', job: currentJob() });
  res.status(202).json({ job });
});

router.delete('/backtest/runs/:id', requireAdmin, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid run id' });
  try {
    await deleteRows('backtest_runs', `id=eq.${req.params.id}`);
    res.status(204).end();
  } catch (err) {
    storageError(res, err);
  }
});

export default router;
