import { sma, ema, rsi, pctReturn, clamp } from '../lib/technical.js';
import type { SignaData } from '../lib/signaClient.js';

export const SECTOR_TO_ETF: Record<string, string> = {
  'Technology': 'QQQ',
  'Financial Services': 'XLF',
  'Financials': 'XLF',
  'Energy': 'XLE',
  'Healthcare': 'XLV',
  'Health Care': 'XLV',
  'Industrials': 'XLI',
  'Consumer Cyclical': 'XLY',
  'Consumer Discretionary': 'XLY',
  'Consumer Defensive': 'XLP',
  'Consumer Staples': 'XLP',
  'Utilities': 'XLU',
  'Basic Materials': 'XLB',
  'Materials': 'XLB',
  'Real Estate': 'XLRE',
  'Communication Services': 'XLC',
};

export interface StockMetric {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'flat';
  note: string;
}

export type StockDecision = 'YES_BUY' | 'YES_SHORT' | 'CAUTION' | 'NO';

export interface StockSectorData {
  ticker: string;
  change5d: number;
  change20d: number;
  aboveSMA50: boolean;
  aboveSMA200: boolean;
}

export function computeStockTechnicalScore(
  history: number[],
  price: number,
): { score: number; metrics: StockMetric[]; isBearish: boolean } {
  const ma20 = sma(history, 20);
  const ma50 = sma(history, 50);
  const ma200 = sma(history, 200);
  const rsi14 = rsi(history, 14);
  const ret5d = pctReturn(history, 5) ?? 0;
  const ret20d = pctReturn(history, 20) ?? 0;

  let score = 0;

  if (ma200 !== null) score += price > ma200 ? 28 : -8;
  if (ma50 !== null) score += price > ma50 ? 24 : -5;
  if (ma20 !== null) score += price > ma20 ? 14 : 0;

  if (rsi14 !== null) {
    if (rsi14 >= 50 && rsi14 <= 65) score += 15;
    else if ((rsi14 >= 40 && rsi14 < 50) || (rsi14 > 65 && rsi14 <= 75)) score += 8;
    else if (rsi14 > 75) score += 4;
    else if (rsi14 >= 30) score -= 5;
    else score -= 12;
  }

  if (ret5d > 3) score += 10;
  else if (ret5d > 1) score += 6;
  else if (ret5d < -3) score -= 12;
  else if (ret5d < -1) score -= 6;

  const finalScore = clamp(score, 0, 100);

  const maStatus = (ma: number | null) => {
    if (ma === null) return 'N/A';
    const diff = ((price - ma) / ma) * 100;
    return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
  };

  const isBearish =
    (ma200 !== null && price < ma200) &&
    (ma50 !== null && price < ma50) &&
    (rsi14 !== null && rsi14 < 50);

  const metrics: StockMetric[] = [
    {
      label: 'vs 200d MA', value: maStatus(ma200),
      direction: ma200 !== null && price > ma200 ? 'up' : 'down',
      note: ma200 === null ? 'Insufficient history' : price > ma200 ? 'Long-term uptrend' : 'Below 200d — bearish structure',
    },
    {
      label: 'vs 50d MA', value: maStatus(ma50),
      direction: ma50 !== null && price > ma50 ? 'up' : 'down',
      note: ma50 === null ? 'Insufficient history' : price > ma50 ? 'Intermediate uptrend' : 'Below 50d — weakening',
    },
    {
      label: 'RSI(14)', value: rsi14 !== null ? rsi14.toFixed(1) : 'N/A',
      direction: rsi14 !== null && rsi14 > 50 ? 'up' : 'down',
      note: rsi14 === null ? 'N/A' : rsi14 > 70 ? 'Overbought' : rsi14 > 50 ? 'Bullish momentum' : rsi14 > 30 ? 'Weakening' : 'Oversold',
    },
    {
      label: '5d Return', value: (ret5d >= 0 ? '+' : '') + ret5d.toFixed(2) + '%',
      direction: ret5d > 0.5 ? 'up' : ret5d < -0.5 ? 'down' : 'flat',
      note: ret5d > 2 ? 'Strong near-term momentum' : ret5d > 0 ? 'Mildly positive' : ret5d < -2 ? 'Selling pressure' : 'Slightly negative',
    },
    {
      label: '20d Return', value: (ret20d >= 0 ? '+' : '') + ret20d.toFixed(2) + '%',
      direction: ret20d > 1 ? 'up' : ret20d < -1 ? 'down' : 'flat',
      note: ret20d > 5 ? 'Strong trend' : ret20d > 0 ? 'Positive trend' : ret20d < -5 ? 'Downtrend' : 'Weak/flat',
    },
  ];

  return { score: finalScore, metrics, isBearish };
}

export function computeSectorETFScore(sector: StockSectorData | undefined): number {
  if (!sector) return 50;

  let score = 0;
  if (sector.aboveSMA50) score += 40;
  if (sector.aboveSMA200) score += 20;

  if (sector.change5d > 2) score += 20;
  else if (sector.change5d > 0) score += 10;
  else if (sector.change5d < -2) score -= 10;
  else if (sector.change5d < 0) score -= 5;

  if (sector.change20d > 5) score += 15;
  else if (sector.change20d > 0) score += 8;
  else if (sector.change20d < -5) score -= 15;
  else if (sector.change20d < 0) score -= 8;

  return clamp(score, 0, 100);
}

export function getStockDecision(
  compositeScore: number,
  marketScore: number,
  regime: string,
  isBearish: boolean,
  signaDirection?: string,
  signaConfidence?: number,
  signaGrade?: string,
): StockDecision {
  // Engine uses BULLISH/BEARISH; data field uses LONG/SHORT — accept both
  const signaLong = signaDirection === 'LONG' || signaDirection === 'BULLISH';
  const signaShortSig = signaDirection === 'SHORT' || signaDirection === 'BEARISH';
  const signaHighConf = (signaConfidence ?? 0) >= 65;
  const signaStrongGrade = signaGrade ? ['A+', 'A', 'B+', 'B'].includes(signaGrade) : false;

  // When Signa has a strong short signal, always respect it
  if (signaShortSig && signaHighConf) {
    return 'YES_SHORT';
  }

  // When Signa has a strong long signal with good grade, don't let low market score force NO
  if (signaLong && signaHighConf && signaStrongGrade) {
    if (regime === 'downtrend' && marketScore < 40) return 'CAUTION';
    if (compositeScore >= 60) return 'YES_BUY';
    return 'CAUTION';
  }

  // Standard logic: market score gate
  if (marketScore < 55) return 'NO';
  if (compositeScore >= 80) {
    return regime === 'downtrend' && isBearish ? 'YES_SHORT' : 'YES_BUY';
  }
  if (compositeScore >= 60) return 'CAUTION';
  return 'NO';
}

export function buildStockAnalysis(
  symbol: string,
  decision: StockDecision,
  compositeScore: number,
  stockScore: number,
  sectorScore: number,
  marketScore: number,
  sectorEtf: string | null,
  regime: string,
): string {
  const decisionText: Record<StockDecision, string> = {
    YES_BUY: 'FAVORABLE LONG SETUP',
    YES_SHORT: 'FAVORABLE SHORT SETUP',
    CAUTION: 'PROCEED WITH CAUTION',
    NO: 'AVOID — UNFAVORABLE CONDITIONS',
  };
  const scoreText = compositeScore >= 80 ? 'strong' : compositeScore >= 60 ? 'moderate' : 'weak';
  const envText = marketScore >= 70 ? 'supportive' : marketScore >= 50 ? 'mixed' : 'unfavorable';
  const sectorLine = sectorEtf
    ? `Sector ETF ${sectorEtf} health score: ${sectorScore}/100.`
    : 'No sector ETF mapping available.';

  const detail =
    decision === 'YES_BUY'
      ? `Technical structure supports long entry. Composite score of ${compositeScore} reflects bullish alignment across stock technicals, sector, and market conditions.`
      : decision === 'YES_SHORT'
      ? `Technical structure supports short entry. Downtrend regime confirmed with bearish stock alignment. Composite score: ${compositeScore}.`
      : decision === 'CAUTION'
      ? `Mixed signals — trade only A+ setups with reduced position size. Score of ${compositeScore} does not support full conviction.`
      : `Market environment score of ${marketScore} is below threshold for active trading. Preserve capital and wait for improved conditions.`;

  return `${symbol} — ${decisionText[decision]}

COMPOSITE: ${compositeScore}/100 (${scoreText}) | MARKET ENV: ${envText} (${marketScore}/100)
${sectorLine} Regime: ${regime.toUpperCase()}.

STOCK: ${stockScore}/100 × 40%  |  SECTOR: ${sectorScore}/100 × 30%  |  MARKET: ${marketScore}/100 × 30%

${detail}`;
}

// ── Fibonacci ────────────────────────────────────────────────────────────────

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
  isExtension: boolean;
}

export function computeFibonacci(history: number[]): FibLevel[] | null {
  const recent = history.slice(-Math.min(252, history.length));
  if (recent.length < 20) return null;

  const high = Math.max(...recent);
  const low = Math.min(...recent);
  const range = high - low;
  if (range < 0.01) return null;

  const levels = [
    { ratio: -0.618, label: '161.8% ext', isExtension: true },
    { ratio: -0.272, label: '127.2% ext', isExtension: true },
    { ratio: 0,     label: '0.0% (High)',  isExtension: false },
    { ratio: 0.236, label: '23.6%',        isExtension: false },
    { ratio: 0.382, label: '38.2%',        isExtension: false },
    { ratio: 0.5,   label: '50.0%',        isExtension: false },
    { ratio: 0.618, label: '61.8%',        isExtension: false },
    { ratio: 0.786, label: '78.6%',        isExtension: false },
    { ratio: 1.0,   label: '100% (Low)',   isExtension: false },
  ];

  // price = high - ratio * range  (extensions: ratio < 0 → price > high)
  return levels.map(l => ({
    ratio: l.ratio,
    label: l.label,
    price: high - l.ratio * range,
    isExtension: l.isExtension,
  }));
}

// ── Moving averages ──────────────────────────────────────────────────────────

export interface MovingAverages {
  ema5: number | null;
  ema21: number | null;
  ema55: number | null;
  sma20: number | null;
  sma200: number | null;
  signaEma20: number | null;
  signaEma50: number | null;
  signaEma200: number | null;
}

export function computeMovingAverages(
  history: number[],
  signaData?: SignaData | null,
): MovingAverages {
  return {
    ema5:   ema(history, 5),
    ema21:  ema(history, 21),
    ema55:  ema(history, 55),
    sma20:  sma(history, 20),
    sma200: sma(history, 200),
    signaEma20:  signaData?.ema20  ?? null,
    signaEma50:  signaData?.ema50  ?? null,
    signaEma200: signaData?.ema200 ?? null,
  };
}
