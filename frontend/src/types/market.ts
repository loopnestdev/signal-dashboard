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

export interface CollectorRun {
  job: string;
  trade_date: string;
  started_at: string;
  status: 'ok' | 'partial' | 'error' | 'skipped';
  api_calls: number;
  rows_written: number;
  message: string | null;
}

export interface CollectorStatus {
  enabled: boolean;
  symbols: string[];
  usage: {
    utcDay: string;
    signaToday: number;
    limit: number;
    reserve: number;
    collectorEstimatePerDay: number;
    history: Array<{ day: string; calls: number }>;
  };
  jobs: Array<{ job: string; slotsEt: string[]; lastRun: CollectorRun | null }>;
  datasets: Array<{ table: string; label: string; rows: number | null }>;
  daily: Array<{ trade_date: string; rows: number; calls: number; errors: number }>;
  recentErrors: CollectorRun[];
}

export interface ScannerCandidate {
  symbol: string;
  trade_date: string;
  run_at: string;
  score: number;
  breakdown: { dp_strength: number; dp_sustained: number; confluence: number; vol_oi: number; sweeps: number };
  options_bias: 'BULLISH' | 'BEARISH' | 'MIXED';
  dp_direction: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | 'NO_DATA';
  dp_strength: number;
  dp_buy_ratio: number | null;
  dp_sustained_days: number;
  confluence: boolean;
  alerts: number;
  calls: number;
  puts: number;
  sweeps: number;
  avg_vol_oi: number;
  total_premium: number;
  underlying_price: number | null;
  max_open_interest: number | null;
  signa_direction: string | null;
  passed_filters: boolean;
  rejected_reason: string | null;
  promoted: boolean;
}

export interface ScannerResponse {
  tradeDate: string | null;
  runAt: string | null;
  config: {
    promoteScore: number;
    maxPromoted: number;
    minPremium: number;
    minTotalPremium: number;
    minPrice: number;
    minOpenInterest: number;
    minDte: number;
    promotionDays: number;
  };
  candidates: ScannerCandidate[];
  core: string[];
  promoted: Array<{ symbol: string; expires_at: string | null; last_score: number | null; promoted_at: string | null }>;
  signa: {
    bullish: Array<{ symbol: string; signal: string | null; score: number | null; grade: string | null }>;
    bearish: Array<{ symbol: string; signal: string | null; score: number | null; grade: string | null }>;
  };
}

export type AiProvider = 'gemini' | 'claude' | 'none';

export interface TradingSettings {
  paperStartingBalance: number;
  sizing: {
    fixedRiskUsd: number;
    fixedUntilBalance: number;
    pctAboveThreshold: number;
    maxPctBelow: number;
    kellyFraction: number;
    kellyMinTrades: number;
  };
  optionsLimits: { maxOpenTrades: number; maxOpenRiskPct: number; maxPerTicker: number };
  shares: { riskPct: number; maxPositionPct: number; maxOpenPositions: number };
  costs: { optionPerContract: number; sharePerOrder: number };
  ai: { provider: AiProvider };
}

export interface SettingsResponse {
  settings: TradingSettings;
  defaults: TradingSettings;
  updatedAt: string | null;
  rulesVersion: string;
  aiKeys: { gemini: boolean; claude: boolean };
  riskPreview: Array<{ balance: number; risk: number }>;
}
