// Thresholds from docs/leaps-rules.md v1.0, fixed before any backtest result was looked at.
// A change here is a new rules version (bump LEAPS_RULES_VERSION and the doc's change log).
export const LEAPS_RULES_VERSION = '1.2';

export type LeapsBook = 'L1' | 'L2' | 'L3' | 'IX';
export const LEAPS_BOOKS: LeapsBook[] = ['L1', 'L2', 'L3', 'IX'];
export const STOCK_BOOKS: LeapsBook[] = ['L1', 'L2', 'L3'];
export const BOOK_DELTA: Record<LeapsBook, number> = { L1: 0.75, L2: 0.5, L3: 0.3, IX: 0.85 };

// Index book IX (section 6b): always holds a deep ITM call on each index, rolled with 120 days left; the rest in T-bills.
// Expiries 500-900 days out so a position is held more than 12 months before the roll (CGT discount).
export const INDEX_BOOK = {
  symbols: ['SPY', 'QQQ'],
  positionPct: 15,
  minExpiryDays: 500,
  maxExpiryDays: 900,
} as const;

// Daily research grid (section 10): for every monthly expiry this far out or more, the call nearest each delta is stored,
// so the price model can later be checked against real LEAPS through calm and stressed markets.
export const QUOTE_GRID = {
  minExpiryDays: 270,
  deltas: [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.85],
} as const;

export type MarketState = 'correction' | 'pullback' | 'normal';

export const RULES = {
  // Section 1 - universe
  minMarketCap: 100e9,
  maxVolRatio: 2.25,            // stock IV30 / VIX
  minOpenInterest: 500,
  maxSpreadPct: 5,              // bid-ask spread as % of mid
  profitQuarters: 4,
  filingLagDays: 65,            // a quarter counts as known this many days after it ends
  maxQuarterAgeDays: 200,       // latest known quarter older than this -> no recent data
  // Section 2 - market condition
  correctionPct: 10,
  pullbackPct: 5,
  pullbackVix: 20,
  pullbackMarketScore: 60,
  stockOffHighPct: 15,
  highLookback: 252,
  // Section 3 - Signa confirmation (recorded, does not block)
  dpBuyShare: 0.55,
  dpSessions: 3,
  flowCallRatio: 1.5,
  flowSessions: 5,
  leapsPrintPremium: 250_000,
  leapsPrintDays: 365,
  leapsPrintSessions: 10,
  // Section 4 - contract
  minExpiryDays: 457,           // 15 months
  maxExpiryDays: 822,           // 27 months
  // Section 5 - sizing
  maxPositionPct: 10,
  pullbackSizeFactor: 0.5,
  maxOpenPositions: 8,
  maxDeployedPct: 60,
  minContracts: 2,
  smallBookBalance: 25_000,     // "could a $25k book have afforded it" flag
  // Section 7 - exits
  halfAtMultiple: 2,
  stopLossMultiple: 0.5,
  runnerMinHoldDays: 182,
  runnerTrailPct: 40,
  timeExitDays: 120,
  // Section 9 - backtest pricing. LEAPS IV = (base + slope x stock 1-year realized vol) x sqrt(VIX6M / ref), the regime
  // factor clamped. Fitted 2026-10-23 on 20 names' real Cboe 15-27 month ATM IVs (VIX6M 22.0 that day).
  modeledHalfSpreadPct: 2,
  modeledMinHalfSpread: 0.05,
  ivBase: 0.07,
  ivSlope: 0.75,
  ivRegimeRef: 22,
  ivRegimeMin: 0.75,
  ivRegimeMax: 2,
} as const;

export const DAY_MS = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const yearsUntil = (from: string, to: string) => daysBetween(from, to) / 365;
