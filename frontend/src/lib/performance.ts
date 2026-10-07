import type { BacktestLeg, BookId } from '../types/market';

export type CurvePoint = { date: string; equity: number | null };
export type ChartRow = { date: string } & Partial<Record<BookId | 'SPY', number>>;

// One row per date across every book's equity curve plus the SPY line, sorted by date, for a single Recharts chart.
export function mergeCurves(curves: Partial<Record<BookId, CurvePoint[]>>, spy: CurvePoint[]): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  const put = (key: BookId | 'SPY', points: CurvePoint[]) => {
    for (const p of points) {
      if (p.equity == null) continue;
      const row = rows.get(p.date) ?? { date: p.date };
      row[key] = Number(p.equity);
      rows.set(p.date, row);
    }
  };
  for (const [book, points] of Object.entries(curves) as Array<[BookId, CurvePoint[]]>) put(book, points);
  put('SPY', spy);
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// "NVDA 140C 2026-11-20" or "NVDA 140/150C 2026-11-20" for a spread; shares just show the ticker.
export function describeLegs(symbol: string, legs: BacktestLeg[]): string {
  if (legs.length === 0) return symbol;
  const type = legs[0].type === 'CALL' ? 'C' : 'P';
  const strikes = [...legs].sort((a, b) => b.side - a.side).map(l => l.strike).join('/');
  return `${symbol} ${strikes}${type} ${legs[0].expiry}`;
}

export const fmtUsd = (n: number | null | undefined, signed = false): string => {
  if (n == null || Number.isNaN(n)) return '-';
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? '-' : signed && n > 0 ? '+' : ''}$${s}`;
};

export const fmtPct = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '-' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
