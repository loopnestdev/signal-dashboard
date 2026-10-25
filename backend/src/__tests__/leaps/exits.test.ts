import { describe, it, expect } from 'vitest';
import { affordableAt, decideExit, EXIT_REASONS, sizePosition, type HeldLeaps } from '../../leaps/exits.js';

const held = (over: Partial<HeldLeaps> = {}): HeldLeaps => ({
  entryDate: '2026-01-02', expiry: '2027-06-18', entryPrice: 20, halfSold: false, peakSinceHalf: null, qualityOk: true, ...over,
});

describe('decideExit', () => {
  it('sells half at +100%', () => {
    expect(decideExit(held(), '2026-03-02', 40)).toEqual({ action: 'half' });
    expect(decideExit(held(), '2026-03-02', 39.9)).toBeNull();
  });
  it('has no stop before halfway, even at -60%', () => {
    expect(decideExit(held(), '2026-06-01', 8)).toBeNull();
  });
  it('stops past halfway when down 50%', () => {
    expect(decideExit(held(), '2026-10-01', 10)).toEqual({ action: 'close', reason: EXIT_REASONS.stop });
    expect(decideExit(held(), '2026-10-01', 10.1)).toBeNull();
  });
  it('closes everything 120 days before expiry, before any other rule', () => {
    expect(decideExit(held(), '2027-02-18', 60)).toEqual({ action: 'close', reason: EXIT_REASONS.time });
  });
  it('closes on a quality break', () => {
    expect(decideExit(held({ qualityOk: false }), '2026-03-02', 40)).toEqual({ action: 'close', reason: EXIT_REASONS.quality });
  });
  it('trails the runner only after 6 months held', () => {
    const runner = held({ halfSold: true, peakSinceHalf: 60 });
    expect(decideExit(runner, '2026-05-01', 30)).toBeNull();
    expect(decideExit(runner, '2026-07-06', 36)).toEqual({ action: 'close', reason: EXIT_REASONS.runner });
    expect(decideExit(runner, '2026-07-06', 36.1)).toBeNull();
  });
});

describe('sizePosition', () => {
  const base = { equity: 50_000, cash: 50_000, openCost: 0, openCount: 0, state: 'correction' as const, unitCost: 1_000, wholeContracts: true };
  it('spends 10% in a correction and 5% in a pullback', () => {
    expect(sizePosition(base)).toEqual({ qty: 5, budget: 5_000 });
    expect(sizePosition({ ...base, state: 'pullback' })).toEqual({ qty: 2, budget: 2_500 });
  });
  it('needs 2 whole contracts', () => {
    expect(sizePosition({ ...base, unitCost: 3_000 })).toEqual({ skip: 'too expensive for split' });
  });
  it('sizes fractionally for the backtest', () => {
    expect(sizePosition({ ...base, unitCost: 3_000, wholeContracts: false })).toMatchObject({ budget: 5_000 });
  });
  it('respects 8 positions, 60% deployed and cash', () => {
    expect(sizePosition({ ...base, openCount: 8 })).toEqual({ skip: 'limit: 8 open positions' });
    expect(sizePosition({ ...base, openCost: 30_000 })).toEqual({ skip: 'limit: 60% deployed' });
    expect(sizePosition({ ...base, openCost: 27_000 })).toEqual({ qty: 3, budget: 3_000 });
    expect(sizePosition({ ...base, cash: 2_000 })).toEqual({ qty: 2, budget: 2_000 });
  });
  it('never buys in a normal market', () => {
    expect(sizePosition({ ...base, state: 'normal' })).toEqual({ skip: 'market not down' });
  });
});

describe('affordableAt', () => {
  it('checks 2 contracts within the per-position budget of that balance', () => {
    expect(affordableAt(25_000, 'correction', 1_250)).toBe(true);
    expect(affordableAt(25_000, 'correction', 1_251)).toBe(false);
    expect(affordableAt(25_000, 'pullback', 700)).toBe(false);
  });
});
