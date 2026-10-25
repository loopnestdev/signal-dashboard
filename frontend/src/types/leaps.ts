// LEAPS book (docs/leaps-rules.md): screen, paper positions and modeled-price backtests.

export type LeapsBook = 'L1' | 'L2' | 'L3' | 'IX';
export type LeapsMarketState = 'correction' | 'pullback' | 'normal';

export interface PriceLevels {
  breakEvenExpiry: number;
  breakEvenToday: number | null;
  doubleExpiry: number;
  doubleToday: number | null;
  doubleIn6m: number | null;
  sellLimit: number;
}

export interface LeapsCheck {
  key: 'marketCap' | 'profit' | 'revenue' | 'volatility' | 'offHigh';
  pass: boolean;
  detail: string;
}

export interface LeapsConfirmation {
  dpBuyShare: number | null;
  dpPass: boolean | null;
  callRatio: number | null;
  flowPass: boolean | null;
  leapsPrints: number;
  leapsPrintPremium: number;
  printPass: boolean;
  confirmed: boolean;
}

export interface LeapsContract {
  contract: string | null;
  expiry: string | null;
  strike: number | null;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  delta: number | null;
  openInterest: number | null;
  liquid: boolean;
  reason: string | null;
  costFor2: number | null;
  affordable25k: boolean | null;
  levels: PriceLevels | null;
}

export interface LeapsScreenRow {
  trade_date: string;
  symbol: string;
  price: number | null;
  high_52w: number | null;
  off_high_pct: number | null;
  market_cap: number | null;
  iv30: number | null;
  vol_ratio: number | null;
  checks: LeapsCheck[];
  eligible: boolean;
  candidate: boolean;
  reason: string | null;
  confirmation: LeapsConfirmation | null;
  contracts: Partial<Record<LeapsBook, LeapsContract>> | null;
}

export interface LeapsMarket {
  trade_date: string;
  spy_close: number;
  spy_high_52w: number;
  spy_off_high_pct: number;
  vix: number | null;
  market_score: number | null;
  state: LeapsMarketState;
}

export interface LeapsPosition {
  id: number;
  book: LeapsBook;
  symbol: string;
  contract_symbol: string;
  expiry: string;
  strike: number;
  status: 'pending' | 'open' | 'closed' | 'cancelled';
  signal_date: string;
  market_state: string;
  qty: number;
  qty_open: number;
  entry_date: string | null;
  entry_price: number | null;
  half_date: string | null;
  half_price: number | null;
  half_qty: number | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pending_action: string | null;
  peak_value: number | null;
  last_bid: number | null;
  last_date: string | null;
  commissions: number;
  pnl: number | null;
  confirmation: LeapsConfirmation | null;
  meta: { estCost?: number; askAtSignal?: number; offHighPct?: number; affordable25k?: boolean | null; minBookForWhole?: number };
  levels: PriceLevels | null;
}

export interface LeapsBookState {
  book: LeapsBook;
  cash: number;
  equity: number;
  openCost: number;
  openCount: number;
  startingBalance: number;
  closed: number;
  wins: number;
  realizedPnl: number;
  interest: number;
}

export interface LeapsResponse {
  market: LeapsMarket | null;
  history: Array<Pick<LeapsMarket, 'trade_date' | 'spy_off_high_pct' | 'vix' | 'market_score' | 'state'>>;
  screen: LeapsScreenRow[];
  positions: LeapsPosition[];
  books: LeapsBookState[];
  rulesVersion: string;
  smallBook: number;
  startingBalance: number;
  indexPositionPct: number;
}

export interface LeapsEpisode {
  id: string;
  end: string;
  maxSpyOffHighPct: number;
  trades: number;
  pnl: number;
  winRate: number | null;
}

export interface LeapsSummary {
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
  unrealizedPnl: number;
  returnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  spyReturnPct: number | null;
  halfSaleRate: number | null;
  halfPnl: number;
  runnerPnl: number;
  avgHoldDays: number | null;
  avgReturnPct: number | null;
  best: { symbol: string; pnl: number } | null;
  worst: { symbol: string; pnl: number } | null;
  exitReasons: Record<string, number>;
  episodes: LeapsEpisode[];
  skips: Record<string, number>;
  openAtEnd: number;
  sessions: number;
  interest?: number;
}

export interface LeapsRunRow {
  id: string;
  created_at: string;
  book: LeapsBook;
  rules_version: string;
  date_from: string;
  date_to: string;
  starting_balance: number;
  summary: LeapsSummary;
}

export interface LeapsJob {
  state: 'running' | 'done' | 'failed';
  request: { from: string; to: string };
  startedAt: string;
  finishedAt: string | null;
  step: string | null;
  runIds: string[];
  missing: string[];
  error: string | null;
}

export interface LeapsRunsResponse {
  runs: LeapsRunRow[];
  latest: string[];
  job: LeapsJob | null;
  rulesVersion: string;
  lastSession: string;
  defaultFrom: string;
}

export interface LeapsTradeRow {
  trade_id: number;
  symbol: string;
  market_state: string;
  expiry: string;
  strike: number;
  qty: number;
  entry_date: string;
  entry_price: number;
  entry_spot: number;
  half_date: string | null;
  half_price: number | null;
  exit_date: string;
  exit_price: number;
  exit_reason: string;
  cost: number;
  pnl: number;
  half_pnl: number | null;
  runner_pnl: number | null;
}

export interface LeapsRunDetail {
  run: LeapsRunRow & { open_at_end: Array<{ symbol: string; expiry: string; strike: number; entryDate: string; unrealizedPnl: number; halfSold: boolean }> };
  trades: LeapsTradeRow[];
  equity: Array<{ date: string; equity: number; cash: number; open_positions: number }>;
  benchmark: Array<{ date: string; equity: number | null }>;
}
