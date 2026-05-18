export type Decision = 'YES_BUY' | 'YES_SELL' | 'CAUTION' | 'NO';
export type Interpretation = 'healthy' | 'neutral' | 'weakening' | 'risk-off';
export type Direction = 'up' | 'down' | 'flat';
export type Regime = 'uptrend' | 'downtrend' | 'chop';
export type TradingMode = 'swing' | 'day';

export interface Metric {
  label: string;
  value: string;
  direction: Direction;
  note: string;
}

export interface CategoryScore {
  score: number;
  weight: number;
  label: string;
  interpretation: Interpretation;
  metrics: Metric[];
}

export interface SectorData {
  ticker: string;
  name: string;
  price: number;
  change1d: number;
  change5d: number;
  change20d: number;
  aboveSMA50: boolean;
  aboveSMA200: boolean;
  parentSector?: string;
}

export interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  type: string;
}

export interface Alert {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface MarketResponse {
  timestamp: string;
  fromCache: boolean;
  decision: Decision;
  marketQualityScore: number;
  executionWindowScore: number;
  categories: {
    volatility: CategoryScore;
    trend: CategoryScore;
    breadth: CategoryScore;
    momentum: CategoryScore;
    macro: CategoryScore;
  };
  vix: { current: number; slope5d: number; percentile1yr: number };
  spy: { current: number; ma20: number | null; ma50: number | null; ma200: number | null; rsi14: number | null; return1d: number; return5d: number };
  qqq: { current: number; ma50: number | null; return1d: number };
  iwm: { current: number; return5d: number };
  macroData: { tnx: number; fedStance: string; fomcEvent: { date: string; hoursUntil: number } | null };
  breadthData: { sectorsAbove50d: number; pctSectorsAbove50d: number };
  sectors: SectorData[];
  subsectors: SectorData[];
  regime: Regime;
  top3Sectors: string[];
  bottom3Sectors: string[];
  analysis: string;
  ticker: TickerItem[];
  alerts: Alert[];
}
