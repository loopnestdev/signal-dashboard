import { describe, it, expect } from 'vitest';
import { expiryWindow, modeledLeapsExpiries, pickContract, pickLeapsExpiry, quoteGrid, spreadPct, type ChainCall } from '../../leaps/contracts.js';

describe('pickLeapsExpiry', () => {
  it('takes the first standard monthly 15-27 months out', () => {
    const expiries = ['2027-06-17', '2027-12-17', '2028-01-21', '2028-03-17', '2028-06-16', '2029-01-19'];
    // 2027-12-17 is 418 days out (too near); 2028-01-21 is 453 days (still < 457); 2028-03-17 is the first in window
    expect(pickLeapsExpiry(expiries, '2026-10-26')).toBe('2028-03-17');
  });
  it('ignores weeklies and anything beyond 27 months', () => {
    expect(pickLeapsExpiry(['2028-02-25', '2029-06-15'], '2026-10-26')).toBeNull();
  });
});

describe('modeledLeapsExpiries', () => {
  it('lists January and June third Fridays', () => {
    const e = modeledLeapsExpiries('2017-03-01');
    expect(e).toContain('2018-01-19');
    expect(e).toContain('2018-06-15');
    expect(pickLeapsExpiry(e, '2017-03-01')).toBe('2018-06-15');
  });
});

describe('quoteGrid', () => {
  const c = (strike: number, delta: number, expiry: string): ChainCall => ({ contract: `G${expiry}${strike}`, expiry, strike, bid: 1, ask: 1.1, iv: 0.3, delta, openInterest: 10 });
  it('keeps the call nearest each grid delta on monthly expiries 270+ days out', () => {
    const chain = [0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((d, i) => c(100 + i * 10, d, '2028-01-21'))
      .concat([c(150, 0.5, '2027-01-15'), c(150, 0.5, '2028-02-25')]);   // too near; weekly
    const grid = quoteGrid(chain, '2026-10-26');
    expect(grid.every(g => g.expiry === '2028-01-21')).toBe(true);
    expect(grid.map(g => g.delta).sort()).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.85]);
  });
});

describe('pickContract', () => {
  const call = (strike: number, delta: number, over: Partial<ChainCall> = {}): ChainCall => ({
    contract: `X280317C${strike}`, expiry: '2028-03-17', strike, bid: 9.8, ask: 10, iv: 0.3, delta, openInterest: 1000, ...over,
  });
  const chain = [call(150, 0.8), call(170, 0.72), call(200, 0.52), call(240, 0.31), { ...call(200, 0.5), expiry: '2027-12-17' }];

  it('picks the call nearest each book delta on the LEAPS expiry', () => {
    expect(pickContract(chain, '2026-10-26', 'L1').call!.strike).toBe(170);
    expect(pickContract(chain, '2026-10-26', 'L2').call!.strike).toBe(200);
    expect(pickContract(chain, '2026-10-26', 'L3')).toMatchObject({ liquid: true, reason: null });
  });
  it('flags low open interest and wide spreads on the chosen contract', () => {
    expect(pickContract([call(200, 0.5, { openInterest: 100 })], '2026-10-26', 'L2').reason).toContain('open interest 100');
    expect(pickContract([call(200, 0.5, { bid: 9 })], '2026-10-26', 'L2').reason).toContain('spread');
    expect(pickContract([call(200, 0.5, { bid: null })], '2026-10-26', 'L2').liquid).toBe(false);
  });
  it('explains a missing expiry or quote', () => {
    expect(pickContract([], '2026-10-26', 'L2').reason).toBe('no LEAPS expiry 15-27 months out');
    expect(pickContract([call(200, 0.5, { ask: null })], '2026-10-26', 'L2').reason).toContain('no quoted calls');
  });
  it('index books IS / IQ use 500-900 day expiries, delta 0.85 and no open-interest floor', () => {
    expect(expiryWindow('IS')).toEqual([500, 900]);
    expect(expiryWindow('IQ')).toEqual([500, 900]);
    const ix = [call(150, 0.86, { expiry: '2028-06-16', openInterest: 20 }), call(150, 0.85, { expiry: '2028-01-21' })];
    const pick = pickContract(ix, '2026-10-26', 'IQ');
    expect(pick.call!.expiry).toBe('2028-06-16');   // 2028-01-21 is 452 days out, under the 500-day floor
    expect(pick.liquid).toBe(true);
  });
  it('measures the spread against the mid', () => {
    expect(spreadPct(9.5, 10.5)).toBeCloseTo(10, 10);
  });
});
