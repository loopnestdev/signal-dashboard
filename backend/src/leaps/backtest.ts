import { blackScholes } from '../backtest/pricing.js';
import { modeledLeapsExpiries, pickLeapsExpiry } from './contracts.js';
import { decideExit, sizePosition } from './exits.js';
import { snapStrike, strikeForDelta } from './levels.js';
import { marketState, offHighPct, rollingHigh, rollingVol } from './market.js';
import { knownQuarters, profitCheck, qualityChecks, revenueCheck, type QuarterFacts } from './quality.js';
import { BOOK_DELTA, daysBetween, INDEX_BOOK, isIndexBook, RULES, yearsUntil, type LeapsBook, type MarketState } from './rules.js';

// LEAPS replay on modeled prices (docs/leaps-rules.md section 9). Pure: history comes in, trades and equity come out.
//   - Decisions use a session's close; fills happen at the next session's close (buy at modeled ask, sell at bid)
//   - IV from the stock's 1-year realized vol, scaled by 6-month VIX (see modeledIv); Black-Scholes, no dividends
//   - The volatility check compares that realized vol with VIX, standing in for the live IV30 / VIX
//   - Fractional contracts, so the books compare the strategy rather than the account size
//   - Idle cash earns the 13-week T-bill rate (rules v1.2); the SPY benchmark is total return (dividends included)
//   - Books IS / IQ hold a SPY / QQQ LEAPS at all times (section 6b); the stock books buy only in down markets

export interface Series {
  dates: string[];
  closes: number[];
}

export interface StockHistory extends Series {
  symbol: string;
  quarters: QuarterFacts[];
  marketCapNow: number | null;   // market cap at the last close; earlier caps scale with the (split-adjusted) price
}

export interface LeapsHistory {
  days: string[];                  // replay sessions, oldest first
  spy: Series;
  vix: Map<string, number>;
  vix6m: Map<string, number>;      // ^VIX6M: long-dated IV moves far less than 30-day VIX in a panic
  rate: Map<string, number>;       // risk-free rate, decimal
  stocks: StockHistory[];
  index: StockHistory[];           // SPY, QQQ for books IS / IQ (no quarters)
  spyTr: Series;                   // SPY adjusted close (total return) for the benchmark
  qqqTr: Series;                   // QQQ adjusted close, the benchmark for book IQ
}

export interface LeapsTrade {
  id: number;
  symbol: string;
  marketState: MarketState;
  episode: string | null;
  expiry: string;
  strike: number;
  qty: number;
  entryDate: string;
  entryPrice: number;
  entrySpot: number;
  halfDate: string | null;
  halfPrice: number | null;
  exitDate: string;
  exitPrice: number;
  exitReason: string;
  cost: number;
  pnl: number;
  halfPnl: number | null;
  runnerPnl: number;
}

export interface LeapsOpen {
  symbol: string;
  expiry: string;
  strike: number;
  entryDate: string;
  entryPrice: number;
  lastBid: number;
  halfSold: boolean;
  cost: number;
  unrealizedPnl: number;
}

export interface LeapsEquity {
  date: string;
  equity: number;
  cash: number;
  openPositions: number;
}

export interface Episode {
  id: string;            // first non-normal session
  end: string;
  maxSpyOffHighPct: number;
}

export interface LeapsBacktestResult {
  book: LeapsBook;
  from: string;
  to: string;
  startingBalance: number;
  trades: LeapsTrade[];
  equity: LeapsEquity[];
  openAtEnd: LeapsOpen[];
  skips: Record<string, number>;
  episodes: Episode[];
  interest: number;
}

interface Prepared extends StockHistory {
  idx: Map<string, number>;
  high: number[];
  vol: (number | null)[];
}

interface Position {
  id: number;
  symbol: string;
  state: MarketState;
  episode: string | null;
  expiry: string;
  strike: number;
  qty: number;
  qtyOpen: number;
  entryDate: string;
  entryPrice: number;
  entrySpot: number;
  cost: number;
  proceeds: number;
  halfDate: string | null;
  halfPrice: number | null;
  halfPnl: number | null;
  peak: number | null;
  lastBid: number;
  pending: { action: 'half' } | { action: 'close'; reason: string } | null;
}

interface PendingEntry {
  symbol: string;
  budget: number;
  expiry: string;
  strike: number;
  state: MarketState;
  episode: string | null;
}

// A new episode starts at a non-normal session after this many normal sessions in a row.
const EPISODE_GAP = 60;
const DEFAULT_RATE = 0.04;

// LEAPS IV from realized vol (fit on live Cboe LEAPS quotes), times a 6-month-VIX regime factor for stressed markets.
export function modeledIv(realizedVol: number, vix6m: number | null): number {
  const regime = vix6m == null ? 1 : Math.min(RULES.ivRegimeMax, Math.max(RULES.ivRegimeMin, Math.sqrt(vix6m / RULES.ivRegimeRef)));
  return (RULES.ivBase + RULES.ivSlope * realizedVol) * regime;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

function prepare(s: Series) {
  return { idx: new Map(s.dates.map((d, i) => [d, i])), high: rollingHigh(s.closes), vol: rollingVol(s.closes) };
}

export function modeledQuote(spot: number, strike: number, years: number, iv: number, rate: number) {
  const mid = blackScholes('CALL', spot, strike, years, iv, rate);
  const half = Math.max(mid * RULES.modeledHalfSpreadPct / 100, RULES.modeledMinHalfSpread);
  return { mid, bid: Math.max(0, mid - half), ask: mid + half };
}

// SPY market state per replay day plus the drawdown episodes they form.
export function marketStates(h: Pick<LeapsHistory, 'days' | 'spy' | 'vix'>): { states: Map<string, { state: MarketState; offHigh: number; episode: string | null }>; episodes: Episode[] } {
  const spy = prepare(h.spy);
  const states = new Map<string, { state: MarketState; offHigh: number; episode: string | null }>();
  const episodes: Episode[] = [];
  let lastVix: number | null = null;
  let normalRun = Infinity;
  for (const date of h.days) {
    lastVix = h.vix.get(date) ?? lastVix;
    const i = spy.idx.get(date);
    if (i == null) { states.set(date, { state: 'normal', offHigh: 0, episode: null }); continue; }
    const off = offHighPct(h.spy.closes[i], spy.high[i]);
    const state = marketState(off, lastVix, null);
    let episode: string | null = null;
    if (state !== 'normal') {
      if (normalRun >= EPISODE_GAP || !episodes.length) episodes.push({ id: date, end: date, maxSpyOffHighPct: round(off, 1) });
      const ep = episodes.at(-1)!;
      ep.end = date;
      ep.maxSpyOffHighPct = Math.max(ep.maxSpyOffHighPct, round(off, 1));
      episode = ep.id;
      normalRun = 0;
    } else {
      normalRun++;
      if (normalRun < EPISODE_GAP && episodes.length) episode = episodes.at(-1)!.id;
    }
    states.set(date, { state, offHigh: off, episode });
  }
  return { states, episodes };
}

export function runLeapsBacktest(h: LeapsHistory, book: LeapsBook, startingBalance: number, commission: number): LeapsBacktestResult {
  const spy = prepare(h.spy);
  const isIndex = isIndexBook(book);
  const stocks: Prepared[] = (isIndex ? h.index.filter(s => s.symbol === INDEX_BOOK.symbolOf[book]) : h.stocks).map(s => ({ ...s, ...prepare(s) }));
  const bySymbol = new Map(stocks.map(s => [s.symbol, s]));
  const { states, episodes } = marketStates(h);
  const skips: Record<string, number> = {};
  const skipSeen = new Set<string>();
  const skip = (symbol: string, reason: string, date: string) => {
    // Counted once per name per reason per month, so a name blocked for weeks is not counted every session.
    const key = `${symbol}|${reason}|${date.slice(0, 7)}`;
    if (skipSeen.has(key)) return;
    skipSeen.add(key);
    skips[reason] = (skips[reason] ?? 0) + 1;
  };

  let cash = startingBalance;
  let nextId = 1;
  let open: Position[] = [];
  let pendingEntries: PendingEntry[] = [];
  const trades: LeapsTrade[] = [];
  const equity: LeapsEquity[] = [];
  let lastVix: number | null = null;
  let lastVix6m: number | null = null;
  let lastRate = DEFAULT_RATE;
  let interest = 0;

  const ivAt = (s: Prepared, i: number): number | null => (s.vol[i] == null ? null : modeledIv(s.vol[i]!, lastVix6m));
  const quoteFor = (s: Prepared, date: string, strike: number, expiry: string) => {
    const i = s.idx.get(date);
    if (i == null) return null;
    const iv = ivAt(s, i);
    if (iv == null) return null;
    return { ...modeledQuote(s.closes[i], strike, yearsUntil(date, expiry), iv, lastRate), spot: s.closes[i] };
  };
  const closePosition = (p: Position, date: string, bid: number, reason: string) => {
    const proceeds = p.qtyOpen * (bid * 100 - commission);
    cash += proceeds;
    p.proceeds += proceeds;
    const pnl = p.proceeds - p.cost;
    trades.push({
      id: p.id, symbol: p.symbol, marketState: p.state, episode: p.episode, expiry: p.expiry, strike: p.strike, qty: round(p.qty, 4),
      entryDate: p.entryDate, entryPrice: round(p.entryPrice), entrySpot: round(p.entrySpot), halfDate: p.halfDate,
      halfPrice: p.halfPrice != null ? round(p.halfPrice) : null, exitDate: date, exitPrice: round(bid), exitReason: reason,
      cost: round(p.cost), pnl: round(pnl), halfPnl: p.halfPnl != null ? round(p.halfPnl) : null, runnerPnl: round(pnl - (p.halfPnl ?? 0)),
    });
    p.qtyOpen = 0;
  };

  h.days.forEach((date, k) => {
    lastVix = h.vix.get(date) ?? lastVix;
    lastVix6m = h.vix6m.get(date) ?? lastVix6m;
    const last = k === h.days.length - 1;
    // Overnight T-bill interest on idle cash, at the rate known at the previous close
    if (k > 0 && cash > 0) {
      const earned = cash * lastRate / 252;
      cash += earned;
      interest += earned;
    }
    lastRate = h.rate.get(date) ?? lastRate;

    // 1a. Sells decided yesterday
    for (const p of open) {
      if (!p.pending) continue;
      const q = quoteFor(bySymbol.get(p.symbol)!, date, p.strike, p.expiry);
      if (!q) continue;   // no bar today: the order waits for the next session
      if (p.pending.action === 'half') {
        const half = p.qtyOpen / 2;
        const proceeds = half * (q.bid * 100 - commission);
        cash += proceeds;
        p.proceeds += proceeds;
        p.halfPnl = proceeds - p.cost * (half / p.qty);
        p.qtyOpen -= half;
        p.halfDate = date;
        p.halfPrice = q.bid;
        p.peak = q.bid;
      } else {
        closePosition(p, date, q.bid, p.pending.reason);
      }
      p.pending = null;
    }
    open = open.filter(p => p.qtyOpen > 0);
    // 1b. Buys decided yesterday (after the sells, so a roll's proceeds pay for its replacement)
    for (const e of pendingEntries) {
      const s = bySymbol.get(e.symbol)!;
      const q = quoteFor(s, date, e.strike, e.expiry);
      if (!q) { skip(e.symbol, 'no price at fill', date); continue; }
      const unit = q.ask * 100 + commission;
      const qty = Math.min(e.budget, cash) / unit;
      if (qty <= 0) { skip(e.symbol, 'no cash at fill', date); continue; }
      const cost = qty * unit;
      cash -= cost;
      open.push({
        id: nextId++, symbol: e.symbol, state: e.state, episode: e.episode, expiry: e.expiry, strike: e.strike, qty, qtyOpen: qty,
        entryDate: date, entryPrice: q.ask, entrySpot: q.spot, cost, proceeds: 0, halfDate: null, halfPrice: null, halfPnl: null,
        peak: null, lastBid: q.bid, pending: null,
      });
    }
    pendingEntries = [];

    // 2. Marks and the equity point
    for (const p of open) {
      const q = quoteFor(bySymbol.get(p.symbol)!, date, p.strike, p.expiry);
      if (q) p.lastBid = q.bid;
      if (p.halfDate) p.peak = Math.max(p.peak ?? 0, p.lastBid);
    }
    const marked = open.reduce((s, p) => s + p.qtyOpen * p.lastBid * 100, 0);
    const eq = cash + marked;
    equity.push({ date, equity: round(eq), cash: round(cash), openPositions: open.length });
    if (last) return;

    // 3. Exit decisions (filled next session)
    for (const p of open) {
      const s = bySymbol.get(p.symbol)!;
      const known = knownQuarters(s.quarters, date);
      const qualityOk = isIndex || (profitCheck(known, date).pass && revenueCheck(known).pass);
      p.pending = decideExit({ entryDate: p.entryDate, expiry: p.expiry, entryPrice: p.entryPrice, halfSold: p.halfDate != null, peakSinceHalf: p.peak, qualityOk }, date, p.lastBid, isIndex);
    }

    // 4. Entry decisions (filled next session)
    const ms = states.get(date)!;
    if (isIndex) {
      // Always invested: re-buy an index as soon as its previous LEAPS is closed (a roll fills the next session).
      for (const s of stocks) {
        const i = s.idx.get(date);
        if (i == null || open.some(p => p.symbol === s.symbol && !p.pending)) continue;
        const iv = ivAt(s, i);
        const expiry = pickLeapsExpiry(modeledLeapsExpiries(date), date, INDEX_BOOK.minExpiryDays, INDEX_BOOK.maxExpiryDays);
        if (iv == null || !expiry) { skip(s.symbol, iv == null ? 'no volatility history' : 'no LEAPS expiry', date); continue; }
        const years = yearsUntil(date, expiry);
        const spot = s.closes[i];
        const strike = snapStrike(strikeForDelta(spot, years, iv, lastRate, BOOK_DELTA[book]), spot);
        // A position being rolled frees its value at the same fill, so size on equity, not on today's cash.
        const budget = eq * INDEX_BOOK.positionPct / 100;
        pendingEntries.push({ symbol: s.symbol, budget, expiry, strike, state: ms.state, episode: ms.episode });
      }
      return;
    }
    if (ms.state === 'normal') return;
    const held = new Set(open.map(p => p.symbol));
    const candidates: { s: Prepared; i: number; off: number; iv: number }[] = [];
    for (const s of stocks) {
      const i = s.idx.get(date);
      if (i == null || held.has(s.symbol)) continue;
      const iv = ivAt(s, i);
      if (iv == null) continue;
      const off = offHighPct(s.closes[i], s.high[i]);
      if (off < RULES.stockOffHighPct) continue;
      const lastClose = s.closes.at(-1)!;
      const cap = s.marketCapNow != null && lastClose > 0 ? s.marketCapNow * (s.closes[i] / lastClose) : null;
      const ratio = lastVix ? s.vol[i]! / (lastVix / 100) : null;
      const q = qualityChecks(s.quarters, date, cap, ratio);
      if (!q.eligible) { skip(s.symbol, `not eligible: ${q.checks.find(c => !c.pass)!.key}`, date); continue; }
      candidates.push({ s, i, off, iv });
    }
    candidates.sort((a, b) => b.off - a.off);
    let openCost = open.reduce((sum, p) => sum + p.cost * (p.qtyOpen / p.qty), 0);
    let reservedCash = 0;
    for (const c of candidates) {
      const expiry = pickLeapsExpiry(modeledLeapsExpiries(date), date);
      if (!expiry) { skip(c.s.symbol, 'no LEAPS expiry', date); continue; }
      const years = yearsUntil(date, expiry);
      const spot = c.s.closes[c.i];
      const strike = snapStrike(strikeForDelta(spot, years, c.iv, lastRate, BOOK_DELTA[book]), spot);
      const q = modeledQuote(spot, strike, years, c.iv, lastRate);
      const size = sizePosition({
        equity: eq, cash: cash - reservedCash, openCost, openCount: open.length + pendingEntries.length,
        state: ms.state, unitCost: q.ask * 100 + commission, wholeContracts: false,
      });
      if ('skip' in size) { skip(c.s.symbol, size.skip, date); continue; }
      pendingEntries.push({ symbol: c.s.symbol, budget: size.budget, expiry, strike, state: ms.state, episode: ms.episode });
      openCost += size.budget;
      reservedCash += size.budget;
    }
  });

  const to = h.days.at(-1) ?? '';
  return {
    book,
    from: h.days[0] ?? '',
    to,
    startingBalance,
    trades,
    equity,
    openAtEnd: open.map(p => ({
      symbol: p.symbol, expiry: p.expiry, strike: p.strike, entryDate: p.entryDate, entryPrice: round(p.entryPrice),
      lastBid: round(p.lastBid), halfSold: p.halfDate != null, cost: round(p.cost),
      unrealizedPnl: round(p.proceeds + p.qtyOpen * p.lastBid * 100 - p.cost),
    })),
    skips,
    episodes,
    interest: round(interest),
  };
}

export interface LeapsSummary {
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
  unrealizedPnl: number;
  returnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  spyReturnPct: number | null;
  benchmark: { symbol: string; returnPct: number | null; cagrPct: number | null; maxDrawdownPct: number | null };
  halfSaleRate: number | null;     // % of trades that reached +100%
  halfPnl: number;
  runnerPnl: number;
  avgHoldDays: number | null;
  avgReturnPct: number | null;     // per trade, on cost
  best: { symbol: string; pnl: number } | null;
  worst: { symbol: string; pnl: number } | null;
  exitReasons: Record<string, number>;
  episodes: Array<Episode & { trades: number; pnl: number; winRate: number | null }>;
  skips: Record<string, number>;
  openAtEnd: number;
  sessions: number;
  interest: number;
}

// Total return, CAGR and max drawdown of a price series over the run's dates.
function seriesStats(s: Series, from: string, to: string) {
  const w = s.dates.map((d, i) => ({ d, c: s.closes[i] })).filter(x => x.d >= from && x.d <= to);
  if (w.length < 2) return { returnPct: null, cagrPct: null, maxDrawdownPct: null };
  const years = daysBetween(w[0].d, w.at(-1)!.d) / 365.25;
  let peak = -Infinity;
  let dd = 0;
  for (const x of w) { peak = Math.max(peak, x.c); dd = Math.min(dd, x.c / peak - 1); }
  const g = w.at(-1)!.c / w[0].c;
  return { returnPct: round((g - 1) * 100), cagrPct: years >= 1 ? round((g ** (1 / years) - 1) * 100) : null, maxDrawdownPct: round(Math.abs(dd) * 100) };
}

export function summarizeLeaps(r: LeapsBacktestResult, spy: Series, bench: { symbol: string; series: Series } = { symbol: 'SPY', series: spy }): LeapsSummary {
  const t = r.trades;
  const wins = t.filter(x => x.pnl > 0);
  const final = r.equity.at(-1)?.equity ?? r.startingBalance;
  const years = r.from && r.to ? daysBetween(r.from, r.to) / 365.25 : 0;
  let peak = -Infinity;
  let dd = 0;
  for (const p of r.equity) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) dd = Math.min(dd, p.equity / peak - 1);
  }
  const spyIn = spy.dates.map((d, i) => ({ d, c: spy.closes[i] })).filter(x => x.d >= r.from && x.d <= r.to);
  const exitReasons: Record<string, number> = {};
  for (const x of t) exitReasons[x.exitReason] = (exitReasons[x.exitReason] ?? 0) + 1;
  const sorted = [...t].sort((a, b) => b.pnl - a.pnl);
  return {
    trades: t.length,
    wins: wins.length,
    winRate: t.length ? round(wins.length / t.length * 100, 1) : null,
    totalPnl: round(t.reduce((s, x) => s + x.pnl, 0)),
    unrealizedPnl: round(r.openAtEnd.reduce((s, p) => s + p.unrealizedPnl, 0)),
    returnPct: round((final / r.startingBalance - 1) * 100),
    cagrPct: years >= 1 && final > 0 ? round(((final / r.startingBalance) ** (1 / years) - 1) * 100) : null,
    maxDrawdownPct: round(-dd * 100),
    spyReturnPct: spyIn.length >= 2 ? round((spyIn.at(-1)!.c / spyIn[0].c - 1) * 100) : null,
    benchmark: { symbol: bench.symbol, ...seriesStats(bench.series, r.from, r.to) },
    halfSaleRate: t.length ? round(t.filter(x => x.halfDate).length / t.length * 100, 1) : null,
    halfPnl: round(t.reduce((s, x) => s + (x.halfPnl ?? 0), 0)),
    runnerPnl: round(t.reduce((s, x) => s + x.runnerPnl, 0)),
    avgHoldDays: t.length ? Math.round(t.reduce((s, x) => s + daysBetween(x.entryDate, x.exitDate), 0) / t.length) : null,
    avgReturnPct: t.length ? round(t.reduce((s, x) => s + x.pnl / x.cost, 0) / t.length * 100, 1) : null,
    best: sorted[0] ? { symbol: sorted[0].symbol, pnl: sorted[0].pnl } : null,
    worst: sorted.at(-1) ? { symbol: sorted.at(-1)!.symbol, pnl: sorted.at(-1)!.pnl } : null,
    exitReasons,
    episodes: r.episodes.map(e => {
      const in_ = t.filter(x => x.episode === e.id);
      return {
        ...e, trades: in_.length, pnl: round(in_.reduce((s, x) => s + x.pnl, 0)),
        winRate: in_.length ? round(in_.filter(x => x.pnl > 0).length / in_.length * 100, 1) : null,
      };
    }),
    skips: r.skips,
    openAtEnd: r.openAtEnd.length,
    sessions: r.equity.length,
    interest: r.interest,
  };
}
