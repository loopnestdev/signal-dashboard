import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import { getFromCache, setToCache } from '../lib/cache.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { getSettings } from '../lib/settings.js';
import { deleteRows, isSupabaseAdminConfigured, selectAll, selectRows } from '../lib/supabaseRest.js';
import { getDailyBarsWithSplits, type DailyBar } from '../lib/yahooClient.js';
import { benchmarkCurve, lastCompleteSession } from '../backtest/report.js';
import { priceLevels } from '../leaps/levels.js';
import { bookState, type PaperPosition } from '../leaps/paper.js';
import { bookInterest } from '../leaps/screen.js';
import { addDays, benchmarkOf, INDEX_BOOK, LEAPS_BOOKS, LEAPS_RULES_VERSION, RULES, yearsUntil, type LeapsBook } from '../leaps/rules.js';
import { currentLeapsJob, parseLeapsRunRequest, startLeapsJob } from '../leaps/runner.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_COLUMNS = 'id,created_at,book,rules_version,date_from,date_to,starting_balance,summary';
// Rate for the "today" price levels of open positions; the screen itself uses that day's 13-week T-bill.
const LEVELS_RATE = 0.04;

interface RunRow {
  id: string;
  created_at: string;
  book: LeapsBook;
  rules_version: string;
  date_from: string;
  date_to: string;
  starting_balance: number;
  summary: Record<string, unknown>;
}

function storageError(res: import('express').Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'query failed';
  if (message.includes('PGRST205') || message.includes('42703')) {
    return res.status(503).json({ error: 'LEAPS tables not found - run supabase/migrations/20261025_leaps.sql' });
  }
  console.warn('[leaps] query failed:', message);
  return res.status(500).json({ error: message });
}

router.use('/leaps', (_req, res, next) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'LEAPS storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  next();
});

// GET /api/leaps:
//   - Latest screen (market state, every universe name with its checks, contracts and price levels per book)
//   - Paper positions with price levels from their actual fill, and each book's cash / equity
router.get('/leaps', async (_req, res) => {
  try {
    const { settings } = await getSettings();
    const start = settings.leaps.startingBalance;
    const [market] = await selectRows<Record<string, unknown> & { trade_date: string }>('leaps_market', 'select=*&order=trade_date.desc&limit=1');
    const [screen, positions, history, interest] = await Promise.all([
      market ? selectAll<Record<string, unknown>>('leaps_screen', `select=*&trade_date=eq.${market.trade_date}&order=symbol`) : Promise.resolve([]),
      selectRows<PaperPosition>('leaps_positions', 'select=*&order=id.desc&limit=300'),
      selectRows<Record<string, unknown>>('leaps_market', 'select=trade_date,spy_off_high_pct,vix,market_score,state&order=trade_date.desc&limit=60'),
      bookInterest(),
    ]);
    const today = market?.trade_date ?? toEtClock(new Date()).date;
    const withLevels = positions.map(p => ({
      ...p,
      levels: p.entry_price != null && p.status === 'open'
        ? priceLevels({
          strike: Number(p.strike), premium: Number(p.entry_price), years: yearsUntil(today, p.expiry),
          iv: p.last_iv != null ? Number(p.last_iv) : null, rate: LEVELS_RATE, commissionPerContract: settings.costs.optionPerContract,
        })
        : null,
    }));
    const books = LEAPS_BOOKS.map(book => {
      const mine = positions.filter(p => p.book === book);
      const closed = mine.filter(p => p.status === 'closed');
      return {
        book, ...bookState(mine, start, interest.get(book)?.total ?? 0), startingBalance: start, interest: Math.round((interest.get(book)?.total ?? 0) * 100) / 100,
        closed: closed.length, wins: closed.filter(p => Number(p.pnl) > 0).length,
        realizedPnl: Math.round(closed.reduce((s, p) => s + Number(p.pnl), 0) * 100) / 100,
      };
    });
    res.json({
      market: market ?? null, history: history.reverse(), screen, positions: withLevels, books,
      rulesVersion: LEAPS_RULES_VERSION, smallBook: RULES.smallBookBalance, startingBalance: start, indexPositionPct: INDEX_BOOK.positionPct,
    });
  } catch (err) {
    storageError(res, err);
  }
});

router.get('/leaps/runs', async (_req, res) => {
  try {
    const runs = await selectRows<RunRow>('leaps_runs', `select=${RUN_COLUMNS}&order=created_at.desc&limit=60`);
    // The newest run of each book sharing the newest run's range and rules version = one replay started together.
    const [newest] = runs;
    const latest = newest
      ? LEAPS_BOOKS.map(b => runs.find(r => r.book === b && r.date_from === newest.date_from && r.date_to === newest.date_to && r.rules_version === newest.rules_version)?.id).filter(Boolean)
      : [];
    const lastSession = lastCompleteSession(toEtClock(new Date()));
    res.json({ runs, latest, job: currentLeapsJob(), rulesVersion: LEAPS_RULES_VERSION, lastSession, defaultFrom: addDays(lastSession, -3653) });
  } catch (err) {
    storageError(res, err);
  }
});

router.get('/leaps/runs/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid run id' });
  try {
    const id = `run_id=eq.${req.params.id}`;
    const [[run], trades, equity] = await Promise.all([
      selectRows<RunRow & { skips: unknown; open_at_end: unknown[] }>('leaps_runs', `select=*&id=eq.${req.params.id}`),
      selectAll<Record<string, unknown>>('leaps_trades', `select=*&${id}&order=trade_id`),
      selectAll<{ date: string; equity: number; cash: number; open_positions: number }>('leaps_equity', `select=date,equity,cash,open_positions&${id}&order=date`),
    ]);
    if (!run) return res.status(404).json({ error: 'run not found' });
    const symbol = benchmarkOf(run.book);
    const key = `leaps-bench-${symbol}-${run.date_from}`;
    let spy = getFromCache<DailyBar[]>(key);
    if (!spy) {
      // Total return (dividends reinvested), matching the backtest summary's SPY figure
      spy = (await getDailyBarsWithSplits(symbol, { since: run.date_from }).catch(() => ({ bars: [] as DailyBar[] }))).bars
        .map(b => ({ ...b, close: b.adjClose ?? b.close }));
      setToCache(key, spy, 3600);
    }
    res.json({ run, trades, equity, benchmarkSymbol: symbol, benchmark: benchmarkCurve(spy, equity.map(e => e.date), Number(run.starting_balance)) });
  } catch (err) {
    storageError(res, err);
  }
});

router.post('/leaps/run', requireAdmin, (req, res) => {
  const lastSession = lastCompleteSession(toEtClock(new Date()));
  const parsed = parseLeapsRunRequest(req.body, lastSession);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const job = startLeapsJob(parsed.request);
  if (!job) return res.status(409).json({ error: 'A LEAPS backtest is already running', job: currentLeapsJob() });
  res.status(202).json({ job });
});

router.delete('/leaps/runs/:id', requireAdmin, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'invalid run id' });
  try {
    await deleteRows('leaps_runs', `id=eq.${req.params.id}`);
    res.status(204).end();
  } catch (err) {
    storageError(res, err);
  }
});

export default router;
