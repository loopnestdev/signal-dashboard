import { describe, it, expect } from 'vitest';
import { riskPerTrade } from '../../lib/risk';

const sizing = { fixedRiskUsd: 1000, fixedUntilBalance: 40000, pctAboveThreshold: 2.5, maxPctBelow: 10, kellyFraction: 0.5, kellyMinTrades: 30 };

describe('riskPerTrade (mirror of backend lib/settings.ts)', () => {
  it('matches the backend formula at the preview balances', () => {
    expect([8000, 10000, 20000, 40000, 60000, 100000].map(b => riskPerTrade(b, sizing))).toEqual([800, 1000, 1000, 1000, 1500, 2500]);
  });

  it('returns NaN-safe 0 for empty or invalid balances', () => {
    expect(riskPerTrade(0, sizing)).toBe(0);
    expect(riskPerTrade(Number.NaN, sizing)).toBe(0);
  });

  it('propagates a half-typed field as NaN so the preview shows "-"', () => {
    expect(riskPerTrade(10000, { ...sizing, fixedRiskUsd: Number.NaN })).toBeNaN();
  });
});
