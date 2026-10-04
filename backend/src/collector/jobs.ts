import { callMcpTool } from '../lib/signaClient.js';
import { callsToday } from '../lib/apiUsage.js';
import { insertRow, rpc, selectRows, upsertRows } from '../lib/supabaseRest.js';
import {
  parseCuratedFlow, parseDpPrints, parseFlowAlerts, parseGexSnapshot,
  parseOptionChain, parseSignalSnapshot, pickSwingExpiries,
} from './parsers.js';
import { SIGNA_CALLS_PER_RUN, type JobName } from './schedule.js';
import { expirationDates, fetchOptionChain, openYahooSession } from './yahooOptions.js';

export interface JobResult {
  status: 'ok' | 'partial' | 'error' | 'skipped';
  apiCalls: number;
  rowsWritten: number;
  message?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const PER_SYMBOL_DELAY_MS = 300;

export async function activeSymbols(): Promise<string[]> {
  const rows = await selectRows<{ symbol: string }>('tracked_symbols', 'select=symbol&active=eq.true&order=symbol');
  return rows.map(r => r.symbol);
}

// Leaves headroom for interactive dashboard use so the collector never exhausts the Signa quota.
async function budgetAllows(calls: number): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = Number(process.env.SIGNA_DAILY_LIMIT ?? 1000);
  const reserve = Number(process.env.SIGNA_RESERVE_CALLS ?? 200);
  const used = await callsToday('signa');
  return { ok: used + calls <= limit - reserve, used, limit };
}

// forEachSymbol:
//   - Runs one Signa call per symbol, sequentially, so a burst never trips Signa rate limits
//   - A null payload counts as a failure; the job is 'partial' if some symbols failed, 'error' if all did
async function forEachSymbol(
  symbols: string[],
  fetchOne: (symbol: string) => Promise<unknown>,
  toRows: (symbol: string, payload: unknown) => Promise<number>,
): Promise<JobResult> {
  let rows = 0;
  const failed: string[] = [];
  for (const symbol of symbols) {
    try {
      const payload = await fetchOne(symbol);
      if (payload === null) failed.push(symbol);
      else rows += await toRows(symbol, payload);
    } catch (err) {
      failed.push(symbol);
      console.warn(`[collector] ${symbol}:`, err instanceof Error ? err.message : err);
    }
    await sleep(PER_SYMBOL_DELAY_MS);
  }
  const status = failed.length === 0 ? 'ok' : failed.length === symbols.length ? 'error' : 'partial';
  return {
    status,
    apiCalls: symbols.length,
    rowsWritten: rows,
    message: failed.length ? `failed: ${failed.join(', ')}` : undefined,
  };
}

async function runSignaJob(job: JobName, tradeDate: string, symbols: string[]): Promise<JobResult> {
  switch (job) {
    case 'signals':
      return forEachSymbol(symbols, s => callMcpTool('get_signal', { symbol: s }), async (s, p) => {
        const row = parseSignalSnapshot(p, s, tradeDate);
        return row ? upsertRows('signal_snapshots', [row], 'merge', 'symbol,trade_date') : 0;
      });
    case 'darkpool':
      return forEachSymbol(symbols, s => callMcpTool('get_dark_pool', { ticker: s, limit: 50 }), async (_s, p) =>
        upsertRows('dp_prints', parseDpPrints(p), 'ignore'));
    case 'flow-alerts':
      return forEachSymbol(symbols, s => callMcpTool('get_options_flow', { ticker: s, limit: 50 }), async (_s, p) =>
        upsertRows('flow_alerts', parseFlowAlerts(p), 'merge'));
    case 'gex':
      return forEachSymbol(symbols, s => callMcpTool('get_gex', { symbol: s }), async (s, p) => {
        const row = parseGexSnapshot(p, s, tradeDate);
        return row ? upsertRows('gex_daily', [row], 'merge', 'symbol,trade_date') : 0;
      });
    case 'curated-flow': {
      const payload = await callMcpTool('get_curated_flow', { limit: 100, min_score: 40 });
      if (payload === null) return { status: 'error', apiCalls: 1, rowsWritten: 0, message: 'no response' };
      const rows = parseCuratedFlow(payload, new Set(symbols));
      return { status: 'ok', apiCalls: 1, rowsWritten: await upsertRows('curated_flow', rows, 'merge') };
    }
    default:
      throw new Error(`${job} is not a Signa job`);
  }
}

async function runOptionChain(tradeDate: string, symbols: string[]): Promise<JobResult> {
  const session = await openYahooSession();
  let calls = 0;
  let rows = 0;
  const failed: string[] = [];
  for (const symbol of symbols) {
    try {
      const first = await fetchOptionChain(session, symbol);
      calls++;
      for (const expiry of pickSwingExpiries(expirationDates(first))) {
        await sleep(500);
        const chain = await fetchOptionChain(session, symbol, expiry);
        calls++;
        rows += await upsertRows('option_quotes', parseOptionChain(chain, symbol, tradeDate), 'merge');
      }
    } catch (err) {
      failed.push(symbol);
      console.warn(`[collector] option-chain ${symbol}:`, err instanceof Error ? err.message : err);
    }
    await sleep(500);
  }
  const status = failed.length === 0 ? 'ok' : failed.length === symbols.length ? 'error' : 'partial';
  return { status, apiCalls: calls, rowsWritten: rows, message: failed.length ? `failed: ${failed.join(', ')}` : undefined };
}

async function runRollup(tradeDate: string): Promise<JobResult> {
  const rolled = await rpc<number>('rollup_dp_daily', { p_date: tradeDate });
  const pruned = await rpc<number>('prune_dp_prints', { p_keep_days: 60 });
  return { status: 'ok', apiCalls: 0, rowsWritten: rolled, message: pruned ? `pruned ${pruned} raw prints` : undefined };
}

export async function runJob(job: JobName, tradeDate: string): Promise<JobResult> {
  const startedAt = new Date().toISOString();
  let result: JobResult;
  try {
    const symbols = await activeSymbols();
    const per = SIGNA_CALLS_PER_RUN[job];
    const planned = per === 'per-symbol' ? symbols.length : per;
    if (planned > 0) {
      const budget = await budgetAllows(planned);
      result = budget.ok
        ? await runSignaJob(job, tradeDate, symbols)
        : { status: 'skipped', apiCalls: 0, rowsWritten: 0, message: `budget: ${budget.used}/${budget.limit} used, needs ${planned}` };
    } else if (job === 'option-chain') {
      result = await runOptionChain(tradeDate, symbols);
    } else {
      result = await runRollup(tradeDate);
    }
  } catch (err) {
    result = { status: 'error', apiCalls: 0, rowsWritten: 0, message: err instanceof Error ? err.message : String(err) };
  }

  console.log(`[collector] ${job} ${tradeDate}: ${result.status} rows=${result.rowsWritten} calls=${result.apiCalls}${result.message ? ` (${result.message})` : ''}`);
  try {
    await insertRow('collector_runs', {
      job,
      trade_date: tradeDate,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: result.status,
      api_calls: result.apiCalls,
      rows_written: result.rowsWritten,
      message: result.message?.slice(0, 1000) ?? null,
    });
  } catch (err) {
    console.warn('[collector] failed to log run:', err);
  }
  return result;
}
