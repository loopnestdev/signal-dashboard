import { describe, it, expect } from 'vitest';
import { marketState, offHighPct, rollingHigh, rollingVol, splitFactorSince } from '../../leaps/market.js';

describe('marketState', () => {
  it('is a correction at >= 10% off the high regardless of VIX', () => {
    expect(marketState(10, 12, 90)).toBe('correction');
    expect(marketState(25, null, null)).toBe('correction');
  });
  it('is a pullback at 5-10% off only with VIX > 20 or a score < 60', () => {
    expect(marketState(6, 21, 80)).toBe('pullback');
    expect(marketState(6, 15, 55)).toBe('pullback');
    expect(marketState(6, 20, 60)).toBe('normal');
    expect(marketState(6, null, null)).toBe('normal');
  });
  it('is normal under 5% off', () => {
    expect(marketState(4.9, 40, 20)).toBe('normal');
  });
});

describe('offHighPct', () => {
  it('is the % below the high', () => {
    expect(offHighPct(90, 100)).toBeCloseTo(10, 10);
    expect(offHighPct(100, 0)).toBe(0);
  });
});

describe('rollingHigh', () => {
  it('keeps the highest close within the window', () => {
    expect(rollingHigh([1, 3, 2, 1, 1], 3)).toEqual([1, 3, 3, 3, 2]);
  });
});

describe('rollingVol', () => {
  it('is null until a full window and 0 for steady growth', () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 * 1.01 ** i);
    const v = rollingVol(closes, 5);
    expect(v.slice(0, 5).every(x => x === null)).toBe(true);
    expect(v[9]).toBeCloseTo(0, 8);
  });
  it('annualises daily log-return dispersion', () => {
    const closes = [100];
    for (let i = 1; i <= 40; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 0.99));
    const v = rollingVol(closes, 20).at(-1)!;
    expect(v).toBeGreaterThan(0.15);
    expect(v).toBeLessThan(0.17);
  });
});

describe('splitFactorSince', () => {
  it('multiplies splits after the date only', () => {
    const splits = [{ date: '2021-07-20', ratio: 4 }, { date: '2024-06-10', ratio: 10 }];
    expect(splitFactorSince(splits, '2024-04-28')).toBe(10);
    expect(splitFactorSince(splits, '2020-01-01')).toBe(40);
    expect(splitFactorSince(splits, '2025-01-01')).toBe(1);
  });
});
