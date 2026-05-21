import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, pctReturn, linearSlope, percentileRank, clamp } from '../../lib/technical.js';

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps to min', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 100)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(100, 0, 100)).toBe(100);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

// ── sma ───────────────────────────────────────────────────────────────────────

describe('sma', () => {
  it('returns null when fewer prices than period', () => {
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it('returns null when prices array is empty', () => {
    expect(sma([], 5)).toBeNull();
  });

  it('calculates simple average of exact period length', () => {
    expect(sma([10, 20, 30], 3)).toBeCloseTo(20);
  });

  it('uses only the last N prices when array is longer than period', () => {
    // Last 3 of [1,2,3,10,20,30] → 10+20+30 = 60/3 = 20
    expect(sma([1, 2, 3, 10, 20, 30], 3)).toBeCloseTo(20);
  });

  it('period=1 returns the last price', () => {
    expect(sma([5, 10, 15], 1)).toBeCloseTo(15);
  });

  it('handles uniform prices', () => {
    expect(sma([100, 100, 100, 100], 4)).toBeCloseTo(100);
  });
});

// ── ema ───────────────────────────────────────────────────────────────────────

describe('ema', () => {
  it('returns null when fewer prices than period', () => {
    expect(ema([1, 2], 5)).toBeNull();
  });

  it('returns sma-equivalent for exactly period-length uniform prices', () => {
    expect(ema([100, 100, 100, 100, 100], 5)).toBeCloseTo(100);
  });

  it('weights recent prices more heavily than older ones', () => {
    // Rising series: EMA should be above SMA (pulled toward recent high values)
    const prices = [10, 10, 10, 10, 20, 30, 40];
    const emaVal = ema(prices, 3) ?? 0;
    const smaVal = sma(prices, 3) ?? 0;
    expect(emaVal).toBeGreaterThan(smaVal);
  });

  it('period=1 returns the last price exactly', () => {
    expect(ema([5, 10, 99], 1)).toBeCloseTo(99);
  });

  it('produces a known result for a 3-period EMA', () => {
    // k = 2/(3+1) = 0.5
    // seed = avg(10,20,30) = 20
    // i=3: 40*0.5 + 20*0.5 = 30
    // i=4: 50*0.5 + 30*0.5 = 40
    expect(ema([10, 20, 30, 40, 50], 3)).toBeCloseTo(40);
  });
});

// ── rsi ───────────────────────────────────────────────────────────────────────

describe('rsi', () => {
  it('returns null when fewer closes than period+1', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  it('returns 100 when there are only gains (no losses)', () => {
    const strictly_rising = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rsi(strictly_rising, 14)).toBe(100);
  });

  it('returns a value near 0 for a strictly falling series', () => {
    const strictly_falling = Array.from({ length: 20 }, (_, i) => 20 - i);
    const result = rsi(strictly_falling, 14) ?? 50;
    expect(result).toBeCloseTo(0);
  });

  it('returns ~50 for a series that alternates equally up and down', () => {
    // Perfect alternation with equal up/down moves → avgGain ≈ avgLoss → RSI ≈ 50
    const alternating: number[] = [100];
    for (let i = 0; i < 30; i++) {
      alternating.push(i % 2 === 0 ? 101 : 100);
    }
    const result = rsi(alternating, 14) ?? 0;
    expect(result).toBeGreaterThan(45);
    expect(result).toBeLessThan(55);
  });

  it('returns value between 0 and 100', () => {
    const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45, 45.1, 43.99, 44.47, 44.18, 43.62, 44.16, 44.8, 43.18];
    const result = rsi(prices, 14);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });

  it('uses default period of 14', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(prices)).toBe(100); // pure uptrend
  });
});

// ── pctReturn ─────────────────────────────────────────────────────────────────

describe('pctReturn', () => {
  it('returns null when not enough data', () => {
    expect(pctReturn([100, 110], 5)).toBeNull();
  });

  it('returns null when base price is zero', () => {
    const prices = [0, 1, 2, 3, 4, 5];
    expect(pctReturn(prices, 5)).toBeNull();
  });

  it('calculates a 5-day return correctly', () => {
    // prices[-6]=100, prices[-1]=110 → +10%
    const prices = [100, 101, 102, 103, 104, 110];
    expect(pctReturn(prices, 5)).toBeCloseTo(10);
  });

  it('returns negative value for a down move', () => {
    const prices = [100, 99, 98, 97, 96, 90];
    expect(pctReturn(prices, 5)).toBeCloseTo(-10);
  });

  it('returns 0 for no change', () => {
    const prices = [100, 100, 100, 100, 100, 100];
    expect(pctReturn(prices, 5)).toBeCloseTo(0);
  });

  it('returns null when array length equals days (need days+1 prices)', () => {
    expect(pctReturn([100, 110, 120], 3)).toBeNull();
  });
});

// ── linearSlope ───────────────────────────────────────────────────────────────

describe('linearSlope', () => {
  it('returns 0 for empty or single-element array', () => {
    expect(linearSlope([])).toBe(0);
    expect(linearSlope([42])).toBe(0);
  });

  it('returns positive slope for increasing series', () => {
    expect(linearSlope([1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });

  it('returns negative slope for decreasing series', () => {
    expect(linearSlope([5, 4, 3, 2, 1])).toBeLessThan(0);
  });

  it('returns 0 for flat series', () => {
    expect(linearSlope([7, 7, 7, 7])).toBeCloseTo(0);
  });

  it('returns exact slope=1 for [0,1,2,3,4]', () => {
    expect(linearSlope([0, 1, 2, 3, 4])).toBeCloseTo(1);
  });

  it('returns exact slope=-1 for [4,3,2,1,0]', () => {
    expect(linearSlope([4, 3, 2, 1, 0])).toBeCloseTo(-1);
  });

  it('returns exact slope=2 for [0,2,4,6,8]', () => {
    expect(linearSlope([0, 2, 4, 6, 8])).toBeCloseTo(2);
  });
});

// ── percentileRank ────────────────────────────────────────────────────────────

describe('percentileRank', () => {
  it('returns 50 for empty array', () => {
    expect(percentileRank(5, [])).toBe(50);
  });

  it('returns 0 when value is less than or equal to all data', () => {
    expect(percentileRank(0, [1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns 100 when value is greater than all data', () => {
    expect(percentileRank(10, [1, 2, 3, 4, 5])).toBe(100);
  });

  it('returns 40 when 2 of 5 values are below', () => {
    // values below 3: 1,2 → 2/5 = 40%
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBeCloseTo(40);
  });

  it('returns 80 when 4 of 5 values are below', () => {
    expect(percentileRank(5, [1, 2, 3, 4, 5])).toBeCloseTo(80);
  });

  it('handles duplicate values in data', () => {
    // values strictly below 5: [1,2,3,4] → 4/6 ≈ 66.7%
    expect(percentileRank(5, [1, 2, 3, 4, 5, 5])).toBeCloseTo(66.67);
  });
});
