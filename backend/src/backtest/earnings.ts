import { isTradingDay } from '../lib/marketCalendar.js';
import type { EarningsEvent } from './types.js';

// Rules section 5: no entry within 10 trading days of a report; exit at the last close before it.

export const EARNINGS_ENTRY_WINDOW = 10;

function shift(date: string, step: 1 | -1): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + step); while (!isTradingDay(d.toISOString().slice(0, 10)));
  return d.toISOString().slice(0, 10);
}

export const nextTradingDay = (date: string) => shift(date, 1);
export const prevTradingDay = (date: string) => shift(date, -1);

// Trading days d with from < d <= to (0 when to <= from).
export function tradingDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d < to; ) {
    d = nextTradingDay(d);
    if (d <= to) n++;
  }
  return n;
}

// Before-open report: the previous session's close. After-close or unknown timing: that day's close.
export function lastCloseBefore(e: EarningsEvent): string {
  const day = isTradingDay(e.date) ? e.date : prevTradingDay(e.date);
  return e.time === 'pre-market' ? prevTradingDay(day) : day;
}

// A report today (any timing) or within the next `window` trading days blocks a new entry decided today.
export function reportWithin(events: EarningsEvent[], date: string, window = EARNINGS_ENTRY_WINDOW): EarningsEvent | null {
  return events.find(e => e.date >= date && tradingDaysBetween(date, e.date) <= window) ?? null;
}

// Decision at `date`'s close fills on the next session. Exit when that fill is the last close before the report,
// or later if the deadline was somehow missed but the report has not happened yet.
export function earningsExitDue(events: EarningsEvent[], date: string): EarningsEvent | null {
  const next = nextTradingDay(date);
  return events.find(e => {
    const deadline = lastCloseBefore(e);
    return next === deadline || (date >= deadline && date <= e.date && !(date === e.date && e.time === 'pre-market'));
  }) ?? null;
}
