import { decideExit } from './exits.js';
import type { LeapsBook } from './rules.js';

// Paper LEAPS books (docs/leaps-rules.md section 10). Pure: one session's quotes move each position one step.
//   - Orders decided after a close fill at the next session's close: buys at the ask, sells at the bid
//   - Whole contracts; half = floor(open / 2)

export interface PaperPosition {
  id?: number;
  book: LeapsBook;
  rules_version: string;
  symbol: string;
  contract_symbol: string;
  expiry: string;
  strike: number;
  status: 'pending' | 'open' | 'closed' | 'cancelled';
  signal_date: string;
  market_state: string;
  qty: number;
  qty_open: number;
  entry_date: string | null;
  entry_price: number | null;
  half_date: string | null;
  half_price: number | null;
  half_qty: number | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pending_action: string | null;
  peak_value: number | null;
  last_bid: number | null;
  last_iv: number | null;
  last_date: string | null;
  commissions: number;
  pnl: number | null;
  confirmation: unknown;
  meta: Record<string, unknown>;
}

export interface Quote {
  bid: number | null;
  ask: number | null;
  iv: number | null;
}

const n = (v: unknown) => Number(v ?? 0);
const round = (x: number) => Math.round(x * 100) / 100;

const entryCost = (p: PaperPosition) => n(p.qty) * n(p.entry_price) * 100;
const halfProceeds = (p: PaperPosition) => n(p.half_qty) * n(p.half_price) * 100;

// Cash, equity and open premium of one book. Pending buys reserve their estimated cost (meta.estCost).
export function bookState(positions: PaperPosition[], startingBalance: number) {
  let cash = startingBalance;
  let marked = 0;
  let openCost = 0;
  let openCount = 0;
  for (const p of positions) {
    if (p.status === 'closed') cash += n(p.pnl);
    if (p.status === 'open') {
      cash += halfProceeds(p) - entryCost(p) - n(p.commissions);
      marked += n(p.qty_open) * n(p.last_bid ?? p.entry_price) * 100;
      openCost += entryCost(p) * (n(p.qty_open) / Math.max(1, n(p.qty)));
      openCount++;
    }
    if (p.status === 'pending') {
      const est = n(p.meta.estCost);
      cash -= est;
      marked += est;
      openCost += est;
      openCount++;
    }
  }
  return { cash: round(cash), equity: round(cash + marked), openCost: round(openCost), openCount };
}

export type StepResult = { position: PaperPosition; event: string | null };

// stepPosition:
//   - pending: fills at today's ask, cut to what the cash allows; cancelled without a quote or with < 2 affordable
//   - open with a pending action: half / close fill at today's bid; without a bid the order waits a session
//   - every open position is then marked and its exit checked for tomorrow's fill
export function stepPosition(p: PaperPosition, q: Quote | null, date: string, qualityOk: boolean, commission: number, cash: number): StepResult {
  const pos: PaperPosition = { ...p, meta: { ...p.meta } };
  let event: string | null = null;

  if (pos.status === 'pending') {
    const unit = q?.ask && q.ask > 0 ? q.ask * 100 + commission : null;
    if (!unit) return { position: { ...pos, status: 'cancelled', exit_reason: 'no quote at fill', exit_date: date }, event: 'cancelled: no quote at fill' };
    const affordable = Math.floor((cash + n(pos.meta.estCost)) / unit);
    const qty = Math.min(pos.qty, affordable);
    if (qty < 2) return { position: { ...pos, status: 'cancelled', exit_reason: 'no cash at fill', exit_date: date }, event: 'cancelled: no cash at fill' };
    Object.assign(pos, {
      status: 'open', qty, qty_open: qty, entry_date: date, entry_price: q!.ask, commissions: qty * commission,
      last_bid: q!.bid, last_iv: q!.iv, last_date: date,
    });
    return { position: pos, event: `bought ${qty} @ ${q!.ask}` };
  }
  if (pos.status !== 'open') return { position: pos, event: null };

  const bid = q?.bid != null && q.bid >= 0 ? q.bid : null;
  if (pos.pending_action && bid != null) {
    if (pos.pending_action === 'half') {
      const half = Math.floor(pos.qty_open / 2);
      Object.assign(pos, { half_qty: half, half_price: bid, half_date: date, qty_open: pos.qty_open - half, commissions: n(pos.commissions) + half * commission, peak_value: bid });
      event = `sold half (${half}) @ ${bid}`;
    } else {
      const reason = pos.pending_action.replace(/^close:/, '');
      const commissions = n(pos.commissions) + pos.qty_open * commission;
      const proceeds = halfProceeds(pos) + pos.qty_open * bid * 100;
      Object.assign(pos, {
        status: 'closed', exit_date: date, exit_price: bid, exit_reason: reason, commissions,
        pnl: round(proceeds - entryCost(pos) - commissions), qty_open: 0, pending_action: null, last_bid: bid, last_date: date,
      });
      return { position: pos, event: `closed (${reason}) @ ${bid}` };
    }
    pos.pending_action = null;
  }

  if (bid != null) {
    pos.last_bid = bid;
    pos.last_iv = q?.iv ?? pos.last_iv;
    pos.last_date = date;
    if (pos.half_date) pos.peak_value = Math.max(n(pos.peak_value), bid);
  }
  if (!pos.pending_action) {
    const d = decideExit({
      entryDate: pos.entry_date!, expiry: pos.expiry, entryPrice: n(pos.entry_price), halfSold: pos.half_date != null,
      peakSinceHalf: pos.peak_value, qualityOk,
    }, date, n(pos.last_bid));
    if (d) {
      pos.pending_action = d.action === 'half' ? 'half' : `close:${d.reason}`;
      event = [event, `decided: ${d.action === 'half' ? 'sell half' : d.reason}`].filter(Boolean).join('; ');
    }
  }
  return { position: pos, event };
}
