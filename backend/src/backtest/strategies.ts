import { analyzeDpVolumes } from '../collector/scanner.js';
import { yearsBetween } from './pricing.js';
import type { Bar, DayData, Direction, Position } from './types.js';

// Entry and exit rules per book (docs/release2-trading-rules.md sections 2-4). Pure: no I/O.

export const GOOD_GRADES = new Set(['A', 'B']);
export const FLOW_RATIO = 1.5;
export const CURATED_MIN_CONVICTION = 60;
export const B_MIN_SCORE = 60;
export const B_MIN_SUSTAINED = 2;
export const C_MAX_ABOVE_ENTRY = 0.02;
export const OPTION_STOP_PCT = 0.5;
export const OPTION_TARGET_MULT = 2;
export const SPREAD_TARGET_OF_MAX = 0.8;
export const EXIT_DTE = 21;
export const C_MAX_HOLD_DAYS = 20;

export interface EntrySignal {
  symbol: string;
  direction: Direction;
  priority: number;
  stop: number | null;
  target: number | null;
  meta: Record<string, unknown>;
}

export interface CheckFailure {
  symbol: string;
  reason: string;
}

const asDirection = (d: string | null | undefined): Direction | null =>
  d === 'BULLISH' || d === 'BEARISH' ? d : null;

// ATR(n) at the bar for `date`, using Wilder's true range; null without enough history.
export function atr(bars: Bar[], date: string, n = 14): number | null {
  const i = bars.findIndex(b => b.date === date);
  if (i < n) return null;
  let sum = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const b = bars[k];
    const prevClose = bars[k - 1].close;
    sum += Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  }
  return sum / n;
}

export function barOn(bars: Bar[], date: string): Bar | null {
  return bars.find(b => b.date === date) ?? null;
}

// ── Book A: Signa engine A/B grade + options flow agreeing ────────────────────

export function bookASignals(day: DayData): EntrySignal[] {
  const out: EntrySignal[] = [];
  for (const [symbol, s] of day.signals) {
    const direction = asDirection(s.engineDirection);
    if (!direction || !GOOD_GRADES.has(s.engineGrade ?? '')) continue;
    const flow = day.flow.get(symbol);
    const flowAgrees = flow
      ? direction === 'BULLISH'
        ? flow.callPremium > 0 && flow.callPremium >= FLOW_RATIO * flow.putPremium
        : flow.putPremium > 0 && flow.putPremium >= FLOW_RATIO * flow.callPremium
      : false;
    const curatedAgrees = day.curated.some(c => c.symbol === symbol && c.direction === direction && (c.conviction ?? 0) >= CURATED_MIN_CONVICTION);
    if (!flowAgrees && !curatedAgrees) continue;

    const price = s.price;
    const validStop = s.stop != null && price != null && (direction === 'BULLISH' ? s.stop < price : s.stop > price) ? s.stop : null;
    const gex = day.gex.get(symbol);
    const wallStop = direction === 'BULLISH' ? gex?.putWall ?? null : gex?.callWall ?? null;
    out.push({
      symbol,
      direction,
      priority: s.engineScore ?? 0,
      stop: validStop ?? wallStop,
      target: null,
      meta: {
        grade: s.engineGrade, score: s.engineScore, flowAgrees, curatedAgrees,
        callPremium: flow?.callPremium ?? 0, putPremium: flow?.putPremium ?? 0,
        stopSource: validStop != null ? 'signa' : wallStop != null ? 'gex wall' : 'none',
      },
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

// ── Book B: Radon check 1 (edge); checks 2 and 3 run in the engine with prices ──

export function bookBSignals(day: DayData, bars: Map<string, Bar[]>): { signals: EntrySignal[]; failures: CheckFailure[] } {
  const signals: EntrySignal[] = [];
  const failures: CheckFailure[] = [];
  for (const [symbol, c] of day.scanner) {
    if (c.score < B_MIN_SCORE) continue;
    const fail = (reason: string) => failures.push({ symbol, reason: `check 1: ${reason}` });
    if (!c.passedFilters) { fail('scanner filters'); continue; }
    if (!c.confluence) { fail('no options/dark pool confluence'); continue; }
    const direction = asDirection(c.optionsBias);
    if (!direction) { fail('mixed options bias'); continue; }
    if (c.dpSustainedDays < B_MIN_SUSTAINED) { fail(`dark pool sustained < ${B_MIN_SUSTAINED} days`); continue; }

    const series = bars.get(symbol) ?? [];
    const i = series.findIndex(b => b.date === day.date);
    const range = atr(series, day.date);
    if (i < 5 || range == null) { fail('not enough price history'); continue; }
    const move = series[i].close - series[i - 5].close;
    if ((direction === 'BULLISH' ? move : -move) > range) { fail('already moved > 1 ATR in 5 sessions'); continue; }

    const gex = day.gex.get(symbol);
    const target = direction === 'BULLISH' ? gex?.callWall ?? null : gex?.putWall ?? null;
    signals.push({ symbol, direction, priority: c.score, stop: null, target, meta: { score: c.score, atr: range, move5d: move } });
  }
  return { signals: signals.sort((a, b) => b.priority - a.priority), failures };
}

// ── Book C: shares on Signa levels ───────────────────────────────────────────

export function bookCSignals(day: DayData, bars: Map<string, Bar[]>): EntrySignal[] {
  const out: EntrySignal[] = [];
  for (const [symbol, s] of day.signals) {
    if (s.engineDirection !== 'BULLISH' || !GOOD_GRADES.has(s.engineGrade ?? '')) continue;
    if (s.entry == null || s.stop == null || s.target == null || !(s.stop < s.entry) || !(s.target > s.entry)) continue;
    const close = barOn(bars.get(symbol) ?? [], day.date)?.close;
    if (close == null || close > s.entry * (1 + C_MAX_ABOVE_ENTRY) || close <= s.stop) continue;
    out.push({ symbol, direction: 'BULLISH', priority: s.engineScore ?? 0, stop: s.stop, target: s.target, meta: { grade: s.engineGrade, score: s.engineScore, signaEntry: s.entry } });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

// ── Exit checks at the close (first one hit wins) ─────────────────────────────

export interface ExitContext {
  date: string;
  close: number;
  unitValue: number;            // mid value of one contract/spread today
  day: DayData;
  dpDirections: string[];       // this symbol's dark pool direction, most recent session first
}

const minDte = (p: Position, date: string) => Math.min(...p.legs.map(l => yearsBetween(date, l.expiry) * 365));

function optionLevels(p: Position, ctx: ExitContext): string | null {
  if (ctx.unitValue <= p.unitCost * (1 - OPTION_STOP_PCT)) return 'down 50%';
  if (p.kind === 'spread' && p.maxValue != null) {
    if (ctx.unitValue >= p.maxValue * SPREAD_TARGET_OF_MAX) return 'spread at 80% of max';
  } else if (ctx.unitValue >= p.unitCost * OPTION_TARGET_MULT) {
    return 'up 100%';
  }
  return null;
}

export function bookAExit(p: Position, ctx: ExitContext): string | null {
  if (p.stop != null && (p.direction === 'BULLISH' ? ctx.close < p.stop : ctx.close > p.stop)) return 'underlying stop';
  const lvl = optionLevels(p, ctx);
  if (lvl) return lvl;
  if (minDte(p, ctx.date) <= EXIT_DTE) return '21 days to expiry';
  const now = asDirection(ctx.day.signals.get(p.symbol)?.engineDirection);
  if (now && now !== p.direction) return 'Signa flipped';
  return null;
}

export function bookBExit(p: Position, ctx: ExitContext): string | null {
  if (p.target != null && (p.direction === 'BULLISH' ? ctx.close >= p.target : ctx.close <= p.target)) return 'GEX target reached';
  if (ctx.unitValue <= p.unitCost * (1 - OPTION_STOP_PCT)) return 'down 50%';
  const against = p.direction === 'BULLISH' ? 'DISTRIBUTION' : 'ACCUMULATION';
  if (ctx.dpDirections.length >= 2 && ctx.dpDirections[0] === against && ctx.dpDirections[1] === against) return 'dark pool flipped 2 sessions';
  if (minDte(p, ctx.date) <= EXIT_DTE) return '21 days to expiry';
  return null;
}

// Book C stops/targets are checked intraday in the engine; these are the close-based exits.
export function bookCCloseExit(p: Position, day: DayData): string | null {
  if (p.daysHeld >= C_MAX_HOLD_DAYS) return '20 trading days held';
  if (day.signals.get(p.symbol)?.engineDirection === 'BEARISH') return 'Signa flipped bearish';
  return null;
}

export function dpDirection(v: { buy: number; sell: number; prints: number } | undefined): string {
  return v ? analyzeDpVolumes(v.buy, v.sell, v.prints).direction : 'NO_DATA';
}
