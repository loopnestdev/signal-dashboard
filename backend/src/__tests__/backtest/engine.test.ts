import { describe, it, expect } from 'vitest';
import { runBacktest } from '../../backtest/engine.js';
import { DEFAULT_SETTINGS } from '../../lib/settings.js';
import { fakeMarket, flatBars, quote, settingsWith, signal } from './fixtures.js';
import type { DayData } from '../../backtest/types.js';

// NVDA call chain on the Nov 20 monthly: 0.50 / 0.40 / 0.30 delta, priced per share.
function chain(d: DayData, c105: [number, number]) {
  d.quotes.set('NVDA', [
    quote('NVDA261120C00100000', 100, 4.9, 5.0, 0.5),
    quote('NVDA261120C00105000', 105, c105[0], c105[1], 0.4),
    quote('NVDA261120C00110000', 110, 1.0, 1.05, 0.3),
  ]);
}

function bookASetup(d: DayData) {
  if (d.date === '2026-10-05') {
    d.signals.set('NVDA', signal('NVDA'));
    d.flow.set('NVDA', { callPremium: 3_000_000, putPremium: 1_000_000 });
  }
}

describe('runBacktest - Book A option lifecycle', () => {
  it('trades a bearish signal with puts and takes profit at +100%', async () => {
    const putChain = (d: DayData, p95: [number, number]) => d.quotes.set('NVDA', [
      quote('NVDA261120P00100000', 100, 4.9, 5.0, -0.5, { type: 'PUT' }),
      quote('NVDA261120P00095000', 95, p95[0], p95[1], -0.4, { type: 'PUT' }),
      quote('NVDA261120P00090000', 90, 1.0, 1.05, -0.3, { type: 'PUT' }),
    ]);
    const prices: Record<string, [number, number]> = { '2026-10-07': [6.1, 6.2], '2026-10-08': [6.4, 6.5] };
    const data = fakeMarket('2026-10-05', '2026-10-09', d => {
      if (d.date === '2026-10-05') {
        d.signals.set('NVDA', signal('NVDA', { engineDirection: 'BEARISH', stop: 105 }));
        d.flow.set('NVDA', { callPremium: 1_000_000, putPremium: 3_000_000 });
      }
      putChain(d, prices[d.date] ?? [2.9, 3.0]);
    }, { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-09') });

    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);

    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({
      direction: 'BEARISH', kind: 'option', legs: [{ type: 'PUT', strike: 95, side: 1 }], qty: 3,
      entryDate: '2026-10-06', exitDate: '2026-10-08', unitCost: 300, exitUnitValue: 640, exitReason: 'up 100%',
    });
    // (640 - 300) x 3 - $6 commissions
    expect(r.trades[0].pnl).toBe(1014);
  });

  it('buys at the next close ask, exits on -50% at the following close bid, with costs and R', async () => {
    const prices: Record<string, [number, number]> = {
      '2026-10-05': [2.9, 3.0], '2026-10-06': [2.9, 3.0], '2026-10-07': [1.4, 1.5], '2026-10-08': [1.3, 1.4],
    };
    const data = fakeMarket('2026-10-05', '2026-10-09', d => { bookASetup(d); chain(d, prices[d.date] ?? [1.3, 1.4]); },
      { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-09') });

    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);

    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t).toMatchObject({
      symbol: 'NVDA', kind: 'option', qty: 3, signalDate: '2026-10-05', entryDate: '2026-10-06', exitDate: '2026-10-08',
      unitCost: 300, exitUnitValue: 130, risk: 900, commissions: 6, exitReason: 'down 50%',
    });
    // (130 - 300) x 3 - $6 commissions
    expect(t.pnl).toBe(-516);
    expect(t.rMultiple).toBe(-0.57);
    expect(r.equity.at(-1)!.equity).toBe(10_000 - 516);
  });

  it('marks open positions at mid each day and reports them at the end', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-07', d => { bookASetup(d); chain(d, d.date === '2026-10-07' ? [3.9, 4.1] : [2.9, 3.0]); },
      { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-07') });
    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);
    expect(r.trades).toHaveLength(0);
    // 3 contracts marked at mid $400 vs $300 cost, less $3 entry commission
    expect(r.openAtEnd).toEqual([{ symbol: 'NVDA', kind: 'option', direction: 'BULLISH', entryDate: '2026-10-06', unrealizedPnl: 297, risk: 900 }]);
    expect(r.equity.map(e => e.equity)).toEqual([10_000, 10_000 - 900 - 3 + 885, 10_000 - 900 - 3 + 1200]);
  });

  it('skips when the contract became too expensive by the fill', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-07', d => { bookASetup(d); chain(d, d.date === '2026-10-05' ? [2.9, 3.0] : [10.5, 10.6]); },
      { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-07') });
    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);
    expect(r.trades).toHaveLength(0);
    expect(r.openAtEnd).toHaveLength(0);
    expect(r.skips).toEqual([{ date: '2026-10-06', symbol: 'NVDA', reason: 'too expensive at fill' }]);
  });

  it('skips a signal with a report inside the 10-trading-day window', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-07', d => { bookASetup(d); chain(d, [2.9, 3.0]); },
      { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-07') }, { NVDA: [{ date: '2026-10-15', time: 'after-hours' }] });
    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);
    expect(r.skips).toEqual([{ date: '2026-10-05', symbol: 'NVDA', reason: 'earnings window (2026-10-15)' }]);
  });

  it('closes before a report and records what holding through it would have returned', async () => {
    // Pre-market report Tue Oct 20: last close before it is Mon Oct 19, decided at Fri Oct 16's close.
    const data = fakeMarket('2026-10-05', '2026-10-21', d => {
      bookASetup(d);
      chain(d, d.date >= '2026-10-20' ? [5.9, 6.0] : [2.9, 3.0]);
    }, { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-21') }, { NVDA: [{ date: '2026-10-20', time: 'pre-market' }] });

    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ exitDate: '2026-10-19', exitReason: 'earnings 2026-10-20 (pre-market)', exitUnitValue: 290 });
    // Shadow: still open at the end, marked at mid $595 x 3 - $3 entry commission vs $900 cost
    expect(r.trades[0].shadowPnl).toBe(882);
  });

  it('enforces max open trades, logging the missed signal', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-07', d => {
      bookASetup(d);
      chain(d, [2.9, 3.0]);
      if (d.date === '2026-10-05') {
        d.signals.set('AMD', signal('AMD', { engineScore: 60 }));
        d.flow.set('AMD', { callPremium: 2_000_000, putPremium: 0 });
        d.quotes.set('AMD', d.quotes.get('NVDA')!.map(q => ({ ...q, symbol: 'AMD', contract: q.contract.replace('NVDA', 'AMD') })));
      }
    }, { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-07'), AMD: flatBars('AMD', '2026-10-05', '2026-10-07') });

    const r = await runBacktest(data, 'A', settingsWith(s => { s.optionsLimits.maxOpenTrades = 1; }));
    expect(r.openAtEnd.map(p => p.symbol)).toEqual(['NVDA']);
    expect(r.skips).toEqual([{ date: '2026-10-05', symbol: 'AMD', reason: 'limit: max open trades' }]);
  });

  it('caps the budget at the remaining total-open-risk room', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-07', d => { bookASetup(d); chain(d, [2.9, 3.0]); },
      { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-07') });
    // 6% of $10k = $600 room -> 2 contracts at $300 instead of 3
    const r = await runBacktest(data, 'A', settingsWith(s => { s.optionsLimits.maxOpenRiskPct = 6; }));
    expect(r.openAtEnd[0].risk).toBe(600);
  });

  it('prices a held contract with Black-Scholes when its quote is missing, and counts it', async () => {
    const data = fakeMarket('2026-10-05', '2026-10-08', d => {
      bookASetup(d);
      if (d.date !== '2026-10-07') chain(d, [2.9, 3.0]);
    }, { NVDA: flatBars('NVDA', '2026-10-05', '2026-10-08') });
    const r = await runBacktest(data, 'A', DEFAULT_SETTINGS);
    expect(r.modeledMarks).toBe(1);
    expect(r.openAtEnd).toHaveLength(1);
  });
});

describe('runBacktest - Book C shares', () => {
  const cSignal = (d: DayData) => {
    if (d.date === '2026-10-05') d.signals.set('AAPL', signal('AAPL', { entry: 100, stop: 95, target: 110 }));
  };

  it('buys at the next open sized by 1% risk, and stops out intraday', async () => {
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-08', 101, {
      '2026-10-06': { open: 101, high: 102, low: 100, close: 101 },
      '2026-10-07': { open: 96, high: 97, low: 94, close: 95 },
    });
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-08', cSignal, { AAPL: bars }), 'C', DEFAULT_SETTINGS);
    // risk $100 / ($101 - $95) = 16 shares; stop fills at $95 (open $96 was above it)
    expect(r.trades[0]).toMatchObject({ kind: 'shares', qty: 16, entryDate: '2026-10-06', exitDate: '2026-10-07', unitCost: 101, exitUnitValue: 95, exitReason: 'stop', risk: 96 });
    expect(r.trades[0].pnl).toBe(-98);
  });

  it('fills a gap through the stop at the open, not the stop price', async () => {
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-08', 101, { '2026-10-07': { open: 90, high: 91, low: 89, close: 90 } });
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-08', cSignal, { AAPL: bars }), 'C', DEFAULT_SETTINGS);
    expect(r.trades[0].exitUnitValue).toBe(90);
  });

  it('takes the target intraday', async () => {
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-08', 101, { '2026-10-07': { open: 104, high: 111, low: 103, close: 109 } });
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-08', cSignal, { AAPL: bars }), 'C', DEFAULT_SETTINGS);
    expect(r.trades[0]).toMatchObject({ exitUnitValue: 110, exitReason: 'target' });
  });

  it('skips when the close is more than 2% above Signa entry', async () => {
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-07', 103);
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-07', cSignal, { AAPL: bars }), 'C', DEFAULT_SETTINGS);
    expect(r.trades).toHaveLength(0);
    expect(r.openAtEnd).toHaveLength(0);
  });

  it('holds through earnings when already up 2R, moving the stop to entry', async () => {
    // Report Oct 20 after the close is 11 trading days after the Oct 5 signal (outside the entry window).
    // Up $13/share on $6 risk (> 2R) by Oct 19, when the exit would be decided -> hold with stop at entry.
    const overrides: Record<string, { open: number; high: number; low: number; close: number }> = {};
    for (const d of ['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21']) overrides[d] = { open: 114, high: 115, low: 113, close: 114 };
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-21', 101, overrides);
    const sig = (d: DayData) => { if (d.date === '2026-10-05') d.signals.set('AAPL', signal('AAPL', { entry: 100, stop: 95, target: 130 })); };
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-21', sig, { AAPL: bars }, { AAPL: [{ date: '2026-10-20', time: 'after-hours' }] }), 'C', DEFAULT_SETTINGS);
    expect(r.trades).toHaveLength(0);
    expect(r.openAtEnd).toHaveLength(1);
  });

  it('exits before earnings when not up 2R, recording the held-through result', async () => {
    const bars = flatBars('AAPL', '2026-10-05', '2026-10-21', 101, { '2026-10-21': { open: 104, high: 105, low: 103, close: 104 } });
    const sig = (d: DayData) => { if (d.date === '2026-10-05') d.signals.set('AAPL', signal('AAPL', { entry: 100, stop: 95, target: 130 })); };
    const r = await runBacktest(fakeMarket('2026-10-05', '2026-10-21', sig, { AAPL: bars }, { AAPL: [{ date: '2026-10-20', time: 'after-hours' }] }), 'C', DEFAULT_SETTINGS);
    // Decided at Oct 19's close, filled at Oct 20's open ($101): flat less $2 commissions
    expect(r.trades[0]).toMatchObject({ exitDate: '2026-10-20', exitReason: 'earnings 2026-10-20 (after-hours)', pnl: -2 });
    // Held-through twin marked at Oct 21's $104 close: +$3 x 16 shares - $1 entry commission
    expect(r.trades[0].shadowPnl).toBe(47);
  });
});
