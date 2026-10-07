import { RULES_VERSION, type TradingSettings } from '../lib/settings.js';
import { insertRow, upsertRows } from '../lib/supabaseRest.js';
import type { BacktestResult } from './engine.js';
import type { Summary } from './metrics.js';

// Persists one replay so the charts (release 2 step 4) can read it. Every run keeps the rules version and settings it used.
export async function saveRun(r: BacktestResult, summary: Summary, settings: TradingSettings): Promise<string> {
  const run = await insertRow<{ id: string }>('backtest_runs', {
    book: r.book,
    rules_version: RULES_VERSION,
    date_from: r.from,
    date_to: r.to,
    starting_balance: r.startingBalance,
    settings,
    summary,
    skips: r.skips,
    open_at_end: r.openAtEnd,
  });
  await upsertRows('backtest_trades', r.trades.map(t => ({
    run_id: run.id, trade_id: t.id, symbol: t.symbol, direction: t.direction, kind: t.kind, legs: t.legs, qty: t.qty,
    signal_date: t.signalDate, entry_date: t.entryDate, exit_date: t.exitDate, unit_cost: t.unitCost,
    exit_unit_value: t.exitUnitValue, risk: t.risk, commissions: t.commissions, pnl: t.pnl, r_multiple: t.rMultiple,
    exit_reason: t.exitReason, modeled_fills: t.modeledFills, shadow_pnl: t.shadowPnl, meta: t.meta,
  })), 'ignore');
  await upsertRows('backtest_equity', r.equity.map(e => ({
    run_id: run.id, date: e.date, equity: e.equity, cash: e.cash, open_risk: e.openRisk, open_positions: e.openPositions,
  })), 'ignore');
  return run.id;
}
