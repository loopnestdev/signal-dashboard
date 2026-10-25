import { describe, it, expect } from 'vitest';
import { marketStates, modeledIv, modeledQuote, runLeapsBacktest, summarizeLeaps, type LeapsHistory, type Series } from '../../leaps/backtest.js';
import type { QuarterFacts } from '../../leaps/quality.js';

// Weekday calendar (holidays do not matter for the engine) starting 2019-01-01.
function weekdays(n: number): string[] {
  const out: string[] = [];
  for (let d = new Date('2019-01-01T12:00:00Z'); out.length < n; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Zig-zag noise (+/-a%) around a path given as daily drift per segment, so realized vol is steady and known.
function path(n: number, noise: number, drift: (i: number) => number): number[] {
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + drift(i)) * (i % 2 ? 1 + noise : 1 - noise));
  return out;
}

const N = 700;
const dates = weekdays(N);
// Up for 300 sessions, then a 15-session slide, flat, then a strong 200-session recovery.
const drift = (scale: number) => (i: number) => (i < 300 ? 0.0005 : i < 315 ? -0.012 * scale : i < 330 ? 0 : i < 530 ? 0.003 * scale : 0);
const spy: Series = { dates, closes: path(N, 0.006, drift(1)) };

const quarters: QuarterFacts[] = [];
for (let y = 2017; y <= 2021; y++) {
  for (const [m, d] of [['03', '31'], ['06', '30'], ['09', '30'], ['12', '31']]) {
    quarters.push({ period_end: `${y}-${m}-${d}`, revenue: 100 + quarters.length * 5, operating_income: 30, net_income: 20, diluted_shares: 1e9 });
  }
}

const history = (): LeapsHistory => ({
  days: dates.slice(260),
  spy,
  vix: new Map(dates.map(d => [d, 30])),
  vix6m: new Map(dates.map(d => [d, 26])),
  rate: new Map(dates.map(d => [d, 0.03])),
  stocks: [
    { symbol: 'AAA', dates, closes: path(N, 0.009, drift(1.6)), quarters, marketCapNow: 500e9 },
    { symbol: 'TINY', dates, closes: path(N, 0.009, drift(1.6)), quarters, marketCapNow: 20e9 },   // fails market cap
  ],
});

describe('modeledQuote', () => {
  it('puts the ask above and the bid below the Black-Scholes mid', () => {
    const q = modeledQuote(100, 100, 1.5, 0.3, 0.03);
    expect(q.ask - q.mid).toBeCloseTo(q.mid * 0.02, 6);
    expect(q.mid - q.bid).toBeCloseTo(q.mid * 0.02, 6);
    expect(modeledQuote(50, 200, 1.5, 0.2, 0.03).ask).toBeGreaterThanOrEqual(0.05);
  });
});

describe('modeledIv', () => {
  it('maps realized vol to LEAPS IV and scales it with 6-month VIX, clamped', () => {
    expect(modeledIv(0.24, 22)).toBeCloseTo(0.25, 6);
    expect(modeledIv(0.24, null)).toBeCloseTo(0.25, 6);
    expect(modeledIv(0.24, 88)).toBeCloseTo(0.5, 6);         // regime factor 2 (cap)
    expect(modeledIv(0.24, 5)).toBeCloseTo(0.25 * 0.75, 6);  // floor
  });
});

describe('marketStates', () => {
  it('marks the slide as one correction episode', () => {
    const { states, episodes } = marketStates(history());
    expect(episodes).toHaveLength(1);
    expect(episodes[0].maxSpyOffHighPct).toBeGreaterThan(10);
    expect(states.get(dates[290])!.state).toBe('normal');
    expect(states.get(dates[320])!.state).toBe('correction');
    expect(states.get(dates[320])!.episode).toBe(episodes[0].id);
  });
});

describe('runLeapsBacktest', () => {
  for (const book of ['L1', 'L2', 'L3'] as const) {
    it(`${book}: buys the eligible name in the correction, fills next session, and sells half on the recovery`, () => {
      const r = runLeapsBacktest(history(), book, 50_000, 1);
      expect(r.equity[0].equity).toBe(50_000);
      const all = [...r.trades.map(t => ({ symbol: t.symbol, entryDate: t.entryDate, half: t.halfDate != null })),
        ...r.openAtEnd.map(p => ({ symbol: p.symbol, entryDate: p.entryDate, half: p.halfSold }))];
      expect(all.length).toBeGreaterThan(0);
      expect(all.every(t => t.symbol === 'AAA')).toBe(true);
      const signal = [...r.equity].findIndex(e => e.openPositions > 0);
      expect(dates.indexOf(all[0].entryDate)).toBe(dates.indexOf(r.equity[signal].date));
      expect(all.some(t => t.half)).toBe(true);
      expect(r.skips['not eligible: marketCap']).toBeGreaterThan(0);
    });
  }

  it('stays in cash without a down market', () => {
    const calm = history();
    calm.spy = { dates, closes: path(N, 0.006, () => 0.0005) };
    const r = runLeapsBacktest(calm, 'L2', 50_000, 1);
    expect(r.trades).toHaveLength(0);
    expect(r.openAtEnd).toHaveLength(0);
    expect(r.equity.at(-1)!.equity).toBe(50_000);
  });

  it('summarises trades, the half sale split and episodes', () => {
    const r = runLeapsBacktest(history(), 'L2', 50_000, 1);
    const s = summarizeLeaps(r, spy);
    expect(s.sessions).toBe(r.equity.length);
    expect(s.episodes).toHaveLength(1);
    expect(s.halfPnl + s.runnerPnl).toBeCloseTo(s.totalPnl, 0);
    expect(s.spyReturnPct).not.toBeNull();
    expect(s.returnPct).toBeGreaterThan(0);
  });
});
