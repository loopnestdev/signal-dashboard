import { daysBetween } from './parse.js';

// Operating leverage table: latest reported quarter vs the same quarter a year earlier.

export interface StoredQuarter {
  ticker: string;
  period_end: string;
  fiscal_year: number | null;
  fiscal_period: string | null;
  revenue: number | string | null;
  operating_income: number | string | null;
  derived: boolean;
  op_computed: boolean;
}

export interface QuarterPoint {
  end: string;
  label: string | null;
  revenue: number;
  operatingIncome: number;
  margin: number;
}

export interface LeverageRow {
  ticker: string;
  name: string | null;
  periodEnd: string;
  periodLabel: string | null;
  derived: boolean;
  opComputed: boolean;
  operatingIncome: number;
  revenue: number;
  opMargin: number;
  opMarginYearAgo: number | null;
  revYoY: number | null;
  incrementalMargin: number | null;   // change in op income / change in revenue, year on year
  dol: number | null;                 // % change in op income / % change in revenue
  rank: number | null;                // 1 = highest incremental margin among growing companies
  stale: boolean;                     // latest quarter ended more than STALE_DAYS before `today`
  marketCap: number | null;           // filled by the route (live price), as on the free cash flow tab
  fcfYield: number | null;            // trailing 12 months of FCF / market cap, from the free cash flow row
  history: QuarterPoint[];            // up to the last 8 quarters, oldest first
}

// DOL is not meaningful when the base is a loss or nearly zero (it explodes or flips sign).
export const DOL_MIN_BASE_MARGIN = 0.01;
// A quarter ending this long ago means the next 10-Q is overdue or the company stopped filing.
export const STALE_DAYS = 150;

const num = (v: number | string | null): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const label = (q: StoredQuarter) => (q.fiscal_period && q.fiscal_year ? `${q.fiscal_period} FY${String(q.fiscal_year).slice(-2)}` : null);

export function leverageFor(ticker: string, name: string | null, quarters: StoredQuarter[], today: string): LeverageRow | null {
  const points = quarters
    .map(q => ({ q, revenue: num(q.revenue), op: num(q.operating_income) }))
    .filter((p): p is { q: StoredQuarter; revenue: number; op: number } => p.revenue != null && p.op != null && p.revenue > 0)
    .sort((a, b) => a.q.period_end.localeCompare(b.q.period_end));
  const latest = points[points.length - 1];
  if (!latest) return null;
  const yearAgo = points.find(p => {
    const d = daysBetween(p.q.period_end, latest.q.period_end);
    return d >= 350 && d <= 380;
  });

  const opMargin = latest.op / latest.revenue;
  let opMarginYearAgo: number | null = null;
  let revYoY: number | null = null;
  let incrementalMargin: number | null = null;
  let dol: number | null = null;
  if (yearAgo) {
    opMarginYearAgo = yearAgo.op / yearAgo.revenue;
    revYoY = latest.revenue / yearAgo.revenue - 1;
    const dRev = latest.revenue - yearAgo.revenue;
    if (dRev > 0) incrementalMargin = (latest.op - yearAgo.op) / dRev;
    if (revYoY > 0 && yearAgo.op > 0 && opMarginYearAgo >= DOL_MIN_BASE_MARGIN) {
      dol = (latest.op / yearAgo.op - 1) / revYoY;
    }
  }

  return {
    ticker,
    name,
    periodEnd: latest.q.period_end,
    periodLabel: label(latest.q),
    derived: latest.q.derived,
    opComputed: latest.q.op_computed,
    operatingIncome: latest.op,
    revenue: latest.revenue,
    opMargin,
    opMarginYearAgo,
    revYoY,
    incrementalMargin,
    dol,
    rank: null,
    stale: daysBetween(latest.q.period_end, today) > STALE_DAYS,
    marketCap: null,
    fcfYield: null,
    history: points.slice(-8).map(p => ({
      end: p.q.period_end, label: label(p.q), revenue: p.revenue, operatingIncome: p.op, margin: p.op / p.revenue,
    })),
  };
}

// rankLeverage:
//   - Rank = incremental margin, highest first; only companies whose revenue grew year on year are ranked
//   - Ties break on margin expansion (op margin now minus a year ago)
//   - Returns rows ordered by operating income, largest first (the table's default order)
export function rankLeverage(rows: LeverageRow[]): LeverageRow[] {
  const expansion = (r: LeverageRow) => r.opMargin - (r.opMarginYearAgo ?? r.opMargin);
  const ranked = rows
    .filter(r => r.incrementalMargin != null)
    .sort((a, b) => b.incrementalMargin! - a.incrementalMargin! || expansion(b) - expansion(a));
  const rankOf = new Map(ranked.map((r, i) => [r.ticker, i + 1]));
  return rows
    .map(r => ({ ...r, rank: rankOf.get(r.ticker) ?? null }))
    .sort((a, b) => b.operatingIncome - a.operatingIncome);
}
