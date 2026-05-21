import { describe, it, expect } from 'vitest';
import {
  scoreVolatility,
  scoreTrend,
  computeMarketQualityScore,
  getDecision,
} from '../../services/scoring.js';
import type { RawMarketData } from '../../services/marketData.js';

// ── Fixture builder ───────────────────────────────────────────────────────────

function makeSector(ticker: string, change5d: number, change20d: number, aboveSMA50: boolean, aboveSMA200: boolean) {
  return {
    ticker, name: ticker, price: 100,
    change1d: 0, change5d, change20d,
    aboveSMA50, aboveSMA200,
  };
}

function makeRawData(overrides: Partial<RawMarketData> = {}): RawMarketData {
  return {
    vix: { current: 18, slope5d: 0, percentile1yr: 50 },
    spy: {
      current: 500, ma20: 490, ma50: 480, ma200: 450,
      rsi14: 58, return1d: 0.3, return5d: 1.5, return20d: 4.0,
      closes: [490, 492, 495, 498, 500],
    },
    qqq: { current: 430, ma50: 410, return1d: 0.4 },
    iwm: { current: 210, return5d: 1.2 },
    macro: {
      tnx: 4.2, tnxReturn30d: -2, tnxSlope20d: -0.01,
      uup: 28, uupSlope20d: -0.003,
      fedStance: 'neutral', fomcEvent: null,
    },
    breadth: { sectorsAbove50d: 10, pctSectorsAbove50d: 71 },
    sectors: [
      makeSector('XLK', 2.5, 6, true, true),
      makeSector('XLF', 1.2, 3, true, true),
      makeSector('XLE', -1.0, -2, false, false),
      makeSector('XLV', 0.5, 1, true, false),
      makeSector('XLI', 1.5, 4, true, true),
      makeSector('XLY', 2.0, 5, true, true),
      makeSector('XLP', 0.2, 0.5, true, false),
      makeSector('XLU', -0.5, -1, false, false),
      makeSector('XLB', 1.0, 2, true, false),
      makeSector('XLRE', -1.0, -3, false, false),
      makeSector('XLC', 1.8, 4, true, true),
      makeSector('ITA', 0.8, 2, true, false),
      makeSector('QQQ', 2.1, 5.5, true, true),
      makeSector('PDBC', 0, 0, true, false),
    ],
    subsectors: [],
    regime: 'uptrend',
    top3Sectors: ['XLK', 'XLY', 'XLC'],
    bottom3Sectors: ['XLU', 'XLRE', 'XLE'],
    ...overrides,
  } as unknown as RawMarketData;
}

// ── scoreVolatility ───────────────────────────────────────────────────────────

describe('scoreVolatility', () => {
  it('returns high score for very low VIX', () => {
    const d = makeRawData({ vix: { current: 10, slope5d: 0, percentile1yr: 50 } });
    expect(scoreVolatility(d).score).toBeGreaterThan(70);
  });

  it('returns low score for very high VIX', () => {
    const d = makeRawData({ vix: { current: 40, slope5d: 0, percentile1yr: 90 } });
    expect(scoreVolatility(d).score).toBeLessThan(30);
  });

  it('returns score between 0 and 100 for any VIX level', () => {
    for (const vix of [8, 15, 20, 30, 45]) {
      const d = makeRawData({ vix: { current: vix, slope5d: 0, percentile1yr: 50 } });
      const { score } = scoreVolatility(d);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('returns weight of 20', () => {
    expect(scoreVolatility(makeRawData()).weight).toBe(20);
  });

  it('returns label Volatility', () => {
    expect(scoreVolatility(makeRawData()).label).toBe('Volatility');
  });

  it('bonuses falling VIX slope vs flat', () => {
    const falling = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: -1.0, percentile1yr: 50 } })).score;
    const flat = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: 0, percentile1yr: 50 } })).score;
    expect(falling).toBeGreaterThan(flat);
  });

  it('penalises rising VIX slope vs flat', () => {
    const rising = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: 1.0, percentile1yr: 50 } })).score;
    const flat = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: 0, percentile1yr: 50 } })).score;
    expect(rising).toBeLessThan(flat);
  });

  it('bonuses historically low VIX percentile', () => {
    const lowPct = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: 0, percentile1yr: 10 } })).score;
    const highPct = scoreVolatility(makeRawData({ vix: { current: 20, slope5d: 0, percentile1yr: 90 } })).score;
    expect(lowPct).toBeGreaterThan(highPct);
  });

  it('returns healthy interpretation for score ≥70', () => {
    const d = makeRawData({ vix: { current: 10, slope5d: 0, percentile1yr: 15 } });
    expect(scoreVolatility(d).interpretation).toBe('healthy');
  });

  it('returns risk-off interpretation for very high VIX', () => {
    const d = makeRawData({ vix: { current: 40, slope5d: 0.5, percentile1yr: 95 } });
    expect(scoreVolatility(d).interpretation).toBe('risk-off');
  });

  it('returns 3 metrics with correct labels', () => {
    const { metrics } = scoreVolatility(makeRawData());
    const labels = metrics.map(m => m.label);
    expect(labels).toContain('VIX');
    expect(labels).toContain('VIX 5d Slope');
    expect(labels).toContain('VIX 1yr %ile');
  });
});

// ── scoreTrend ────────────────────────────────────────────────────────────────

describe('scoreTrend', () => {
  it('scores high in a strong uptrend', () => {
    const { score } = scoreTrend(makeRawData());
    expect(score).toBeGreaterThan(50);
  });

  it('scores low in a downtrend with SPY below all MAs', () => {
    const d = makeRawData({
      spy: {
        current: 400, ma20: 450, ma50: 470, ma200: 480,
        rsi14: 35, return1d: -1, return5d: -3, return20d: -8,
        closes: [450, 440, 430, 420, 410, 400],
      },
      regime: 'downtrend',
    });
    const { score } = scoreTrend(d);
    expect(score).toBeLessThan(40);
  });

  it('returns score between 0 and 100', () => {
    const { score } = scoreTrend(makeRawData());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns weight of 25', () => {
    expect(scoreTrend(makeRawData()).weight).toBe(25);
  });

  it('returns label Trend', () => {
    expect(scoreTrend(makeRawData()).label).toBe('Trend');
  });

  it('returns 4 metrics including SPY vs 200d, 50d, RSI and Regime', () => {
    const { metrics } = scoreTrend(makeRawData());
    const labels = metrics.map(m => m.label);
    expect(labels).toContain('SPY vs 200d');
    expect(labels).toContain('SPY vs 50d');
    expect(labels).toContain('SPY RSI(14)');
    expect(labels).toContain('Regime');
  });

  it('uptrend bonus makes score higher than downtrend penalty', () => {
    const up = scoreTrend(makeRawData({ regime: 'uptrend' })).score;
    const down = scoreTrend(makeRawData({ regime: 'downtrend' })).score;
    expect(up).toBeGreaterThan(down);
  });
});

// ── computeMarketQualityScore ─────────────────────────────────────────────────

describe('computeMarketQualityScore', () => {
  it('weights: vol×20 + trend×25 + breadth×20 + momentum×25 + macro×10', () => {
    expect(computeMarketQualityScore(100, 0, 0, 0, 0)).toBe(20);
    expect(computeMarketQualityScore(0, 100, 0, 0, 0)).toBe(25);
    expect(computeMarketQualityScore(0, 0, 100, 0, 0)).toBe(20);
    expect(computeMarketQualityScore(0, 0, 0, 100, 0)).toBe(25);
    expect(computeMarketQualityScore(0, 0, 0, 0, 100)).toBe(10);
  });

  it('all-100 inputs produces 100', () => {
    expect(computeMarketQualityScore(100, 100, 100, 100, 100)).toBe(100);
  });

  it('all-0 inputs produces 0', () => {
    expect(computeMarketQualityScore(0, 0, 0, 0, 0)).toBe(0);
  });

  it('returns a rounded integer', () => {
    const score = computeMarketQualityScore(65, 70, 55, 80, 60);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('produces a realistic mid-range score', () => {
    const score = computeMarketQualityScore(60, 65, 55, 70, 50);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(80);
  });
});

// ── getDecision (market-level) ────────────────────────────────────────────────

describe('getDecision (market-level)', () => {
  it('returns YES_BUY for score ≥80 in uptrend or chop', () => {
    expect(getDecision(80, 'uptrend')).toBe('YES_BUY');
    expect(getDecision(95, 'chop')).toBe('YES_BUY');
    expect(getDecision(100, 'uptrend')).toBe('YES_BUY');
  });

  it('returns YES_SELL for score ≥80 in downtrend', () => {
    expect(getDecision(80, 'downtrend')).toBe('YES_SELL');
    expect(getDecision(100, 'downtrend')).toBe('YES_SELL');
  });

  it('returns CAUTION for score 60–79 in any regime', () => {
    expect(getDecision(60, 'uptrend')).toBe('CAUTION');
    expect(getDecision(79, 'downtrend')).toBe('CAUTION');
    expect(getDecision(70, 'chop')).toBe('CAUTION');
  });

  it('returns NO for score below 60', () => {
    expect(getDecision(59, 'uptrend')).toBe('NO');
    expect(getDecision(0, 'chop')).toBe('NO');
    expect(getDecision(59, 'downtrend')).toBe('NO');
  });
});
