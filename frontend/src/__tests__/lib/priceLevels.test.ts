import { describe, it, expect } from 'vitest';
import { validatePriceLevels } from '../../lib/priceLevels';

// ── validatePriceLevels ───────────────────────────────────────────────────────

describe('validatePriceLevels', () => {
  // ── Direction detection ───────────────────────────────────────────────────

  it('treats BULLISH as long', () => {
    const r = validatePriceLevels('BULLISH', 100, 90, 120, 2, 100);
    expect(r.isLong).toBe(true);
  });

  it('treats LONG as long', () => {
    const r = validatePriceLevels('LONG', 100, 90, 120, 2, 100);
    expect(r.isLong).toBe(true);
  });

  it('treats BUY as long', () => {
    const r = validatePriceLevels('BUY', 100, 90, 120, 2, 100);
    expect(r.isLong).toBe(true);
  });

  it('treats BEARISH as short', () => {
    const r = validatePriceLevels('BEARISH', 100, 110, 80, 2, 100);
    expect(r.isLong).toBe(false);
  });

  it('treats SHORT as short', () => {
    const r = validatePriceLevels('SHORT', 100, 110, 80, 2, 100);
    expect(r.isLong).toBe(false);
  });

  it('is case-insensitive for direction', () => {
    expect(validatePriceLevels('bullish', 100, 90, 120, 2, 100).isLong).toBe(true);
    expect(validatePriceLevels('Bearish', 100, 110, 80, 2, 100).isLong).toBe(false);
  });

  // ── entryRef ──────────────────────────────────────────────────────────────

  it('uses entry as entryRef when entry > 0', () => {
    const r = validatePriceLevels('BULLISH', 100, 90, 120, 2, 95);
    expect(r.entryRef).toBe(100);
  });

  it('falls back to currentPrice when entry is 0', () => {
    const r = validatePriceLevels('BULLISH', 0, 90, 120, 2, 95);
    expect(r.entryRef).toBe(95);
  });

  it('falls back to currentPrice when entry is negative', () => {
    const r = validatePriceLevels('BULLISH', -5, 90, 120, 2, 95);
    expect(r.entryRef).toBe(95);
  });

  // ── Long signal: stop below entry, target above ───────────────────────────

  it('LONG: stopValid when stop < entryRef', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 120, 2, 100).stopValid).toBe(true);
  });

  it('LONG: stopValid=false when stop >= entryRef (inverted)', () => {
    expect(validatePriceLevels('BULLISH', 100, 105, 120, 2, 100).stopValid).toBe(false);
    expect(validatePriceLevels('BULLISH', 100, 100, 120, 2, 100).stopValid).toBe(false);
  });

  it('LONG: stopValid=false when stop is 0', () => {
    expect(validatePriceLevels('BULLISH', 100, 0, 120, 2, 100).stopValid).toBe(false);
  });

  it('LONG: targetValid when target > entryRef', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 120, 2, 100).targetValid).toBe(true);
  });

  it('LONG: targetValid=false when target <= entryRef (inverted)', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 95, 2, 100).targetValid).toBe(false);
    expect(validatePriceLevels('BULLISH', 100, 90, 100, 2, 100).targetValid).toBe(false);
  });

  it('LONG: targetValid=false when target is 0', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 0, 2, 100).targetValid).toBe(false);
  });

  // ── Short signal: stop above entry, target below ──────────────────────────

  it('SHORT: stopValid when stop > entryRef', () => {
    expect(validatePriceLevels('SHORT', 100, 110, 80, 2, 100).stopValid).toBe(true);
  });

  it('SHORT: stopValid=false when stop <= entryRef (inverted)', () => {
    expect(validatePriceLevels('SHORT', 100, 95, 80, 2, 100).stopValid).toBe(false);
    expect(validatePriceLevels('SHORT', 100, 100, 80, 2, 100).stopValid).toBe(false);
  });

  it('SHORT: targetValid when target < entryRef', () => {
    expect(validatePriceLevels('SHORT', 100, 110, 80, 2, 100).targetValid).toBe(true);
  });

  it('SHORT: targetValid=false when target >= entryRef (inverted)', () => {
    expect(validatePriceLevels('SHORT', 100, 110, 110, 2, 100).targetValid).toBe(false);
    expect(validatePriceLevels('SHORT', 100, 110, 100, 2, 100).targetValid).toBe(false);
  });

  // ── R/R validity ──────────────────────────────────────────────────────────

  it('rrValid is true only when stop, target, and rr are all valid', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 120, 2, 100).rrValid).toBe(true);
  });

  it('rrValid=false when rr is 0', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 120, 0, 100).rrValid).toBe(false);
  });

  it('rrValid=false when stop is invalid', () => {
    expect(validatePriceLevels('BULLISH', 100, 110, 120, 2, 100).rrValid).toBe(false);
  });

  it('rrValid=false when target is invalid', () => {
    expect(validatePriceLevels('BULLISH', 100, 90, 80, 2, 100).rrValid).toBe(false);
  });

  // ── Real-world ASTS-like regression test ─────────────────────────────────

  it('ASTS regression: BULLISH engine but data has SHORT levels → invalid', () => {
    // Simulates the bug: engine says BULLISH, but data computed a short setup.
    // Stop ($101) above entry ($89), target ($65) below entry → both invalid.
    const r = validatePriceLevels('BULLISH', 89.58, 101.53, 65.68, 1.2, 89.58);
    expect(r.isLong).toBe(true);
    expect(r.stopValid).toBe(false);   // stop above entry for long → inverted
    expect(r.targetValid).toBe(false); // target below entry for long → inverted
    expect(r.rrValid).toBe(false);
  });

  it('correct BULLISH setup with valid levels → all valid', () => {
    const r = validatePriceLevels('BULLISH', 89.58, 82.00, 110.00, 2.8, 89.58);
    expect(r.isLong).toBe(true);
    expect(r.stopValid).toBe(true);
    expect(r.targetValid).toBe(true);
    expect(r.rrValid).toBe(true);
  });
});
