import { daysBetween, RULES, type MarketState } from './rules.js';

// Exit rules (docs/leaps-rules.md section 7) and sizing (section 5), shared by the backtest and the paper book.

export interface HeldLeaps {
  entryDate: string;
  expiry: string;
  entryPrice: number;           // per share paid
  halfSold: boolean;
  peakSinceHalf: number | null; // highest value per share since the half sale
  qualityOk: boolean;
}

export type ExitDecision = { action: 'half' } | { action: 'close'; reason: string } | null;

export const EXIT_REASONS = {
  time: `time exit (${RULES.timeExitDays} days left)`,
  quality: 'quality break',
  stop: 'stop: past halfway and -50%',
  runner: `runner trail (-${RULES.runnerTrailPct}% from peak)`,
} as const;

// decideExit, first match wins:
//   - time exit, quality break and the halfway-and-down-50% stop close everything
//   - +100% sells half once; the runner then closes on a 40% drop from its peak, but only after 6 months held
//   - The index book (IX) only rolls: the time exit is its one rule
export function decideExit(p: HeldLeaps, date: string, value: number, indexBook = false): ExitDecision {
  if (daysBetween(date, p.expiry) <= RULES.timeExitDays) return { action: 'close', reason: EXIT_REASONS.time };
  if (indexBook) return null;
  if (!p.qualityOk) return { action: 'close', reason: EXIT_REASONS.quality };
  const elapsed = daysBetween(p.entryDate, date);
  const halfway = daysBetween(p.entryDate, p.expiry) / 2;
  if (elapsed > halfway && value <= p.entryPrice * RULES.stopLossMultiple) return { action: 'close', reason: EXIT_REASONS.stop };
  if (!p.halfSold && value >= p.entryPrice * RULES.halfAtMultiple) return { action: 'half' };
  if (p.halfSold && elapsed >= RULES.runnerMinHoldDays && p.peakSinceHalf != null && value <= p.peakSinceHalf * (1 - RULES.runnerTrailPct / 100)) {
    return { action: 'close', reason: EXIT_REASONS.runner };
  }
  return null;
}

export interface SizingInput {
  equity: number;
  cash: number;
  openCost: number;      // premium paid for open positions (cost basis)
  openCount: number;
  state: MarketState;
  unitCost: number;      // one contract incl. commission
  wholeContracts: boolean;
}

// sizePosition:
//   - Budget = 10% of equity (half that in a pullback), capped by the 60%-deployed room and the cash on hand
//   - Whole contracts need at least 2 so half can be sold; the backtest sizes fractionally to compare strategies
export function sizePosition(s: SizingInput): { qty: number; budget: number } | { skip: string } {
  if (s.state === 'normal') return { skip: 'market not down' };
  if (s.openCount >= RULES.maxOpenPositions) return { skip: `limit: ${RULES.maxOpenPositions} open positions` };
  const target = s.equity * (RULES.maxPositionPct / 100) * (s.state === 'pullback' ? RULES.pullbackSizeFactor : 1);
  const room = s.equity * (RULES.maxDeployedPct / 100) - s.openCost;
  const budget = Math.min(target, room, s.cash);
  if (budget <= 0 || room <= 0) return { skip: `limit: ${RULES.maxDeployedPct}% deployed` };
  if (s.unitCost <= 0) return { skip: 'no price' };
  if (!s.wholeContracts) return { qty: budget / s.unitCost, budget };
  const qty = Math.floor(budget / s.unitCost);
  return qty < RULES.minContracts ? { skip: 'too expensive for split' } : { qty, budget };
}

// Would a $25k book (same rules) have been able to buy 2 contracts?
export function affordableAt(balance: number, state: MarketState, unitCost: number): boolean {
  const budget = balance * (RULES.maxPositionPct / 100) * (state === 'pullback' ? RULES.pullbackSizeFactor : 1);
  return unitCost > 0 && Math.floor(budget / unitCost) >= RULES.minContracts;
}
