import { describe, expect, it } from 'vitest';
import { barsRangeFor, benchmarkCurve, lastCompleteSession, latestRunSet, parseRunRequest, type RunHeader } from '../../backtest/report.js';

const TODAY = '2026-10-07';

describe('parseRunRequest', () => {
  it('defaults to all three books', () => {
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-06' }, TODAY)).toEqual({ request: { from: '2026-10-02', to: '2026-10-06', books: ['A', 'B', 'C'] } });
  });

  it('keeps requested books in A, B, C order without duplicates', () => {
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-06', books: ['C', 'A', 'C'] }, TODAY)).toEqual({ request: { from: '2026-10-02', to: '2026-10-06', books: ['A', 'C'] } });
  });

  it('rejects bad dates, reversed ranges, the future and long ranges', () => {
    expect(parseRunRequest({ from: '2026/10/02', to: '2026-10-06' }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest({ from: '2026-13-02', to: '2026-10-06' }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest({ from: '2026-10-06', to: '2026-10-02' }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-08' }, TODAY)).toEqual({ error: 'to cannot be after the last completed session (2026-10-07)' });
    expect(parseRunRequest({ from: '2025-10-01', to: '2026-10-06' }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest(null, TODAY)).toHaveProperty('error');
  });

  it('rejects unknown or empty book lists', () => {
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-06', books: ['D'] }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-06', books: [] }, TODAY)).toHaveProperty('error');
    expect(parseRunRequest({ from: '2026-10-02', to: '2026-10-06', books: 'A' }, TODAY)).toHaveProperty('error');
  });
});

describe('lastCompleteSession', () => {
  const at = (date: string, hhmm: string) => ({ date, minute: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() });

  it('is the previous session until 30 minutes after the close', () => {
    expect(lastCompleteSession(at('2026-10-07', '00:45'))).toBe('2026-10-06');
    expect(lastCompleteSession(at('2026-10-07', '16:29'))).toBe('2026-10-06');
    expect(lastCompleteSession(at('2026-10-07', '16:30'))).toBe('2026-10-07');
  });

  it('skips weekends and holidays', () => {
    expect(lastCompleteSession(at('2026-10-10', '12:00'))).toBe('2026-10-09');
    expect(lastCompleteSession(at('2026-10-12', '09:00'))).toBe('2026-10-09');
    expect(lastCompleteSession(at('2026-11-26', '18:00'))).toBe('2026-11-25');
  });

  it('follows early closes', () => {
    expect(lastCompleteSession(at('2026-11-27', '13:29'))).toBe('2026-11-25');
    expect(lastCompleteSession(at('2026-11-27', '13:30'))).toBe('2026-11-27');
  });
});

describe('barsRangeFor', () => {
  it('covers the start plus a lookback', () => {
    expect(barsRangeFor('2026-10-02', TODAY)).toBe('6mo');
    expect(barsRangeFor('2026-06-01', TODAY)).toBe('6mo');
    expect(barsRangeFor('2026-04-01', TODAY)).toBe('1y');
    expect(barsRangeFor('2025-10-07', TODAY)).toBe('2y');
  });
});

describe('benchmarkCurve', () => {
  const bars = [
    { date: '2026-10-01', open: 1, high: 1, low: 1, close: 90 },
    { date: '2026-10-02', open: 1, high: 1, low: 1, close: 100 },
    { date: '2026-10-05', open: 1, high: 1, low: 1, close: 110 },
  ];

  it('scales SPY so the first equity date equals the starting balance', () => {
    expect(benchmarkCurve(bars, ['2026-10-02', '2026-10-05'], 10_000)).toEqual([
      { date: '2026-10-02', equity: 10_000 },
      { date: '2026-10-05', equity: 11_000 },
    ]);
  });

  it('carries the last close over a missing bar and leaves leading gaps null', () => {
    expect(benchmarkCurve(bars, ['2026-09-30', '2026-10-02', '2026-10-06'], 10_000)).toEqual([
      { date: '2026-09-30', equity: null },
      { date: '2026-10-02', equity: 10_000 },
      { date: '2026-10-06', equity: 10_000 },
    ]);
  });

  it('returns nulls without SPY bars', () => {
    expect(benchmarkCurve([], ['2026-10-02'], 10_000)).toEqual([{ date: '2026-10-02', equity: null }]);
  });
});

describe('latestRunSet', () => {
  const run = (id: string, book: 'A' | 'B' | 'C', from = '2026-10-02', version = '1.1'): RunHeader =>
    ({ id, created_at: '', book, rules_version: version, date_from: from, date_to: '2026-10-06' });

  it('takes the newest run per book for the newest range and rules version, in book order', () => {
    const runs = [run('c2', 'C'), run('a2', 'A'), run('b-old-range', 'B', '2026-10-01'), run('a1', 'A'), run('b1', 'B'), run('c0', 'C', '2026-10-02', '1.0')];
    expect(latestRunSet(runs).map(r => r.id)).toEqual(['a2', 'b1', 'c2']);
  });

  it('is empty without runs', () => {
    expect(latestRunSet([])).toEqual([]);
  });
});
