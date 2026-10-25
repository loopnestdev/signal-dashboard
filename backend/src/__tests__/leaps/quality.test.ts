import { describe, it, expect } from 'vitest';
import { knownQuarters, latestShares, marketCapCheck, profitCheck, qualityChecks, revenueCheck, volatilityCheck, type QuarterFacts } from '../../leaps/quality.js';

const q = (period_end: string, revenue: number | null, op: number | null, ni: number | null = null, shares: number | null = 1e9): QuarterFacts =>
  ({ period_end, revenue, operating_income: op, net_income: ni, diluted_shares: shares });

const growing = [
  q('2025-03-31', 100, 20), q('2025-06-30', 105, 21), q('2025-09-30', 110, 22), q('2025-12-31', 115, 23),
  q('2026-03-31', 120, 24), q('2026-06-30', 125, 25),
];

describe('knownQuarters', () => {
  it('counts a quarter only 65 days after it ends', () => {
    expect(knownQuarters(growing, '2026-09-02').at(-1)!.period_end).toBe('2026-03-31');
    expect(knownQuarters(growing, '2026-09-03').at(-1)!.period_end).toBe('2026-06-30');
  });
});

describe('profitCheck', () => {
  it('passes 4 profitable quarters', () => {
    expect(profitCheck(growing, '2026-10-01').pass).toBe(true);
  });
  it('fails on a loss in the last 4 quarters', () => {
    const rows = [...growing.slice(0, 5), q('2026-06-30', 125, -1)];
    const c = profitCheck(rows, '2026-10-01');
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('2026-06-30');
  });
  it('uses net income when there is no operating income line (banks)', () => {
    const bank = growing.map(x => ({ ...x, operating_income: null, net_income: 10 }));
    expect(profitCheck(bank, '2026-10-01').pass).toBe(true);
  });
  it('fails with fewer than 4 quarters or a stale latest quarter', () => {
    expect(profitCheck(growing.slice(0, 3), '2025-12-01').pass).toBe(false);
    expect(profitCheck(growing, '2027-06-01').detail).toBe('no recent quarter on file');
  });
});

describe('revenueCheck', () => {
  it('compares the latest quarter with the one a year earlier', () => {
    expect(revenueCheck(growing)).toMatchObject({ pass: true });
    expect(revenueCheck(growing).detail).toContain('+19.0%');
    const falling = [...growing.slice(0, 5), q('2026-06-30', 100, 25)];
    expect(revenueCheck(falling).pass).toBe(false);
  });
  it('fails without revenue or a year-ago quarter', () => {
    expect(revenueCheck(growing.slice(-2)).detail).toBe('no year-ago quarter');
    expect(revenueCheck([q('2026-06-30', null, 5)]).detail).toBe('no revenue figure on file');
  });
});

describe('marketCapCheck / volatilityCheck', () => {
  it('needs $100B and at most 2.25x VIX', () => {
    expect(marketCapCheck(150e9)).toMatchObject({ pass: true, detail: '$150B' });
    expect(marketCapCheck(2.5e12).detail).toBe('$2.50T');
    expect(marketCapCheck(99e9).pass).toBe(false);
    expect(marketCapCheck(null).pass).toBe(false);
    expect(volatilityCheck(2.25).pass).toBe(true);
    expect(volatilityCheck(2.3).pass).toBe(false);
    expect(volatilityCheck(null).pass).toBe(false);
  });
});

describe('qualityChecks', () => {
  it('is eligible when every check passes', () => {
    expect(qualityChecks(growing, '2026-10-01', 200e9, 1.2)).toMatchObject({ eligible: true, reason: null });
  });
  it('reports the first failed check', () => {
    expect(qualityChecks(growing, '2026-10-01', 50e9, 1.2).reason).toBe('marketCap: $50B');
    expect(qualityChecks(growing, '2026-10-01', 200e9, 3).reason).toBe('volatility: 3.00x VIX');
  });
  it('only uses quarters filed by the date (no look-ahead)', () => {
    const lateLoss = [...growing, q('2026-09-30', 130, -5)];
    expect(qualityChecks(lateLoss, '2026-10-15', 200e9, 1).eligible).toBe(true);
    expect(qualityChecks(lateLoss, '2026-12-10', 200e9, 1).eligible).toBe(false);
  });
});

describe('latestShares', () => {
  it('takes the newest quarter with a share count', () => {
    const rows = [q('2026-03-31', 1, 1, null, 5e9), q('2026-06-30', 1, 1, null, null)];
    expect(latestShares(rows)).toEqual({ shares: 5e9, periodEnd: '2026-03-31' });
    expect(latestShares([q('2026-03-31', 1, 1, null, null)])).toBeNull();
  });
});
