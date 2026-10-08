import { describe, expect, it } from 'vitest';
import { callShare, classify, DEFAULT_FLOW_STUDY, forwardReturn, isSurge, runFlowStudy, type FlowDay } from '../../backtest/flowStudy.js';
import type { Bar } from '../../backtest/types.js';

const day = (symbol: string, date: string, call: number, put: number): FlowDay => ({ symbol, date, callPremium: call, putPremium: put });
const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close });
const M = 1_000_000;

describe('classify', () => {
  it('buckets by call share of premium, at the 75% default', () => {
    expect(classify(day('MU', '2026-10-07', 3 * M, 1 * M), DEFAULT_FLOW_STUDY)).toBe('call-heavy');
    expect(classify(day('MU', '2026-10-07', 1 * M, 3 * M), DEFAULT_FLOW_STUDY)).toBe('put-heavy');
    expect(classify(day('MU', '2026-10-07', 2 * M, 2 * M), DEFAULT_FLOW_STUDY)).toBe('mixed');
  });

  it('ignores days below the minimum premium or with no flow', () => {
    expect(classify(day('MU', '2026-10-07', 600_000, 100_000), DEFAULT_FLOW_STUDY)).toBeNull();
    expect(classify(day('MU', '2026-10-07', 0, 0), DEFAULT_FLOW_STUDY)).toBeNull();
    expect(callShare(day('MU', '2026-10-07', 0, 0))).toBeNull();
  });
});

describe('forwardReturn', () => {
  const bars = [bar('2026-10-05', 100), bar('2026-10-06', 110), bar('2026-10-07', 99)];

  it('measures close to close n sessions later', () => {
    expect(forwardReturn(bars, '2026-10-05', 1)).toBeCloseTo(0.1);
    expect(forwardReturn(bars, '2026-10-05', 2)).toBeCloseTo(-0.01);
  });

  it('is null when the horizon is incomplete or the date has no bar', () => {
    expect(forwardReturn(bars, '2026-10-06', 2)).toBeNull();
    expect(forwardReturn(bars, '2026-10-04', 1)).toBeNull();
  });
});

describe('isSurge', () => {
  const history = [4, 2, 3, 5, 1].map((m, i) => day('MU', `2026-09-2${i}`, m * M, 0));

  it('compares with the median of earlier days (2x by default)', () => {
    expect(isSurge(day('MU', '2026-10-07', 6 * M, 0), history, DEFAULT_FLOW_STUDY)).toBe(true);
    expect(isSurge(day('MU', '2026-10-07', 5 * M, 0), history, DEFAULT_FLOW_STUDY)).toBe(false);
  });

  it('needs enough history to judge', () => {
    expect(isSurge(day('MU', '2026-10-07', 50 * M, 0), history.slice(0, 4), DEFAULT_FLOW_STUDY)).toBeNull();
  });
});

describe('runFlowStudy', () => {
  // MU: call-heavy then +10%; AMD: put-heavy then -5%; AAPL: mixed then flat.
  const days = [
    day('MU', '2026-10-05', 3 * M, 1 * M),
    day('AMD', '2026-10-05', 1 * M, 4 * M),
    day('AAPL', '2026-10-05', 2 * M, 2 * M),
    day('AAPL', '2026-10-06', 100, 0),
  ];
  const bars = new Map([
    ['MU', [bar('2026-10-05', 100), bar('2026-10-06', 110)]],
    ['AMD', [bar('2026-10-05', 100), bar('2026-10-06', 95)]],
    ['AAPL', [bar('2026-10-05', 100), bar('2026-10-06', 100)]],
  ]);
  const r = runFlowStudy(days, bars, { ...DEFAULT_FLOW_STUDY, horizons: [1, 5] });
  const group = (g: string) => r.groups.find(x => x.group === g)!;

  it('compares each bucket with all flow days', () => {
    expect(r).toMatchObject({ from: '2026-10-05', to: '2026-10-06', symbols: 3, flowDays: 3, minSample: 30 });
    expect(group('all').stats[0]).toEqual({ horizon: 1, n: 3, meanPct: 1.67, upPct: 33.33, vsAllPct: 0 });
    expect(group('call-heavy').stats[0]).toEqual({ horizon: 1, n: 1, meanPct: 10, upPct: 100, vsAllPct: 8.33 });
    expect(group('put-heavy').stats[0]).toEqual({ horizon: 1, n: 1, meanPct: -5, upPct: 0, vsAllPct: -6.67 });
  });

  it('leaves incomplete horizons out', () => {
    expect(group('all').stats[1]).toEqual({ horizon: 5, n: 0, meanPct: null, upPct: null, vsAllPct: null });
  });

  it('lists heavy days only, newest and largest first', () => {
    expect(r.events.map(e => `${e.symbol} ${e.bucket}`)).toEqual(['AMD put-heavy', 'MU call-heavy']);
    expect(r.events[0]).toMatchObject({ callShare: 20, totalPremium: 5 * M, surge: null, forward: { 1: -5, 5: null } });
  });
});
