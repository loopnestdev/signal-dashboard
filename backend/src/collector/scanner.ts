// Flow scanner - port of Radon scripts/discover.py (market-wide mode).
// Pure functions only; the job in jobs.ts does the I/O.
//
// Radon pipeline: large flow prints -> aggregate per ticker -> validate with dark pool -> 0-100 edge score.
// Deviations from Radon (Signa data, swing horizon):
//   - Discovery feed is Signa get_raw_flow (UW executions >= min premium), not UW flow-alerts pages
//   - Prints under SCANNER_MIN_DTE days are ignored: 0DTE lottery flow says little about a multi-week swing
//   - Dark pool comes from our own dp_daily history (Signa serves only the latest 50 prints per call)
//   - Extra filters (price, total premium, optional open interest) before promotion

export type OptionsBias = 'BULLISH' | 'BEARISH' | 'MIXED';
export type DpDirection = 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | 'NO_DATA';

export interface ScannerConfig {
  minPremium: number;
  minDte: number;
  minAlerts: number;
  minTotalPremium: number;
  minPrice: number;
  minOpenInterest: number;
  promoteScore: number;
  maxPromoted: number;
  dpLookupsPerRun: number;
  promotionDays: number;
}

const envNum = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== '' && process.env[key] !== undefined ? v : fallback;
};

export function scannerConfig(): ScannerConfig {
  return {
    minPremium: envNum('SCANNER_MIN_PREMIUM', 500_000),
    minDte: envNum('SCANNER_MIN_DTE', 7),
    minAlerts: envNum('SCANNER_MIN_ALERTS', 2),
    minTotalPremium: envNum('SCANNER_MIN_TOTAL_PREMIUM', 1_000_000),
    minPrice: envNum('SCANNER_MIN_PRICE', 10),
    // Off by default: low OI on a large print usually marks a new opening position, which vol/OI already rewards.
    // Option liquidity is checked at trade time from recorded option quotes instead.
    minOpenInterest: envNum('SCANNER_MIN_OPEN_INTEREST', 0),
    // Promotion only starts data collection. New names cap near 69 (1 sustained day), so the bar sits below that;
    // the backtest decides the actual trade threshold.
    promoteScore: envNum('SCANNER_PROMOTE_SCORE', 45),
    maxPromoted: envNum('SCANNER_MAX_PROMOTED', 12),
    dpLookupsPerRun: envNum('SCANNER_DP_LOOKUPS', 10),
    promotionDays: envNum('SCANNER_PROMOTION_DAYS', 14),
  };
}

// Radon discover.py index_symbols - index options are not single-stock swing candidates.
export const INDEX_SYMBOLS = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'DJX', 'OEX', 'XSP']);

// ── Flow aggregation (Radon _aggregate_alerts) ───────────────────────────────

export interface FlowPrint {
  symbol: string;
  option_type: 'CALL' | 'PUT';
  premium: number;
  dte: number | null;
  vol_oi_ratio: number | null;
  is_sweep: boolean;
  open_interest: number | null;
  underlying_price: number | null;
  executed_at: string;
}

export interface FlowAggregate {
  symbol: string;
  alerts: number;
  calls: number;
  puts: number;
  sweeps: number;
  totalPremium: number;
  volOiRatios: number[];
  maxOpenInterest: number;
  underlyingPrice: number | null;
}

export function aggregateFlow(prints: FlowPrint[], cfg: Pick<ScannerConfig, 'minPremium' | 'minDte'>): Map<string, FlowAggregate> {
  const out = new Map<string, FlowAggregate>();
  const latestAt = new Map<string, string>();
  for (const p of prints) {
    if (p.premium < cfg.minPremium) continue;
    if (p.dte !== null && p.dte < cfg.minDte) continue;
    const a = out.get(p.symbol) ?? {
      symbol: p.symbol, alerts: 0, calls: 0, puts: 0, sweeps: 0, totalPremium: 0,
      volOiRatios: [], maxOpenInterest: 0, underlyingPrice: null,
    };
    a.alerts++;
    a.totalPremium += p.premium;
    if (p.option_type === 'CALL') a.calls++; else a.puts++;
    if (p.is_sweep) a.sweeps++;
    if (p.vol_oi_ratio && p.vol_oi_ratio > 0) a.volOiRatios.push(p.vol_oi_ratio);
    a.maxOpenInterest = Math.max(a.maxOpenInterest, p.open_interest ?? 0);
    if (p.underlying_price && p.executed_at >= (latestAt.get(p.symbol) ?? '')) {
      a.underlyingPrice = p.underlying_price;
      latestAt.set(p.symbol, p.executed_at);
    }
    out.set(p.symbol, a);
  }
  return out;
}

// Radon _build_candidate: bias from call vs put print counts, 1.5x either way.
export function optionsBias(calls: number, puts: number): OptionsBias {
  if (calls > puts * 1.5) return 'BULLISH';
  if (puts > calls * 1.5) return 'BEARISH';
  return 'MIXED';
}

// ── Dark pool (Radon analyze_darkpool_day + fetch_darkpool_multi) ─────────────
// Works on per-session buy/sell volumes (signal.dp_daily), which carry exactly what Radon's per-day analysis uses.

export interface DpDayVolume {
  trade_date: string;
  buy_volume: number;
  sell_volume: number;
  num_prints: number;
}

export interface DpAnalysis {
  buyRatio: number | null;
  direction: DpDirection;
  strength: number;
  prints: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function analyzeDpVolumes(buy: number, sell: number, prints: number): DpAnalysis {
  const total = buy + sell;
  if (prints === 0 || total === 0) return { buyRatio: null, direction: 'NO_DATA', strength: 0, prints };
  const ratio = buy / total;
  if (ratio >= 0.55) return { buyRatio: round4(ratio), direction: 'ACCUMULATION', strength: round1(Math.min((ratio - 0.5) * 200, 100)), prints };
  if (ratio <= 0.45) return { buyRatio: round4(ratio), direction: 'DISTRIBUTION', strength: round1(Math.min((0.5 - ratio) * 200, 100)), prints };
  return { buyRatio: round4(ratio), direction: 'NEUTRAL', strength: 0, prints };
}

export interface DpMulti {
  aggregate: DpAnalysis;
  sustainedDays: number;
  totalPrints: number;
}

// Days are given newest first; sustained = consecutive sessions matching the newest session's direction.
export function analyzeDpMulti(daily: DpDayVolume[], days: string[]): DpMulti {
  const byDate = new Map(daily.map(d => [d.trade_date, d]));
  const perDay = days
    .map(d => byDate.get(d))
    .filter((d): d is DpDayVolume => d !== undefined && d.num_prints > 0)
    .map(d => analyzeDpVolumes(d.buy_volume, d.sell_volume, d.num_prints));
  let sustained = 0;
  const first = perDay[0]?.direction;
  if (first === 'ACCUMULATION' || first === 'DISTRIBUTION') {
    sustained = 1;
    for (const d of perDay.slice(1)) {
      if (d.direction !== first) break;
      sustained++;
    }
  }
  const inWindow = daily.filter(d => days.includes(d.trade_date));
  return {
    aggregate: analyzeDpVolumes(
      inWindow.reduce((s, d) => s + d.buy_volume, 0),
      inWindow.reduce((s, d) => s + d.sell_volume, 0),
      inWindow.reduce((s, d) => s + d.num_prints, 0),
    ),
    sustainedDays: sustained,
    totalPrints: perDay.reduce((s, d) => s + d.prints, 0),
  };
}

// ── Score (Radon calculate_score) ────────────────────────────────────────────

export const WEIGHTS = { dp_strength: 30, dp_sustained: 20, confluence: 20, vol_oi: 15, sweeps: 15 } as const;

export interface ScoreBreakdown {
  dp_strength: number;
  dp_sustained: number;
  confluence: number;
  vol_oi: number;
  sweeps: number;
}

export function volOiScore(ratio: number): number {
  if (ratio <= 1) return 0;
  if (ratio <= 2) return (ratio - 1) * 50;
  if (ratio <= 4) return 50 + (ratio - 2) * 25;
  return 100;
}

export function calculateScore(input: {
  dpStrength: number;
  dpSustained: number;
  confluence: boolean;
  avgVolOi: number;
  sweeps: number;
}): { total: number; weighted: ScoreBreakdown } {
  const raw: ScoreBreakdown = {
    dp_strength: Math.min(input.dpStrength, 100),
    dp_sustained: Math.min(input.dpSustained * 20, 100),
    confluence: input.confluence ? 100 : 0,
    vol_oi: volOiScore(input.avgVolOi),
    sweeps: input.sweeps === 0 ? 0 : input.sweeps === 1 ? 50 : 100,
  };
  const r1 = round1;
  const weighted: ScoreBreakdown = {
    dp_strength: r1(raw.dp_strength * WEIGHTS.dp_strength / 100),
    dp_sustained: r1(raw.dp_sustained * WEIGHTS.dp_sustained / 100),
    confluence: r1(raw.confluence * WEIGHTS.confluence / 100),
    vol_oi: r1(raw.vol_oi * WEIGHTS.vol_oi / 100),
    sweeps: r1(raw.sweeps * WEIGHTS.sweeps / 100),
  };
  const total = r1(Object.values(raw).reduce((s, v, i) => s + v * Object.values(WEIGHTS)[i] / 100, 0));
  return { total, weighted };
}

// ── Candidate ────────────────────────────────────────────────────────────────

export interface Candidate {
  symbol: string;
  score: number;
  breakdown: ScoreBreakdown;
  options_bias: OptionsBias;
  dp_direction: DpDirection;
  dp_strength: number;
  dp_buy_ratio: number | null;
  dp_sustained_days: number;
  confluence: boolean;
  alerts: number;
  calls: number;
  puts: number;
  sweeps: number;
  avg_vol_oi: number;
  total_premium: number;
  underlying_price: number | null;
  max_open_interest: number;
}

export function buildCandidate(flow: FlowAggregate, dp: DpMulti): Candidate {
  const bias = optionsBias(flow.calls, flow.puts);
  const confluence =
    (bias === 'BULLISH' && dp.aggregate.direction === 'ACCUMULATION') ||
    (bias === 'BEARISH' && dp.aggregate.direction === 'DISTRIBUTION');
  const avgVolOi = flow.volOiRatios.length
    ? flow.volOiRatios.reduce((s, v) => s + v, 0) / flow.volOiRatios.length
    : 0;
  const { total, weighted } = calculateScore({
    dpStrength: dp.aggregate.strength,
    dpSustained: dp.sustainedDays,
    confluence,
    avgVolOi,
    sweeps: flow.sweeps,
  });
  return {
    symbol: flow.symbol,
    score: total,
    breakdown: weighted,
    options_bias: bias,
    dp_direction: dp.aggregate.direction,
    dp_strength: dp.aggregate.strength,
    dp_buy_ratio: dp.aggregate.buyRatio,
    dp_sustained_days: dp.sustainedDays,
    confluence,
    alerts: flow.alerts,
    calls: flow.calls,
    puts: flow.puts,
    sweeps: flow.sweeps,
    avg_vol_oi: Math.round(avgVolOi * 100) / 100,
    total_premium: flow.totalPremium,
    underlying_price: flow.underlyingPrice,
    max_open_interest: flow.maxOpenInterest,
  };
}

// Tradeability gate; returns the first failing reason or null.
export function rejectReason(c: Candidate, cfg: ScannerConfig): string | null {
  if (INDEX_SYMBOLS.has(c.symbol)) return 'index option';
  if (c.alerts < cfg.minAlerts) return `fewer than ${cfg.minAlerts} large prints`;
  if (c.total_premium < cfg.minTotalPremium) return `premium under $${(cfg.minTotalPremium / 1e6).toFixed(1)}M`;
  if (c.underlying_price === null || c.underlying_price < cfg.minPrice) return `price under $${cfg.minPrice}`;
  if (cfg.minOpenInterest > 0 && c.max_open_interest < cfg.minOpenInterest) return `open interest under ${cfg.minOpenInterest}`;
  if (c.dp_direction === 'NO_DATA') return 'no dark pool data yet';
  return null;
}

// ── Promotion ────────────────────────────────────────────────────────────────

export interface ScannerSlot {
  symbol: string;
  score: number;      // latest known score
  expiresAt: string;  // YYYY-MM-DD
}

export interface PromotionPlan {
  keep: ScannerSlot[];     // promoted symbols after this run (new + refreshed + still-valid)
  demote: string[];        // scanner symbols to deactivate (expired or squeezed out by the cap)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// planPromotions:
//   - Qualifying candidates (passed filters, score >= threshold, not core) are added or have their expiry refreshed
//   - Existing scanner symbols past expires_at are demoted
//   - When over the cap, the lowest scores are demoted so the Signa budget stays bounded
export function planPromotions(
  qualifying: Candidate[],
  current: ScannerSlot[],
  coreSymbols: Set<string>,
  today: string,
  cfg: Pick<ScannerConfig, 'maxPromoted' | 'promotionDays'>,
): PromotionPlan {
  const expiry = addDays(today, cfg.promotionDays);
  const slots = new Map<string, ScannerSlot>();
  const demote = new Set<string>();

  for (const s of current) {
    if (s.expiresAt < today) demote.add(s.symbol);
    else slots.set(s.symbol, s);
  }
  for (const c of qualifying) {
    if (coreSymbols.has(c.symbol)) continue;
    slots.set(c.symbol, { symbol: c.symbol, score: c.score, expiresAt: expiry });
    demote.delete(c.symbol);
  }

  const ranked = [...slots.values()].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const keep = ranked.slice(0, Math.max(0, cfg.maxPromoted));
  for (const s of ranked.slice(keep.length)) demote.add(s.symbol);
  return { keep, demote: [...demote].sort() };
}
