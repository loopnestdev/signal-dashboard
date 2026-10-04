import { createHash } from 'node:crypto';
import { etDateOf } from '../lib/marketCalendar.js';

// Pure transforms from Signa / Yahoo payloads into signal-schema rows.

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

// Signa can repeat an item within one response; Postgres rejects an upsert batch that touches a row twice.
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map(r => [r.id, r])).values()];
}

export function rowId(...parts: unknown[]): string {
  return createHash('sha1').update(parts.map(p => String(p ?? '')).join('|')).digest('hex');
}

// ── Dark pool ────────────────────────────────────────────────────────────────

export interface DpPrintRow {
  id: string;
  symbol: string;
  executed_at: string;
  trade_date: string;
  price: number;
  size: number;
  premium: number;
  nbbo_bid: number | null;
  nbbo_ask: number | null;
  day_volume: number | null;
  side: 1 | -1 | 0;
}

// Radon analyze_darkpool: at/above the NBBO midpoint = buy, below = sell, no NBBO = unclassified.
export function classifyDpSide(price: number, bid: number | null, ask: number | null): 1 | -1 | 0 {
  if (!bid || !ask || bid <= 0 || ask <= 0) return 0;
  return price >= (bid + ask) / 2 ? 1 : -1;
}

export function parseDpPrints(payload: unknown): DpPrintRow[] {
  const prints = (payload as Raw | null)?.prints;
  if (!Array.isArray(prints)) return [];
  const rows: DpPrintRow[] = [];
  for (const item of prints as Raw[]) {
    if (item.canceled) continue;
    const symbol = str(item.ticker)?.toUpperCase();
    const executedAt = str(item.executed_at);
    const price = num(item.price);
    const size = num(item.size);
    if (!symbol || !executedAt || price === null || size === null || Number.isNaN(Date.parse(executedAt))) continue;
    const bid = num(item.nbbo_bid);
    const ask = num(item.nbbo_ask);
    rows.push({
      id: rowId(symbol, executedAt, price, size),
      symbol,
      executed_at: executedAt,
      trade_date: etDateOf(executedAt),
      price,
      size: Math.round(size),
      premium: num(item.premium) ?? price * size,
      nbbo_bid: bid,
      nbbo_ask: ask,
      day_volume: num(item.volume),
      side: classifyDpSide(price, bid, ask),
    });
  }
  return dedupeById(rows);
}

// ── Options flow alerts ──────────────────────────────────────────────────────

export interface FlowAlertRow {
  id: string;
  symbol: string;
  option_type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  premium: number;
  volume: number | null;
  open_interest: number | null;
  vol_oi_ratio: number | null;
  has_sweep: boolean;
  has_floor: boolean;
  underlying_price: number | null;
  alert_rule: string | null;
  alerted_at: string;
  trade_date: string;
}

export function parseFlowAlerts(payload: unknown): FlowAlertRow[] {
  const flow = (payload as Raw | null)?.flow;
  if (!Array.isArray(flow)) return [];
  const rows: FlowAlertRow[] = [];
  for (const item of flow as Raw[]) {
    const symbol = str(item.ticker)?.toUpperCase();
    const type = str(item.type)?.toUpperCase();
    const strike = num(item.strike);
    const expiry = str(item.expiry);
    const startMs = num(item.start_time);
    if (!symbol || (type !== 'CALL' && type !== 'PUT') || strike === null || !expiry || !startMs) continue;
    const alertedAt = new Date(startMs).toISOString();
    const rule = str(item.alert_rule);
    rows.push({
      id: rowId(symbol, type, strike, expiry, startMs, rule),
      symbol,
      option_type: type,
      strike,
      expiry,
      premium: num(item.premium) ?? 0,
      volume: num(item.volume),
      open_interest: num(item.open_interest),
      vol_oi_ratio: num(item.vol_oi_ratio),
      has_sweep: Boolean(item.has_sweep),
      has_floor: Boolean(item.has_floor),
      underlying_price: num(item.underlying_price),
      alert_rule: rule,
      alerted_at: alertedAt,
      trade_date: etDateOf(alertedAt),
    });
  }
  return dedupeById(rows);
}

// ── Curated flow ─────────────────────────────────────────────────────────────

export interface CuratedFlowRow {
  id: string;
  symbol: string;
  direction: string | null;
  conviction_score: number | null;
  option_type: string | null;
  strike: number | null;
  expiry: string | null;
  premium: number | null;
  confirms_signal: boolean | null;
  contradicts_signal: boolean | null;
  rationale: string | null;
  scored_at: string | null;
  trade_date: string;
  payload: Raw;
}

export function parseCuratedFlow(payload: unknown, symbols: Set<string>, now = new Date()): CuratedFlowRow[] {
  const events = (payload as Raw | null)?.events;
  if (!Array.isArray(events)) return [];
  const rows: CuratedFlowRow[] = [];
  for (const ev of events as Raw[]) {
    const inner = (ev.flow_events ?? {}) as Raw;
    const symbol = str(inner.symbol ?? ev.symbol)?.toUpperCase();
    const id = str(ev.id ?? ev.curated_id);
    if (!symbol || !id || !symbols.has(symbol)) continue;
    const scoredAt = str(ev.scored_at);
    const bool = (v: unknown) => (v === null || v === undefined ? null : Boolean(v));
    rows.push({
      id,
      symbol,
      direction: str(ev.direction),
      conviction_score: num(ev.conviction_score),
      option_type: str(inner.option_type)?.toUpperCase() ?? null,
      strike: num(inner.strike),
      expiry: str(inner.expiry),
      premium: num(inner.premium_size),
      confirms_signal: bool(ev.confirms_signal),
      contradicts_signal: bool(ev.contradicts_signal),
      rationale: str(ev.rationale_short),
      scored_at: scoredAt,
      trade_date: etDateOf(scoredAt ?? now),
      payload: ev,
    });
  }
  return dedupeById(rows);
}

// ── GEX ──────────────────────────────────────────────────────────────────────

export interface GexSnapshotRow {
  symbol: string;
  trade_date: string;
  captured_at: string;
  spot: number | null;
  gamma_flip: number | null;
  call_wall: number | null;
  put_wall: number | null;
  max_gamma_strike: number | null;
  regime_above_flip: boolean | null;
  net_gex: number | null;
  strikes: Array<[number, number]>;
}

const STRIKE_BAND = 0.3;

export function parseGexSnapshot(payload: unknown, symbol: string, tradeDate: string, now = new Date()): GexSnapshotRow | null {
  const raw = payload as Raw | null;
  if (!raw || raw.ok === false) return null;
  const levels = (raw.levels ?? {}) as Raw;
  const underlying = (raw.underlying ?? {}) as Raw;
  const spot = num(underlying.price ?? raw.current_price ?? raw.currentPrice);

  const byStrike = new Map<number, number>();
  const list = raw.netGexByStrike ?? raw.strikes;
  if (Array.isArray(list)) {
    for (const lv of list as Raw[]) {
      const strike = num(lv.strike);
      const gex = num(lv.netGex ?? lv.net_gex) ?? 0;
      if (strike === null || strike <= 0) continue;
      byStrike.set(strike, (byStrike.get(strike) ?? 0) + gex);
    }
  }
  const all = [...byStrike.entries()].sort((a, b) => a[0] - b[0]);
  const netGex = all.length ? all.reduce((s, [, g]) => s + g, 0) : null;
  const strikes = spot
    ? all.filter(([k]) => Math.abs(k - spot) / spot <= STRIKE_BAND)
    : all;

  return {
    symbol: symbol.toUpperCase(),
    trade_date: tradeDate,
    captured_at: now.toISOString(),
    spot,
    gamma_flip: num(levels.gammaFlipLevel ?? raw.gammaFlipLevel ?? levels.flipLevel),
    call_wall: num(levels.callWall ?? raw.callWall),
    put_wall: num(levels.putWall ?? raw.putWall),
    max_gamma_strike: num(levels.maxGammaStrike ?? raw.maxGammaStrike),
    regime_above_flip: (levels.regimeAboveFlip ?? raw.regimeAboveFlip) == null
      ? null : Boolean(levels.regimeAboveFlip ?? raw.regimeAboveFlip),
    net_gex: netGex,
    strikes,
  };
}

// ── Signa Action Card ────────────────────────────────────────────────────────

export interface SignalSnapshotRow {
  symbol: string;
  trade_date: string;
  captured_at: string;
  engine_direction: string | null;
  engine_score: number | null;
  engine_grade: string | null;
  signa_action: string | null;
  signa_grade: string | null;
  conviction: number | null;
  price: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  payload: Raw;
}

export function parseSignalSnapshot(payload: unknown, symbol: string, tradeDate: string, now = new Date()): SignalSnapshotRow | null {
  const raw = payload as Raw | null;
  if (!raw || raw.ok === false) return null;
  const engine = (raw.engine ?? {}) as Raw;
  const data = (raw.data ?? {}) as Raw;
  const signa = (raw.signa ?? {}) as Raw;
  return {
    symbol: symbol.toUpperCase(),
    trade_date: tradeDate,
    captured_at: now.toISOString(),
    engine_direction: str(engine.direction),
    engine_score: num(engine.score),
    engine_grade: str(engine.grade),
    signa_action: str(signa.action),
    signa_grade: str(signa.grade),
    conviction: num(signa.conviction),
    price: num(data.price),
    entry: num(engine.entry ?? data.entry),
    stop: num(engine.stop ?? data.stop),
    target: num(engine.target ?? data.target),
    payload: raw,
  };
}

// ── Yahoo option chain ───────────────────────────────────────────────────────

export interface OptionQuoteRow {
  contract_symbol: string;
  trade_date: string;
  symbol: string;
  option_type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  iv: number | null;
  open_interest: number | null;
  volume: number | null;
  spot: number | null;
  captured_at: string;
}

// Swing horizon: the listed expiries closest to 30 and 60 calendar days out, within 21-75 DTE.
export function pickSwingExpiries(expiriesEpoch: number[], now = new Date()): number[] {
  const dte = (e: number) => (e * 1000 - now.getTime()) / 86_400_000;
  const eligible = expiriesEpoch.filter(e => dte(e) >= 21 && dte(e) <= 75);
  const picks = new Set<number>();
  for (const targetDays of [30, 60]) {
    let best: number | null = null;
    for (const e of eligible) {
      if (best === null || Math.abs(dte(e) - targetDays) < Math.abs(dte(best) - targetDays)) best = e;
    }
    if (best !== null) picks.add(best);
  }
  return [...picks].sort((a, b) => a - b);
}

const QUOTE_BAND = 0.15;

export function parseOptionChain(payload: unknown, symbol: string, tradeDate: string, now = new Date()): OptionQuoteRow[] {
  const result = ((payload as Raw | null)?.optionChain as Raw | undefined)?.result;
  const chain = Array.isArray(result) ? (result[0] as Raw | undefined) : undefined;
  if (!chain) return [];
  const spot = num((chain.quote as Raw | undefined)?.regularMarketPrice);
  const rows: OptionQuoteRow[] = [];
  for (const block of (chain.options as Raw[] | undefined) ?? []) {
    for (const [key, type] of [['calls', 'CALL'], ['puts', 'PUT']] as const) {
      for (const c of (block[key] as Raw[] | undefined) ?? []) {
        const strike = num(c.strike);
        const expiry = num(c.expiration);
        const contract = str(c.contractSymbol);
        if (strike === null || expiry === null || !contract) continue;
        if (spot && Math.abs(strike - spot) / spot > QUOTE_BAND) continue;
        rows.push({
          contract_symbol: contract,
          trade_date: tradeDate,
          symbol: symbol.toUpperCase(),
          option_type: type,
          strike,
          expiry: new Date(expiry * 1000).toISOString().slice(0, 10),
          bid: num(c.bid),
          ask: num(c.ask),
          last: num(c.lastPrice),
          iv: num(c.impliedVolatility),
          open_interest: num(c.openInterest),
          volume: num(c.volume),
          spot,
          captured_at: now.toISOString(),
        });
      }
    }
  }
  return rows;
}

// ── Market-wide raw flow (scanner discovery feed) ────────────────────────────

export interface RawFlowRow {
  id: string;
  symbol: string;
  option_type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  dte: number | null;
  premium: number;
  volume: number | null;
  open_interest: number | null;
  vol_oi_ratio: number | null;
  is_sweep: boolean;
  is_block: boolean;
  iv: number | null;
  underlying_price: number | null;
  signal_type: string | null;
  sentiment: string | null;
  unusual_score: number | null;
  executed_at: string;
  trade_date: string;
}

export function parseRawFlow(payload: unknown): RawFlowRow[] {
  const events = (payload as Raw | null)?.events;
  if (!Array.isArray(events)) return [];
  const rows: RawFlowRow[] = [];
  for (const ev of events as Raw[]) {
    const id = str(ev.id);
    const symbol = str(ev.symbol)?.toUpperCase();
    const type = str(ev.option_type)?.toUpperCase();
    const strike = num(ev.strike);
    const expiry = str(ev.expiry);
    const executedAt = str(ev.executed_at);
    if (!id || !symbol || (type !== 'CALL' && type !== 'PUT') || strike === null || !expiry || !executedAt) continue;
    if (Number.isNaN(Date.parse(executedAt))) continue;
    rows.push({
      id,
      symbol,
      option_type: type,
      strike,
      expiry,
      dte: num(ev.dte),
      premium: num(ev.premium_size ?? ev.premium) ?? 0,
      volume: num(ev.volume),
      open_interest: num(ev.open_interest),
      vol_oi_ratio: num(ev.volume_oi_ratio ?? ev.vol_oi_ratio),
      is_sweep: Boolean(ev.is_sweep),
      is_block: Boolean(ev.is_block),
      iv: num(ev.iv),
      underlying_price: num(ev.underlying_price),
      signal_type: str(ev.signal_type),
      sentiment: str(ev.sentiment),
      unusual_score: num(ev.unusual_score),
      executed_at: executedAt,
      trade_date: etDateOf(executedAt),
    });
  }
  return dedupeById(rows);
}

// ── Signa scan_symbols ───────────────────────────────────────────────────────

export interface SignaScanRow {
  symbol: string;
  trade_date: string;
  direction: string;
  signal: string | null;
  score: number | null;
  grade: string | null;
  confidence: number | null;
  model_count: number | null;
  reasons: string[];
  captured_at: string;
}

export function parseSignaScan(payload: unknown, tradeDate: string, now = new Date()): SignaScanRow[] {
  const results = (payload as Raw | null)?.results;
  if (!Array.isArray(results)) return [];
  const rows = new Map<string, SignaScanRow>();
  for (const r of results as Raw[]) {
    const symbol = str(r.ticker ?? r.symbol)?.toUpperCase();
    const direction = str(r.direction)?.toUpperCase();
    if (!symbol || !direction) continue;
    rows.set(`${symbol}|${direction}`, {
      symbol,
      trade_date: tradeDate,
      direction,
      signal: str(r.signal),
      score: num(r.score),
      grade: str(r.grade),
      confidence: num(r.confidence),
      model_count: num(r.model_count),
      reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : [],
      captured_at: now.toISOString(),
    });
  }
  return [...rows.values()];
}
