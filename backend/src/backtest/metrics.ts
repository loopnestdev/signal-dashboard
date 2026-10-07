import type { BacktestResult } from './engine.js';
import type { Bar, ClosedTrade, EquityPoint } from './types.js';

// Rules section 6 (reported for every book) and the section 7 go-live checklist.

export interface Summary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgR: number | null;
  profitFactor: number | null;
  totalPnl: number;
  returnPct: number;
  maxDrawdownPct: number;
  longestLosingStreak: number;
  pnlWithoutTop2: number;
  spyReturnPct: number | null;
  openAtEnd: number;
  unrealizedPnl: number;
  modeledFillShare: number | null;
  skipsByReason: Record<string, number>;
  earningsExits: { count: number; actualPnl: number; shadowPnl: number | null };
  goLive: Array<{ check: string; pass: boolean | null; detail: string }>;
  sessions: number;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function maxDrawdownPct(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) worst = Math.min(worst, (p.equity - peak) / peak);
  }
  return round(-worst * 100);
}

export function longestLosingStreak(trades: ClosedTrade[]): number {
  let best = 0;
  let run = 0;
  for (const t of [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate))) {
    run = t.pnl <= 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function profitFactor(trades: ClosedTrade[]): number | null {
  const gross = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const loss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  if (loss === 0) return gross > 0 ? Infinity : null;
  return round(gross / loss);
}

export function spyReturnPct(spy: Bar[], from: string, to: string): number | null {
  const inRange = spy.filter(b => b.date >= from && b.date <= to);
  if (inRange.length < 2) return null;
  return round((inRange.at(-1)!.close / inRange[0].close - 1) * 100);
}

const MIN_TRADES = 30;
const MIN_AVG_R = 0.2;
const MIN_PROFIT_FACTOR = 1.3;
const MIN_MONTHS = 3;

export function summarize(r: BacktestResult, spy: Bar[]): Summary {
  const t = r.trades;
  const wins = t.filter(x => x.pnl > 0);
  const losses = t.filter(x => x.pnl <= 0);
  const totalPnl = round(t.reduce((s, x) => s + x.pnl, 0));
  const top2 = [...t].sort((a, b) => b.pnl - a.pnl).slice(0, 2).reduce((s, x) => s + x.pnl, 0);
  const finalEquity = r.equity.at(-1)?.equity ?? r.startingBalance;
  const avgR = t.length ? round(t.reduce((s, x) => s + x.rMultiple, 0) / t.length) : null;
  const pf = profitFactor(t);
  const dd = maxDrawdownPct(r.equity);
  const optionFills = t.filter(x => x.kind !== 'shares').length * 2;
  const modeled = t.reduce((s, x) => s + x.modeledFills, 0);
  const skipsByReason: Record<string, number> = {};
  for (const s of r.skips) skipsByReason[s.reason.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, '')] = (skipsByReason[s.reason.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, '')] ?? 0) + 1;
  const earn = t.filter(x => x.exitReason.startsWith('earnings'));
  const shadows = earn.filter(x => x.shadowPnl != null);
  const months = r.equity.length / 21;

  return {
    trades: t.length,
    wins: wins.length,
    losses: losses.length,
    winRate: t.length ? round(wins.length / t.length * 100, 1) : null,
    avgWin: wins.length ? round(wins.reduce((s, x) => s + x.pnl, 0) / wins.length) : null,
    avgLoss: losses.length ? round(losses.reduce((s, x) => s + x.pnl, 0) / losses.length) : null,
    avgR,
    profitFactor: pf,
    totalPnl,
    returnPct: round((finalEquity / r.startingBalance - 1) * 100),
    maxDrawdownPct: dd,
    longestLosingStreak: longestLosingStreak(t),
    pnlWithoutTop2: round(totalPnl - top2),
    spyReturnPct: spyReturnPct(spy, r.from, r.to),
    openAtEnd: r.openAtEnd.length,
    unrealizedPnl: round(r.openAtEnd.reduce((s, p) => s + p.unrealizedPnl, 0)),
    modeledFillShare: optionFills ? round(modeled / optionFills * 100, 1) : null,
    skipsByReason,
    earningsExits: {
      count: earn.length,
      actualPnl: round(earn.reduce((s, x) => s + x.pnl, 0)),
      shadowPnl: shadows.length ? round(shadows.reduce((s, x) => s + (x.shadowPnl ?? 0), 0)) : null,
    },
    goLive: [
      { check: `At least ${MIN_TRADES} closed trades over ${MIN_MONTHS}+ months`, pass: t.length >= MIN_TRADES && months >= MIN_MONTHS, detail: `${t.length} trades over ${round(months, 1)} months` },
      { check: `Average R above ${MIN_AVG_R}`, pass: avgR == null ? null : avgR > MIN_AVG_R, detail: avgR == null ? 'no trades' : `${avgR}R` },
      { check: `Profit factor >= ${MIN_PROFIT_FACTOR} after costs`, pass: pf == null ? null : pf >= MIN_PROFIT_FACTOR, detail: pf == null ? 'no trades' : String(pf) },
      { check: 'Profitable without its 2 best trades', pass: t.length > 2 ? totalPnl - top2 > 0 : null, detail: `$${round(totalPnl - top2)}` },
      { check: 'Max drawdown within your limit', pass: null, detail: `${dd}% (limit not set yet)` },
      { check: 'Replay and paper results agree', pass: null, detail: 'paper trading not started' },
    ],
    sessions: r.equity.length,
  };
}
