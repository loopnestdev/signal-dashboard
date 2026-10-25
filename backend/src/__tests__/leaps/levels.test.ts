import { describe, it, expect } from 'vitest';
import { blackScholes } from '../../backtest/pricing.js';
import { callDelta, invNorm, priceLevels, snapStrike, spotForValue, strikeForDelta } from '../../leaps/levels.js';

describe('invNorm', () => {
  it('inverts the normal CDF at known points', () => {
    expect(invNorm(0.5)).toBeCloseTo(0, 8);
    expect(invNorm(0.975)).toBeCloseTo(1.959964, 5);
    expect(invNorm(0.01)).toBeCloseTo(-2.326348, 5);
    expect(invNorm(0)).toBe(-Infinity);
    expect(invNorm(1)).toBe(Infinity);
  });
});

describe('strikeForDelta', () => {
  it('returns the strike whose call delta is the target', () => {
    for (const d of [0.3, 0.5, 0.75]) {
      const k = strikeForDelta(200, 1.5, 0.3, 0.04, d);
      expect(callDelta(200, k, 1.5, 0.3, 0.04)).toBeCloseTo(d, 6);
    }
  });
  it('puts deep ITM below spot and OTM above', () => {
    expect(strikeForDelta(100, 1.5, 0.3, 0.04, 0.75)).toBeLessThan(100);
    expect(strikeForDelta(100, 1.5, 0.3, 0.04, 0.3)).toBeGreaterThan(100);
  });
});

describe('callDelta', () => {
  it('is 1 / 0 at expiry for ITM / OTM', () => {
    expect(callDelta(110, 100, 0, 0.3, 0.04)).toBe(1);
    expect(callDelta(90, 100, 0, 0.3, 0.04)).toBe(0);
  });
});

describe('snapStrike', () => {
  it('uses the largest usual increment within 2.5% of spot', () => {
    expect(snapStrike(433, 450)).toBe(430);    // $10 step
    expect(snapStrike(152.4, 150)).toBe(152.5); // $2.5 step
    expect(snapStrike(1234, 1200)).toBe(1225);  // $25 step
  });
  it('falls back to 2.5% of spot for very low prices', () => {
    expect(snapStrike(0.61, 0.6)).toBeCloseTo(0.615, 6);  // step = 0.015
  });
});

describe('spotForValue', () => {
  it('finds the stock price at which the call is worth the value', () => {
    const s = spotForValue(30, 200, 1.5, 0.3, 0.04);
    expect(blackScholes('CALL', s, 200, 1.5, 0.3, 0.04)).toBeCloseTo(30, 4);
  });
  it('is strike + value at expiry', () => {
    expect(spotForValue(12, 100, 0, 0.3, 0.04)).toBe(112);
  });
});

describe('priceLevels', () => {
  const base = { strike: 200, premium: 25, years: 1.5, iv: 0.3, rate: 0.04, commissionPerContract: 1 };
  it('gives expiry levels from strike + premium (+ round-trip commission for break-even)', () => {
    const l = priceLevels(base);
    expect(l.breakEvenExpiry).toBe(225.02);
    expect(l.doubleExpiry).toBe(250);
    expect(l.sellLimit).toBe(50);
  });
  it('orders the time-dependent levels: today < in 6 months < at expiry', () => {
    const l = priceLevels(base);
    expect(l.breakEvenToday!).toBeLessThan(l.breakEvenExpiry);
    expect(l.doubleToday!).toBeLessThan(l.doubleIn6m!);
    expect(l.doubleIn6m!).toBeLessThan(l.doubleExpiry);
    expect(blackScholes('CALL', l.doubleToday!, 200, 1.5, 0.3, 0.04)).toBeCloseTo(50, 1);
  });
  it('leaves IV-based levels empty without IV and skips the 6-month level inside 6 months', () => {
    const noIv = priceLevels({ ...base, iv: null });
    expect(noIv.breakEvenToday).toBeNull();
    expect(noIv.doubleToday).toBeNull();
    expect(priceLevels({ ...base, years: 0.4 }).doubleIn6m).toBeNull();
  });
});
