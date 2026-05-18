import { getHistoryAndQuote } from '../lib/yahooClient.js';
import { sma, rsi, percentileRank, linearSlope, pctReturn } from '../lib/technical.js';
import { getUpcomingFOMC, getFedStance } from '../lib/fomc.js';

// QQQ replaces XLK — user-requested; SPY, PDBC (Commodities), NASA (Space) are new display sectors
export const SECTORS = [
  'QQQ', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'SPY', 'PDBC', 'NASA',
] as const;
// These are indexes/themes — excluded from breadth scoring and leader/lagger ranking
export const DISPLAY_ONLY_SECTORS = new Set(['SPY', 'PDBC', 'NASA']);
export const SECTOR_NAMES: Record<string, string> = {
  QQQ: 'Nasdaq 100', XLF: 'Financials', XLE: 'Energy', XLV: 'Health Care',
  XLI: 'Industrials', XLY: 'Consumer Disc.', XLP: 'Consumer Staples',
  XLU: 'Utilities', XLB: 'Materials', XLRE: 'Real Estate', XLC: 'Comm. Services',
  SPY: 'S&P 500', PDBC: 'Commodities', NASA: 'Space',
};

// Sub-sector ETFs — all freely available on Yahoo Finance; no API key required
// SMH replaces SOXX (VanEck Semiconductor ETF); commodity sub-sectors use spot/futures symbols
export const SUBSECTORS = [
  'SMH', 'IGV', 'XBI', 'IHI', 'URA', 'XOP', 'KRE', 'ICLN', 'TAN',
  'GC=F', 'SI=F', 'COPX', 'CL=F',
] as const;
export const SUBSECTOR_NAMES: Record<string, string> = {
  SMH: 'Semiconductors', IGV: 'Software', XBI: 'Biotech', IHI: 'Medical Devices',
  URA: 'Uranium', XOP: 'Oil & Gas E&P', KRE: 'Regional Banks', ICLN: 'Clean Energy',
  TAN: 'Solar',
  'GC=F': 'Gold', 'SI=F': 'Silver', COPX: 'Copper', 'CL=F': 'Crude Oil WTI',
};
export const SUBSECTOR_PARENT: Record<string, string> = {
  SMH: 'Nasdaq 100', IGV: 'Nasdaq 100', XBI: 'Health Care', IHI: 'Health Care',
  URA: 'Energy', XOP: 'Energy', KRE: 'Financials', ICLN: 'Energy',
  TAN: 'Energy',
  'GC=F': 'Commodities', 'SI=F': 'Commodities', COPX: 'Commodities', 'CL=F': 'Commodities',
};

export interface RawMarketData {
  vix: { current: number; slope5d: number; percentile1yr: number };
  spy: {
    current: number; ma20: number | null; ma50: number | null; ma200: number | null;
    rsi14: number | null; return1d: number; return5d: number; return20d: number;
    closes: number[];
  };
  qqq: { current: number; ma50: number | null; return1d: number };
  iwm: { current: number; return5d: number };
  macro: {
    tnx: number; tnxReturn30d: number; tnxSlope20d: number;
    uup: number; uupSlope20d: number;
    fedStance: 'hawkish' | 'neutral' | 'dovish';
    fomcEvent: { date: string; hoursUntil: number } | null;
  };
  breadth: { sectorsAbove50d: number; pctSectorsAbove50d: number };
  sectors: Array<{
    ticker: string; name: string; price: number;
    change1d: number; change5d: number; change20d: number;
    aboveSMA50: boolean; aboveSMA200: boolean;
  }>;
  subsectors: Array<{
    ticker: string; name: string; parentSector: string; price: number;
    change1d: number; change5d: number; change20d: number;
    aboveSMA50: boolean; aboveSMA200: boolean;
  }>;
  regime: 'uptrend' | 'downtrend' | 'chop';
  top3Sectors: string[];
  bottom3Sectors: string[];
}

export async function fetchMarketData(): Promise<RawMarketData> {
  const [
    vixData, spyData, qqqData, tnxData, uupData, iwmData,
    ...allSectorData
  ] = await Promise.all([
    getHistoryAndQuote('^VIX', '2y'),
    getHistoryAndQuote('SPY', '2y'),
    getHistoryAndQuote('QQQ', '1y'),
    getHistoryAndQuote('^TNX', '1y'),
    getHistoryAndQuote('UUP', '1y'),
    getHistoryAndQuote('IWM', '1y'),
    ...SECTORS.map(s => getHistoryAndQuote(s, '1y')),
    ...SUBSECTORS.map(s => getHistoryAndQuote(s, '1y')),
  ]);

  const vixH = vixData.history;
  const spyH = spyData.history;
  const qqqH = qqqData.history;
  const tnxH = tnxData.history;
  const uupH = uupData.history;
  const iwmH = iwmData.history;

  const sectorDataArr = allSectorData.slice(0, SECTORS.length);
  const subsectorDataArr = allSectorData.slice(SECTORS.length);

  const spy20MA = sma(spyH, 20);
  const spy50MA = sma(spyH, 50);
  const spy200MA = sma(spyH, 200);
  const spyRSI14 = rsi(spyH, 14);
  const spy20dRet = pctReturn(spyH, 20) ?? 0;

  const vix5dSlope = linearSlope(vixH.slice(-5));
  const vixPercentile = percentileRank(vixData.price, vixH.slice(-252));

  const tnxSlope20d = linearSlope(tnxH.slice(-20));
  const tnxReturn30d = pctReturn(tnxH, 30) ?? 0;
  const uupSlope20d = linearSlope(uupH.slice(-20));

  const aboveAll = spy20MA && spy50MA && spy200MA &&
    spyData.price > spy20MA && spyData.price > spy50MA && spyData.price > spy200MA;
  const belowAll200 = spy200MA && spyData.price < spy200MA;
  const regime: 'uptrend' | 'downtrend' | 'chop' = aboveAll && spy20dRet > 0
    ? 'uptrend' : belowAll200 && spy20dRet < -3 ? 'downtrend' : 'chop';

  const sectorList = SECTORS.map((ticker, i) => {
    const sd = sectorDataArr[i];
    const h = sd.history;
    const cur = sd.price;
    const ma50 = sma(h, 50);
    const ma200 = sma(h, 200);
    return {
      ticker,
      name: SECTOR_NAMES[ticker],
      price: cur,
      change1d: sd.change1d,
      change5d: pctReturn(h, 5) ?? 0,
      change20d: pctReturn(h, 20) ?? 0,
      aboveSMA50: ma50 !== null && cur > ma50,
      aboveSMA200: ma200 !== null && cur > ma200,
    };
  });

  const subsectorList = SUBSECTORS.map((ticker, i) => {
    const sd = subsectorDataArr[i];
    const h = sd.history;
    const cur = sd.price;
    const ma50 = sma(h, 50);
    const ma200 = sma(h, 200);
    return {
      ticker,
      name: SUBSECTOR_NAMES[ticker],
      parentSector: SUBSECTOR_PARENT[ticker],
      price: cur,
      change1d: sd.change1d,
      change5d: pctReturn(h, 5) ?? 0,
      change20d: pctReturn(h, 20) ?? 0,
      aboveSMA50: ma50 !== null && cur > ma50,
      aboveSMA200: ma200 !== null && cur > ma200,
    };
  });

  // Breadth and leader/lagger only count the real sector ETFs, not indexes/themes
  const scoringSectors = sectorList.filter(s => !DISPLAY_ONLY_SECTORS.has(s.ticker));
  const sectorsAbove50d = scoringSectors.filter(s => s.aboveSMA50).length;
  const sorted5d = [...scoringSectors].sort((a, b) => b.change5d - a.change5d);

  return {
    vix: { current: vixData.price, slope5d: vix5dSlope, percentile1yr: vixPercentile },
    spy: {
      current: spyData.price,
      ma20: spy20MA, ma50: spy50MA, ma200: spy200MA,
      rsi14: spyRSI14,
      return1d: spyData.change1d,
      return5d: pctReturn(spyH, 5) ?? 0,
      return20d: spy20dRet,
      closes: spyH.slice(-15),
    },
    qqq: {
      current: qqqData.price,
      ma50: sma(qqqH, 50),
      return1d: qqqData.change1d,
    },
    iwm: {
      current: iwmData.price,
      return5d: pctReturn(iwmH, 5) ?? 0,
    },
    macro: {
      tnx: tnxData.price,
      tnxReturn30d,
      tnxSlope20d,
      uup: uupData.price,
      uupSlope20d,
      fedStance: getFedStance(),
      fomcEvent: getUpcomingFOMC(),
    },
    breadth: {
      sectorsAbove50d,
      pctSectorsAbove50d: (sectorsAbove50d / scoringSectors.length) * 100,
    },
    sectors: sectorList,
    subsectors: subsectorList,
    regime,
    top3Sectors: sorted5d.slice(0, 3).map(s => s.name),
    bottom3Sectors: sorted5d.slice(-3).map(s => s.name),
  };
}
