import { describe, it, expect } from 'vitest';
import {
  addDays, aggregateFlow, analyzeDpMulti, analyzeDpVolumes, buildCandidate, calculateScore,
  optionsBias, planPromotions, rejectReason, volOiScore,
  type Candidate, type FlowPrint, type ScannerConfig,
} from '../../collector/scanner.js';
import { parseRawFlow, parseSignaScan } from '../../collector/parsers.js';
import { recentTradingDays } from '../../lib/marketCalendar.js';

const cfg: ScannerConfig = {
  minPremium: 500_000, minDte: 7, minAlerts: 2, minTotalPremium: 1_000_000, minPrice: 10,
  minOpenInterest: 1_000, promoteScore: 60, maxPromoted: 2, dpLookupsPerRun: 10, promotionDays: 14,
};

const print = (over: Partial<FlowPrint> = {}): FlowPrint => ({
  symbol: 'AMD', option_type: 'CALL', premium: 600_000, dte: 30, vol_oi_ratio: 3, is_sweep: false,
  open_interest: 5_000, underlying_price: 160, executed_at: '2026-10-05T15:00:00Z', ...over,
});

describe('aggregateFlow', () => {
  it('counts calls, puts, sweeps and premium per symbol', () => {
    const agg = aggregateFlow([
      print(), print({ option_type: 'PUT', is_sweep: true }), print({ symbol: 'TSM' }),
    ], cfg).get('AMD')!;
    expect(agg).toMatchObject({ alerts: 2, calls: 1, puts: 1, sweeps: 1, totalPremium: 1_200_000, maxOpenInterest: 5_000 });
  });

  it('drops prints under the premium floor or the minimum DTE', () => {
    const agg = aggregateFlow([print({ premium: 499_999 }), print({ dte: 6 }), print({ dte: null })], cfg).get('AMD')!;
    expect(agg.alerts).toBe(1);
  });

  it('keeps the underlying price of the latest print and ignores zero vol/oi', () => {
    const agg = aggregateFlow([
      print({ underlying_price: 170, executed_at: '2026-10-05T19:00:00Z', vol_oi_ratio: 0 }),
      print({ underlying_price: 150, executed_at: '2026-10-05T14:00:00Z' }),
    ], cfg).get('AMD')!;
    expect(agg.underlyingPrice).toBe(170);
    expect(agg.volOiRatios).toEqual([3]);
  });
});

describe('optionsBias (Radon 1.5x rule on print counts)', () => {
  it('classifies bias', () => {
    expect(optionsBias(4, 2)).toBe('BULLISH');
    expect(optionsBias(3, 2)).toBe('MIXED');
    expect(optionsBias(1, 2)).toBe('BEARISH');
    expect(optionsBias(1, 0)).toBe('BULLISH');
    expect(optionsBias(0, 0)).toBe('MIXED');
  });
});

describe('analyzeDpVolumes (Radon analyze_darkpool_day)', () => {
  it('maps buy ratio to direction and 0-100 strength', () => {
    expect(analyzeDpVolumes(70, 30, 10)).toEqual({ buyRatio: 0.7, direction: 'ACCUMULATION', strength: 40, prints: 10 });
    expect(analyzeDpVolumes(20, 80, 10)).toEqual({ buyRatio: 0.2, direction: 'DISTRIBUTION', strength: 60, prints: 10 });
    expect(analyzeDpVolumes(52, 48, 10)).toMatchObject({ direction: 'NEUTRAL', strength: 0 });
  });

  it('treats the 55% / 45% boundaries as directional', () => {
    expect(analyzeDpVolumes(55, 45, 2).direction).toBe('ACCUMULATION');
    expect(analyzeDpVolumes(45, 55, 2).direction).toBe('DISTRIBUTION');
  });

  it('returns NO_DATA without prints or classified volume', () => {
    expect(analyzeDpVolumes(0, 0, 0).direction).toBe('NO_DATA');
    expect(analyzeDpVolumes(0, 0, 5).direction).toBe('NO_DATA');
  });
});

describe('analyzeDpMulti', () => {
  const days = ['2026-10-07', '2026-10-06', '2026-10-05'];
  const day = (trade_date: string, buy: number, sell: number) => ({ trade_date, buy_volume: buy, sell_volume: sell, num_prints: 10 });

  it('counts consecutive sessions in the newest direction', () => {
    const r = analyzeDpMulti([day('2026-10-07', 80, 20), day('2026-10-06', 70, 30), day('2026-10-05', 20, 80)], days);
    expect(r.sustainedDays).toBe(2);
    expect(r.aggregate.buyRatio).toBe(0.5667);
    expect(r.totalPrints).toBe(30);
  });

  it('is 0 when the newest session is neutral and skips missing days', () => {
    expect(analyzeDpMulti([day('2026-10-07', 50, 50), day('2026-10-06', 90, 10)], days).sustainedDays).toBe(0);
    expect(analyzeDpMulti([day('2026-10-06', 90, 10), day('2026-10-05', 90, 10)], days).sustainedDays).toBe(2);
  });

  it('ignores rows outside the window', () => {
    expect(analyzeDpMulti([day('2026-09-01', 90, 10)], days).aggregate.direction).toBe('NO_DATA');
  });
});

describe('scannerConfig defaults', () => {
  it('promotes at 45 with the open interest filter off', async () => {
    const { scannerConfig } = await import('../../collector/scanner.js');
    expect(scannerConfig()).toMatchObject({ promoteScore: 45, minOpenInterest: 0, maxPromoted: 12, minPremium: 500_000, minDte: 7 });
  });
});

describe('calculateScore (Radon weights 30/20/20/15/15)', () => {
  it('scores vol/oi on the piecewise scale', () => {
    expect([0.5, 1.5, 2, 3, 4, 9].map(volOiScore)).toEqual([0, 25, 50, 75, 100, 100]);
  });

  it('gives 100 when every component is maxed', () => {
    expect(calculateScore({ dpStrength: 100, dpSustained: 5, confluence: true, avgVolOi: 5, sweeps: 2 }).total).toBe(100);
  });

  it('weights each component', () => {
    const r = calculateScore({ dpStrength: 40, dpSustained: 2, confluence: true, avgVolOi: 3, sweeps: 1 });
    expect(r.weighted).toEqual({ dp_strength: 12, dp_sustained: 8, confluence: 20, vol_oi: 11.3, sweeps: 7.5 });
    expect(r.total).toBe(58.8);
  });
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  symbol: 'AMD', score: 70, breakdown: { dp_strength: 0, dp_sustained: 0, confluence: 0, vol_oi: 0, sweeps: 0 },
  options_bias: 'BULLISH', dp_direction: 'ACCUMULATION', dp_strength: 40, dp_buy_ratio: 0.7, dp_sustained_days: 1,
  confluence: true, alerts: 3, calls: 3, puts: 0, sweeps: 0, avg_vol_oi: 3, total_premium: 2_000_000,
  underlying_price: 160, max_open_interest: 5_000, ...over,
});

describe('buildCandidate', () => {
  it('flags confluence when options bias and dark pool agree', () => {
    const flow = aggregateFlow([print(), print(), print()], cfg).get('AMD')!;
    const dp = analyzeDpMulti([{ trade_date: '2026-10-05', buy_volume: 70, sell_volume: 30, num_prints: 5 }], ['2026-10-05']);
    const c = buildCandidate(flow, dp);
    expect(c).toMatchObject({ options_bias: 'BULLISH', dp_direction: 'ACCUMULATION', confluence: true, avg_vol_oi: 3, dp_sustained_days: 1 });
    expect(c.score).toBe(12 + 4 + 20 + 11.3);
  });

  it('has no confluence when they disagree', () => {
    const flow = aggregateFlow([print({ option_type: 'PUT' }), print({ option_type: 'PUT' })], cfg).get('AMD')!;
    const dp = analyzeDpMulti([{ trade_date: '2026-10-05', buy_volume: 70, sell_volume: 30, num_prints: 5 }], ['2026-10-05']);
    expect(buildCandidate(flow, dp).confluence).toBe(false);
  });
});

describe('rejectReason', () => {
  it('passes a tradeable candidate', () => {
    expect(rejectReason(candidate(), cfg)).toBeNull();
  });

  it('rejects in order: index, prints, premium, price, open interest, dark pool', () => {
    expect(rejectReason(candidate({ symbol: 'SPXW' }), cfg)).toBe('index option');
    expect(rejectReason(candidate({ alerts: 1 }), cfg)).toMatch(/large prints/);
    expect(rejectReason(candidate({ total_premium: 900_000 }), cfg)).toMatch(/premium/);
    expect(rejectReason(candidate({ underlying_price: 8 }), cfg)).toMatch(/price/);
    expect(rejectReason(candidate({ underlying_price: null }), cfg)).toMatch(/price/);
    expect(rejectReason(candidate({ max_open_interest: 500 }), cfg)).toMatch(/open interest/);
    expect(rejectReason(candidate({ dp_direction: 'NO_DATA' }), cfg)).toMatch(/dark pool/);
  });

  it('skips the open interest check when the minimum is 0', () => {
    expect(rejectReason(candidate({ max_open_interest: 0 }), { ...cfg, minOpenInterest: 0 })).toBeNull();
  });
});

describe('planPromotions', () => {
  const today = '2026-10-05';
  const core = new Set(['NVDA']);

  it('promotes qualifying non-core symbols with an expiry', () => {
    const plan = planPromotions([candidate({ symbol: 'AMD' }), candidate({ symbol: 'NVDA' })], [], core, today, cfg);
    expect(plan.keep).toEqual([{ symbol: 'AMD', score: 70, expiresAt: '2026-10-19' }]);
    expect(plan.demote).toEqual([]);
  });

  it('refreshes an existing slot and demotes expired ones', () => {
    const plan = planPromotions(
      [candidate({ symbol: 'AMD', score: 65 })],
      [{ symbol: 'AMD', score: 80, expiresAt: '2026-10-06' }, { symbol: 'OLD', score: 90, expiresAt: '2026-10-04' }],
      core, today, cfg,
    );
    expect(plan.keep).toEqual([{ symbol: 'AMD', score: 65, expiresAt: '2026-10-19' }]);
    expect(plan.demote).toEqual(['OLD']);
  });

  it('enforces the cap by dropping the lowest scores', () => {
    const plan = planPromotions(
      [candidate({ symbol: 'A', score: 90 }), candidate({ symbol: 'B', score: 61 })],
      [{ symbol: 'C', score: 75, expiresAt: '2026-10-10' }],
      core, today, cfg,
    );
    expect(plan.keep.map(k => k.symbol)).toEqual(['A', 'C']);
    expect(plan.demote).toEqual(['B']);
  });

  it('a requalifying expired symbol is kept, not demoted', () => {
    const plan = planPromotions([candidate({ symbol: 'AMD' })], [{ symbol: 'AMD', score: 70, expiresAt: '2026-10-01' }], core, today, cfg);
    expect(plan.keep.map(k => k.symbol)).toEqual(['AMD']);
    expect(plan.demote).toEqual([]);
  });
});

describe('dates', () => {
  it('adds calendar days', () => {
    expect(addDays('2026-10-05', 14)).toBe('2026-10-19');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('lists recent trading days newest first, skipping weekends and holidays', () => {
    expect(recentTradingDays('2026-10-05', 3)).toEqual(['2026-10-05', '2026-10-02', '2026-10-01']);
    expect(recentTradingDays('2026-11-27', 2)).toEqual(['2026-11-27', '2026-11-25']);
  });
});

describe('parseRawFlow', () => {
  const ev = {
    id: 'e1', symbol: 'amd', option_type: 'CALL', strike: 180, expiry: '2026-11-20', dte: 46, premium_size: 1_694_000,
    volume: 200, open_interest: 6717, volume_oi_ratio: 0.0298, is_sweep: true, is_block: false, iv: 0.45,
    underlying_price: 165, signal_type: 'UNUSUAL_CALL_SWEEP', sentiment: 'BULLISH', unusual_score: 70,
    executed_at: '2026-10-02T20:19:04.561888+00:00',
  };

  it('maps Signa raw flow fields', () => {
    expect(parseRawFlow({ events: [ev] })[0]).toMatchObject({
      id: 'e1', symbol: 'AMD', premium: 1_694_000, vol_oi_ratio: 0.0298, is_sweep: true, dte: 46, trade_date: '2026-10-02',
    });
  });

  it('skips malformed events and dedupes by id', () => {
    expect(parseRawFlow({ events: [ev, ev, { ...ev, id: 'e2', option_type: 'STOCK' }, { ...ev, id: 'e3', executed_at: 'x' }] })).toHaveLength(1);
    expect(parseRawFlow(null)).toEqual([]);
  });
});

describe('parseSignaScan', () => {
  it('maps results and keeps one row per symbol + direction', () => {
    const rows = parseSignaScan({ results: [
      { ticker: 'csx', signal: 'STRONG_BUY', direction: 'BULLISH', score: 72, grade: 'B', confidence: 0.585, model_count: 3, reasons: ['a'] },
      { ticker: 'CSX', direction: 'BULLISH', score: 70 },
      { ticker: 'SHY' },
    ] }, '2026-10-05');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: 'CSX', direction: 'BULLISH', score: 70, trade_date: '2026-10-05', reasons: [] });
  });
});
