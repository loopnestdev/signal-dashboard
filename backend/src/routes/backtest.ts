import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { RULES_VERSION } from '../lib/settings.js';
import { deleteRows, isSupabaseAdminConfigured, selectAll, selectRows } from '../lib/supabaseRest.js';
import { getDailyBars } from '../lib/yahooClient.js';
import { barsRangeFor, benchmarkCurve, lastCompleteSession, latestRunSet, parseRunRequest, type RunHeader } from '../backtest/report.js';
import { currentJob, startReplayJob } from '../backtest/runner.js';
import { DEFAULT_FLOW_STUDY, runFlowStudy, type FlowDay } from '../backtest/flowStudy.js';
import { getFromCache, setToCache } from '../lib/cache.js';
import type { Bar } from '../backtest/types.js';

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
      lastSession: lastCompleteSession(toEtClock(new Date())),
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

const numParam = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

// Flow study over everything collected so far. Daily bars come from Yahoo (one request per ticker), so the result
// is cached for 15 minutes per parameter set.
router.get('/backtest/flow-study', async (req, res) => {
  const cfg = {
    ...DEFAULT_FLOW_STUDY,
    heavyShare: numParam(req.query.share, DEFAULT_FLOW_STUDY.heavyShare, 0.55, 0.95),
    minPremium: numParam(req.query.minPremium, DEFAULT_FLOW_STUDY.minPremium, 0, 1e10),
  };
  const key = `flow-study-${cfg.heavyShare}-${cfg.minPremium}`;
  const cached = getFromCache<object>(key);
  if (cached) return res.json(cached);
  try {
    const rows = await selectAll<{ symbol: string; trade_date: string; call_premium: number; put_premium: number }>(
      'flow_daily', 'select=symbol,trade_date,call_premium,put_premium&order=symbol,trade_date');
    const days: FlowDay[] = rows.map(r => ({ symbol: r.symbol, date: r.trade_date, callPremium: Number(r.call_premium), putPremium: Number(r.put_premium) }));
    const symbols = [...new Set(days.map(d => d.symbol))];
    const from = days.map(d => d.date).sort()[0];
    const range = barsRangeFor(from ?? toEtClock(new Date()).date, toEtClock(new Date()).date);
    const bars = new Map<string, Bar[]>();
    for (const symbol of symbols) bars.set(symbol, await getDailyBars(symbol, range).catch(() => []));
    const payload = runFlowStudy(days, bars, cfg);
    setToCache(key, payload, 15 * 60);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('PGRST205')) {
      return res.status(503).json({ error: 'Flow study view not found - run supabase/migrations/20261008_flow_daily.sql' });
    }
    storageError(res, err);
  }
});

router.post('/backtest/run', requireAdmin, (req, res) => {
  const parsed = parseRunRequest(req.body, lastCompleteSession(toEtClock(new Date())));
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
