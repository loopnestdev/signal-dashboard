import { describe, it, expect } from 'vitest';
import { blackScholes, normCdf, yearsBetween } from '../../backtest/pricing.js';
import { isLiquid, payoffAt, pickEntryExpiry, selectContract } from '../../backtest/contracts.js';
import { earningsExitDue, lastCloseBefore, nextTradingDay, reportWithin, tradingDaysBetween } from '../../backtest/earnings.js';
import { atr, bookAExit, bookASignals, bookBExit, bookBSignals, bookCSignals } from '../../backtest/strategies.js';
import { longestLosingStreak, maxDrawdownPct, profitFactor, spyReturnPct } from '../../backtest/metrics.js';
import { tradingDaysInRange } from '../../backtest/data.js';
import { emptyDay, flatBars, quote, signal } from './fixtures.js';
import type { ClosedTrade, Position } from '../../backtest/types.js';

describe('pricing', () => {
  it('normCdf matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it('Black-Scholes satisfies put-call parity and textbook value', () => {
    const [S, K, T, v, r] = [100, 100, 1, 0.2, 0.05];
    const c = blackScholes('CALL', S, K, T, v, r);
    const p = blackScholes('PUT', S, K, T, v, r);
    expect(c).toBeCloseTo(10.45, 2);
    expect(c - p).toBeCloseTo(S - K * Math.exp(-r * T), 6);
  });

  it('collapses to intrinsic at expiry', () => {
    expect(blackScholes('CALL', 110, 100, 0, 0.4)).toBe(10);
    expect(blackScholes('PUT', 110, 100, 0, 0.4)).toBe(0);
  });

  it('measures years between session dates', () => {
    expect(yearsBetween('2026-10-05', '2027-10-05')).toBeCloseTo(1, 2);
  });
});

describe('contract selection (rules 1.6)', () => {
  const q = [
    quote('C100', 100, 4.9, 5.0, 0.5),
    quote('C105', 105, 2.9, 3.0, 0.4),
    quote('C110', 110, 1.0, 1.05, 0.3),
    quote('C115', 115, 0.42, 0.45, 0.2),
  ];

  it('prefers the latest monthly expiry 30-75 days out', () => {
    const exp = [
      quote('a', 100, 1, 1.1, 0.5, { expiry: '2026-11-06' }),
      quote('b', 100, 1, 1.1, 0.5, { expiry: '2026-11-20' }),
      quote('c', 100, 1, 1.1, 0.5, { expiry: '2026-12-04' }),
      quote('d', 100, 1, 1.1, 0.5, { expiry: '2027-01-15' }),
    ];
    expect(pickEntryExpiry(exp, '2026-10-05')).toBe('2026-11-20');
    expect(pickEntryExpiry(exp.filter(x => x.expiry !== '2026-11-20'), '2026-10-05')).toBe('2026-12-04');
    expect(pickEntryExpiry([exp[0]], '2026-10-20')).toBeNull();
  });

  it('picks the single option nearest 0.40 delta within budget', () => {
    const s = selectContract(q, 'BULLISH', 1000, '2026-10-05');
    expect(s).toMatchObject({ ok: true, structure: { kind: 'option', unitCost: 300, legs: [{ contract: 'C105', side: 1 }] } });
  });

  it('falls back to a debit spread with max gain >= 2x cost when singles are too expensive', () => {
    // budget $150: no single near 0.40 fits except C115 ($45) and C110 ($105)... closest-delta fitting single wins
    expect(selectContract(q, 'BULLISH', 150, '2026-10-05')).toMatchObject({ ok: true, structure: { legs: [{ contract: 'C110' }] } });
    // force spread: reject singles via accept()
    const s = selectContract(q, 'BULLISH', 1000, '2026-10-05', st => st.kind === 'spread');
    // buy C100 at $5.00: vs C105 $210 debit / $500 wide and vs C110 $400 / $1,000 both fail 2:1;
    // vs C115 (bid $0.42): $458 debit, $1,500 wide, gain $1,042 >= $916
    expect(s).toMatchObject({ ok: true, structure: { kind: 'spread', unitCost: 458, maxValue: 1500 } });
  });

  it('reports why it skipped', () => {
    expect(selectContract(q, 'BULLISH', 30, '2026-10-05')).toEqual({ ok: false, reason: 'too expensive for account size' });
    expect(selectContract(q, 'BEARISH', 1000, '2026-10-05')).toEqual({ ok: false, reason: 'illiquid' });
    expect(selectContract([], 'BULLISH', 1000, '2026-10-05')).toEqual({ ok: false, reason: 'no expiry 30-75 days out' });
  });

  describe('bearish (puts)', () => {
    // CRWD-style put chain on the Nov 20 monthly, spot ~275; put deltas are negative.
    const puts = [
      quote('P270', 270, 7.0, 7.2, -0.5, { type: 'PUT' }),
      quote('P260', 260, 4.0, 4.1, -0.38, { type: 'PUT' }),
      quote('P250', 250, 1.9, 2.0, -0.2, { type: 'PUT' }),
      quote('C280', 280, 4.0, 4.1, 0.4),
    ];

    it('buys the put nearest 0.40 delta, never a call', () => {
      const s = selectContract(puts, 'BEARISH', 1000, '2026-10-05');
      expect(s).toMatchObject({ ok: true, structure: { kind: 'option', legs: [{ contract: 'P260', type: 'PUT', side: 1 }] } });
      if (s.ok) expect(s.structure.unitCost).toBeCloseTo(410);
    });

    it('builds a bear put spread: long the higher strike, short the next lower one, 2:1 payoff', () => {
      const s = selectContract(puts, 'BEARISH', 1000, '2026-10-05', st => st.kind === 'spread');
      // long P270 at $7.20, short P260 at $4.00: $320 debit, $1,000 wide, max gain $680 >= 2 x $320
      expect(s).toMatchObject({ ok: true, structure: { kind: 'spread', unitCost: 320, maxValue: 1000, legs: [{ contract: 'P270', side: 1 }, { contract: 'P260', side: -1 }] } });
      if (!s.ok) throw new Error('expected a spread');
      expect(payoffAt(s.structure, 280)).toBe(0);
      expect(payoffAt(s.structure, 265)).toBe(500);
      expect(payoffAt(s.structure, 240)).toBe(1000);
    });
  });

  it('filters illiquid quotes (wide spread, low OI, missing delta)', () => {
    expect(isLiquid(quote('x', 100, 1, 1.05, 0.4))).toBe(true);
    expect(isLiquid(quote('x', 100, 1, 1.3, 0.4))).toBe(false);
    expect(isLiquid(quote('x', 100, 1, 1.05, 0.4, { openInterest: 50 }))).toBe(false);
    expect(isLiquid(quote('x', 100, 1, 1.05, 0.4, { delta: null }))).toBe(false);
  });

  it('computes payoff at a target for singles and spreads', () => {
    const spread = { kind: 'spread' as const, unitCost: 300, maxValue: 1000, legs: [
      { contract: 'a', type: 'CALL' as const, strike: 100, expiry: '2026-11-20', side: 1 as const },
      { contract: 'b', type: 'CALL' as const, strike: 110, expiry: '2026-11-20', side: -1 as const },
    ] };
    expect(payoffAt(spread, 105)).toBe(500);
    expect(payoffAt(spread, 130)).toBe(1000);
    expect(payoffAt(spread, 95)).toBe(0);
  });
});

describe('earnings dates (rules 5)', () => {
  it('finds the last close before a report', () => {
    expect(lastCloseBefore({ date: '2026-10-15', time: 'pre-market' })).toBe('2026-10-14');
    expect(lastCloseBefore({ date: '2026-10-19', time: 'pre-market' })).toBe('2026-10-16');
    expect(lastCloseBefore({ date: '2026-10-15', time: 'after-hours' })).toBe('2026-10-15');
    expect(lastCloseBefore({ date: '2026-10-15', time: 'unknown' })).toBe('2026-10-14');
  });

  it('counts trading days and steps over weekends/holidays', () => {
    expect(tradingDaysBetween('2026-10-05', '2026-10-19')).toBe(10);
    expect(tradingDaysBetween('2026-10-19', '2026-10-05')).toBe(0);
    expect(nextTradingDay('2026-11-25')).toBe('2026-11-27');
  });

  it('blocks entries within 10 trading days, including a report today', () => {
    expect(reportWithin([{ date: '2026-10-19', time: 'unknown' }], '2026-10-05')).not.toBeNull();
    expect(reportWithin([{ date: '2026-10-20', time: 'unknown' }], '2026-10-05')).toBeNull();
    expect(reportWithin([{ date: '2026-10-05', time: 'after-hours' }], '2026-10-05')).not.toBeNull();
    expect(reportWithin([{ date: '2026-10-01', time: 'after-hours' }], '2026-10-05')).toBeNull();
  });

  it('signals the exit decision one session before the deadline', () => {
    const pre = [{ date: '2026-10-15', time: 'pre-market' as const }];
    expect(earningsExitDue(pre, '2026-10-12')).toBeNull();
    expect(earningsExitDue(pre, '2026-10-13')).not.toBeNull();   // fills Oct 14, the last close before
    expect(earningsExitDue(pre, '2026-10-15')).toBeNull();       // report already out before the open
    const after = [{ date: '2026-10-15', time: 'after-hours' as const }];
    expect(earningsExitDue(after, '2026-10-14')).not.toBeNull();  // fills Oct 15's close, before the report
    const unknown = [{ date: '2026-10-15', time: 'unknown' as const }];
    expect(earningsExitDue(unknown, '2026-10-12')).toBeNull();
    expect(earningsExitDue(unknown, '2026-10-13')).not.toBeNull(); // v1.1: treated like before-open
    expect(earningsExitDue(unknown, '2026-10-15')).toBeNull();
  });
});

describe('Book signals and exits', () => {
  it('Book A needs grade A/B and agreeing flow or curated conviction >= 60', () => {
    const d = emptyDay('2026-10-05');
    d.signals.set('NVDA', signal('NVDA'));
    d.signals.set('AMD', signal('AMD', { engineGrade: 'C' }));
    d.signals.set('TSLA', signal('TSLA', { engineDirection: 'BEARISH', price: 100, stop: 105 }));
    d.flow.set('NVDA', { callPremium: 1_400_000, putPremium: 1_000_000 });
    d.curated.push({ symbol: 'TSLA', direction: 'BEARISH', conviction: 65 });
    d.gex.set('NVDA', { symbol: 'NVDA', spot: 100, gammaFlip: 98, callWall: 110, putWall: 92 });
    expect(bookASignals(d).map(s => s.symbol)).toEqual(['TSLA']);
    d.flow.set('NVDA', { callPremium: 1_500_000, putPremium: 1_000_000 });
    expect(bookASignals(d).map(s => [s.symbol, s.stop, s.meta.stopSource])).toEqual([['NVDA', 95, 'signa'], ['TSLA', 105, 'signa']]);
  });

  it('Book A uses the GEX wall when Signa\'s stop is on the wrong side', () => {
    const d = emptyDay('2026-10-05');
    d.signals.set('NVDA', signal('NVDA', { stop: 104 }));
    d.flow.set('NVDA', { callPremium: 2, putPremium: 1 });
    d.gex.set('NVDA', { symbol: 'NVDA', spot: 100, gammaFlip: 98, callWall: 110, putWall: 92 });
    expect(bookASignals(d)[0]).toMatchObject({ stop: 92, meta: { stopSource: 'gex wall' } });
  });

  it('Book B check 1 logs each failure reason', () => {
    const d = emptyDay('2026-10-14');
    const cand = { score: 65, confluence: true, optionsBias: 'BULLISH' as const, dpDirection: 'ACCUMULATION', dpSustainedDays: 2, passedFilters: true };
    d.scanner.set('OK', { symbol: 'OK', ...cand });
    d.scanner.set('LOW', { symbol: 'LOW', ...cand, score: 50 });
    d.scanner.set('NOCONF', { symbol: 'NOCONF', ...cand, confluence: false });
    d.scanner.set('SHORT', { symbol: 'SHORT', ...cand, dpSustainedDays: 1 });
    d.scanner.set('MOVED', { symbol: 'MOVED', ...cand });
    const bars = new Map([
      ['OK', flatBars('OK', '2026-10-05', '2026-10-14')],
      ['MOVED', flatBars('MOVED', '2026-10-05', '2026-10-14', 100, { '2026-10-14': { close: 110, high: 110 } })],
    ]);
    const { signals, failures } = bookBSignals(d, bars);
    expect(signals.map(s => s.symbol)).toEqual(['OK']);
    expect(failures).toEqual([
      { symbol: 'NOCONF', reason: 'check 1: no options/dark pool confluence' },
      { symbol: 'SHORT', reason: 'check 1: dark pool sustained < 2 days' },
      { symbol: 'MOVED', reason: 'check 1: already moved > 1 ATR in 5 sessions' },
    ]);
  });

  it('Book C needs Signa levels and price within 2% of entry', () => {
    const d = emptyDay('2026-10-05');
    d.signals.set('AAPL', signal('AAPL', { entry: 100, stop: 95, target: 110 }));
    d.signals.set('MSFT', signal('MSFT', { entry: 100, stop: 95, target: null }));
    const bars = new Map([['AAPL', flatBars('AAPL', '2026-10-05', '2026-10-05', 102)], ['MSFT', flatBars('MSFT', '2026-10-05', '2026-10-05', 100)]]);
    expect(bookCSignals(d, bars).map(s => s.symbol)).toEqual(['AAPL']);
    expect(bookCSignals(d, new Map([['AAPL', flatBars('AAPL', '2026-10-05', '2026-10-05', 102.5)]]))).toEqual([]);
  });

  const pos = (over: Partial<Position> = {}): Position => ({
    id: 1, book: 'A', symbol: 'NVDA', direction: 'BULLISH', kind: 'option', legs: [{ contract: 'c', type: 'CALL', strike: 105, expiry: '2026-11-20', side: 1 }],
    qty: 1, signalDate: '2026-10-05', entryDate: '2026-10-06', unitCost: 300, risk: 300, commissions: 1, maxValue: null,
    stop: 95, target: null, modeledFills: 0, daysHeld: 1, earningsHold: false, shadow: false, shadowOf: null, lastIv: {}, meta: {}, ...over,
  });
  const ctx = (over: Partial<{ close: number; unitValue: number; date: string; dpDirections: string[] }> = {}) =>
    ({ date: '2026-10-08', close: 100, unitValue: 300, day: emptyDay('2026-10-08'), dpDirections: [], ...over });

  it('Book A exits in rule order', () => {
    expect(bookAExit(pos(), ctx({ close: 94 }))).toBe('underlying stop');
    expect(bookAExit(pos(), ctx({ unitValue: 150 }))).toBe('down 50%');
    expect(bookAExit(pos(), ctx({ unitValue: 600 }))).toBe('up 100%');
    expect(bookAExit(pos({ kind: 'spread', maxValue: 1000 }), ctx({ unitValue: 800 }))).toBe('spread at 80% of max');
    expect(bookAExit(pos(), ctx({ date: '2026-10-30' }))).toBe('21 days to expiry');
    const d = emptyDay('2026-10-08');
    d.signals.set('NVDA', signal('NVDA', { engineDirection: 'BEARISH' }));
    expect(bookAExit(pos(), { ...ctx(), day: d })).toBe('Signa flipped');
    expect(bookAExit(pos(), ctx())).toBeNull();
  });

  it('Book B exits on target, -50%, two-session dark pool flip, 21 days', () => {
    const p = pos({ book: 'B', target: 110, stop: null });
    expect(bookBExit(p, ctx({ close: 110 }))).toBe('GEX target reached');
    expect(bookBExit(p, ctx({ unitValue: 140 }))).toBe('down 50%');
    expect(bookBExit(p, ctx({ dpDirections: ['DISTRIBUTION', 'DISTRIBUTION'] }))).toBe('dark pool flipped 2 sessions');
    expect(bookBExit(p, ctx({ dpDirections: ['DISTRIBUTION', 'NEUTRAL'] }))).toBeNull();
  });

  it('ATR needs n+1 bars and uses true range', () => {
    const b = flatBars('X', '2026-10-05', '2026-10-14');
    expect(atr(b, '2026-10-14')).toBeCloseTo(2, 6);
    expect(atr(b.slice(-5), b.at(-1)!.date)).toBeNull();
  });
});

describe('metrics', () => {
  const trade = (pnl: number, exitDate: string): ClosedTrade => ({
    id: 1, book: 'A', symbol: 'X', direction: 'BULLISH', kind: 'option', legs: [], qty: 1, signalDate: exitDate, entryDate: exitDate,
    exitDate, unitCost: 100, exitUnitValue: 100, risk: 100, commissions: 0, pnl, rMultiple: pnl / 100, exitReason: 'x', modeledFills: 0, shadowPnl: null, meta: {},
  });

  it('computes drawdown from the running peak', () => {
    const eq = [10_000, 11_000, 9_900, 10_500, 9_350].map((equity, i) => ({ date: `d${i}`, equity, cash: 0, openRisk: 0, openPositions: 0 }));
    expect(maxDrawdownPct(eq)).toBe(15);
  });

  it('computes profit factor and losing streaks in exit order', () => {
    const t = [trade(300, '2026-10-01'), trade(-100, '2026-10-02'), trade(-50, '2026-10-03'), trade(200, '2026-10-04'), trade(-100, '2026-10-05')];
    expect(profitFactor(t)).toBe(2);
    expect(longestLosingStreak(t)).toBe(2);
    expect(profitFactor([])).toBeNull();
    expect(profitFactor([trade(10, '2026-10-01')])).toBe(Infinity);
  });

  it('measures SPY over the same sessions', () => {
    const spy = flatBars('SPY', '2026-10-05', '2026-10-09', 100, { '2026-10-09': { close: 102 } });
    expect(spyReturnPct(spy, '2026-10-05', '2026-10-09')).toBe(2);
  });

  it('lists trading days in a range', () => {
    expect(tradingDaysInRange('2026-11-24', '2026-11-30')).toEqual(['2026-11-24', '2026-11-25', '2026-11-27', '2026-11-30']);
  });
});
