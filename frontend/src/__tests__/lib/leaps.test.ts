import { describe, it, expect } from 'vitest';
import { buyAndHoldRows, fmtCap, fmtLevel, indexAction, mergeNamedCurves, pctTo, positionReturnPct, positionStatus, sortScreen } from '../../lib/leaps';
import type { LeapsScreenRow, LeapsSummary } from '../../types/leaps';

describe('pctTo / fmtLevel', () => {
  it('gives the % move from the price to the level', () => {
    expect(pctTo(100, 110)).toBeCloseTo(10, 10);
    expect(pctTo(null, 110)).toBeNull();
    expect(fmtLevel(110, 100)).toBe('$110.00 (+10.0%)');
    expect(fmtLevel(95.5, 100)).toBe('$95.50 (-4.5%)');
    expect(fmtLevel(110, null)).toBe('$110.00');
    expect(fmtLevel(null, 100)).toBe('-');
  });
});

describe('fmtCap', () => {
  it('shows billions and trillions', () => {
    expect(fmtCap(2.53e12)).toBe('$2.53T');
    expect(fmtCap(187.4e9)).toBe('$187B');
    expect(fmtCap(null)).toBe('-');
  });
});

describe('sortScreen', () => {
  const row = (symbol: string, candidate: boolean, contracts: boolean, off: number): LeapsScreenRow => ({
    trade_date: '2026-10-23', symbol, price: 1, high_52w: 1, off_high_pct: off, market_cap: 1, iv30: 1, vol_ratio: 1, checks: [],
    eligible: true, candidate, reason: null, confirmation: null, contracts: contracts ? {} : null,
  });
  it('puts candidates first, then names with contracts by discount, then the rest', () => {
    const out = sortScreen([row('C', false, false, 30), row('B', false, true, 16), row('A', true, true, 18), row('D', false, true, 25)]);
    expect(out.map(r => r.symbol)).toEqual(['A', 'D', 'B', 'C']);
  });
});

describe('positionReturnPct', () => {
  it('counts both halves against the premium paid', () => {
    expect(positionReturnPct({ qty: 4, qty_open: 4, entry_price: 10, last_bid: 12, half_qty: null, half_price: null })).toBeCloseTo(20, 10);
    expect(positionReturnPct({ qty: 4, qty_open: 2, entry_price: 10, last_bid: 15, half_qty: 2, half_price: 20 })).toBeCloseTo(75, 10);
    expect(positionReturnPct({ qty: 4, qty_open: 4, entry_price: null, last_bid: 12, half_qty: null, half_price: null })).toBeNull();
  });
});

describe('positionStatus', () => {
  it('describes what the position is waiting for', () => {
    expect(positionStatus({ status: 'pending', pending_action: null, half_date: null, exit_reason: null })).toContain('next close');
    expect(positionStatus({ status: 'open', pending_action: 'half', half_date: null, exit_reason: null })).toBe('Selling half at next close');
    expect(positionStatus({ status: 'open', pending_action: 'close:quality break', half_date: null, exit_reason: null })).toBe('Closing at next close (quality break)');
    expect(positionStatus({ status: 'open', pending_action: null, half_date: '2027-01-05', exit_reason: null })).toBe('Runner (half sold)');
    expect(positionStatus({ status: 'open', pending_action: null, half_date: null, exit_reason: null })).toBe('Holding');
    expect(positionStatus({ status: 'cancelled', pending_action: null, half_date: null, exit_reason: 'no quote at fill' })).toBe('Cancelled (no quote at fill)');
  });
});

describe('mergeNamedCurves', () => {
  it('joins curves by date, skipping null points', () => {
    const rows = mergeNamedCurves(
      { L1: [{ date: '2026-01-02', equity: 100 }, { date: '2026-01-05', equity: 110 }] },
      [{ date: '2026-01-02', equity: 100 }, { date: '2026-01-05', equity: null }],
    );
    expect(rows).toEqual([{ date: '2026-01-02', L1: 100, SPY: 100 }, { date: '2026-01-05', L1: 110 }]);
  });
});

describe('buyAndHoldRows', () => {
  const sum = (symbol: string, returnPct: number) => ({ benchmark: { symbol, returnPct, cagrPct: 15, maxDrawdownPct: 34 } }) as unknown as LeapsSummary;
  it('takes SPY from any SPY-benchmarked run and QQQ from the IQ run, SPY first', () => {
    expect(buyAndHoldRows([sum('QQQ', 532), sum('SPY', 315), sum('SPY', 315)])).toEqual([
      { symbol: 'SPY', returnPct: 315, cagrPct: 15, maxDrawdownPct: 34 },
      { symbol: 'QQQ', returnPct: 532, cagrPct: 15, maxDrawdownPct: 34 },
    ]);
  });
  it('skips an index with no run (older runs without a benchmark)', () => {
    expect(buyAndHoldRows([sum('SPY', 1), {} as LeapsSummary])).toHaveLength(1);
  });
});

describe('indexAction', () => {
  const p = (over: Record<string, unknown>) => ({ id: 1, status: 'open', expiry: '2028-06-16', strike: 580, pending_action: null, ...over }) as never;
  it('says buy now with no live position', () => {
    expect(indexAction([], '2026-10-26').action).toBe('buy');
    expect(indexAction([p({ status: 'closed' })], '2026-10-26').action).toBe('buy');
  });
  it('shows a pending paper order', () => {
    expect(indexAction([p({ status: 'pending' })], '2026-10-26').label).toBe('Order placed');
  });
  it('holds until 120 days before expiry, with the days left', () => {
    const a = indexAction([p({})], '2026-10-26');
    expect(a).toMatchObject({ action: 'hold', label: 'Hold' });
    expect(a.detail).toContain('roll on 2028-02-17');
    expect(a.detail).toContain('(479 days)');
  });
  it('says roll when the time exit is queued, even with the replacement order already placed', () => {
    const a = indexAction([p({ pending_action: 'close:time exit (120 days left)' }), p({ id: 2, status: 'pending', expiry: '2029-06-15' })], '2028-02-17');
    expect(a.action).toBe('roll');
    expect(a.detail).toContain('580C 2028-06-16');
  });
});
