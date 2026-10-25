import { addDays, daysBetween, RULES } from './rules.js';

// "Bulletproof" company checks (docs/leaps-rules.md section 1), point-in-time: only quarters filed by `date` count.

export interface QuarterFacts {
  period_end: string;
  revenue: number | string | null;
  operating_income: number | string | null;
  net_income: number | string | null;
  diluted_shares: number | string | null;
}

export interface Check {
  key: 'marketCap' | 'profit' | 'revenue' | 'volatility' | 'offHigh';
  pass: boolean;
  detail: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function knownQuarters<T extends QuarterFacts>(quarters: T[], date: string): T[] {
  return quarters
    .filter(q => addDays(q.period_end, RULES.filingLagDays) <= date)
    .sort((a, b) => a.period_end.localeCompare(b.period_end));
}

// Banks and insurers file no operating income line, so their net income stands in.
const profitOf = (q: QuarterFacts) => num(q.operating_income) ?? num(q.net_income);

export function profitCheck(known: QuarterFacts[], date: string): Check {
  const latest = known.at(-1);
  if (!latest || daysBetween(latest.period_end, date) > RULES.maxQuarterAgeDays) {
    return { key: 'profit', pass: false, detail: 'no recent quarter on file' };
  }
  const last = known.slice(-RULES.profitQuarters);
  if (last.length < RULES.profitQuarters) return { key: 'profit', pass: false, detail: `only ${last.length} quarters on file` };
  const losses = last.filter(q => (profitOf(q) ?? -1) <= 0);
  return losses.length
    ? { key: 'profit', pass: false, detail: `loss or no profit figure in quarter ending ${losses.at(-1)!.period_end}` }
    : { key: 'profit', pass: true, detail: `profitable last ${RULES.profitQuarters} quarters` };
}

export function revenueCheck(known: QuarterFacts[]): Check {
  const latest = [...known].reverse().find(q => num(q.revenue) != null);
  if (!latest) return { key: 'revenue', pass: false, detail: 'no revenue figure on file' };
  const yearAgo = known.find(q => {
    const d = daysBetween(q.period_end, latest.period_end);
    return d >= 350 && d <= 380 && num(q.revenue) != null;
  });
  if (!yearAgo) return { key: 'revenue', pass: false, detail: 'no year-ago quarter' };
  const growth = (num(latest.revenue)! / num(yearAgo.revenue)! - 1) * 100;
  return { key: 'revenue', pass: growth > 0, detail: `revenue ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% year on year (${latest.period_end})` };
}

export function marketCapCheck(marketCap: number | null): Check {
  if (marketCap == null) return { key: 'marketCap', pass: false, detail: 'market cap unknown (no share count on file)' };
  const b = marketCap / 1e9;
  return { key: 'marketCap', pass: marketCap >= RULES.minMarketCap, detail: `$${b >= 1000 ? `${(b / 1000).toFixed(2)}T` : `${b.toFixed(0)}B`}` };
}

export function volatilityCheck(volRatio: number | null): Check {
  if (volRatio == null) return { key: 'volatility', pass: false, detail: 'volatility unknown' };
  return { key: 'volatility', pass: volRatio <= RULES.maxVolRatio, detail: `${volRatio.toFixed(2)}x VIX` };
}

export function offHighCheck(pct: number): Check {
  return { key: 'offHigh', pass: pct >= RULES.stockOffHighPct, detail: `${pct.toFixed(1)}% below 52-week high` };
}

// The latest share count filed by `date` (for market cap); null when none is on file.
export function latestShares(known: QuarterFacts[]): { shares: number; periodEnd: string } | null {
  const q = [...known].reverse().find(x => num(x.diluted_shares) != null);
  return q ? { shares: num(q.diluted_shares)!, periodEnd: q.period_end } : null;
}

// Quality = market cap, profit, revenue, volatility. The stock's distance from its high decides "candidate", not quality.
export function qualityChecks(quarters: QuarterFacts[], date: string, marketCap: number | null, volRatio: number | null): { checks: Check[]; eligible: boolean; reason: string | null } {
  const known = knownQuarters(quarters, date);
  const checks = [marketCapCheck(marketCap), profitCheck(known, date), revenueCheck(known), volatilityCheck(volRatio)];
  const failed = checks.find(c => !c.pass);
  return { checks, eligible: !failed, reason: failed ? `${failed.key}: ${failed.detail}` : null };
}
