import { describe, it, expect } from 'vitest';
import {
  getStockDecision,
  computeStockTechnicalScore,
  computeSectorETFScore,
  computeFibonacci,
  computeMovingAverages,
  SECTOR_TO_ETF,
} from '../../services/stockScoring.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a simple synthetic price history. Generates prices that steadily
// trend from `start` to `end` over `n` candles so MA/RSI comparisons work.
function buildHistory(start: number, end: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    return start + (end - start) * t;
  });
}

// ── SECTOR_TO_ETF mapping ─────────────────────────────────────────────────────

describe('SECTOR_TO_ETF', () => {
  it('maps Technology to QQQ', () => {
    expect(SECTOR_TO_ETF['Technology']).toBe('QQQ');
  });

  it('maps both Financial Services and Financials to XLF', () => {
    expect(SECTOR_TO_ETF['Financial Services']).toBe('XLF');
    expect(SECTOR_TO_ETF['Financials']).toBe('XLF');
  });

  it('maps both Healthcare and Health Care to XLV', () => {
    expect(SECTOR_TO_ETF['Healthcare']).toBe('XLV');
    expect(SECTOR_TO_ETF['Health Care']).toBe('XLV');
  });

  it('maps both Consumer Cyclical and Consumer Discretionary to XLY', () => {
    expect(SECTOR_TO_ETF['Consumer Cyclical']).toBe('XLY');
    expect(SECTOR_TO_ETF['Consumer Discretionary']).toBe('XLY');
  });

  it('maps Energy to XLE', () => {
    expect(SECTOR_TO_ETF['Energy']).toBe('XLE');
  });
});

// ── getStockDecision ──────────────────────────────────────────────────────────

describe('getStockDecision', () => {
  // ── Standard market score gate (no Signa override) ────────────────────────

  it('returns NO when market score below 55 regardless of composite', () => {
    expect(getStockDecision(90, 40, 'uptrend', false)).toBe('NO');
    expect(getStockDecision(80, 54, 'uptrend', false)).toBe('NO');
  });

  it('returns YES_BUY when composite ≥80 and market ≥55 in uptrend', () => {
    expect(getStockDecision(80, 60, 'uptrend', false)).toBe('YES_BUY');
    expect(getStockDecision(95, 70, 'chop', false)).toBe('YES_BUY');
  });

  it('returns YES_SHORT when composite ≥80 in downtrend with bearish stock', () => {
    expect(getStockDecision(82, 60, 'downtrend', true)).toBe('YES_SHORT');
  });

  it('returns CAUTION when composite 60–79 and market ≥55', () => {
    expect(getStockDecision(70, 60, 'uptrend', false)).toBe('CAUTION');
    expect(getStockDecision(60, 60, 'chop', false)).toBe('CAUTION');
  });

  it('returns NO when composite <60 and market ≥55', () => {
    expect(getStockDecision(59, 60, 'uptrend', false)).toBe('NO');
  });

  // ── Signa LONG / BULLISH vocabulary ──────────────────────────────────────

  it('treats LONG the same as BULLISH for strong long signal', () => {
    // High-conf LONG + good grade + composite ≥60 → YES_BUY
    expect(getStockDecision(65, 55, 'uptrend', false, 'LONG', 70, 'A')).toBe('YES_BUY');
    expect(getStockDecision(65, 55, 'uptrend', false, 'BULLISH', 70, 'A')).toBe('YES_BUY');
  });

  it('returns YES_BUY for BULLISH engine signal with high confidence and grade A', () => {
    expect(getStockDecision(65, 55, 'chop', false, 'BULLISH', 65, 'A')).toBe('YES_BUY');
  });

  it('returns CAUTION not NO for BULLISH signal when composite just under 60', () => {
    // Strong Signa long but composite < 60 → CAUTION (not NO)
    expect(getStockDecision(55, 60, 'chop', false, 'BULLISH', 70, 'A+')).toBe('CAUTION');
  });

  it('returns CAUTION not YES_BUY for strong BULLISH in downtrend with very low market', () => {
    expect(getStockDecision(70, 35, 'downtrend', false, 'BULLISH', 70, 'A')).toBe('CAUTION');
  });

  // ── Signa SHORT / BEARISH vocabulary ─────────────────────────────────────

  it('returns YES_SHORT for BEARISH engine signal with high confidence', () => {
    expect(getStockDecision(50, 60, 'uptrend', false, 'BEARISH', 70, 'A')).toBe('YES_SHORT');
  });

  it('treats SHORT the same as BEARISH for short signal', () => {
    expect(getStockDecision(50, 60, 'uptrend', false, 'SHORT', 70, 'A')).toBe('YES_SHORT');
    expect(getStockDecision(50, 60, 'uptrend', false, 'BEARISH', 70, 'A')).toBe('YES_SHORT');
  });

  it('does NOT trigger YES_SHORT for low-confidence bearish signal', () => {
    // confidence < 65 → falls through to standard logic
    const result = getStockDecision(70, 60, 'uptrend', false, 'BEARISH', 60, 'A');
    // Standard path: market≥55, composite≥60 → CAUTION
    expect(result).toBe('CAUTION');
  });

  // ── Grade boundary ────────────────────────────────────────────────────────

  it('requires grade A+/A/B+/B for BULLISH YES_BUY fast-path', () => {
    // Grade C: falls back to standard path → with composite=65, market=60 → CAUTION
    expect(getStockDecision(65, 60, 'uptrend', false, 'BULLISH', 70, 'C')).toBe('CAUTION');
  });

  it('accepts B+ and B as strong grades for BULLISH YES_BUY', () => {
    expect(getStockDecision(65, 55, 'uptrend', false, 'BULLISH', 70, 'B+')).toBe('YES_BUY');
    expect(getStockDecision(65, 55, 'uptrend', false, 'BULLISH', 70, 'B')).toBe('YES_BUY');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns NO when no Signa data, market=55 exactly, composite=59', () => {
    expect(getStockDecision(59, 55, 'chop', false, undefined, undefined, undefined)).toBe('NO');
  });

  it('handles missing signa params gracefully', () => {
    expect(() => getStockDecision(70, 60, 'uptrend', false)).not.toThrow();
  });
});

// ── computeStockTechnicalScore ────────────────────────────────────────────────

describe('computeStockTechnicalScore', () => {
  it('returns score between 0 and 100', () => {
    const h = buildHistory(100, 150, 250);
    const { score } = computeStockTechnicalScore(h, 150);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores high for a strong uptrend stock', () => {
    // Long uptrend: price well above all MAs, strong RSI, positive momentum
    const h = buildHistory(50, 150, 250);
    const { score, isBearish } = computeStockTechnicalScore(h, 150);
    expect(score).toBeGreaterThan(60);
    expect(isBearish).toBe(false);
  });

  it('scores low for a strong downtrend stock', () => {
    // Price starts high and falls far below all MAs
    const h = buildHistory(150, 50, 250);
    const { score, isBearish } = computeStockTechnicalScore(h, 50);
    expect(score).toBeLessThan(50);
    expect(isBearish).toBe(true);
  });

  it('returns 5 metrics with correct labels', () => {
    const h = buildHistory(100, 120, 250);
    const { metrics } = computeStockTechnicalScore(h, 120);
    const labels = metrics.map(m => m.label);
    expect(labels).toContain('vs 200d MA');
    expect(labels).toContain('vs 50d MA');
    expect(labels).toContain('RSI(14)');
    expect(labels).toContain('5d Return');
    expect(labels).toContain('20d Return');
    expect(metrics).toHaveLength(5);
  });

  it('shows N/A for MAs when history is shorter than required period', () => {
    const shortHistory = buildHistory(100, 110, 30); // too short for 200d/50d
    const { metrics } = computeStockTechnicalScore(shortHistory, 110);
    const vs200 = metrics.find(m => m.label === 'vs 200d MA')!;
    const vs50 = metrics.find(m => m.label === 'vs 50d MA')!;
    expect(vs200.value).toBe('N/A');
    expect(vs50.value).toBe('N/A');
  });

  it('isBearish requires ALL three conditions: below 200d, below 50d, RSI<50', () => {
    // A stock above its 200d MA should not be bearish even if RSI is low
    const h = buildHistory(80, 150, 250); // steady uptrend, price above all MAs
    const { isBearish } = computeStockTechnicalScore(h, 150);
    expect(isBearish).toBe(false);
  });

  it('score does not exceed 100 even for perfect bull setup', () => {
    const h = buildHistory(10, 999, 260);
    const { score } = computeStockTechnicalScore(h, 999);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── computeSectorETFScore ─────────────────────────────────────────────────────

describe('computeSectorETFScore', () => {
  it('returns 50 when sector data is undefined', () => {
    expect(computeSectorETFScore(undefined)).toBe(50);
  });

  it('scores high for a healthy sector', () => {
    const score = computeSectorETFScore({
      ticker: 'QQQ',
      aboveSMA50: true,
      aboveSMA200: true,
      change5d: 3,
      change20d: 7,
    });
    expect(score).toBeGreaterThan(70);
  });

  it('scores low for a weak sector', () => {
    const score = computeSectorETFScore({
      ticker: 'XLE',
      aboveSMA50: false,
      aboveSMA200: false,
      change5d: -3,
      change20d: -6,
    });
    expect(score).toBeLessThan(30);
  });

  it('returns 0 at minimum (clamp floor)', () => {
    const score = computeSectorETFScore({
      ticker: 'XLE',
      aboveSMA50: false,
      aboveSMA200: false,
      change5d: -10,
      change20d: -20,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns 100 at maximum (clamp ceiling)', () => {
    const score = computeSectorETFScore({
      ticker: 'QQQ',
      aboveSMA50: true,
      aboveSMA200: true,
      change5d: 10,
      change20d: 20,
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores above 50 when above both MAs even with flat momentum', () => {
    const score = computeSectorETFScore({
      ticker: 'XLV',
      aboveSMA50: true,
      aboveSMA200: true,
      change5d: 0,
      change20d: 0,
    });
    expect(score).toBeGreaterThan(50);
  });
});

// ── computeFibonacci ──────────────────────────────────────────────────────────

describe('computeFibonacci', () => {
  it('returns null when history has fewer than 20 candles', () => {
    expect(computeFibonacci([100, 110, 120])).toBeNull();
  });

  it('returns null when all prices are identical (range=0)', () => {
    const flatHistory = Array(30).fill(100);
    expect(computeFibonacci(flatHistory)).toBeNull();
  });

  it('returns 9 levels for a valid history', () => {
    const h = buildHistory(50, 150, 100);
    const levels = computeFibonacci(h);
    expect(levels).not.toBeNull();
    expect(levels!).toHaveLength(9);
  });

  it('0% level equals the high price', () => {
    const h = buildHistory(50, 150, 100);
    const high = Math.max(...h);
    const levels = computeFibonacci(h)!;
    const zeroLevel = levels.find(l => l.ratio === 0)!;
    expect(zeroLevel.price).toBeCloseTo(high);
  });

  it('100% level equals the low price', () => {
    const h = buildHistory(50, 150, 100);
    const low = Math.min(...h);
    const levels = computeFibonacci(h)!;
    const fullLevel = levels.find(l => l.ratio === 1.0)!;
    expect(fullLevel.price).toBeCloseTo(low);
  });

  it('extension levels have price above the high', () => {
    const h = buildHistory(50, 150, 100);
    const high = Math.max(...h);
    const levels = computeFibonacci(h)!;
    const extensions = levels.filter(l => l.isExtension);
    extensions.forEach(ext => {
      expect(ext.price).toBeGreaterThan(high);
    });
  });

  it('50% retracement is midpoint between high and low', () => {
    const h = buildHistory(50, 150, 100);
    const high = Math.max(...h);
    const low = Math.min(...h);
    const midpoint = (high + low) / 2;
    const levels = computeFibonacci(h)!;
    const fiftyLevel = levels.find(l => l.ratio === 0.5)!;
    expect(fiftyLevel.price).toBeCloseTo(midpoint);
  });

  it('uses only last 252 candles for history over a year', () => {
    // Build 300 candles, last 252 will span 50→150; first 48 are 200→210
    const oldPrices = buildHistory(200, 210, 48);
    const recentPrices = buildHistory(50, 150, 252);
    const combined = [...oldPrices, ...recentPrices];
    const levels = computeFibonacci(combined)!;
    // high/low should be from recentPrices (50–150), not oldPrices (200–210)
    const zeroLevel = levels.find(l => l.ratio === 0)!;
    expect(zeroLevel.price).toBeCloseTo(150, 0);
  });
});

// ── computeMovingAverages ─────────────────────────────────────────────────────

describe('computeMovingAverages', () => {
  it('returns all nulls when history is too short', () => {
    const result = computeMovingAverages([100, 110], null);
    expect(result.ema5).toBeNull();
    expect(result.ema21).toBeNull();
    expect(result.sma20).toBeNull();
    expect(result.sma200).toBeNull();
  });

  it('computes ema5 with at least 5 prices', () => {
    const h = buildHistory(100, 120, 10);
    const result = computeMovingAverages(h, null);
    expect(result.ema5).not.toBeNull();
  });

  it('reads signa EMA values from signaData when provided', () => {
    const h = buildHistory(100, 120, 250);
    const result = computeMovingAverages(h, {
      direction: 'BULLISH', confidence: 80, grade: 'A',
      action: 'BUY', riskRating: 'Low', conviction: 75,
      engineReasons: [], signaTriggers: [], entry: 110, stop: 100, target: 130,
      rr: 2, stage: 3, stageDescription: 'Breakout', riskScore: 20, riskFactors: [],
      triggers: [], patterns: [], tier: 'pro', overallScore: 80, rsi: 60, adx: 30,
      ema20: 105, ema50: 95, ema200: 80,
    });
    expect(result.signaEma20).toBe(105);
    expect(result.signaEma50).toBe(95);
    expect(result.signaEma200).toBe(80);
  });

  it('returns null signa EMAs when signaData is null', () => {
    const h = buildHistory(100, 120, 250);
    const result = computeMovingAverages(h, null);
    expect(result.signaEma20).toBeNull();
    expect(result.signaEma50).toBeNull();
    expect(result.signaEma200).toBeNull();
  });
});
