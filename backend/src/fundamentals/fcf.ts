import { daysBetween } from './parse.js';
import { STALE_DAYS } from './leverage.js';

// Free cash flow table: latest quarter vs the quarter before it (and the same quarter a year earlier).

export interface StoredCashQuarter {
  ticker: string;
  period_end: string;
  fiscal_year: number | null;
  fiscal_period: string | null;
  revenue: number | string | null;
  operating_cash_flow: number | string | null;
  capex: number | string | null;
  cash: number | string | null;
}

export interface FcfPoint {
  end: string;
  label: string | null;
  fcf: number;
  operatingCashFlow: number;
  capex: number | null;
  cash: number | null;
}

export interface FcfRow {
  ticker: string;
  name: string | null;
  periodEnd: string;
  periodLabel: string | null;
  fcf: number;
  fcfPrev: number | null;          // the quarter just before (75-105 days earlier)
  qoq: number | null;              // fcf / fcfPrev - 1; null when the previous quarter was <= 0
  yoy: number | null;              // vs the same quarter a year earlier; null when that was <= 0
  growing: boolean;                // fcf > fcfPrev
  streak: number;                  // consecutive quarters (ending at the latest) each with higher FCF than the one before
  fcfMargin: number | null;        // fcf / revenue of the same quarter
  cash: number | null;             // cash and equivalents at the latest quarter end
  noCapex: boolean;                // the company tags no capex at all: FCF = operating cash flow
  stale: boolean;
  history: FcfPoint[];             // up to the last 8 quarters, oldest first
}

const num = (v: number | string | null): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const label = (q: StoredCashQuarter) => (q.fiscal_period && q.fiscal_year ? `${q.fiscal_period} FY${String(q.fiscal_year).slice(-2)}` : null);
const isNextQuarter = (a: string, b: string) => daysBetween(a, b) >= 75 && daysBetween(a, b) <= 105;
const growth = (now: number, before: number | null) => (before != null && before > 0 ? now / before - 1 : null);

// fcfFor:
//   - FCF = operating cash flow - capex; a company that never tags capex (banks, some software) gets operating cash flow as FCF
//   - A company that tags capex in other quarters but not this one has no FCF for it, so a missing capex never reads as a jump
export function fcfFor(ticker: string, name: string | null, quarters: StoredCashQuarter[], today: string): FcfRow | null {
  const tagsCapex = quarters.some(q => num(q.capex) != null);
  const points = quarters
    .map(q => {
      const ocf = num(q.operating_cash_flow);
      const capex = num(q.capex);
      const fcf = ocf == null || (tagsCapex && capex == null) ? null : ocf - (capex ?? 0);
      return { q, ocf, capex, fcf, revenue: num(q.revenue), cash: num(q.cash) };
    })
    .filter((p): p is typeof p & { ocf: number; fcf: number } => p.fcf != null)
    .sort((a, b) => a.q.period_end.localeCompare(b.q.period_end));
  const latest = points[points.length - 1];
  if (!latest) return null;
  const prev = points.length > 1 && isNextQuarter(points[points.length - 2].q.period_end, latest.q.period_end) ? points[points.length - 2] : null;
  const yearAgo = points.find(p => {
    const d = daysBetween(p.q.period_end, latest.q.period_end);
    return d >= 350 && d <= 380;
  });

  let streak = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (!isNextQuarter(points[i - 1].q.period_end, points[i].q.period_end) || points[i].fcf <= points[i - 1].fcf) break;
    streak++;
  }

  return {
    ticker,
    name,
    periodEnd: latest.q.period_end,
    periodLabel: label(latest.q),
    fcf: latest.fcf,
    fcfPrev: prev?.fcf ?? null,
    qoq: growth(latest.fcf, prev?.fcf ?? null),
    yoy: growth(latest.fcf, yearAgo?.fcf ?? null),
    growing: prev != null && latest.fcf > prev.fcf,
    streak,
    fcfMargin: latest.revenue != null && latest.revenue > 0 ? latest.fcf / latest.revenue : null,
    cash: latest.cash,
    noCapex: latest.capex == null,
    stale: daysBetween(latest.q.period_end, today) > STALE_DAYS,
    history: points.slice(-8).map(p => ({
      end: p.q.period_end, label: label(p.q), fcf: p.fcf, operatingCashFlow: p.ocf, capex: p.capex, cash: p.cash,
    })),
  };
}
