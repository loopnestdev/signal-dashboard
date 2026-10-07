import { isMonthlyExpiry } from '../collector/parsers.js';
import { yearsBetween } from './pricing.js';
import type { Direction, Leg, OptionQuote } from './types.js';

// Rules 1.6 - contract selection for the options books.

export const TARGET_DELTA_SINGLE = 0.40;
export const TARGET_DELTA_SPREAD_LONG = 0.50;
export const MAX_SPREAD_PCT = 0.10;
export const MIN_OPEN_INTEREST = 100;
export const MIN_ENTRY_DTE = 30;
export const MAX_ENTRY_DTE = 75;

export interface Structure {
  kind: 'option' | 'spread';
  legs: Leg[];
  unitCost: number;        // estimated debit for one contract/spread at decision time (ask/bid, x100)
  maxValue: number | null; // spread width x 100
}

// Payoff at the underlying price `at`, for one unit, before subtracting the cost.
export function payoffAt(s: Structure, at: number): number {
  let value = 0;
  for (const leg of s.legs) {
    const intrinsic = leg.type === 'CALL' ? Math.max(0, at - leg.strike) : Math.max(0, leg.strike - at);
    value += leg.side * intrinsic * 100;
  }
  return value;
}

const mid = (q: OptionQuote) => ((q.bid ?? 0) + (q.ask ?? 0)) / 2;

export function isLiquid(q: OptionQuote): boolean {
  if (q.bid == null || q.ask == null || q.bid <= 0 || q.ask <= 0 || q.delta == null) return false;
  if ((q.openInterest ?? 0) < MIN_OPEN_INTEREST) return false;
  return (q.ask - q.bid) / mid(q) <= MAX_SPREAD_PCT;
}

// Rules 1.6 step 1: the later recorded expiry about 30-60 days out; a standard monthly is preferred so the
// held contract stays recorded every day until its 21-days-left exit.
export function pickEntryExpiry(quotes: OptionQuote[], decisionDate: string): string | null {
  const days = (e: string) => yearsBetween(decisionDate, e) * 365;
  const expiries = [...new Set(quotes.map(q => q.expiry))].filter(e => days(e) >= MIN_ENTRY_DTE && days(e) <= MAX_ENTRY_DTE).sort();
  const monthlies = expiries.filter(isMonthlyExpiry);
  return (monthlies.length ? monthlies : expiries).at(-1) ?? null;
}

const legOf = (q: OptionQuote, side: 1 | -1): Leg => ({ contract: q.contract, type: q.type, strike: q.strike, expiry: q.expiry, side });

export type Selection = { ok: true; structure: Structure } | { ok: false; reason: string };

// Steps 2-5: single option near 0.40 delta within budget, else a debit spread with max gain >= 2x cost, else skip.
// `accept` lets a book add its own test (Book B's 2:1 at the GEX target).
export function selectContract(
  quotes: OptionQuote[],
  direction: Direction,
  budget: number,
  decisionDate: string,
  accept: (s: Structure) => boolean = () => true,
): Selection {
  const type = direction === 'BULLISH' ? 'CALL' : 'PUT';
  const expiry = pickEntryExpiry(quotes, decisionDate);
  if (!expiry) return { ok: false, reason: 'no expiry 30-75 days out' };
  const chain = quotes.filter(q => q.expiry === expiry && q.type === type);
  const liquid = chain.filter(isLiquid);
  if (liquid.length === 0) return { ok: false, reason: 'illiquid' };

  const byDelta = (target: number) => [...liquid].sort((a, b) => Math.abs(Math.abs(a.delta!) - target) - Math.abs(Math.abs(b.delta!) - target));

  let anyFitBudget = false;
  for (const q of byDelta(TARGET_DELTA_SINGLE)) {
    const s: Structure = { kind: 'option', legs: [legOf(q, 1)], unitCost: q.ask! * 100, maxValue: null };
    if (s.unitCost > budget) continue;
    anyFitBudget = true;
    if (accept(s)) return { ok: true, structure: s };
  }

  const [long] = byDelta(TARGET_DELTA_SPREAD_LONG);
  const further = liquid
    .filter(q => (type === 'CALL' ? q.strike > long.strike : q.strike < long.strike))
    .sort((a, b) => Math.abs(a.strike - long.strike) - Math.abs(b.strike - long.strike));
  for (const short of further) {
    const debit = (long.ask! - short.bid!) * 100;
    if (debit <= 0) continue;
    const width = Math.abs(short.strike - long.strike) * 100;
    if (debit > budget) continue;
    anyFitBudget = true;
    if (width - debit < 2 * debit) continue;
    const s: Structure = { kind: 'spread', legs: [legOf(long, 1), legOf(short, -1)], unitCost: debit, maxValue: width };
    if (accept(s)) return { ok: true, structure: s };
  }

  return { ok: false, reason: anyFitBudget ? 'no structure passes the payoff check' : 'too expensive for account size' };
}
