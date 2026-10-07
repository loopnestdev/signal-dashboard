import type { Range } from '../lib/yahooClient.js';
import type { Bar, Book } from './types.js';

// Pure helpers for the Performance page (release 2 step 4): run requests, the SPY comparison line, run grouping.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const BOOKS: Book[] = ['A', 'B', 'C'];

export interface RunRequest {
  from: string;
  to: string;
  books: Book[];
}

const validDate = (s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

export function parseRunRequest(body: unknown, today: string): { request: RunRequest } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!validDate(b.from) || !validDate(b.to)) return { error: 'from and to must be dates (YYYY-MM-DD)' };
  if (b.from > b.to) return { error: 'from must be on or before to' };
  if (b.to > today) return { error: 'to cannot be in the future' };
  const days = (Date.parse(`${b.to}T12:00:00Z`) - Date.parse(`${b.from}T12:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) return { error: 'range is limited to one year' };
  const raw = b.books == null ? BOOKS : b.books;
  if (!Array.isArray(raw) || raw.length === 0 || raw.some(x => !BOOKS.includes(x as Book))) return { error: 'books must be a list of A, B, C' };
  const books = BOOKS.filter(x => raw.includes(x));
  return { request: { from: b.from, to: b.to, books } };
}

// Yahoo range long enough to cover `from` plus the ~20 sessions before it that ATR and the 2% entry rule look back on.
export function barsRangeFor(from: string, today: string): Range {
  const days = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 + 35;
  if (days <= 170) return '6mo';
  if (days <= 355) return '1y';
  return '2y';
}

// "SPY bought with the same starting balance": SPY's close on each equity date, scaled so the first date equals
// the starting balance. A date without a bar carries the previous value forward.
export function benchmarkCurve(spy: Bar[], dates: string[], startingBalance: number): Array<{ date: string; equity: number | null }> {
  const closeOn = new Map(spy.map(b => [b.date, b.close]));
  let base: number | null = null;
  let last: number | null = null;
  return dates.map(date => {
    const close = closeOn.get(date) ?? last;
    if (close != null) last = close;
    if (base == null && close != null) base = close;
    return { date, equity: close != null && base != null ? Math.round(startingBalance * (close / base) * 100) / 100 : null };
  });
}

export interface RunHeader {
  id: string;
  created_at: string;
  book: Book;
  rules_version: string;
  date_from: string;
  date_to: string;
}

// The newest run of each book that shares the newest run's date range and rules version, i.e. one "replay"
// started together. `runs` must be newest first.
export function latestRunSet<T extends RunHeader>(runs: T[]): T[] {
  const [newest] = runs;
  if (!newest) return [];
  const out = new Map<Book, T>();
  for (const r of runs) {
    if (r.date_from !== newest.date_from || r.date_to !== newest.date_to || r.rules_version !== newest.rules_version) continue;
    if (!out.has(r.book)) out.set(r.book, r);
  }
  return BOOKS.filter(b => out.has(b)).map(b => out.get(b)!);
}
