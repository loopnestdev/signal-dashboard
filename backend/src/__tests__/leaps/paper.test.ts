import { describe, it, expect } from 'vitest';
import { bookState, stepPosition, type PaperPosition } from '../../leaps/paper.js';
import { EXIT_REASONS } from '../../leaps/exits.js';

const pos = (over: Partial<PaperPosition> = {}): PaperPosition => ({
  book: 'L2', rules_version: '1.0', symbol: 'MSFT', contract_symbol: 'MSFT280121C00450000', expiry: '2028-01-21', strike: 450,
  status: 'open', signal_date: '2026-10-23', market_state: 'correction', qty: 4, qty_open: 4, entry_date: '2026-10-26', entry_price: 10,
  half_date: null, half_price: null, half_qty: null, exit_date: null, exit_price: null, exit_reason: null, pending_action: null,
  peak_value: null, last_bid: 10, last_iv: 0.3, last_date: '2026-10-26', commissions: 4, pnl: null, confirmation: null, meta: {}, ...over,
});

describe('bookState', () => {
  it('counts open cost, marks, realized P&L and pending reservations', () => {
    const s = bookState([
      pos({ last_bid: 12 }),                                                           // cost 4,000 + 4 commission, marked 4,800
      pos({ status: 'closed', pnl: 500 }),
      pos({ status: 'pending', entry_price: null, meta: { estCost: 2_000 } }),
      pos({ status: 'cancelled' }),
    ], 50_000);
    expect(s).toEqual({ cash: 50_000 - 4_004 + 500 - 2_000, equity: 50_000 - 4_004 + 500 + 4_800, openCost: 6_000, openCount: 2 });
  });
});

describe('stepPosition', () => {
  const pending = pos({ status: 'pending', entry_date: null, entry_price: null, last_bid: null, commissions: 0, meta: { estCost: 4_004 } });

  it('fills a pending buy at the ask', () => {
    const { position, event } = stepPosition(pending, { bid: 9.8, ask: 10.2, iv: 0.31 }, '2026-10-27', true, 1, 46_000);
    expect(position).toMatchObject({ status: 'open', qty: 4, entry_price: 10.2, entry_date: '2026-10-27', commissions: 4, last_bid: 9.8 });
    expect(event).toBe('bought 4 @ 10.2');
  });
  it('cuts the size to the cash, and cancels below 2 contracts or without a quote', () => {
    expect(stepPosition(pending, { bid: 9.8, ask: 10.2, iv: 0.3 }, '2026-10-27', true, 1, -1_000).position.qty).toBe(2);
    expect(stepPosition(pending, { bid: 9.8, ask: 10.2, iv: 0.3 }, '2026-10-27', true, 1, -3_000).position).toMatchObject({ status: 'cancelled', exit_reason: 'no cash at fill' });
    expect(stepPosition(pending, null, '2026-10-27', true, 1, 46_000).position).toMatchObject({ status: 'cancelled', exit_reason: 'no quote at fill' });
  });
  it('decides the half sale at +100% and fills it at the next bid', () => {
    const decided = stepPosition(pos(), { bid: 20.5, ask: 21, iv: 0.3 }, '2027-01-04', true, 1, 0).position;
    expect(decided.pending_action).toBe('half');
    const sold = stepPosition(decided, { bid: 21, ask: 21.5, iv: 0.3 }, '2027-01-05', true, 1, 0).position;
    expect(sold).toMatchObject({ half_qty: 2, half_price: 21, qty_open: 2, half_date: '2027-01-05', peak_value: 21, pending_action: null, commissions: 6 });
  });
  it('closes with P&L across both halves', () => {
    const runner = pos({ half_qty: 2, half_price: 21, half_date: '2027-01-05', qty_open: 2, commissions: 6, pending_action: `close:${EXIT_REASONS.runner}` });
    const { position } = stepPosition(runner, { bid: 25, ask: 25.5, iv: 0.3 }, '2027-06-01', true, 1, 0);
    // proceeds 2x21x100 + 2x25x100 = 9,200; cost 4,000; commissions 8
    expect(position).toMatchObject({ status: 'closed', exit_price: 25, exit_reason: EXIT_REASONS.runner, pnl: 5_192, qty_open: 0 });
  });
  it('keeps an order waiting when there is no bid', () => {
    const p = pos({ pending_action: 'half' });
    expect(stepPosition(p, null, '2027-01-05', true, 1, 0).position.pending_action).toBe('half');
  });
  it('tracks the runner peak and queues a quality-break exit', () => {
    const runner = pos({ half_qty: 2, half_price: 21, half_date: '2027-01-05', qty_open: 2, peak_value: 21 });
    expect(stepPosition(runner, { bid: 24, ask: 24.5, iv: 0.3 }, '2027-02-01', true, 1, 0).position.peak_value).toBe(24);
    expect(stepPosition(pos(), { bid: 11, ask: 11.5, iv: 0.3 }, '2027-02-01', false, 1, 0).position.pending_action).toBe(`close:${EXIT_REASONS.quality}`);
  });
});

describe('index book (IX) paper positions', () => {
  const ix = pos({ book: 'IX', status: 'pending', qty: 0.3712, qty_open: 0.3712, entry_date: null, entry_price: null, last_bid: null, commissions: 0, meta: { estCost: 7_500 } });
  it('fills fractional contracts at the ask, cut to cash', () => {
    const { position } = stepPosition(ix, { bid: 199, ask: 200, iv: 0.17 }, '2026-10-27', true, 1, 42_500);
    expect(position).toMatchObject({ status: 'open', qty: 0.3712, entry_price: 200, commissions: 1 });
    expect(stepPosition(ix, { bid: 199, ask: 200, iv: 0.17 }, '2026-10-27', true, 1, -3_500).position.qty).toBeCloseTo(0.1999, 4);
  });
  it('never sells half or stops out; only the time exit rolls it', () => {
    const open = pos({ book: 'IX', expiry: '2028-06-16', entry_date: '2026-10-27', entry_price: 100, qty: 0.4, qty_open: 0.4 });
    expect(stepPosition(open, { bid: 250, ask: 251, iv: 0.17 }, '2027-03-01', true, 1, 0).position.pending_action).toBeNull();
    expect(stepPosition(open, { bid: 30, ask: 31, iv: 0.17 }, '2027-09-01', false, 1, 0).position.pending_action).toBeNull();
    expect(stepPosition(open, { bid: 150, ask: 151, iv: 0.17 }, '2028-02-17', true, 1, 0).position.pending_action).toBe(`close:${EXIT_REASONS.time}`);
  });
  it('adds earned interest to book cash', () => {
    expect(bookState([], 50_000, 125.5)).toEqual({ cash: 50_125.5, equity: 50_125.5, openCost: 0, openCount: 0 });
  });
});
