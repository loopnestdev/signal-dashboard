import { callMcpTool } from '../lib/signaClient.js';
import { callsToday } from '../lib/apiUsage.js';
import { recentTradingDays } from '../lib/marketCalendar.js';
import { insertRow, rpc, selectRows, updateRows, upsertRows } from '../lib/supabaseRest.js';
import {
  parseCuratedFlow, parseDpPrints, parseFlowAlerts, parseGexSnapshot,
  parseOptionChain, parseRawFlow, parseSignalSnapshot, parseSignaScan, pickSwingExpiries,
} from './parsers.js';
import {
  aggregateFlow, analyzeDpMulti, buildCandidate, INDEX_SYMBOLS, planPromotions, rejectReason, scannerConfig,
  type DpDayVolume, type FlowPrint, type ScannerSlot,
} from './scanner.js';
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
    case 'raw-flow': {
      // Store everything >= $250k; the scanner applies its own (higher) premium floor.
      const payload = await callMcpTool('get_raw_flow', { min_premium: 250_000, limit: 200 });
      if (payload === null) return { status: 'error', apiCalls: 1, rowsWritten: 0, message: 'no response' };
      return { status: 'ok', apiCalls: 1, rowsWritten: await upsertRows('raw_flow', parseRawFlow(payload), 'merge') };
    }
    case 'signa-scan': {
      let rows = 0;
      let failed = 0;
      for (const direction of ['bullish', 'bearish']) {
        const payload = await callMcpTool('scan_symbols', { direction, limit: 50 });
        if (payload === null) { failed++; continue; }
        rows += await upsertRows('signa_scans', parseSignaScan(payload, tradeDate), 'merge', 'symbol,trade_date,direction');
      }
      const status = failed === 0 ? 'ok' : failed === 2 ? 'error' : 'partial';
      return { status, apiCalls: 2, rowsWritten: rows };
    }
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

interface TrackedRow {
  symbol: string;
  source: 'core' | 'scanner' | 'manual';
  expires_at: string | null;
  last_score: number | null;
  promoted_at: string | null;
}

const inList = (symbols: string[]) => `(${symbols.map(s => `"${s}"`).join(',')})`;

// runScanner:
//   - Scores every symbol in today's large-print feed with Radon's discover formula
//   - Untracked candidates get one live dark pool pull (up to dpLookups) so they can be scored at all
//   - Qualifying candidates are promoted into tracked_symbols (source 'scanner') so the per-symbol jobs start collecting them
//   - Expired or over-cap scanner symbols are deactivated; core symbols are never touched
async function runScanner(tradeDate: string, trackedActive: string[], dpLookups: number): Promise<JobResult> {
  const cfg = scannerConfig();
  const tracked = await selectRows<TrackedRow>('tracked_symbols', 'select=symbol,source,expires_at,last_score,promoted_at&active=eq.true');
  const core = new Set(tracked.filter(t => t.source !== 'scanner').map(t => t.symbol));

  const prints = await selectRows<FlowPrint & { trade_date: string }>(
    'raw_flow',
    `select=symbol,option_type,premium,dte,vol_oi_ratio,is_sweep,open_interest,underlying_price,executed_at,trade_date&trade_date=eq.${tradeDate}&limit=5000`,
  );
  const flows = aggregateFlow(prints, cfg);
  if (flows.size === 0) {
    return { status: 'ok', apiCalls: 0, rowsWritten: 0, message: 'no large prints today yet' };
  }

  // Live dark pool for the biggest untracked names that could pass the cheap filters.
  const trackedSet = new Set(trackedActive);
  const lookups = [...flows.values()]
    .filter(f => !trackedSet.has(f.symbol) && !INDEX_SYMBOLS.has(f.symbol))
    .filter(f => f.alerts >= cfg.minAlerts && f.totalPremium >= cfg.minTotalPremium && (f.underlyingPrice ?? 0) >= cfg.minPrice)
    .sort((a, b) => b.totalPremium - a.totalPremium)
    .slice(0, dpLookups)
    .map(f => f.symbol);
  let apiCalls = 0;
  for (const symbol of lookups) {
    const payload = await callMcpTool('get_dark_pool', { ticker: symbol, limit: 50 });
    apiCalls++;
    if (payload !== null) await upsertRows('dp_prints', parseDpPrints(payload), 'ignore');
    await sleep(PER_SYMBOL_DELAY_MS);
  }
  await rpc('rollup_dp_daily', { p_date: tradeDate });

  const days = recentTradingDays(tradeDate, 3);
  const symbols = [...flows.keys()];
  const dpRows = await selectRows<DpDayVolume & { symbol: string }>(
    'dp_daily',
    `select=symbol,trade_date,buy_volume,sell_volume,num_prints&symbol=in.${inList(symbols)}&trade_date=in.${inList(days)}&limit=5000`,
  );
  const signa = await selectRows<{ symbol: string; direction: string }>(
    'signa_scans', `select=symbol,direction&trade_date=eq.${tradeDate}&symbol=in.${inList(symbols)}`,
  );
  const signaDir = new Map(signa.map(r => [r.symbol, r.direction]));

  const candidates = [...flows.values()].map(f => {
    const c = buildCandidate(f, analyzeDpMulti(dpRows.filter(r => r.symbol === f.symbol), days));
    return { candidate: c, reason: rejectReason(c, cfg) };
  });

  const qualifying = candidates
    .filter(x => x.reason === null && x.candidate.score >= cfg.promoteScore)
    .map(x => x.candidate);
  const current: ScannerSlot[] = tracked
    .filter(t => t.source === 'scanner')
    .map(t => ({ symbol: t.symbol, score: Number(t.last_score ?? 0), expiresAt: t.expires_at ?? tradeDate }));
  const plan = planPromotions(qualifying, current, core, tradeDate, cfg);
  const kept = new Set(plan.keep.map(k => k.symbol));
  const wasActive = new Set(current.map(c => c.symbol));
  const promotedAt = new Map(tracked.map(t => [t.symbol, t.promoted_at]));

  const now = new Date().toISOString();
  if (plan.keep.length) {
    await upsertRows('tracked_symbols', plan.keep.map(k => ({
      symbol: k.symbol,
      kind: 'stock',
      active: true,
      source: 'scanner',
      expires_at: k.expiresAt,
      last_score: k.score,
      notes: 'promoted by flow scanner',
      promoted_at: (wasActive.has(k.symbol) ? promotedAt.get(k.symbol) : null) ?? now,
    })), 'merge', 'symbol');
  }
  if (plan.demote.length) {
    await updateRows('tracked_symbols', `symbol=in.${inList(plan.demote)}&source=eq.scanner`, { active: false });
  }

  const rows = candidates.map(({ candidate: c, reason }) => ({
    ...c,
    trade_date: tradeDate,
    run_at: now,
    signa_direction: signaDir.get(c.symbol) ?? null,
    passed_filters: reason === null,
    rejected_reason: reason,
    promoted: kept.has(c.symbol) || core.has(c.symbol),
  }));
  const written = await upsertRows('scanner_candidates', rows, 'merge', 'symbol,trade_date');

  const added = plan.keep.filter(k => !wasActive.has(k.symbol)).map(k => k.symbol);
  const parts = [
    `${candidates.length} scored, ${qualifying.length} qualified`,
    added.length ? `promoted ${added.join(', ')}` : '',
    plan.demote.length ? `expired ${plan.demote.join(', ')}` : '',
    dpLookups === 0 && lookups.length === 0 ? '' : `${lookups.length} dark pool lookups`,
  ].filter(Boolean);
  return { status: 'ok', apiCalls, rowsWritten: written, message: parts.join('; ') };
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
    const planned = per === 'per-symbol' ? symbols.length : per === 'scanner' ? scannerConfig().dpLookupsPerRun : per;
    if (job === 'scanner') {
      const budget = await budgetAllows(planned);
      result = await runScanner(tradeDate, symbols, budget.ok ? planned : 0);
    } else if (planned > 0) {
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
