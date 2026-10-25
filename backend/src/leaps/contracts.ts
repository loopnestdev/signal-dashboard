import { isMonthlyExpiry } from '../collector/parsers.js';
import { BOOK_DELTA, daysBetween, INDEX_BOOK, QUOTE_GRID, RULES, type LeapsBook } from './rules.js';

// Contract choice (docs/leaps-rules.md section 4): first standard monthly expiry 15-27 months out, call nearest the
// book's target delta, with the section 1 liquidity check on that contract.

export function pickLeapsExpiry(expiries: string[], date: string, minDays: number = RULES.minExpiryDays, maxDays: number = RULES.maxExpiryDays): string | null {
  return [...new Set(expiries)]
    .filter(e => isMonthlyExpiry(e))
    .filter(e => daysBetween(date, e) >= minDays && daysBetween(date, e) <= maxDays)
    .sort()[0] ?? null;
}

export const expiryWindow = (book: LeapsBook): [number, number] =>
  book === 'IX' ? [INDEX_BOOK.minExpiryDays, INDEX_BOOK.maxExpiryDays] : [RULES.minExpiryDays, RULES.maxExpiryDays];

const thirdFriday = (year: number, month: number): string => {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const offset = (5 - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + 14, 12)).toISOString().slice(0, 10);
};

// Backtest stand-in for the listed chain: January and June LEAPS cycles, so one always falls 15-22 months out.
export function modeledLeapsExpiries(date: string): string[] {
  const y = Number(date.slice(0, 4));
  const out: string[] = [];
  for (let year = y; year <= y + 3; year++) out.push(thirdFriday(year, 1), thirdFriday(year, 6));
  return out;
}

export interface ChainCall {
  contract: string;
  expiry: string;
  strike: number;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  delta: number | null;
  openInterest: number | null;
}

export interface ContractPick {
  call: ChainCall | null;
  liquid: boolean;
  reason: string | null;   // why no contract / why it fails liquidity
}

// Research grid: on each standard monthly expiry 9+ months out, the quoted call nearest each grid delta (deduped).
export function quoteGrid(calls: ChainCall[], date: string): ChainCall[] {
  const expiries = [...new Set(calls.map(c => c.expiry))].filter(e => isMonthlyExpiry(e) && daysBetween(date, e) >= QUOTE_GRID.minExpiryDays);
  const out = new Map<string, ChainCall>();
  for (const e of expiries) {
    const usable = calls.filter(c => c.expiry === e && c.delta != null && c.bid != null && c.ask != null);
    if (!usable.length) continue;
    for (const target of QUOTE_GRID.deltas) {
      const c = usable.reduce((best, x) => (Math.abs(x.delta! - target) < Math.abs(best.delta! - target) ? x : best));
      out.set(c.contract, c);
    }
  }
  return [...out.values()];
}

export const spreadPct = (bid: number, ask: number) => ((ask - bid) / ((ask + bid) / 2)) * 100;

// pickContract:
//   - Calls on the chosen expiry with a delta and an ask; the one nearest the book's target delta wins
//   - Liquidity (OI >= 500, spread <= 5% of mid) is judged on that contract only, so a thin strike is a skip, not a fallback
export function pickContract(calls: ChainCall[], date: string, book: LeapsBook): ContractPick {
  const [minDays, maxDays] = expiryWindow(book);
  const expiry = pickLeapsExpiry(calls.map(c => c.expiry), date, minDays, maxDays);
  if (!expiry) return { call: null, liquid: false, reason: `no LEAPS expiry ${Math.round(minDays / 30.4)}-${Math.round(maxDays / 30.4)} months out` };
  const target = BOOK_DELTA[book];
  const usable = calls.filter(c => c.expiry === expiry && c.delta != null && c.ask != null && c.ask > 0);
  if (!usable.length) return { call: null, liquid: false, reason: `no quoted calls for ${expiry}` };
  const call = usable.reduce((best, c) => (Math.abs(c.delta! - target) < Math.abs(best.delta! - target) ? c : best));
  // Index LEAPS (SPY/QQQ) trade in deep markets even where a single strike shows little open interest.
  if (book !== 'IX' && (call.openInterest ?? 0) < RULES.minOpenInterest) {
    return { call, liquid: false, reason: `illiquid: open interest ${call.openInterest ?? 0} < ${RULES.minOpenInterest}` };
  }
  if (call.bid == null || call.bid <= 0 || spreadPct(call.bid, call.ask!) > RULES.maxSpreadPct) {
    const s = call.bid ? spreadPct(call.bid, call.ask!).toFixed(1) : 'n/a';
    return { call, liquid: false, reason: `illiquid: spread ${s}% > ${RULES.maxSpreadPct}%` };
  }
  return { call, liquid: true, reason: null };
}
