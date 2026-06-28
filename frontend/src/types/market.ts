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

// ── Market-wide options flow ──────────────────────────────────────────────────

export interface MarketFlowItem {
  ticker: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  premium: number;
  volume: number;
  open_interest: number;
  vol_oi_ratio: number;
  has_sweep: boolean;
  has_floor: boolean;
  underlying_price: number;
  alert_rule: string;
  start_time: number;
}

export interface MarketFlowResponse {
  flow: MarketFlowItem[];
}

// ── Dark pool ─────────────────────────────────────────────────────────────────

export interface DpPrint {
  ticker: string;
  price: number;
  size: number;
  volume: number;
  premium: number;
  executed_at: string;
  nbbo_bid: number;
  nbbo_ask: number;
  canceled: boolean;
  dp_direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  dp_score: number;
}

export interface MarketDpResponse {
  prints: DpPrint[];
}

// ── Market scanner ────────────────────────────────────────────────────────────

export interface ScanItem {
  ticker: string;
  signal: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  grade: string;
  confidence: number;
  reasons: string[];
}

export interface MarketScanResponse {
  results: ScanItem[];
  count: number;
}

// ── Gamma / GEX ───────────────────────────────────────────────────────────────

export interface GexLevel {
  strike: number;
  net_gex: number;
}

export interface GexRawLevel {
  strike: number;
  expiry: string;
  net_gex: number;
}

export interface GexHistoryPoint {
  call_wall: number | null;
  gamma_flip: number | null;
  put_wall: number | null;
  current_price: number;
  above_flip: boolean | null;
  net_gex: number | null;
  captured_at: string;
}

export interface GexData {
  symbol: string;
  current_price: number;
  gamma_flip: number | null;
  call_wall: number | null;
  put_wall: number | null;
  above_flip: boolean | null;
  net_gex: number | null;
  levels: GexLevel[];
  rawLevels?: GexRawLevel[];
}

export interface GammaGexResponse {
  spy: GexData | null;
  qqq: GexData | null;
  iwm: GexData | null;
}

export interface StockGexResponse extends GexData {
  fromCache: boolean;
  capturedAt?: string;
  history?: GexHistoryPoint[];
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
