import type { LeverageRow } from '../types/market';

export type LeverageSortKey = 'operatingIncome' | 'ticker' | 'opMargin' | 'marginChange' | 'revYoY' | 'incrementalMargin' | 'dol' | 'rank';

// $63.73B / $459.7M / -$3.6M, matching the source table's style.
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export const fmtRatioPct = (n: number | null, signed = false): string =>
  n == null ? '-' : `${signed && n > 0 ? '+' : ''}${(n * 100).toFixed(Math.abs(n) < 0.1 && n !== 0 ? 1 : 0)}%`;

export const fmtMargin = (n: number | null): string => (n == null ? '-' : `${(n * 100).toFixed(1)}%`);

const sortValue = (r: LeverageRow, key: LeverageSortKey): number | string | null => {
  switch (key) {
    case 'ticker': return r.ticker;
    case 'marginChange': return r.opMarginYearAgo == null ? null : r.opMargin - r.opMarginYearAgo;
    case 'rank': return r.rank == null ? null : -r.rank;
    default: return r[key];
  }
};

// Descending by default (rank: best first); missing values always sink to the bottom.
export function sortLeverage(rows: LeverageRow[], key: LeverageSortKey, asc = false): LeverageRow[] {
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb == null) return a.ticker.localeCompare(b.ticker);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return asc ? cmp : -cmp;
  });
}
