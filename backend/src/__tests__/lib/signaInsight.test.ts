import { describe, it, expect } from 'vitest';
import { synthesizeOptionsInsight } from '../../lib/signaClient.js';
import type { OptionsFlowData, DarkpoolData, GammaData } from '../../lib/signaClient.js';

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeFlow(direction: 'bullish' | 'bearish' | 'neutral', unusualCount = 0): OptionsFlowData {
  return {
    ticker: 'AAPL',
    items: [],
    callPutRatio: direction === 'bullish' ? 1.8 : direction === 'bearish' ? 0.5 : 1.0,
    bullishPremium: 1000000,
    bearishPremium: 500000,
    unusualCount,
    direction,
    summary: `${direction} flow`,
  };
}

function makeDarkpool(direction: 'bullish' | 'bearish' | 'neutral'): DarkpoolData {
  return {
    ticker: 'AAPL',
    trades: [],
    totalVolume: 1000000,
    darkpoolPercent: 45.0,
    avgPrice: 150.0,
    bullishVolume: 600000,
    bearishVolume: 400000,
    direction,
    summary: `${direction} darkpool`,
  };
}

function makeGamma(direction: 'bullish' | 'bearish' | 'neutral', gammaFlipPoint: number | null = 145, pinRisk = false): GammaData {
  return {
    ticker: 'AAPL',
    currentPrice: 150,
    netGamma: direction === 'bullish' ? 1000 : -1000,
    gammaFlipPoint,
    keyLevels: [],
    dominantFlow: direction === 'bullish' ? 'call' : direction === 'bearish' ? 'put' : 'neutral',
    pinRisk,
    direction,
    summary: `${direction} gamma`,
  };
}

// ── synthesizeOptionsInsight ──────────────────────────────────────────────────

describe('synthesizeOptionsInsight', () => {
  // ── No data ───────────────────────────────────────────────────────────────

  it('returns neutral/low when all sources are null', () => {
    const result = synthesizeOptionsInsight(null, null, null, 150, 'AAPL');
    expect(result.overallDirection).toBe('neutral');
    expect(result.confidence).toBe('low');
    expect(result.keyPoints).toHaveLength(0);
    expect(result.summary).toBe('No options data available.');
  });

  it('passes through null data sources', () => {
    const result = synthesizeOptionsInsight(null, null, null, 150, 'AAPL');
    expect(result.flow).toBeNull();
    expect(result.darkpool).toBeNull();
    expect(result.gamma).toBeNull();
  });

  // ── Single source ─────────────────────────────────────────────────────────

  it('returns bullish direction from flow only', () => {
    const result = synthesizeOptionsInsight(makeFlow('bullish'), null, null, 150, 'AAPL');
    expect(result.overallDirection).toBe('bullish');
    expect(result.confidence).toBe('high'); // 1/1 agreement
  });

  it('returns bearish direction from darkpool only', () => {
    const result = synthesizeOptionsInsight(null, makeDarkpool('bearish'), null, 150, 'AAPL');
    expect(result.overallDirection).toBe('bearish');
    expect(result.confidence).toBe('high');
  });

  it('returns neutral direction from gamma only when neutral', () => {
    const result = synthesizeOptionsInsight(null, null, makeGamma('neutral'), 150, 'AAPL');
    expect(result.overallDirection).toBe('neutral');
  });

  // ── Full agreement ────────────────────────────────────────────────────────

  it('returns high confidence when all 3 sources agree bullish', () => {
    const result = synthesizeOptionsInsight(
      makeFlow('bullish'),
      makeDarkpool('bullish'),
      makeGamma('bullish'),
      150, 'AAPL',
    );
    expect(result.overallDirection).toBe('bullish');
    expect(result.confidence).toBe('high');
    expect(result.keyPoints).toHaveLength(3);
  });

  it('returns high confidence when all 3 sources agree bearish', () => {
    const result = synthesizeOptionsInsight(
      makeFlow('bearish'),
      makeDarkpool('bearish'),
      makeGamma('bearish'),
      150, 'AAPL',
    );
    expect(result.overallDirection).toBe('bearish');
    expect(result.confidence).toBe('high');
  });

  // ── Mixed signals ─────────────────────────────────────────────────────────

  it('returns medium confidence when 2/3 sources agree', () => {
    const result = synthesizeOptionsInsight(
      makeFlow('bullish'),
      makeDarkpool('bullish'),
      makeGamma('bearish'),
      150, 'AAPL',
    );
    expect(result.overallDirection).toBe('bullish'); // 2 bull vs 1 bear
    expect(result.confidence).toBe('medium');
  });

  it('returns neutral and low confidence when sources are split 1-1-1', () => {
    const result = synthesizeOptionsInsight(
      makeFlow('bullish'),
      makeDarkpool('bearish'),
      makeGamma('neutral'),
      150, 'AAPL',
    );
    // 1 bull, 1 bear → tied → neutral; 1 agreement vs 3 total → low
    expect(result.overallDirection).toBe('neutral');
    expect(result.confidence).toBe('low');
  });

  // ── Key points content ────────────────────────────────────────────────────

  it('includes C/P ratio in flow key point', () => {
    const result = synthesizeOptionsInsight(makeFlow('bullish', 3), null, null, 150, 'AAPL');
    expect(result.keyPoints[0]).toContain('C/P ratio');
    expect(result.keyPoints[0]).toContain('3 unusual trade');
  });

  it('omits unusual trade count when unusualCount is 0', () => {
    const result = synthesizeOptionsInsight(makeFlow('bullish', 0), null, null, 150, 'AAPL');
    expect(result.keyPoints[0]).not.toContain('unusual');
  });

  it('includes avg fill price in darkpool key point', () => {
    const result = synthesizeOptionsInsight(null, makeDarkpool('bearish'), null, 150, 'AAPL');
    expect(result.keyPoints[0]).toContain('avg fill $150.00');
  });

  it('includes gamma flip annotation when flip point is provided', () => {
    const result = synthesizeOptionsInsight(null, null, makeGamma('bullish', 145), 150, 'AAPL');
    // 150 > 145 → above flip → positive gamma
    expect(result.keyPoints[0]).toContain('above — positive gamma');
  });

  it('shows negative gamma when price is below flip point', () => {
    const result = synthesizeOptionsInsight(null, null, makeGamma('bearish', 160), 150, 'AAPL');
    // 150 < 160 → below flip → negative gamma
    expect(result.keyPoints[0]).toContain('below — negative gamma');
  });

  it('omits flip annotation when gammaFlipPoint is null', () => {
    const result = synthesizeOptionsInsight(null, null, makeGamma('bullish', null), 150, 'AAPL');
    expect(result.keyPoints[0]).not.toContain('flip point');
  });

  it('includes pin risk in gamma key point', () => {
    const result = synthesizeOptionsInsight(null, null, makeGamma('neutral', null, true), 150, 'AAPL');
    expect(result.keyPoints[0]).toContain('pin risk');
  });

  // ── Summary formatting ────────────────────────────────────────────────────

  it('summary mentions symbol and source count', () => {
    const result = synthesizeOptionsInsight(
      makeFlow('bullish'),
      makeDarkpool('bullish'),
      null,
      150, 'NVDA',
    );
    expect(result.summary).toContain('NVDA');
    expect(result.summary).toContain('2 data sources');
  });

  it('summary uses singular for 1 source', () => {
    const result = synthesizeOptionsInsight(makeFlow('bearish'), null, null, 150, 'SPY');
    expect(result.summary).toContain('1 data source');
    expect(result.summary).not.toContain('sources');
  });

  // ── Pass-through of data objects ──────────────────────────────────────────

  it('passes flow/darkpool/gamma through to the result', () => {
    const flow = makeFlow('bullish');
    const darkpool = makeDarkpool('bullish');
    const gamma = makeGamma('bullish');
    const result = synthesizeOptionsInsight(flow, darkpool, gamma, 150, 'AAPL');
    expect(result.flow).toBe(flow);
    expect(result.darkpool).toBe(darkpool);
    expect(result.gamma).toBe(gamma);
  });
});
