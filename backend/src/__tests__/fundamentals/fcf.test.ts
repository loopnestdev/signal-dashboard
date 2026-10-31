import { describe, it, expect } from 'vitest';
import { fcfFor, type StoredCashQuarter } from '../../fundamentals/fcf.js';

const q = (period_end: string, ocf: number | string | null, capex: number | string | null, extra: Partial<StoredCashQuarter> = {}): StoredCashQuarter => ({
  ticker: 'T', period_end, fiscal_year: 2026, fiscal_period: 'Q2', revenue: 1000, operating_cash_flow: ocf, capex, cash: null, ...extra,
});

describe('fcfFor', () => {
  const quarters = [
    q('2025-06-30', 150, 50),
    q('2025-09-30', 120, 40),
    q('2025-12-31', 140, 40),
    q('2026-03-31', 160, 40),
    q('2026-06-30', 200, 50, { cash: '5000', fiscal_period: 'Q2', fiscal_year: 2026 }),
  ];

  it('computes FCF, QoQ, YoY, margin, streak and cash for the latest quarter', () => {
    const r = fcfFor('T', 'Test', quarters, '2026-08-01')!;
    expect(r.periodEnd).toBe('2026-06-30');
    expect(r.periodLabel).toBe('Q2 FY26');
    expect(r.fcf).toBe(150);
    expect(r.fcfPrev).toBe(120);
    expect(r.qoq).toBeCloseTo(0.25);
    expect(r.yoy).toBeCloseTo(0.5);
    expect(r.growing).toBe(true);
    expect(r.streak).toBe(3);
    expect(r.fcfMargin).toBeCloseTo(0.15);
    expect(r.cash).toBe(5000);
    expect(r.noCapex).toBe(false);
    expect(r.stale).toBe(false);
    expect(r.history.map(h => h.fcf)).toEqual([100, 80, 100, 120, 150]);
    expect(r.ttmFcf).toBe(450);
    expect(r.marketCap).toBeNull();
    expect(r.fcfYield).toBeNull();
  });

  it('divides trailing 12-month FCF by market cap', () => {
    const r = fcfFor('T', null, quarters, '2026-08-01', 9000)!;
    expect(r.marketCap).toBe(9000);
    expect(r.fcfYield).toBeCloseTo(0.05);
  });

  it('has no TTM FCF or yield without 4 consecutive quarters', () => {
    const r = fcfFor('T', null, [q('2025-09-30', 120, 40), q('2025-12-31', 140, 40), q('2026-06-30', 200, 50)], '2026-08-01', 9000)!;
    expect(r.ttmFcf).toBeNull();
    expect(r.fcfYield).toBeNull();
  });

  it('counts as growing with no % when the previous quarter was negative', () => {
    const r = fcfFor('T', null, [q('2026-03-31', -50, 10), q('2026-06-30', 30, 10)], '2026-08-01')!;
    expect(r.growing).toBe(true);
    expect(r.qoq).toBeNull();
    expect(r.streak).toBe(1);
  });

  it('is not growing when FCF fell, and has no previous quarter across a gap', () => {
    expect(fcfFor('T', null, [q('2026-03-31', 100, 0), q('2026-06-30', 90, 0)], '2026-08-01')!.growing).toBe(false);
    const gap = fcfFor('T', null, [q('2025-12-31', 10, 0), q('2026-06-30', 90, 0)], '2026-08-01')!;
    expect(gap.fcfPrev).toBeNull();
    expect(gap.growing).toBe(false);
    expect(gap.streak).toBe(0);
  });

  it('uses operating cash flow as FCF when the company never tags capex', () => {
    const r = fcfFor('T', null, [q('2026-03-31', 80, null), q('2026-06-30', 100, null), q('2026-09-30', null, null)], '2026-10-01')!;
    expect(r.periodEnd).toBe('2026-06-30');
    expect(r.fcf).toBe(100);
    expect(r.noCapex).toBe(true);
    expect(r.growing).toBe(true);
  });

  it('skips a quarter missing capex when other quarters have it', () => {
    const r = fcfFor('T', null, [q('2025-12-31', 50, 5), q('2026-03-31', 80, null), q('2026-06-30', 100, 10)], '2026-08-01')!;
    expect(r.history.map(h => h.end)).toEqual(['2025-12-31', '2026-06-30']);
    expect(r.fcfPrev).toBeNull();
    expect(r.noCapex).toBe(false);
  });

  it('flags a stale latest quarter and returns null without cash flow data', () => {
    expect(fcfFor('T', null, [q('2025-12-31', 10, 1)], '2026-08-01')!.stale).toBe(true);
    expect(fcfFor('T', null, [q('2026-06-30', null, 5)], '2026-08-01')).toBeNull();
  });
});
