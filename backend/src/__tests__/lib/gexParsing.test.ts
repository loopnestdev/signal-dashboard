import { describe, it, expect } from 'vitest';
import { parseGexRawResponse } from '../../lib/signaClient.js';

// ── parseGexRawResponse ───────────────────────────────────────────────────────
// Tests cover: camelCase field names (Signa's actual response shape),
// snake_case fallbacks, per-expiry rawLevels, strike aggregation,
// net_gex fallback sum, and symbol normalisation.

describe('parseGexRawResponse', () => {

  // ── Key level field names ─────────────────────────────────────────────────

  it('reads gammaFlipLevel (Signa camelCase)', () => {
    const result = parseGexRawResponse({ gammaFlipLevel: 450 }, 'SPY');
    expect(result.gamma_flip).toBe(450);
  });

  it('falls back to gamma_flip (snake_case)', () => {
    const result = parseGexRawResponse({ gamma_flip: 455 }, 'SPY');
    expect(result.gamma_flip).toBe(455);
  });

  it('falls back to gammaFlipPoint', () => {
    const result = parseGexRawResponse({ gammaFlipPoint: 460 }, 'SPY');
    expect(result.gamma_flip).toBe(460);
  });

  it('prefers gammaFlipLevel over gamma_flip when both present', () => {
    const result = parseGexRawResponse({ gammaFlipLevel: 450, gamma_flip: 455 }, 'SPY');
    expect(result.gamma_flip).toBe(450);
  });

  it('reads callWall (Signa camelCase)', () => {
    const result = parseGexRawResponse({ callWall: 470 }, 'SPY');
    expect(result.call_wall).toBe(470);
  });

  it('falls back to call_wall (snake_case)', () => {
    const result = parseGexRawResponse({ call_wall: 472 }, 'SPY');
    expect(result.call_wall).toBe(472);
  });

  it('reads putWall (Signa camelCase)', () => {
    const result = parseGexRawResponse({ putWall: 440 }, 'SPY');
    expect(result.put_wall).toBe(440);
  });

  it('returns null for missing key levels', () => {
    const result = parseGexRawResponse({}, 'SPY');
    expect(result.gamma_flip).toBeNull();
    expect(result.call_wall).toBeNull();
    expect(result.put_wall).toBeNull();
  });

  // ── Regime (above_flip) ───────────────────────────────────────────────────

  it('reads regimeAboveFlip (Signa camelCase)', () => {
    const result = parseGexRawResponse({ regimeAboveFlip: true }, 'SPY');
    expect(result.above_flip).toBe(true);
  });

  it('falls back to above_flip', () => {
    const result = parseGexRawResponse({ above_flip: false }, 'SPY');
    expect(result.above_flip).toBe(false);
  });

  it('falls back to aboveFlip', () => {
    const result = parseGexRawResponse({ aboveFlip: true }, 'SPY');
    expect(result.above_flip).toBe(true);
  });

  it('prefers regimeAboveFlip over aboveFlip', () => {
    const result = parseGexRawResponse({ regimeAboveFlip: false, aboveFlip: true }, 'SPY');
    expect(result.above_flip).toBe(false);
  });

  // ── Current price ─────────────────────────────────────────────────────────

  it('reads current_price', () => {
    const result = parseGexRawResponse({ current_price: 525.5 }, 'SPY');
    expect(result.current_price).toBe(525.5);
  });

  it('falls back to currentPrice', () => {
    const result = parseGexRawResponse({ currentPrice: 526 }, 'SPY');
    expect(result.current_price).toBe(526);
  });

  // ── netGexByStrike parsing ────────────────────────────────────────────────

  it('reads netGex field on each level entry (Signa camelCase)', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 500, expiry: '2026-07-18', netGex: 1000 },
        { strike: 510, expiry: '2026-07-18', netGex: -500 },
      ],
    }, 'SPY');
    expect(result.levels).toHaveLength(2);
    expect(result.levels.find(l => l.strike === 500)?.net_gex).toBe(1000);
    expect(result.levels.find(l => l.strike === 510)?.net_gex).toBe(-500);
  });

  it('aggregates same strike across multiple expiries', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 500, expiry: '2026-07-18', netGex: 1000 },
        { strike: 500, expiry: '2026-08-15', netGex: 400 },
        { strike: 510, expiry: '2026-07-18', netGex: -200 },
      ],
    }, 'SPY');
    // $500 should be sum of both expiries
    expect(result.levels.find(l => l.strike === 500)?.net_gex).toBe(1400);
    expect(result.levels.find(l => l.strike === 510)?.net_gex).toBe(-200);
  });

  it('preserves rawLevels per-expiry before aggregation', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 500, expiry: '2026-07-18', netGex: 1000 },
        { strike: 500, expiry: '2026-08-15', netGex: 400 },
      ],
    }, 'SPY');
    expect(result.rawLevels).toHaveLength(2);
    expect(result.rawLevels![0]).toEqual({ strike: 500, expiry: '2026-07-18', net_gex: 1000 });
    expect(result.rawLevels![1]).toEqual({ strike: 500, expiry: '2026-08-15', net_gex: 400 });
  });

  it('falls back to net_gex field name on level entry', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [{ strike: 500, expiry: '2026-07-18', net_gex: 800 }],
    }, 'SPY');
    expect(result.levels[0]?.net_gex).toBe(800);
  });

  it('falls back to levels[] array key', () => {
    const result = parseGexRawResponse({
      levels: [{ strike: 490, expiry: '2026-07-18', netGex: 300 }],
    }, 'SPY');
    expect(result.levels).toHaveLength(1);
    expect(result.levels[0]?.net_gex).toBe(300);
  });

  it('sorts aggregated levels by strike ascending', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 510, expiry: '2026-07-18', netGex: 100 },
        { strike: 490, expiry: '2026-07-18', netGex: 200 },
        { strike: 500, expiry: '2026-07-18', netGex: 150 },
      ],
    }, 'SPY');
    expect(result.levels.map(l => l.strike)).toEqual([490, 500, 510]);
  });

  it('skips entries with zero or missing strike', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 0, expiry: '2026-07-18', netGex: 999 },
        { expiry: '2026-07-18', netGex: 888 },
        { strike: 500, expiry: '2026-07-18', netGex: 100 },
      ],
    }, 'SPY');
    expect(result.levels).toHaveLength(1);
    expect(result.rawLevels).toHaveLength(1);
  });

  // ── net_gex fallback sum ──────────────────────────────────────────────────

  it('uses explicit net_gex field when provided', () => {
    const result = parseGexRawResponse({
      net_gex: 5_000_000,
      netGexByStrike: [{ strike: 500, expiry: '2026-07-18', netGex: 1000 }],
    }, 'SPY');
    expect(result.net_gex).toBe(5_000_000);
  });

  it('sums all level net_gex values when top-level net_gex is absent', () => {
    const result = parseGexRawResponse({
      netGexByStrike: [
        { strike: 500, expiry: '2026-07-18', netGex: 1000 },
        { strike: 510, expiry: '2026-07-18', netGex: -300 },
      ],
    }, 'SPY');
    expect(result.net_gex).toBe(700);
  });

  it('returns null net_gex when no levels and no top-level field', () => {
    const result = parseGexRawResponse({}, 'SPY');
    expect(result.net_gex).toBeNull();
  });

  // ── Symbol normalisation ──────────────────────────────────────────────────

  it('uppercases the symbol', () => {
    const result = parseGexRawResponse({}, 'spy');
    expect(result.symbol).toBe('SPY');
  });

  it('empty netGexByStrike produces empty levels and rawLevels', () => {
    const result = parseGexRawResponse({ netGexByStrike: [] }, 'MU');
    expect(result.levels).toHaveLength(0);
    expect(result.rawLevels).toHaveLength(0);
  });
});
