// Shared types for the replay engine (docs/release2-trading-rules.md v1.0).

export type Book = 'A' | 'B' | 'C';
export type Direction = 'BULLISH' | 'BEARISH';
export type OptionType = 'CALL' | 'PUT';

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OptionQuote {
  contract: string;
  symbol: string;
  type: OptionType;
  strike: number;
  expiry: string;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  delta: number | null;
  openInterest: number | null;
}

export interface SignalSnap {
  symbol: string;
  engineDirection: string | null;
  engineGrade: string | null;
  engineScore: number | null;
  price: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
}

export interface ScanCandidate {
  symbol: string;
  score: number;
  confluence: boolean;
  optionsBias: 'BULLISH' | 'BEARISH' | 'MIXED';
  dpDirection: string;
  dpSustainedDays: number;
  passedFilters: boolean;
}

export interface GexSnap {
  symbol: string;
  spot: number | null;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
}

export interface FlowTotals {
  callPremium: number;
  putPremium: number;
}

export interface CuratedEvent {
  symbol: string;
  direction: string | null;
  conviction: number | null;
}

export interface DpVolumes {
  buy: number;
  sell: number;
  prints: number;
}

export interface EarningsEvent {
  date: string;
  time: 'pre-market' | 'after-hours' | 'unknown';
}

// Everything recorded for one session, as available after that session's close.
export interface DayData {
  date: string;
  signals: Map<string, SignalSnap>;
  scanner: Map<string, ScanCandidate>;
  gex: Map<string, GexSnap>;
  flow: Map<string, FlowTotals>;
  curated: CuratedEvent[];
  dp: Map<string, DpVolumes>;
  quotes: Map<string, OptionQuote[]>;
  iv30: Map<string, number>;
}

export interface MarketData {
  days: string[];
  day(date: string): Promise<DayData>;
  bars(symbol: string): Promise<Bar[]>;
  earnings(symbol: string): EarningsEvent[];
}

export interface Leg {
  contract: string;
  type: OptionType;
  strike: number;
  expiry: string;
  side: 1 | -1;
}

export type PositionKind = 'option' | 'spread' | 'shares';

export interface Position {
  id: number;
  book: Book;
  symbol: string;
  direction: Direction;
  kind: PositionKind;
  legs: Leg[];
  qty: number;
  signalDate: string;
  entryDate: string;
  unitCost: number;        // per contract (x100 included) or per share
  risk: number;            // max loss used for R
  commissions: number;
  maxValue: number | null; // spread width x 100
  stop: number | null;     // underlying stop (A, C)
  target: number | null;   // underlying target (B, C)
  modeledFills: number;
  daysHeld: number;
  earningsHold: boolean;
  shadow: boolean;         // "held through earnings" twin; never touches cash or limits
  shadowOf: number | null;
  lastIv: Record<string, number>;
  meta: Record<string, unknown>;
}

export interface ClosedTrade {
  id: number;
  book: Book;
  symbol: string;
  direction: Direction;
  kind: PositionKind;
  legs: Leg[];
  qty: number;
  signalDate: string;
  entryDate: string;
  exitDate: string;
  unitCost: number;
  exitUnitValue: number;
  risk: number;
  commissions: number;
  pnl: number;
  rMultiple: number;
  exitReason: string;
  modeledFills: number;
  shadowPnl: number | null;
  meta: Record<string, unknown>;
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  openRisk: number;
  openPositions: number;
}
