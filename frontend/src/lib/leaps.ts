import type { LeapsPosition, LeapsScreenRow } from '../types/leaps';

// Pure helpers for the LEAPS page.

// % the stock must move from `price` to reach `level`.
export function pctTo(price: number | null, level: number | null): number | null {
  if (price == null || level == null || price <= 0) return null;
  return (level / price - 1) * 100;
}

export function fmtLevel(level: number | null, price: number | null): string {
  if (level == null) return '-';
  const pct = pctTo(price, level);
  const s = `$${level.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return pct == null ? s : `${s} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}

export function fmtCap(n: number | null): string {
  if (n == null) return '-';
  return n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : `$${Math.round(n / 1e9)}B`;
}

// Candidates first, then the rest of the names with a contract (deepest discount first), then everything else by ticker.
export function sortScreen(rows: LeapsScreenRow[]): LeapsScreenRow[] {
  const rank = (r: LeapsScreenRow) => (r.candidate ? 0 : r.contracts ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (b.off_high_pct ?? 0) - (a.off_high_pct ?? 0) || a.symbol.localeCompare(b.symbol));
}

// Open position P&L on cost: both halves at their sale / last bid, before commissions.
export function positionReturnPct(p: Pick<LeapsPosition, 'qty' | 'qty_open' | 'entry_price' | 'last_bid' | 'half_qty' | 'half_price'>): number | null {
  if (p.entry_price == null || p.last_bid == null || p.qty <= 0) return null;
  const cost = p.qty * Number(p.entry_price);
  const value = p.qty_open * Number(p.last_bid) + Number(p.half_qty ?? 0) * Number(p.half_price ?? 0);
  return cost > 0 ? (value / cost - 1) * 100 : null;
}

// What a position is waiting for, in words.
export function positionStatus(p: Pick<LeapsPosition, 'status' | 'pending_action' | 'half_date' | 'exit_reason'>): string {
  if (p.status === 'pending') return 'Order placed - fills at next close';
  if (p.status === 'cancelled') return `Cancelled (${p.exit_reason ?? 'no fill'})`;
  if (p.status === 'closed') return `Closed (${p.exit_reason ?? ''})`;
  if (p.pending_action === 'half') return 'Selling half at next close';
  if (p.pending_action?.startsWith('close:')) return `Closing at next close (${p.pending_action.slice(6)})`;
  return p.half_date ? 'Runner (half sold)' : 'Holding';
}

export type CurvePoint = { date: string; equity: number | null };

// One row per date across several equity curves plus SPY, for a single Recharts chart.
export function mergeNamedCurves(curves: Record<string, CurvePoint[]>, spy: CurvePoint[]): Array<Record<string, number | string>> {
  const rows = new Map<string, Record<string, number | string>>();
  const put = (key: string, points: CurvePoint[]) => {
    for (const p of points) {
      if (p.equity == null) continue;
      const row = rows.get(p.date) ?? { date: p.date };
      row[key] = Number(p.equity);
      rows.set(p.date, row);
    }
  };
  for (const [k, v] of Object.entries(curves)) put(k, v);
  put('SPY', spy);
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
