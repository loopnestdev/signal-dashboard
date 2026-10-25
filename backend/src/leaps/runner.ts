import { getSettings } from '../lib/settings.js';
import { insertRow, upsertRows } from '../lib/supabaseRest.js';
import { runLeapsBacktest, summarizeLeaps, type LeapsBacktestResult, type LeapsSummary } from './backtest.js';
import { loadLeapsHistory } from './data.js';
import { benchmarkOf, LEAPS_BOOKS, LEAPS_RULES_VERSION, type LeapsBook } from './rules.js';

// One LEAPS backtest of the three strike books over the same history; shared by the CLI and the API.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST = '2012-01-01';   // SEC XBRL quarters are complete from ~2010; the checks need a year-ago quarter

export interface LeapsRunRequest {
  from: string;
  to: string;
}

export function parseLeapsRunRequest(body: unknown, lastSession: string): { request: LeapsRunRequest } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const valid = (s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
  if (!valid(b.from) || !valid(b.to)) return { error: 'from and to must be dates (YYYY-MM-DD)' };
  if (b.from >= b.to) return { error: 'from must be before to' };
  if (b.from < EARLIEST) return { error: `from cannot be before ${EARLIEST}` };
  if (b.to > lastSession) return { error: `to cannot be after the last completed session (${lastSession})` };
  return { request: { from: b.from, to: b.to } };
}

async function saveLeapsRun(r: LeapsBacktestResult, summary: LeapsSummary): Promise<string> {
  const run = await insertRow<{ id: string }>('leaps_runs', {
    book: r.book, rules_version: LEAPS_RULES_VERSION, date_from: r.from, date_to: r.to,
    starting_balance: r.startingBalance, summary, skips: r.skips, open_at_end: r.openAtEnd,
  });
  await upsertRows('leaps_trades', r.trades.map(t => ({
    run_id: run.id, trade_id: t.id, symbol: t.symbol, market_state: t.marketState, expiry: t.expiry, strike: t.strike, qty: t.qty,
    entry_date: t.entryDate, entry_price: t.entryPrice, entry_spot: t.entrySpot, half_date: t.halfDate, half_price: t.halfPrice,
    exit_date: t.exitDate, exit_price: t.exitPrice, exit_reason: t.exitReason, cost: t.cost, pnl: t.pnl,
    half_pnl: t.halfPnl, runner_pnl: t.runnerPnl,
  })), 'ignore');
  await upsertRows('leaps_equity', r.equity.map(e => ({
    run_id: run.id, date: e.date, equity: e.equity, cash: e.cash, open_positions: e.openPositions,
  })), 'ignore');
  return run.id;
}

export interface LeapsOutcome {
  result: LeapsBacktestResult;
  summary: LeapsSummary;
  runId: string | null;
}

export async function replayLeaps(req: LeapsRunRequest, save: boolean, books: LeapsBook[] = LEAPS_BOOKS, onStep?: (step: string) => void): Promise<{ outcomes: LeapsOutcome[]; missing: string[]; symbols: number }> {
  const { settings } = await getSettings();
  onStep?.('loading history');
  const { history, missing } = await loadLeapsHistory(req.from, req.to);
  if (!history.days.length) throw new Error('no SPY sessions in range');
  const outcomes: LeapsOutcome[] = [];
  for (const book of books) {
    onStep?.(book);
    const result = runLeapsBacktest(history, book, settings.leaps.startingBalance, settings.costs.optionPerContract);
    const bench = benchmarkOf(book);
    const summary = summarizeLeaps(result, history.spyTr, { symbol: bench, series: bench === 'QQQ' ? history.qqqTr : history.spyTr });
    const runId = save ? await saveLeapsRun(result, summary) : null;
    outcomes.push({ result, summary, runId });
  }
  return { outcomes, missing, symbols: history.stocks.length };
}

export interface LeapsJob {
  state: 'running' | 'done' | 'failed';
  request: LeapsRunRequest;
  startedAt: string;
  finishedAt: string | null;
  step: string | null;
  runIds: string[];
  missing: string[];
  error: string | null;
}

let job: LeapsJob | null = null;

export const currentLeapsJob = (): LeapsJob | null => job;

// A 10-year replay loads ~120 Yahoo histories, so it runs in the background and the page polls.
export function startLeapsJob(req: LeapsRunRequest): LeapsJob | null {
  if (job?.state === 'running') return null;
  const j: LeapsJob = { state: 'running', request: req, startedAt: new Date().toISOString(), finishedAt: null, step: null, runIds: [], missing: [], error: null };
  job = j;
  replayLeaps(req, true, LEAPS_BOOKS, step => { j.step = step; })
    .then(({ outcomes, missing }) => { j.runIds = outcomes.map(o => o.runId!).filter(Boolean); j.missing = missing; j.state = 'done'; })
    .catch(err => { j.error = err instanceof Error ? err.message : String(err); j.state = 'failed'; console.warn('[leaps] replay failed:', err); })
    .finally(() => { j.finishedAt = new Date().toISOString(); j.step = null; });
  return j;
}
