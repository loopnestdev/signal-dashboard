import { describe, it, expect } from 'vitest';
import { leverageFor, rankLeverage, type LeverageRow, type StoredQuarter } from '../../fundamentals/leverage.js';

const q = (period_end: string, revenue: number | string | null, operating_income: number | string | null, extra: Partial<StoredQuarter> = {}): StoredQuarter => ({
  ticker: 'T', period_end, fiscal_year: 2026, fiscal_period: 'Q3', revenue, operating_income, derived: false, op_computed: false, ...extra,
});

describe('leverageFor', () => {
  // AVGO fiscal Q3 2026 vs Q3 2025, as reported to the SEC (USD billions).
  const avgo = [q('2025-08-03', 15.95e9, 5.89e9), q('2026-02-01', 19.31e9, 8.56e9), q('2026-05-03', 22.19e9, 10.79e9), q('2026-08-02', 29.59e9, 15.96e9)];

  it('reproduces the reference row for AVGO', () => {
    const r = leverageFor('AVGO', 'Broadcom', avgo, '2026-10-21')!;
    expect(r.periodEnd).toBe('2026-08-02');
    expect(r.periodLabel).toBe('Q3 FY26');
    expect(r.opMargin).toBeCloseTo(0.539, 3);
    expect(r.opMarginYearAgo).toBeCloseTo(0.369, 3);
    expect(r.revYoY).toBeCloseTo(0.855, 3);
    expect(r.incrementalMargin).toBeCloseTo(0.738, 3);
    expect(r.dol).toBeCloseTo(2.0, 1);
    expect(r.stale).toBe(false);
    expect(r.history.map(h => h.end)).toEqual(avgo.map(x => x.period_end));
  });

  it('accepts numeric strings from PostgREST', () => {
    const r = leverageFor('X', null, [q('2025-06-30', '100', '10'), q('2026-06-30', '150', '30')], '2026-08-01')!;
    expect(r.incrementalMargin).toBeCloseTo(0.4);
  });

  it('returns n/m DOL when last year was a loss or under a 1% margin', () => {
    const loss = leverageFor('X', null, [q('2025-06-30', 100, -2), q('2026-06-30', 150, 30)], '2026-08-01')!;
    expect(loss.dol).toBeNull();
    expect(loss.incrementalMargin).toBeCloseTo(0.64);
    const thin = leverageFor('X', null, [q('2025-06-30', 1000, 9), q('2026-06-30', 1500, 300)], '2026-08-01')!;
    expect(thin.dol).toBeNull();
    const ok = leverageFor('X', null, [q('2025-06-30', 1000, 30), q('2026-06-30', 1380, 313)], '2026-08-01')!;
    expect(ok.dol).toBeCloseTo((313 / 30 - 1) / 0.38, 3);
  });

  it('leaves incremental margin and DOL empty when revenue fell', () => {
    const r = leverageFor('X', null, [q('2025-06-30', 200, 40), q('2026-06-30', 150, 20)], '2026-08-01')!;
    expect(r.revYoY).toBeCloseTo(-0.25);
    expect(r.incrementalMargin).toBeNull();
    expect(r.dol).toBeNull();
  });

  it('has no year-ago figures without a quarter 350-380 days earlier', () => {
    const r = leverageFor('X', null, [q('2026-03-31', 100, 10), q('2026-06-30', 120, 15)], '2026-08-01')!;
    expect(r.opMarginYearAgo).toBeNull();
    expect(r.revYoY).toBeNull();
    expect(r.incrementalMargin).toBeNull();
  });

  it('skips quarters missing revenue or operating income, or with zero revenue', () => {
    const r = leverageFor('X', null, [q('2026-03-31', 100, 10), q('2026-06-30', null, 15), q('2026-09-30', 0, -5)], '2026-10-21')!;
    expect(r.periodEnd).toBe('2026-03-31');
    expect(leverageFor('X', null, [q('2026-06-30', null, 1)], '2026-10-21')).toBeNull();
  });

  it('flags a latest quarter older than 150 days as stale', () => {
    expect(leverageFor('X', null, [q('2026-03-31', 100, 10)], '2026-08-28')!.stale).toBe(false);
    expect(leverageFor('X', null, [q('2026-03-31', 100, 10)], '2026-08-29')!.stale).toBe(true);
  });

  it('carries the derived Q4 and computed operating income flags', () => {
    const r = leverageFor('X', null, [q('2026-08-31', 100, 10, { derived: true, op_computed: true, fiscal_period: 'Q4' })], '2026-10-01')!;
    expect(r).toMatchObject({ derived: true, opComputed: true, periodLabel: 'Q4 FY26' });
  });
});

describe('rankLeverage', () => {
  const row = (ticker: string, operatingIncome: number, incrementalMargin: number | null, opMargin = 0.2, opMarginYearAgo: number | null = 0.1): LeverageRow => ({
    ticker, name: null, periodEnd: '2026-06-30', periodLabel: null, derived: false, opComputed: false,
    operatingIncome, revenue: 1, opMargin, opMarginYearAgo, revYoY: 0.1, incrementalMargin, dol: null, rank: null, stale: false, history: [],
  });

  it('ranks by incremental margin and orders rows by operating income', () => {
    const out = rankLeverage([row('A', 50, 0.5), row('B', 10, 0.9), row('C', 30, null), row('D', 70, 0.7)]);
    expect(out.map(r => r.ticker)).toEqual(['D', 'A', 'C', 'B']);
    expect(Object.fromEntries(out.map(r => [r.ticker, r.rank]))).toEqual({ A: 3, B: 1, C: null, D: 2 });
  });

  it('breaks ties on margin expansion', () => {
    const out = rankLeverage([row('A', 1, 0.74, 0.54, 0.37), row('B', 2, 0.74, 0.23, 0.03)]);
    expect(out.find(r => r.ticker === 'B')!.rank).toBe(1);
    expect(out.find(r => r.ticker === 'A')!.rank).toBe(2);
  });
});
