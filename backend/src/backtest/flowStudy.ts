import type { Bar } from './types.js';

// Flow study: after a ticker's options flow is heavily one-sided (mostly calls, or mostly puts), what did the stock
// do next? Compares forward returns on those days with every flow day, so a "bullish-looking" day only counts as
// a signal if it beats the ordinary day. Uses the collector's daily flow-alert premium (signal.flow_daily).

export interface FlowDay {
  symbol: string;
  date: string;
  callPremium: number;
  putPremium: number;
}

export interface FlowStudyConfig {
  heavyShare: number;    // call share >= this = call-heavy; <= 1 - this = put-heavy
  minPremium: number;    // ignore days with less total flow premium (too little to mean anything)
  surgeMultiple: number; // "surge" = total premium >= this x the ticker's median of its earlier days
  surgeMinHistory: number;
  horizons: number[];    // trading sessions after the flow day's close
}

export const DEFAULT_FLOW_STUDY: FlowStudyConfig = {
  heavyShare: 0.75,
  minPremium: 1_000_000,
  surgeMultiple: 2,
  surgeMinHistory: 5,
  horizons: [1, 5, 10, 20],
};

export const MIN_SAMPLE = 30;
const SURGE_LOOKBACK = 20;

export type Bucket = 'call-heavy' | 'put-heavy' | 'mixed';
export type Group = 'all' | Bucket | 'call-heavy surge' | 'put-heavy surge';

export const callShare = (d: FlowDay): number | null => {
  const total = d.callPremium + d.putPremium;
  return total > 0 ? d.callPremium / total : null;
};

export function classify(d: FlowDay, cfg: FlowStudyConfig): Bucket | null {
  const share = callShare(d);
  if (share == null || d.callPremium + d.putPremium < cfg.minPremium) return null;
  if (share >= cfg.heavyShare) return 'call-heavy';
  if (share <= 1 - cfg.heavyShare) return 'put-heavy';
  return 'mixed';
}

// Close of `date` to the close `n` sessions later; null when the date has no bar or the horizon is not complete yet.
export function forwardReturn(bars: Bar[], date: string, n: number): number | null {
  const i = bars.findIndex(b => b.date === date);
  if (i < 0 || i + n >= bars.length) return null;
  return bars[i + n].close / bars[i].close - 1;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Unusually large flow for this ticker: total premium >= multiple x the median of its previous (up to 20) flow days.
// null until the ticker has enough history to judge.
export function isSurge(day: FlowDay, earlier: FlowDay[], cfg: FlowStudyConfig): boolean | null {
  const prior = earlier.slice(-SURGE_LOOKBACK).map(d => d.callPremium + d.putPremium);
  if (prior.length < cfg.surgeMinHistory) return null;
  return day.callPremium + day.putPremium >= cfg.surgeMultiple * median(prior);
}

export interface HorizonStat {
  horizon: number;
  n: number;
  meanPct: number | null;
  upPct: number | null;      // share of cases where the stock rose
  vsAllPct: number | null;   // mean minus the "all" group's mean at the same horizon
}

export interface StudyEvent {
  symbol: string;
  date: string;
  bucket: Bucket;
  callShare: number;
  totalPremium: number;
  surge: boolean | null;
  forward: Record<number, number | null>;
}

export interface FlowStudyResult {
  config: FlowStudyConfig;
  from: string | null;
  to: string | null;
  symbols: number;
  flowDays: number;
  minSample: number;
  groups: Array<{ group: Group; days: number; stats: HorizonStat[] }>;
  events: StudyEvent[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function runFlowStudy(days: FlowDay[], bars: Map<string, Bar[]>, cfg: FlowStudyConfig = DEFAULT_FLOW_STUDY): FlowStudyResult {
  const bySymbol = new Map<string, FlowDay[]>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    bySymbol.set(d.symbol, [...(bySymbol.get(d.symbol) ?? []), d]);
  }

  const events: StudyEvent[] = [];
  for (const [symbol, list] of bySymbol) {
    const symbolBars = bars.get(symbol) ?? [];
    list.forEach((d, i) => {
      const bucket = classify(d, cfg);
      if (!bucket) return;
      events.push({
        symbol, date: d.date, bucket,
        callShare: r2(callShare(d)! * 100),
        totalPremium: Math.round(d.callPremium + d.putPremium),
        surge: isSurge(d, list.slice(0, i), cfg),
        forward: Object.fromEntries(cfg.horizons.map(h => {
          const f = forwardReturn(symbolBars, d.date, h);
          return [h, f == null ? null : r2(f * 100)];
        })),
      });
    });
  }

  const members: Record<Group, StudyEvent[]> = {
    all: events,
    'call-heavy': events.filter(e => e.bucket === 'call-heavy'),
    'put-heavy': events.filter(e => e.bucket === 'put-heavy'),
    mixed: events.filter(e => e.bucket === 'mixed'),
    'call-heavy surge': events.filter(e => e.bucket === 'call-heavy' && e.surge === true),
    'put-heavy surge': events.filter(e => e.bucket === 'put-heavy' && e.surge === true),
  };

  const statsFor = (list: StudyEvent[], h: number) => {
    const xs = list.map(e => e.forward[h]).filter((x): x is number => x != null);
    return {
      n: xs.length,
      mean: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null,
      up: xs.length ? xs.filter(x => x > 0).length / xs.length * 100 : null,
    };
  };

  const groups = (Object.keys(members) as Group[]).map(group => ({
    group,
    days: members[group].length,
    stats: cfg.horizons.map(h => {
      const s = statsFor(members[group], h);
      const base = statsFor(events, h).mean;
      return {
        horizon: h,
        n: s.n,
        meanPct: s.mean == null ? null : r2(s.mean),
        upPct: s.up == null ? null : r2(s.up),
        vsAllPct: s.mean == null || base == null ? null : r2(s.mean - base),
      };
    }),
  }));

  const dates = days.map(d => d.date).sort();
  return {
    config: cfg,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    symbols: bySymbol.size,
    flowDays: events.length,
    minSample: MIN_SAMPLE,
    groups,
    events: events.filter(e => e.bucket !== 'mixed').sort((a, b) => b.date.localeCompare(a.date) || b.totalPremium - a.totalPremium).slice(0, 40),
  };
}
