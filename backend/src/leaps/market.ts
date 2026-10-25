import { RULES, type MarketState } from './rules.js';

// Market condition (docs/leaps-rules.md section 2) and the price statistics the screen needs.

export const offHighPct = (close: number, high: number) => (high > 0 ? (1 - close / high) * 100 : 0);

// marketState:
//   - Correction: SPY >= 10% below its 52-week high
//   - Pullback: 5-10% below and (VIX > 20 or Market Quality Score < 60); a missing input simply does not count
export function marketState(spyOffHighPct: number, vix: number | null, marketScore: number | null): MarketState {
  if (spyOffHighPct >= RULES.correctionPct) return 'correction';
  if (spyOffHighPct >= RULES.pullbackPct) {
    const stressed = (vix != null && vix > RULES.pullbackVix) || (marketScore != null && marketScore < RULES.pullbackMarketScore);
    if (stressed) return 'pullback';
  }
  return 'normal';
}

// Highest close in the `lookback` sessions ending at index i (inclusive).
export function rollingHigh(closes: number[], lookback: number = RULES.highLookback): number[] {
  const out: number[] = [];
  const window: number[] = [];   // indices with decreasing closes
  closes.forEach((c, i) => {
    while (window.length && closes[window.at(-1)!] <= c) window.pop();
    window.push(i);
    while (window[0] <= i - lookback) window.shift();
    out.push(closes[window[0]]);
  });
  return out;
}

// Annualised standard deviation of daily log returns over the `lookback` sessions ending at each index;
// null until a full window exists.
export function rollingVol(closes: number[], lookback: number = RULES.highLookback): (number | null)[] {
  const rets = closes.map((c, i) => (i === 0 || closes[i - 1] <= 0 || c <= 0 ? 0 : Math.log(c / closes[i - 1])));
  let sum = 0;
  let sumSq = 0;
  return closes.map((_, i) => {
    if (i > 0) { sum += rets[i]; sumSq += rets[i] ** 2; }
    if (i > lookback) { sum -= rets[i - lookback]; sumSq -= rets[i - lookback] ** 2; }
    if (i < lookback) return null;
    const mean = sum / lookback;
    const variance = Math.max(0, sumSq / lookback - mean * mean) * lookback / (lookback - 1);
    return Math.sqrt(variance * 252);
  });
}

// Stock-split factor between `after` (exclusive) and today: SEC share counts filed before a split are multiplied by it.
export function splitFactorSince(splits: { date: string; ratio: number }[], after: string): number {
  return splits.filter(s => s.date > after).reduce((f, s) => f * s.ratio, 1);
}
