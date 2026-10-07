import { riskPerTrade, type TradingSettings } from '../lib/settings.js';
import { selectContract, payoffAt, type Structure } from './contracts.js';
import { earningsExitDue, reportWithin } from './earnings.js';
import { blackScholes, MODELED_HALF_SPREAD, yearsBetween } from './pricing.js';
import {
  barOn, bookAExit, bookASignals, bookBExit, bookBSignals, bookCCloseExit, bookCSignals, dpDirection,
  type EntrySignal,
} from './strategies.js';
import type { Bar, Book, ClosedTrade, DayData, EquityPoint, Leg, MarketData, Position } from './types.js';

// Day-by-day replay of one paper book under rules v1.0.
//   - Decisions use a session's data after its close; options fill at the next session's close quotes (buy at ask,
//     sell at bid), shares at the next session's open; share stops/targets trigger intraday on the daily bar
//   - A held contract without a recorded quote is priced by Black-Scholes from its last seen IV and flagged "modeled";
//     new entries always need real quotes
//   - Earnings exits spawn a "shadow" twin that ignores earnings, to measure what holding would have returned

export interface SkipRecord {
  date: string;
  symbol: string;
  reason: string;
}

export interface OpenAtEnd {
  symbol: string;
  kind: string;
  direction: string;
  entryDate: string;
  unrealizedPnl: number;
  risk: number;
}

export interface BacktestResult {
  book: Book;
  from: string;
  to: string;
  startingBalance: number;
  trades: ClosedTrade[];
  openAtEnd: OpenAtEnd[];
  equity: EquityPoint[];
  skips: SkipRecord[];
  modeledMarks: number;
}

interface PendingEntry {
  signal: EntrySignal;
  structure: Structure | null;
  budget: number;
  decisionDate: string;
}

type PriceSide = 'mid' | 'open' | 'close';

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function runBacktest(data: MarketData, book: Book, settings: TradingSettings): Promise<BacktestResult> {
  const days = data.days;
  const startingBalance = settings.paperStartingBalance;
  let cash = startingBalance;
  let nextId = 1;
  const positions: Position[] = [];
  const closed: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];
  const skips: SkipRecord[] = [];
  const pendingEntries: PendingEntry[] = [];
  const pendingExits = new Map<number, string>();
  const dpHistory = new Map<string, string[]>();
  const barCache = new Map<string, Bar[]>();
  let modeledMarks = 0;

  const bars = async (symbol: string) => {
    if (!barCache.has(symbol)) barCache.set(symbol, await data.bars(symbol).catch(() => []));
    return barCache.get(symbol)!;
  };

  const optionCommission = (p: { legs: Leg[]; qty: number }) => settings.costs.optionPerContract * p.legs.length * p.qty;

  // Unit value of an option position: 'open' = cost to buy now, 'close' = proceeds to sell now, 'mid' = mark.
  const unitValue = (p: Position, day: DayData, close: number | null, side: PriceSide): { value: number; modeled: boolean } => {
    let value = 0;
    let modeled = false;
    for (const leg of p.legs) {
      const q = day.quotes.get(p.symbol)?.find(x => x.contract === leg.contract);
      let bid: number;
      let ask: number;
      if (q && q.bid != null && q.ask != null && q.ask > 0) {
        bid = q.bid;
        ask = q.ask;
        if (q.iv) p.lastIv[leg.contract] = q.iv;
      } else {
        modeled = true;
        const iv = p.lastIv[leg.contract] ?? (day.iv30.get(p.symbol) ?? 40) / 100;
        const m = close == null ? 0 : blackScholes(leg.type, close, leg.strike, yearsBetween(day.date, leg.expiry), iv);
        bid = m * (1 - MODELED_HALF_SPREAD);
        ask = m * (1 + MODELED_HALF_SPREAD);
      }
      const longPrice = side === 'open' ? ask : side === 'close' ? bid : (bid + ask) / 2;
      const shortPrice = side === 'open' ? bid : side === 'close' ? ask : (bid + ask) / 2;
      value += leg.side === 1 ? longPrice * 100 : -shortPrice * 100;
    }
    return { value: Math.max(0, value), modeled };
  };

  const recordClose = (p: Position, date: string, exitUnitValue: number, reason: string, exitCommission: number, modeled: boolean) => {
    const idx = positions.indexOf(p);
    if (idx >= 0) positions.splice(idx, 1);
    const proceeds = exitUnitValue * p.qty - exitCommission;
    const commissions = p.commissions + exitCommission;
    const pnl = round2(proceeds - p.unitCost * p.qty - p.commissions);
    if (p.shadow) {
      const original = closed.find(t => t.id === p.shadowOf);
      if (original) original.shadowPnl = pnl;
      return;
    }
    cash += proceeds;
    closed.push({
      id: p.id, book, symbol: p.symbol, direction: p.direction, kind: p.kind, legs: p.legs, qty: p.qty,
      signalDate: p.signalDate, entryDate: p.entryDate, exitDate: date,
      unitCost: round2(p.unitCost), exitUnitValue: round2(exitUnitValue), risk: round2(p.risk),
      commissions: round2(commissions), pnl, rMultiple: p.risk > 0 ? round2(pnl / p.risk) : 0,
      exitReason: reason, modeledFills: p.modeledFills + (modeled ? 1 : 0), shadowPnl: null, meta: p.meta,
    });
  };

  const spawnShadow = (p: Position) => {
    positions.push({ ...structuredClone(p), id: nextId++, shadow: true, shadowOf: p.id });
  };

  const live = () => positions.filter(p => !p.shadow);
  const tradingDaysHeld = (p: Position, date: string) => days.filter(d => d > p.entryDate && d <= date).length;

  const sizingBudget = (equityNow: number): { budget: number; note: string | null } => {
    const cap = book === 'C' ? equityNow * settings.shares.riskPct / 100 : riskPerTrade(equityNow, settings.sizing);
    const done = closed.filter(t => t.book === book);
    if (done.length < settings.sizing.kellyMinTrades) return { budget: cap, note: null };
    const wins = done.filter(t => t.pnl > 0);
    const losses = done.filter(t => t.pnl <= 0);
    const w = wins.length / done.length;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.rMultiple, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0) / losses.length) : 0;
    const kelly = avgLoss === 0 ? 1 : avgWin === 0 ? -1 : w - (1 - w) / (avgWin / avgLoss);
    if (kelly <= 0) return { budget: 0, note: 'Kelly: no edge in closed trades' };
    return { budget: Math.min(cap, settings.sizing.kellyFraction * kelly * equityNow), note: null };
  };

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const day = await data.day(date);
    const closeOf = async (symbol: string) => barOn(await bars(symbol), date)?.close ?? day.gex.get(symbol)?.spot ?? null;

    for (const [symbol, v] of day.dp) {
      dpHistory.set(symbol, [dpDirection(v), ...(dpHistory.get(symbol) ?? [])].slice(0, 5));
    }

    // 1. Fills decided at the previous close
    for (const [id, reason] of [...pendingExits]) {
      const p = positions.find(x => x.id === id);
      pendingExits.delete(id);
      if (!p) continue;
      if (p.kind === 'shares') {
        const bar = barOn(await bars(p.symbol), date);
        if (!bar) { pendingExits.set(id, reason); continue; }
        recordClose(p, date, bar.open, reason, settings.costs.sharePerOrder, false);
      } else {
        const { value, modeled } = unitValue(p, day, await closeOf(p.symbol), 'close');
        recordClose(p, date, value, reason, optionCommission(p), modeled);
      }
    }

    const equityAtOpen = equity.at(-1)?.equity ?? startingBalance;
    for (const pe of pendingEntries.splice(0)) {
      const { signal } = pe;
      const skip = (reason: string) => skips.push({ date, symbol: signal.symbol, reason });
      if (book === 'C') {
        const bar = barOn(await bars(signal.symbol), date);
        if (!bar || signal.stop == null) { skip('no price at fill'); continue; }
        if (bar.open <= signal.stop) { skip('gapped below stop at fill'); continue; }
        const perShareRisk = bar.open - signal.stop;
        const shares = Math.floor(Math.min(
          pe.budget / perShareRisk,
          equityAtOpen * settings.shares.maxPositionPct / 100 / bar.open,
          (cash - settings.costs.sharePerOrder) / bar.open,
        ));
        if (shares < 1) { skip('too expensive at fill'); continue; }
        cash -= shares * bar.open + settings.costs.sharePerOrder;
        positions.push({
          id: nextId++, book, symbol: signal.symbol, direction: 'BULLISH', kind: 'shares', legs: [], qty: shares,
          signalDate: pe.decisionDate, entryDate: date, unitCost: bar.open, risk: perShareRisk * shares,
          commissions: settings.costs.sharePerOrder, maxValue: null, stop: signal.stop, target: signal.target,
          modeledFills: 0, daysHeld: 0, earningsHold: false, shadow: false, shadowOf: null, lastIv: {}, meta: signal.meta,
        });
        continue;
      }
      const s = pe.structure!;
      const draft: Position = {
        id: 0, book, symbol: signal.symbol, direction: signal.direction, kind: s.kind, legs: s.legs, qty: 1,
        signalDate: pe.decisionDate, entryDate: date, unitCost: 0, risk: 0, commissions: 0, maxValue: s.maxValue,
        stop: signal.stop, target: signal.target, modeledFills: 0, daysHeld: 0, earningsHold: false,
        shadow: false, shadowOf: null, lastIv: {}, meta: signal.meta,
      };
      const { value: unitCost, modeled } = unitValue(draft, day, await closeOf(signal.symbol), 'open');
      if (modeled || unitCost <= 0) { skip('no quote at fill'); continue; }
      const commissionPerUnit = settings.costs.optionPerContract * s.legs.length;
      const qty = Math.floor(Math.min(pe.budget / unitCost, (cash) / (unitCost + commissionPerUnit)));
      if (qty < 1) { skip('too expensive at fill'); continue; }
      cash -= unitCost * qty + commissionPerUnit * qty;
      positions.push({ ...draft, id: nextId++, qty, unitCost, risk: unitCost * qty, commissions: commissionPerUnit * qty });
    }

    // 2. Shares: stop / target touched during the session (stop assumed first if both)
    for (const p of positions.filter(x => x.kind === 'shares' && !pendingExits.has(x.id))) {
      const bar = barOn(await bars(p.symbol), date);
      if (!bar) continue;
      if (p.stop != null && bar.low <= p.stop) {
        recordClose(p, date, Math.min(p.stop, bar.open), p.earningsHold ? 'stop at entry (held through earnings)' : 'stop', settings.costs.sharePerOrder, false);
      } else if (p.target != null && bar.high >= p.target) {
        recordClose(p, date, Math.max(p.target, bar.open), 'target', settings.costs.sharePerOrder, false);
      }
    }

    // 3. Mark to market
    let marked = 0;
    let openRisk = 0;
    for (const p of live()) {
      const close = await closeOf(p.symbol);
      if (p.kind === 'shares') {
        marked += (close ?? p.unitCost) * p.qty;
      } else {
        const { value, modeled } = unitValue(p, day, close, 'mid');
        if (modeled) modeledMarks++;
        marked += value * p.qty;
      }
      openRisk += p.risk;
    }
    const equityNow = round2(cash + marked);
    equity.push({ date, equity: equityNow, cash: round2(cash), openRisk: round2(openRisk), openPositions: live().length });

    // 4. Exit decisions for the next session
    for (const p of [...positions]) {
      if (pendingExits.has(p.id)) continue;
      p.daysHeld = tradingDaysHeld(p, date);
      const close = await closeOf(p.symbol);
      if (close == null) continue;

      if (!p.shadow && !p.earningsHold) {
        const report = earningsExitDue(data.earnings(p.symbol), date);
        if (report) {
          const unrealized = p.kind === 'shares' ? (close - p.unitCost) * p.qty : 0;
          if (p.kind === 'shares' && unrealized >= 2 * p.risk) {
            p.earningsHold = true;
            p.stop = p.unitCost;
            p.meta = { ...p.meta, earningsHold: report.date };
          } else {
            pendingExits.set(p.id, `earnings ${report.date} (${report.time})`);
            spawnShadow(p);
            continue;
          }
        }
      }

      let reason: string | null;
      if (p.kind === 'shares') {
        reason = bookCCloseExit(p, day);
      } else {
        const { value } = unitValue(p, day, close, 'mid');
        const ctx = { date, close, unitValue: value, day, dpDirections: dpHistory.get(p.symbol) ?? [] };
        const dte = Math.min(...p.legs.map(l => yearsBetween(date, l.expiry) * 365));
        reason = dte <= 0 ? 'expiry' : book === 'A' ? bookAExit(p, ctx) : bookBExit(p, ctx);
      }
      if (reason) pendingExits.set(p.id, reason);
    }

    // 5. Entry decisions for the next session (none on the last day: nothing could fill)
    if (i === days.length - 1) continue;

    let candidates: EntrySignal[];
    if (book === 'A') candidates = bookASignals(day);
    else if (book === 'C') candidates = bookCSignals(day, new Map(await Promise.all([...day.signals.keys()].map(async s => [s, await bars(s)] as const))));
    else {
      const barMap = new Map(await Promise.all([...day.scanner.keys()].map(async s => [s, await bars(s)] as const)));
      const { signals, failures } = bookBSignals(day, barMap);
      for (const f of failures) skips.push({ date, symbol: f.symbol, reason: f.reason });
      candidates = signals;
    }

    for (const signal of candidates) {
      const skip = (reason: string) => skips.push({ date, symbol: signal.symbol, reason });
      const holding = live().some(p => p.symbol === signal.symbol) || pendingEntries.some(e => e.signal.symbol === signal.symbol);
      const maxPerTicker = book === 'C' ? 1 : settings.optionsLimits.maxPerTicker;
      const perTicker = live().filter(p => p.symbol === signal.symbol).length + pendingEntries.filter(e => e.signal.symbol === signal.symbol).length;
      if (holding && perTicker >= maxPerTicker) continue;

      const report = reportWithin(data.earnings(signal.symbol), date);
      if (report) { skip(`earnings window (${report.date})`); continue; }

      const openCount = live().length + pendingEntries.length;
      const maxOpen = book === 'C' ? settings.shares.maxOpenPositions : settings.optionsLimits.maxOpenTrades;
      if (openCount >= maxOpen) { skip('limit: max open trades'); continue; }

      const { budget: sized, note } = sizingBudget(equityNow);
      if (note) { skip(note); continue; }
      let budget = sized;

      if (book === 'C') {
        pendingEntries.push({ signal, structure: null, budget, decisionDate: date });
        continue;
      }

      const reserved = live().reduce((s, p) => s + p.risk, 0) + pendingEntries.reduce((s, e) => s + e.budget, 0);
      const room = equityNow * settings.optionsLimits.maxOpenRiskPct / 100 - reserved;
      if (room <= 0) { skip('limit: total open risk'); continue; }
      budget = Math.min(budget, room);

      const quotes = day.quotes.get(signal.symbol) ?? [];
      let accept: ((s: Structure) => boolean) | undefined;
      if (book === 'B') {
        const close = await closeOf(signal.symbol);
        const t = signal.target;
        if (t == null || close == null || (signal.direction === 'BULLISH' ? t <= close : t >= close)) { skip('check 2: GEX target not beyond price'); continue; }
        accept = s => payoffAt(s, t) - s.unitCost >= 2 * s.unitCost;
      }
      const sel = selectContract(quotes, signal.direction, budget, date, accept);
      if (!sel.ok) {
        skip(book === 'B' && sel.reason === 'no structure passes the payoff check' ? 'check 2: no 2:1 structure at GEX target' : sel.reason);
        continue;
      }
      pendingEntries.push({ signal, structure: sel.structure, budget, decisionDate: date });
    }
  }

  // Positions still open at the end are reported at their last mark; open shadows report their unrealized result.
  const lastDate = days.at(-1);
  const openAtEnd: OpenAtEnd[] = [];
  if (lastDate) {
    const day = await data.day(lastDate);
    for (const p of positions) {
      const close = barOn(await bars(p.symbol), lastDate)?.close ?? null;
      const value = p.kind === 'shares' ? (close ?? p.unitCost) : unitValue(p, day, close, 'mid').value;
      const unrealized = round2((value - p.unitCost) * p.qty - p.commissions);
      if (p.shadow) {
        const original = closed.find(t => t.id === p.shadowOf);
        if (original && original.shadowPnl == null) original.shadowPnl = unrealized;
        continue;
      }
      openAtEnd.push({ symbol: p.symbol, kind: p.kind, direction: p.direction, entryDate: p.entryDate, unrealizedPnl: unrealized, risk: round2(p.risk) });
    }
  }

  return { book, from: days[0] ?? '', to: lastDate ?? '', startingBalance, trades: closed, openAtEnd, equity, skips, modeledMarks };
}
