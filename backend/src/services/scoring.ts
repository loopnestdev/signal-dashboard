import { clamp } from '../lib/technical.js';
import type { RawMarketData } from './marketData.js';

export interface CategoryScore {
  score: number;
  weight: number;
  label: string;
  interpretation: 'healthy' | 'neutral' | 'weakening' | 'risk-off';
  metrics: Array<{ label: string; value: string; direction: 'up' | 'down' | 'flat'; note: string }>;
}

export function scoreVolatility(d: RawMarketData): CategoryScore {
  const { current, slope5d, percentile1yr } = d.vix;

  let base: number;
  if (current <= 12) base = 95;
  else if (current <= 15) base = 83;
  else if (current <= 18) base = 70;
  else if (current <= 22) base = 52;
  else if (current <= 28) base = 34;
  else if (current <= 35) base = 18;
  else base = 8;

  const trendAdj = slope5d < -0.5 ? 10 : slope5d < -0.1 ? 5 : slope5d > 0.5 ? -15 : slope5d > 0.1 ? -7 : 0;
  const pctAdj = percentile1yr < 20 ? 10 : percentile1yr < 40 ? 5 : percentile1yr > 80 ? -15 : percentile1yr > 60 ? -7 : 0;
  const score = clamp(base + trendAdj + pctAdj, 0, 100);

  return {
    score,
    weight: 20,
    label: 'Volatility',
    interpretation: score >= 70 ? 'healthy' : score >= 50 ? 'neutral' : score >= 30 ? 'weakening' : 'risk-off',
    metrics: [
      {
        label: 'VIX', value: current.toFixed(2),
        direction: slope5d < -0.1 ? 'down' : slope5d > 0.1 ? 'up' : 'flat',
        note: current <= 18 ? 'Low vol — favorable' : current <= 25 ? 'Elevated — cautious' : 'High vol — risk-off',
      },
      {
        label: 'VIX 5d Slope', value: slope5d.toFixed(2),
        direction: slope5d < 0 ? 'down' : slope5d > 0 ? 'up' : 'flat',
        note: slope5d < -0.1 ? 'Declining (improving)' : slope5d > 0.1 ? 'Rising (deteriorating)' : 'Flat',
      },
      {
        label: 'VIX 1yr %ile', value: percentile1yr.toFixed(0) + '%',
        direction: percentile1yr < 40 ? 'down' : percentile1yr > 70 ? 'up' : 'flat',
        note: percentile1yr < 30 ? 'Historically calm' : percentile1yr > 70 ? 'Historically stressed' : 'Normal range',
      },
    ],
  };
}

export function scoreTrend(d: RawMarketData): CategoryScore {
  const { spy, qqq, regime } = d;
  let score = 0;

  if (spy.ma200 !== null) score += spy.current > spy.ma200 ? 28 : -5;
  if (spy.ma50 !== null) score += spy.current > spy.ma50 ? 22 : -5;
  if (spy.ma20 !== null) score += spy.current > spy.ma20 ? 16 : 0;
  if (qqq.ma50 !== null) score += qqq.current > qqq.ma50 ? 12 : -5;

  if (spy.rsi14 !== null) {
    const r = spy.rsi14;
    if (r >= 50 && r <= 65) score += 12;
    else if ((r >= 40 && r < 50) || (r > 65 && r <= 75)) score += 6;
    else if (r > 75) score += 2;
    else if (r >= 30) score -= 5;
    else score -= 12;
  }

  if (regime === 'uptrend') score += 5;
  else if (regime === 'downtrend') score -= 15;
  else score -= 5;

  const finalScore = clamp(score, 0, 100);

  const maStatus = (price: number, ma: number | null, label: string) =>
    ma !== null ? `${label}: ${price > ma ? '+' : ''}${(((price - ma) / ma) * 100).toFixed(1)}%` : 'N/A';

  return {
    score: finalScore,
    weight: 25,
    label: 'Trend',
    interpretation: finalScore >= 70 ? 'healthy' : finalScore >= 50 ? 'neutral' : finalScore >= 30 ? 'weakening' : 'risk-off',
    metrics: [
      {
        label: 'SPY vs 200d', value: maStatus(spy.current, spy.ma200, '200d'),
        direction: spy.ma200 && spy.current > spy.ma200 ? 'up' : 'down',
        note: spy.ma200 && spy.current > spy.ma200 ? 'Above — long-term uptrend' : 'Below — bearish structure',
      },
      {
        label: 'SPY vs 50d', value: maStatus(spy.current, spy.ma50, '50d'),
        direction: spy.ma50 && spy.current > spy.ma50 ? 'up' : 'down',
        note: spy.ma50 && spy.current > spy.ma50 ? 'Above — intermediate uptrend' : 'Below — weakening',
      },
      {
        label: 'SPY RSI(14)', value: spy.rsi14 !== null ? spy.rsi14.toFixed(1) : 'N/A',
        direction: spy.rsi14 !== null && spy.rsi14 > 50 ? 'up' : 'down',
        note: spy.rsi14 !== null
          ? spy.rsi14 > 70 ? 'Overbought' : spy.rsi14 > 50 ? 'Bullish momentum' : spy.rsi14 > 30 ? 'Weakening' : 'Oversold'
          : 'N/A',
      },
      {
        label: 'Regime', value: regime.toUpperCase(),
        direction: regime === 'uptrend' ? 'up' : regime === 'downtrend' ? 'down' : 'flat',
        note: regime === 'uptrend' ? 'Trend is your friend' : regime === 'chop' ? 'Choppy — be selective' : 'Downtrend — avoid longs',
      },
    ],
  };
}

export function scoreBreadth(d: RawMarketData): CategoryScore {
  const { breadth, spy, iwm } = d;
  let score = 0;

  const pct = breadth.pctSectorsAbove50d;
  if (pct >= 82) score += 55;
  else if (pct >= 65) score += 42;
  else if (pct >= 50) score += 28;
  else if (pct >= 35) score += 14;
  else score += 0;

  const iwmVsSpy = iwm.return5d - spy.return5d;
  if (iwmVsSpy > 1.5) score += 30;
  else if (iwmVsSpy > 0) score += 20;
  else if (iwmVsSpy > -1) score += 10;
  else if (iwmVsSpy > -2.5) score += 0;
  else score -= 10;

  if (pct >= 73) score += 15;

  return {
    score: clamp(score, 0, 100),
    weight: 20,
    label: 'Breadth',
    interpretation: score >= 70 ? 'healthy' : score >= 50 ? 'neutral' : score >= 30 ? 'weakening' : 'risk-off',
    metrics: [
      {
        label: 'Sectors > 50d MA', value: `${breadth.sectorsAbove50d}/${d.sectors.length}`,
        direction: pct >= 55 ? 'up' : pct < 40 ? 'down' : 'flat',
        note: pct >= 70 ? 'Broad participation' : pct >= 50 ? 'Mixed breadth' : 'Narrow leadership',
      },
      {
        label: '% Sectors > 50d', value: pct.toFixed(0) + '%',
        direction: pct >= 55 ? 'up' : pct < 40 ? 'down' : 'flat',
        note: pct >= 80 ? 'Excellent breadth' : pct >= 55 ? 'Good breadth' : 'Weakening breadth',
      },
      {
        label: 'IWM vs SPY (5d)', value: (iwmVsSpy >= 0 ? '+' : '') + iwmVsSpy.toFixed(2) + '%',
        direction: iwmVsSpy > 0 ? 'up' : 'down',
        note: iwmVsSpy > 0.5 ? 'Small caps leading — broad rally' : iwmVsSpy < -1 ? 'Large cap only — narrowing' : 'In line',
      },
    ],
  };
}

export function scoreMomentum(d: RawMarketData): CategoryScore {
  const { sectors, spy } = d;
  let score = 0;

  const outperforming = sectors.filter(s => s.change5d > spy.return5d).length;
  if (outperforming >= 9) score += 40;
  else if (outperforming >= 7) score += 30;
  else if (outperforming >= 5) score += 20;
  else if (outperforming >= 3) score += 10;

  const sorted = [...sectors].sort((a, b) => b.change5d - a.change5d);
  const leaderTickers = sorted.slice(0, 3).map(s => s.ticker);
  const growthLeaders = leaderTickers.filter(t => ['XLK', 'XLY', 'XLF', 'XLI', 'XLC'].includes(t)).length;
  const defensiveLeaders = leaderTickers.filter(t => ['XLP', 'XLU', 'XLRE'].includes(t)).length;
  score += growthLeaders * 12;
  score -= defensiveLeaders * 12;

  const aboveMAs = sectors.filter(s => s.aboveSMA50).length;
  score += Math.round((aboveMAs / sectors.length) * 20);

  const spread = (sorted[0]?.change5d ?? 0) - (sorted[sorted.length - 1]?.change5d ?? 0);

  return {
    score: clamp(score, 0, 100),
    weight: 25,
    label: 'Momentum',
    interpretation: score >= 70 ? 'healthy' : score >= 50 ? 'neutral' : score >= 30 ? 'weakening' : 'risk-off',
    metrics: [
      {
        label: 'Sectors Outperforming', value: `${outperforming}/${sectors.length}`,
        direction: outperforming >= 6 ? 'up' : outperforming < 4 ? 'down' : 'flat',
        note: outperforming >= 8 ? 'Broad momentum' : outperforming >= 5 ? 'Mixed momentum' : 'Weak breadth',
      },
      {
        label: 'Leaders', value: sorted.slice(0, 3).map(s => s.ticker).join(', '),
        direction: growthLeaders > defensiveLeaders ? 'up' : 'down',
        note: growthLeaders >= 2 ? 'Growth-led — quality momentum' : defensiveLeaders >= 2 ? 'Defensive rotation — risk-off' : 'Mixed leadership',
      },
      {
        label: 'Sector Spread (5d)', value: spread.toFixed(2) + '%',
        direction: 'flat',
        note: spread > 8 ? 'High rotation — stock picker env.' : spread > 4 ? 'Normal rotation' : 'Tight — low momentum',
      },
    ],
  };
}

export function scoreMacro(d: RawMarketData): CategoryScore {
  const { macro } = d;
  let score = 50;

  if (macro.tnx < 3.5) score += 10;
  else if (macro.tnx < 4.5) score += 5;
  else if (macro.tnx < 5.5) score -= 5;
  else score -= 15;

  if (macro.tnxReturn30d < -20) score += 15;
  else if (macro.tnxReturn30d < -5) score += 8;
  else if (macro.tnxReturn30d < 5) score += 0;
  else if (macro.tnxReturn30d < 20) score -= 8;
  else score -= 15;

  if (macro.uupSlope20d < -0.005) score += 8;
  else if (macro.uupSlope20d > 0.005) score -= 8;

  if (macro.fedStance === 'dovish') score += 15;
  else if (macro.fedStance === 'hawkish') score -= 15;

  if (macro.fomcEvent) score -= 15;

  return {
    score: clamp(score, 0, 100),
    weight: 10,
    label: 'Macro',
    interpretation: score >= 70 ? 'healthy' : score >= 50 ? 'neutral' : score >= 30 ? 'weakening' : 'risk-off',
    metrics: [
      {
        label: '10Y Yield', value: macro.tnx.toFixed(2) + '%',
        direction: macro.tnxReturn30d < 0 ? 'down' : macro.tnxReturn30d > 0 ? 'up' : 'flat',
        note: macro.tnx < 4.0 ? 'Low rates — equity friendly' : macro.tnx < 4.75 ? 'Moderate — manageable' : 'High — headwind for equities',
      },
      {
        label: 'Dollar (UUP)', value: macro.uup.toFixed(2),
        direction: macro.uupSlope20d > 0.005 ? 'up' : macro.uupSlope20d < -0.005 ? 'down' : 'flat',
        note: macro.uupSlope20d < 0 ? 'Weakening dollar — risk-on' : macro.uupSlope20d > 0 ? 'Strengthening — mild headwind' : 'Stable',
      },
      {
        label: 'Fed Stance', value: macro.fedStance.toUpperCase(),
        direction: macro.fedStance === 'dovish' ? 'up' : macro.fedStance === 'hawkish' ? 'down' : 'flat',
        note: macro.fedStance === 'dovish' ? 'Supportive of risk assets' : macro.fedStance === 'hawkish' ? 'Tightening headwind' : 'On hold — neutral',
      },
      ...(macro.fomcEvent ? [{
        label: 'FOMC', value: macro.fomcEvent.hoursUntil + 'h away',
        direction: 'flat' as const,
        note: 'Event risk — reduce sizing',
      }] : []),
    ],
  };
}

export function scoreExecutionWindow(d: RawMarketData): number {
  let score = 50;
  const closes = d.spy.closes;

  if (closes.length >= 5) {
    const last5 = closes.slice(-5);
    const upDays = last5.filter((c, i) => i > 0 && c > last5[i - 1]).length;
    if (upDays >= 4) score += 25;
    else if (upDays >= 3) score += 15;
    else if (upDays <= 1) score -= 20;
  }

  if (d.spy.return5d > 2.5) score += 20;
  else if (d.spy.return5d > 0.5) score += 10;
  else if (d.spy.return5d < -2.5) score -= 25;
  else if (d.spy.return5d < -0.5) score -= 10;

  if (d.spy.ma20 !== null) {
    const dist = ((d.spy.current - d.spy.ma20) / d.spy.ma20) * 100;
    if (dist > 0 && dist < 2.5) score += 10;
    else if (dist < 0 && dist > -2) score -= 5;
  }

  return clamp(score, 0, 100);
}

export function computeMarketQualityScore(
  vol: number, trend: number, breadth: number, momentum: number, macro: number
): number {
  return Math.round(vol * 0.20 + momentum * 0.25 + trend * 0.25 + breadth * 0.20 + macro * 0.10);
}

export type Decision = 'YES_BUY' | 'YES_SELL' | 'CAUTION' | 'NO';

export function getDecision(score: number, regime: string): Decision {
  if (score >= 80) return regime === 'downtrend' ? 'YES_SELL' : 'YES_BUY';
  if (score >= 60) return 'CAUTION';
  return 'NO';
}
