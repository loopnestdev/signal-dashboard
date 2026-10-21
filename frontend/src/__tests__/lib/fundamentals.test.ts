import { describe, expect, it } from 'vitest';
import { fmtMargin, fmtMoney, fmtRatioPct, sortLeverage } from '../../lib/fundamentals';
import type { LeverageRow } from '../../types/market';

const row = (ticker: string, extra: Partial<LeverageRow> = {}): LeverageRow => ({
  ticker, name: null, periodEnd: '2026-06-30', periodLabel: null, derived: false, opComputed: false,
  operatingIncome: 1, revenue: 10, opMargin: 0.1, opMarginYearAgo: 0.05, revYoY: 0.2, incrementalMargin: 0.3, dol: 2, rank: 1, stale: false, history: [],
  ...extra,
});

describe('fmtMoney', () => {
  it('scales to B / M / K and keeps the sign in front', () => {
    expect(fmtMoney(63.73e9)).toBe('$63.73B');
    expect(fmtMoney(459.7e6)).toBe('$459.7M');
    expect(fmtMoney(-3.6e6)).toBe('-$3.6M');
    expect(fmtMoney(12_400)).toBe('$12K');
    expect(fmtMoney(0)).toBe('$0');
  });
});

describe('percent formatters', () => {
  it('formats ratios as whole percents, with a sign when asked', () => {
    expect(fmtRatioPct(3.79, true)).toBe('+379%');
    expect(fmtRatioPct(0.93)).toBe('93%');
    expect(fmtRatioPct(-0.25, true)).toBe('-25%');
    expect(fmtRatioPct(0.052)).toBe('5.2%');
    expect(fmtRatioPct(null)).toBe('-');
  });
  it('formats margins to one decimal', () => {
    expect(fmtMargin(0.807)).toBe('80.7%');
    expect(fmtMargin(-0.017)).toBe('-1.7%');
    expect(fmtMargin(null)).toBe('-');
  });
});

describe('sortLeverage', () => {
  const rows = [
    row('A', { operatingIncome: 5, rank: 3, dol: null }),
    row('B', { operatingIncome: 9, rank: null, dol: 1.5 }),
    row('C', { operatingIncome: 1, rank: 1, dol: 24.9, opMargin: 0.227, opMarginYearAgo: 0.03 }),
  ];

  it('sorts descending by default and ascending on request', () => {
    expect(sortLeverage(rows, 'operatingIncome').map(r => r.ticker)).toEqual(['B', 'A', 'C']);
    expect(sortLeverage(rows, 'operatingIncome', true).map(r => r.ticker)).toEqual(['C', 'A', 'B']);
  });

  it('puts rank 1 first and unranked last', () => {
    expect(sortLeverage(rows, 'rank').map(r => r.ticker)).toEqual(['C', 'A', 'B']);
    expect(sortLeverage(rows, 'rank', true).map(r => r.ticker)).toEqual(['A', 'C', 'B']);
  });

  it('keeps missing values at the bottom in both directions', () => {
    expect(sortLeverage(rows, 'dol').map(r => r.ticker)).toEqual(['C', 'B', 'A']);
    expect(sortLeverage(rows, 'dol', true).map(r => r.ticker)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by margin change and by ticker', () => {
    expect(sortLeverage(rows, 'marginChange')[0].ticker).toBe('C');
    expect(sortLeverage(rows, 'ticker', true).map(r => r.ticker)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortLeverage(rows, 'dol');
    expect(rows).toEqual(copy);
  });
});
