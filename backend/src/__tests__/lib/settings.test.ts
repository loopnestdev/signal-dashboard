import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, riskPerTrade, validateSettings } from '../../lib/settings.js';
import { isLoopback } from '../../lib/adminAuth.js';

describe('riskPerTrade (rules 1.2: $1,000 until $40k, then 2.5%; max 10% of a smaller balance)', () => {
  const s = DEFAULT_SETTINGS.sizing;

  it('is $1,000 from $10k up to just below $40k', () => {
    expect(riskPerTrade(10_000, s)).toBe(1_000);
    expect(riskPerTrade(25_000, s)).toBe(1_000);
    expect(riskPerTrade(39_999, s)).toBe(1_000);
  });

  it('switches to 2.5% at $40k with no jump', () => {
    expect(riskPerTrade(40_000, s)).toBe(1_000);
    expect(riskPerTrade(60_000, s)).toBe(1_500);
    expect(riskPerTrade(100_000, s)).toBe(2_500);
  });

  it('shrinks to 10% of the balance below $10k', () => {
    expect(riskPerTrade(8_000, s)).toBe(800);
    expect(riskPerTrade(1_234.56, s)).toBe(123.46);
  });

  it('is 0 for an empty or negative balance', () => {
    expect(riskPerTrade(0, s)).toBe(0);
    expect(riskPerTrade(-500, s)).toBe(0);
  });
});

describe('validateSettings', () => {
  it('fills missing fields from defaults', () => {
    const { settings, errors } = validateSettings({ paperStartingBalance: 25_000 });
    expect(errors).toEqual([]);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, paperStartingBalance: 25_000 });
  });

  it('accepts a full valid document including the AI provider', () => {
    const input = structuredClone(DEFAULT_SETTINGS);
    input.ai.provider = 'claude';
    input.optionsLimits.maxOpenTrades = 7;
    expect(validateSettings(input).settings).toEqual(input);
  });

  it('reports every invalid field', () => {
    const { settings, errors } = validateSettings({
      sizing: { kellyFraction: 1, kellyMinTrades: 12.5 },
      optionsLimits: { maxOpenTrades: 'five' },
      ai: { provider: 'gpt' },
    });
    expect(settings).toBeNull();
    expect(errors).toEqual([
      'sizing.kellyFraction must be between 0.1 and 0.5',
      'sizing.kellyMinTrades must be a whole number',
      'optionsLimits.maxOpenTrades must be a number',
      'ai.provider must be one of gemini, claude, none',
    ]);
  });

  it('rejects a per-trade risk larger than the starting balance', () => {
    expect(validateSettings({ paperStartingBalance: 1_000, sizing: { fixedRiskUsd: 2_000 } }).errors)
      .toEqual(['sizing.fixedRiskUsd cannot exceed the starting balance']);
  });

  it('rejects non-objects and non-finite numbers', () => {
    expect(validateSettings(null).errors).toEqual(['settings must be an object']);
    expect(validateSettings([]).errors).toEqual(['settings must be an object']);
    expect(validateSettings({ paperStartingBalance: Number.NaN }).errors).toEqual(['paperStartingBalance must be a number']);
  });

  it('does not mutate the defaults', () => {
    validateSettings({ paperStartingBalance: 50_000 });
    expect(DEFAULT_SETTINGS.paperStartingBalance).toBe(10_000);
  });
});

describe('isLoopback', () => {
  it('recognises IPv4, IPv6 and IPv4-mapped loopback only', () => {
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].map(isLoopback)).toEqual([true, true, true]);
    expect(['10.0.0.5', '::ffff:10.0.0.5', undefined].map(isLoopback)).toEqual([false, false, false]);
  });
});
