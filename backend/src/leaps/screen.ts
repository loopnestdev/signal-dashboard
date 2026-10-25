import { fetchCboeChain } from '../collector/cboeOptions.js';
import { parseOccSymbol } from '../collector/parsers.js';
import { recentTradingDays } from '../lib/marketCalendar.js';
import { getSettings } from '../lib/settings.js';
import { insertRow, selectAll, selectRows, updateRows, upsertRows } from '../lib/supabaseRest.js';
import { getDailyBarsWithSplits, type DailyBar, type Split } from '../lib/yahooClient.js';
import { fetchMarketData } from '../services/marketData.js';
import { computeMarketQualityScore, scoreBreadth, scoreMacro, scoreMomentum, scoreTrend, scoreVolatility } from '../services/scoring.js';
import { confirmationFor, type Confirmation } from './confirm.js';
import { pickContract, quoteGrid, type ChainCall } from './contracts.js';
import { affordableAt, sizePosition } from './exits.js';
import { eligibleFilers, marketCapNow, quartersFor } from './data.js';
import { priceLevels, type PriceLevels } from './levels.js';
import { marketState, offHighPct, rollingHigh } from './market.js';
import { bookState, stepPosition, type PaperPosition } from './paper.js';
import { knownQuarters, offHighCheck, qualityChecks, type Check } from './quality.js';
import { addDays, daysBetween, INDEX_BOOK, LEAPS_BOOKS, LEAPS_RULES_VERSION, RULES, STOCK_BOOKS, yearsUntil, type LeapsBook, type MarketState } from './rules.js';

// Collector job 'leaps' (after the close): market state, the "bulletproof" screen with one contract per book and its
// price levels, real LEAPS quotes for those contracts and every held one, then the paper books' fills and decisions.
// No Signa calls: confirmation reads what the collector already stored.

export interface ContractView {
  contract: string | null;
  expiry: string | null;
  strike: number | null;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  delta: number | null;
  openInterest: number | null;
  liquid: boolean;
  reason: string | null;
  costFor2: number | null;
  affordable25k: boolean | null;
  levels: PriceLevels | null;
}

export interface ScreenRow {
  trade_date: string;
  symbol: string;
  price: number | null;
  high_52w: number | null;
  off_high_pct: number | null;
  market_cap: number | null;
  iv30: number | null;
  vol_ratio: number | null;
  checks: Check[];
  eligible: boolean;
  candidate: boolean;
  reason: string | null;
  confirmation: Confirmation | null;
  contracts: Partial<Record<LeapsBook, ContractView>> | null;
}

const round = (x: number | null, dp = 2) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const CBOE_GAP_MS = 250;

function chainCalls(payload: unknown): { calls: ChainCall[]; iv30: number | null; spot: number | null } {
  const data = (payload as { data?: { options?: Record<string, unknown>[]; iv30?: unknown; current_price?: unknown; close?: unknown } } | null)?.data;
  const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const calls: ChainCall[] = [];
  for (const c of data?.options ?? []) {
    const occ = parseOccSymbol(String(c.option ?? ''));
    if (!occ || occ.type !== 'CALL') continue;
    const iv = num(c.iv);
    calls.push({ contract: String(c.option), expiry: occ.expiry, strike: occ.strike, bid: num(c.bid), ask: num(c.ask), iv: iv === 0 ? null : iv, delta: num(c.delta), openInterest: num(c.open_interest) });
  }
  return { calls, iv30: num(data?.iv30), spot: num(data?.current_price ?? data?.close) };
}

async function marketScore(): Promise<number | null> {
  try {
    const raw = await fetchMarketData();
    return computeMarketQualityScore(scoreVolatility(raw).score, scoreTrend(raw).score, scoreBreadth(raw).score, scoreMomentum(raw).score, scoreMacro(raw).score);
  } catch (err) {
    console.warn('[leaps] market score unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

function contractView(calls: ChainCall[], tradeDate: string, book: LeapsBook, state: MarketState, rate: number, commission: number): ContractView {
  const pick = pickContract(calls, tradeDate, book);
  const c = pick.call;
  const years = c ? yearsUntil(tradeDate, c.expiry) : 0;
  const unit = c?.ask ? c.ask * 100 + commission : null;
  return {
    contract: c?.contract ?? null, expiry: c?.expiry ?? null, strike: c?.strike ?? null, bid: c?.bid ?? null, ask: c?.ask ?? null,
    iv: c?.iv ?? null, delta: c?.delta ?? null, openInterest: c?.openInterest ?? null, liquid: pick.liquid, reason: pick.reason,
    costFor2: unit ? round(unit * 2) : null,
    affordable25k: unit && book !== 'IX' ? affordableAt(RULES.smallBookBalance, state === 'normal' ? 'correction' : state, unit) : null,
    levels: c?.ask ? priceLevels({ strike: c.strike, premium: c.ask, years, iv: c.iv, rate, commissionPerContract: commission }) : null,
  };
}

const closeOn = (bars: DailyBar[], date: string) => [...bars].reverse().find(b => b.date <= date) ?? null;

async function confirmations(symbols: string[], tradeDate: string): Promise<Map<string, Confirmation>> {
  if (!symbols.length) return new Map();
  const list = `(${symbols.map(s => `"${s}"`).join(',')})`;
  const since = (n: number) => recentTradingDays(tradeDate, n).at(-1)!;
  const [dp, flow, raw] = await Promise.all([
    selectAll<{ symbol: string; buy_volume: number; sell_volume: number }>('dp_daily', `select=symbol,buy_volume,sell_volume,trade_date&symbol=in.${list}&trade_date=gte.${since(RULES.dpSessions)}&trade_date=lte.${tradeDate}&order=symbol`),
    selectAll<{ symbol: string; option_type: string; premium: number }>('flow_alerts', `select=symbol,option_type,premium&symbol=in.${list}&trade_date=gte.${since(RULES.flowSessions)}&trade_date=lte.${tradeDate}&order=id`),
    selectAll<{ symbol: string; option_type: string; premium: number; expiry: string; trade_date: string }>('raw_flow', `select=symbol,option_type,premium,expiry,trade_date&symbol=in.${list}&trade_date=gte.${since(RULES.leapsPrintSessions)}&trade_date=lte.${tradeDate}&order=id`),
  ]);
  const by = <T extends { symbol: string }>(rows: T[], s: string) => rows.filter(r => r.symbol === s);
  return new Map(symbols.map(s => [s, confirmationFor(by(dp, s), by(flow, s), by(raw, s))]));
}

export async function runLeapsScreen(tradeDate: string): Promise<{ status: 'ok' | 'partial' | 'error'; rowsWritten: number; message: string }> {
  const { settings } = await getSettings();
  const commission = settings.costs.optionPerContract;
  const since = addDays(tradeDate, -400);

  // ── Market state ──
  const [spy, vixBars, irxBars, mqs] = await Promise.all([
    getDailyBarsWithSplits('SPY', { since }), getDailyBarsWithSplits('^VIX', { since: addDays(tradeDate, -10) }),
    getDailyBarsWithSplits('^IRX', { since: addDays(tradeDate, -10) }), marketScore(),
  ]);
  const spyBars = spy.bars.filter(b => b.date <= tradeDate);
  if (spyBars.at(-1)?.date !== tradeDate) throw new Error(`no SPY bar for ${tradeDate} yet`);
  const spyHigh = rollingHigh(spyBars.map(b => b.close)).at(-1)!;
  const spyOff = offHighPct(spyBars.at(-1)!.close, spyHigh);
  const vix = closeOn(vixBars.bars, tradeDate)?.close ?? null;
  const rate = (closeOn(irxBars.bars, tradeDate)?.close ?? 4) / 100;
  const state: MarketState = marketState(spyOff, vix, mqs);
  await upsertRows('leaps_market', [{
    trade_date: tradeDate, spy_close: spyBars.at(-1)!.close, spy_high_52w: spyHigh, spy_off_high_pct: round(spyOff),
    vix, market_score: mqs, state, captured_at: new Date().toISOString(),
  }], 'merge', 'trade_date');

  // ── Screen ──
  const held = await selectRows<PaperPosition>('leaps_positions', 'select=*&status=in.(pending,open)&order=id');
  const symbols = await eligibleFilers();
  const heldSymbols = new Set(held.map(p => p.symbol));
  const indexSymbols = new Set<string>(INDEX_BOOK.symbols);
  const universe = [...new Set([...symbols, ...heldSymbols, ...indexSymbols])].sort();
  const quarters = await quartersFor(universe);
  const rows: ScreenRow[] = [];
  const chains = new Map<string, ChainCall[]>();
  const failed: string[] = [];

  for (const symbol of universe) {
    try {
      const { bars, splits } = await getDailyBarsWithSplits(symbol, { since }).catch(() => ({ bars: [] as DailyBar[], splits: [] as Split[] }));
      const upTo = bars.filter(b => b.date <= tradeDate);
      const q = quarters.get(symbol) ?? [];
      const price = upTo.at(-1)?.close ?? null;
      const high = upTo.length ? rollingHigh(upTo.map(b => b.close)).at(-1)! : null;
      const off = price != null && high != null ? offHighPct(price, high) : null;
      const cap = price != null ? marketCapNow(knownQuarters(q, tradeDate), price, splits) : null;
      // One Cboe request for every name: the screen needs it for eligible ones, the research quote grid for all.
      await sleep(CBOE_GAP_MS);
      const chain = chainCalls(await fetchCboeChain(symbol));
      const calls = chain.calls;
      const iv30 = chain.iv30;
      chains.set(symbol, calls);
      if (indexSymbols.has(symbol)) {
        rows.push({
          trade_date: tradeDate, symbol, price, high_52w: high, off_high_pct: round(off), market_cap: null, iv30, vol_ratio: null,
          checks: [], eligible: true, candidate: true, reason: null, confirmation: null,
          contracts: price != null ? { IX: contractView(calls, tradeDate, 'IX', state, rate, commission) } : null,
        });
        continue;
      }
      const volRatio = iv30 != null && vix ? iv30 / vix : null;
      const quality = qualityChecks(q, tradeDate, cap, volRatio);
      const offCheck = off != null ? offHighCheck(off) : null;
      const candidate = quality.eligible && state !== 'normal' && (offCheck?.pass ?? false);
      let contracts: ScreenRow['contracts'] = null;
      if (quality.eligible && offCheck?.pass && price != null) {
        contracts = {};
        for (const book of STOCK_BOOKS) contracts[book] = contractView(calls, tradeDate, book, state, rate, commission);
      }
      rows.push({
        trade_date: tradeDate, symbol, price, high_52w: high, off_high_pct: round(off), market_cap: cap, iv30, vol_ratio: round(volRatio),
        checks: [...quality.checks, ...(offCheck ? [offCheck] : [])], eligible: quality.eligible, candidate,
        reason: quality.reason ?? (offCheck && !offCheck.pass ? `offHigh: ${offCheck.detail}` : null), confirmation: null, contracts,
      });
    } catch (err) {
      failed.push(symbol);
      console.warn(`[leaps] ${symbol}:`, err instanceof Error ? err.message : err);
    }
  }

  const withContracts = rows.filter(r => r.contracts && !indexSymbols.has(r.symbol));
  const conf = await confirmations(withContracts.map(r => r.symbol), tradeDate);
  for (const r of withContracts) r.confirmation = conf.get(r.symbol) ?? null;
  let written = await upsertRows('leaps_screen', rows, 'merge', 'trade_date,symbol');

  // ── Real quotes: the chosen and held contracts, plus the research grid for every name ──
  const keep = new Set<string>([
    ...rows.flatMap(r => Object.values(r.contracts ?? {}).map(c => c?.contract).filter((c): c is string => !!c)),
    ...held.map(p => p.contract_symbol),
  ]);
  const quoteRows = [...chains.entries()].flatMap(([symbol, calls]) => {
    const grid = new Set(quoteGrid(calls, tradeDate).map(c => c.contract));
    return calls.filter(c => keep.has(c.contract) || grid.has(c.contract)).map(c => ({
      trade_date: tradeDate, contract_symbol: c.contract, symbol, expiry: c.expiry, strike: c.strike, bid: c.bid, ask: c.ask,
      iv: c.iv, delta: c.delta, open_interest: c.openInterest, spot: rows.find(r => r.symbol === symbol)?.price ?? null,
      grid: grid.has(c.contract), captured_at: new Date().toISOString(),
    }));
  });
  written += await upsertRows('leaps_quotes', quoteRows, 'merge', 'trade_date,contract_symbol');

  // ── Paper books ──
  const events = await runPaper(tradeDate, state, rows, chains, settings.leaps.startingBalance, commission, rate);

  const candidates = rows.filter(r => r.candidate).map(r => r.symbol);
  const message = [
    `${state} (SPY ${round(spyOff, 1)}% off high, VIX ${vix ?? 'n/a'}, score ${mqs ?? 'n/a'})`,
    `${rows.filter(r => r.eligible).length}/${rows.length} eligible`,
    candidates.length ? `candidates: ${candidates.join(', ')}` : 'no candidates',
    events.length ? events.join('; ') : '',
    failed.length ? `failed: ${failed.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  return { status: failed.length ? (failed.length === universe.length ? 'error' : 'partial') : 'ok', rowsWritten: written, message };
}

export async function bookInterest(): Promise<Map<string, { total: number; last: string | null }>> {
  const rows = await selectAll<{ book: string; trade_date: string; amount: number }>('leaps_interest', 'select=book,trade_date,amount&order=book,trade_date');
  const out = new Map<string, { total: number; last: string | null }>();
  for (const r of rows) {
    const cur = out.get(r.book) ?? { total: 0, last: null };
    out.set(r.book, { total: cur.total + Number(r.amount), last: r.trade_date });
  }
  return out;
}

async function runPaper(tradeDate: string, state: MarketState, rows: ScreenRow[], chains: Map<string, ChainCall[]>, startingBalance: number, commission: number, rate: number): Promise<string[]> {
  const all = await selectRows<PaperPosition>('leaps_positions', 'select=*&order=id');
  const interest = await bookInterest();
  // Idempotent per session: a re-run after the paper step already ran today only refreshes the screen.
  if ([...interest.values()].some(v => v.last === tradeDate) || all.some(p => p.last_date === tradeDate || (p.status === 'pending' && p.signal_date === tradeDate))) {
    return ['paper already processed today'];
  }
  const quoteOf = (p: PaperPosition) => chains.get(p.symbol)?.find(c => c.contract === p.contract_symbol) ?? null;
  const rowOf = new Map(rows.map(r => [r.symbol, r]));
  const events: string[] = [];

  for (const book of LEAPS_BOOKS) {
    const positions = all.filter(p => p.book === book);
    const earned = interest.get(book)?.total ?? 0;
    for (const [i, p] of positions.entries()) {
      if (p.status !== 'pending' && p.status !== 'open') continue;
      const q = quoteOf(p);
      const r = rowOf.get(p.symbol);
      // A name that dropped out of the screen entirely keeps its position; only failed profit/revenue checks break quality.
      const known = r ? r.checks : [];
      const qualityOk = !known.some(c => (c.key === 'profit' || c.key === 'revenue') && !c.pass);
      const { cash } = bookState(positions, startingBalance, earned);
      const { position, event } = stepPosition(p, q ? { bid: q.bid, ask: q.ask, iv: q.iv } : null, tradeDate, qualityOk, commission, cash);
      positions[i] = position;
      if (event) events.push(`${book} ${p.symbol}: ${event}`);
      const { id, ...patch } = position;
      await updateRows('leaps_positions', `id=eq.${id}`, patch);
    }

    // Idle cash earns the 13-week T-bill rate for the calendar days since the book's last accrual (rules v1.2).
    const last = interest.get(book)?.last;
    const idle = bookState(positions, startingBalance, earned).cash;
    const amount = last && idle > 0 ? Math.round(idle * rate * daysBetween(last, tradeDate) / 365 * 100) / 100 : 0;
    await upsertRows('leaps_interest', [{ book, trade_date: tradeDate, amount }], 'merge', 'book,trade_date');

    if (book === 'IX') {
      events.push(...await indexOrders(positions, rows, tradeDate, state, startingBalance, earned + amount, commission));
      continue;
    }
    if (state === 'normal') continue;
    const holding = new Set(positions.filter(p => p.status === 'open' || p.status === 'pending').map(p => p.symbol));
    const candidates = rows
      .filter(r => r.candidate && r.contracts?.[book]?.liquid && !holding.has(r.symbol))
      .sort((a, b) => (b.off_high_pct ?? 0) - (a.off_high_pct ?? 0));
    for (const r of candidates) {
      const c = r.contracts![book]!;
      const unit = c.ask! * 100 + commission;
      const s = bookState(positions, startingBalance, earned + amount);
      const size = sizePosition({ equity: s.equity, cash: s.cash, openCost: s.openCost, openCount: s.openCount, state, unitCost: unit, wholeContracts: true });
      if ('skip' in size) { events.push(`${book} ${r.symbol}: skipped (${size.skip})`); continue; }
      const pos: PaperPosition = {
        book, rules_version: LEAPS_RULES_VERSION, symbol: r.symbol, contract_symbol: c.contract!, expiry: c.expiry!, strike: c.strike!,
        status: 'pending', signal_date: tradeDate, market_state: state, qty: size.qty, qty_open: size.qty, entry_date: null, entry_price: null,
        half_date: null, half_price: null, half_qty: null, exit_date: null, exit_price: null, exit_reason: null, pending_action: null,
        peak_value: null, last_bid: null, last_iv: null, last_date: null, commissions: 0, pnl: null, confirmation: r.confirmation,
        meta: { estCost: Math.round(size.qty * unit * 100) / 100, askAtSignal: c.ask, offHighPct: r.off_high_pct, affordable25k: c.affordable25k },
      };
      const saved = await insertRow<PaperPosition>('leaps_positions', pos);
      positions.push(saved);
      events.push(`${book} ${r.symbol}: order ${size.qty}x ${c.contract}`);
    }
  }
  return events;
}

// Book IX: hold one LEAPS per index at all times. A position closing at the next fill (the 120-day roll) is replaced in
// the same session, sized at 15% of the book's equity, in fractional contracts.
async function indexOrders(positions: PaperPosition[], rows: ScreenRow[], tradeDate: string, state: MarketState, startingBalance: number, interest: number, commission: number): Promise<string[]> {
  const events: string[] = [];
  for (const symbol of INDEX_BOOK.symbols) {
    const active = positions.some(p => p.symbol === symbol && (p.status === 'pending' || (p.status === 'open' && !p.pending_action?.startsWith('close:'))));
    if (active) continue;
    const c = rows.find(r => r.symbol === symbol)?.contracts?.IX;
    if (!c?.contract || !c.ask || !c.liquid) { events.push(`IX ${symbol}: no contract (${c?.reason ?? 'no quote'})`); continue; }
    const unit = c.ask * 100 + commission;
    const budget = bookState(positions, startingBalance, interest).equity * INDEX_BOOK.positionPct / 100;
    const qty = Math.floor(budget / unit * 1e4 + 1e-6) / 1e4;
    const pos: PaperPosition = {
      book: 'IX', rules_version: LEAPS_RULES_VERSION, symbol, contract_symbol: c.contract, expiry: c.expiry!, strike: c.strike!,
      status: 'pending', signal_date: tradeDate, market_state: state, qty, qty_open: qty, entry_date: null, entry_price: null,
      half_date: null, half_price: null, half_qty: null, exit_date: null, exit_price: null, exit_reason: null, pending_action: null,
      peak_value: null, last_bid: null, last_iv: null, last_date: null, commissions: 0, pnl: null, confirmation: null,
      // Book size at which this position would be at least one whole contract
      meta: { estCost: Math.round(budget * 100) / 100, askAtSignal: c.ask, minBookForWhole: Math.round(unit / (INDEX_BOOK.positionPct / 100)) },
    };
    positions.push(await insertRow<PaperPosition>('leaps_positions', pos));
    events.push(`IX ${symbol}: order ${qty}x ${c.contract}`);
  }
  return events;
}
