import { describe, it, expect } from 'vitest';
import {
  classifyDpSide, dedupeById, parseCuratedFlow, parseDpPrints, parseFlowAlerts,
  parseGexSnapshot, parseOptionChain, parseSignalSnapshot, pickSwingExpiries, rowId,
} from '../../collector/parsers.js';

describe('rowId', () => {
  it('is deterministic and order-sensitive', () => {
    expect(rowId('MU', 1, 2)).toBe(rowId('MU', 1, 2));
    expect(rowId('MU', 1, 2)).not.toBe(rowId('MU', 2, 1));
    expect(rowId('MU', 1, 2)).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('dedupeById', () => {
  it('keeps the last copy of each id', () => {
    expect(dedupeById([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }])).toEqual([{ id: 'a', v: 3 }, { id: 'b', v: 2 }]);
  });
});

describe('classifyDpSide', () => {
  it('treats prints at or above mid as buys', () => {
    expect(classifyDpSide(10.05, 10, 10.1)).toBe(1);
    expect(classifyDpSide(10.1, 10, 10.1)).toBe(1);
  });
  it('treats prints below mid as sells', () => {
    expect(classifyDpSide(10.01, 10, 10.1)).toBe(-1);
  });
  it('leaves prints without a valid NBBO unclassified', () => {
    expect(classifyDpSide(10, null, 10.1)).toBe(0);
    expect(classifyDpSide(10, 0, 10.1)).toBe(0);
    expect(classifyDpSide(10, 10, null)).toBe(0);
  });
});

describe('parseDpPrints', () => {
  const print = {
    ticker: 'mu', price: '1069.111', size: 150, volume: 27336532, premium: '160366.650',
    executed_at: '2026-10-02T19:59:45Z', nbbo_bid: '1069.11', nbbo_ask: '1069.15', canceled: false,
  };

  it('maps Signa string fields to numeric rows with an ET trade date', () => {
    const [row] = parseDpPrints({ prints: [print] });
    expect(row).toMatchObject({
      symbol: 'MU', price: 1069.111, size: 150, premium: 160366.65, day_volume: 27336532,
      nbbo_bid: 1069.11, nbbo_ask: 1069.15, side: -1, trade_date: '2026-10-02',
    });
  });

  it('assigns a print after 8 PM ET to the ET calendar date, not the UTC date', () => {
    const [row] = parseDpPrints({ prints: [{ ...print, executed_at: '2026-10-03T00:30:00Z' }] });
    expect(row.trade_date).toBe('2026-10-02');
  });

  it('skips canceled and malformed prints and dedupes repeats', () => {
    const rows = parseDpPrints({ prints: [print, print, { ...print, canceled: true }, { ...print, price: 'x' }, { ...print, executed_at: 'bad' }] });
    expect(rows).toHaveLength(1);
  });

  it('falls back to price x size when premium is missing', () => {
    const [row] = parseDpPrints({ prints: [{ ...print, premium: null, price: 10, size: 100 }] });
    expect(row.premium).toBe(1000);
  });

  it('returns [] for null or missing prints', () => {
    expect(parseDpPrints(null)).toEqual([]);
    expect(parseDpPrints({})).toEqual([]);
  });
});

describe('parseFlowAlerts', () => {
  const alert = {
    ticker: 'MU', type: 'call', strike: '1060', expiry: '2026-10-16', premium: '46962', volume: 499,
    open_interest: 1077, vol_oi_ratio: '0.4633', has_sweep: false, has_floor: true,
    underlying_price: '1074.55', alert_rule: 'RepeatedHitsDescendingFill', start_time: 1790971174592,
  };

  it('normalises type and timestamps', () => {
    const [row] = parseFlowAlerts({ flow: [alert] });
    expect(row).toMatchObject({
      symbol: 'MU', option_type: 'CALL', strike: 1060, premium: 46962, vol_oi_ratio: 0.4633,
      has_floor: true, alerted_at: new Date(1790971174592).toISOString(),
    });
  });

  it('gives the same alert the same id across polls even if premium grows', () => {
    const [a] = parseFlowAlerts({ flow: [alert] });
    const [b] = parseFlowAlerts({ flow: [{ ...alert, premium: '99999', volume: 900 }] });
    expect(a.id).toBe(b.id);
  });

  it('skips alerts with unknown type or missing keys', () => {
    expect(parseFlowAlerts({ flow: [{ ...alert, type: 'stock' }, { ...alert, start_time: null }, { ...alert, strike: null }] })).toEqual([]);
  });
});

describe('parseCuratedFlow', () => {
  const ev = {
    id: 'c1', direction: 'BULLISH', conviction_score: 72, confirms_signal: true, contradicts_signal: null,
    rationale_short: 'Large sweep', scored_at: '2026-10-02T15:00:00Z',
    flow_events: { symbol: 'MU', option_type: 'call', strike: 1100, expiry: '2026-11-20', premium_size: 2_000_000 },
  };

  it('keeps only universe symbols', () => {
    const rows = parseCuratedFlow({ events: [ev, { ...ev, id: 'c2', flow_events: { ...ev.flow_events, symbol: 'TSLA' } }] }, new Set(['MU']));
    expect(rows.map(r => r.id)).toEqual(['c1']);
  });

  it('extracts the nested contract and preserves the payload', () => {
    const [row] = parseCuratedFlow({ events: [ev] }, new Set(['MU']));
    expect(row).toMatchObject({
      symbol: 'MU', option_type: 'CALL', strike: 1100, premium: 2_000_000, confirms_signal: true,
      contradicts_signal: null, trade_date: '2026-10-02',
    });
    expect(row.payload).toBe(ev);
  });
});

describe('parseGexSnapshot', () => {
  const payload = {
    ok: true,
    underlying: { price: 100 },
    levels: { gammaFlipLevel: 95, callWall: 110, putWall: 90, maxGammaStrike: 100, regimeAboveFlip: true },
    netGexByStrike: [
      { strike: 100, expiry: '2026-10-16', netGex: 10 },
      { strike: 100, expiry: '2026-11-20', netGex: 5 },
      { strike: 90, expiry: '2026-10-16', netGex: -4 },
      { strike: 200, expiry: '2026-10-16', netGex: 1 },
    ],
  };

  it('sums strikes across expiries and computes net GEX over every strike', () => {
    const row = parseGexSnapshot(payload, 'smh', '2026-10-02')!;
    expect(row.symbol).toBe('SMH');
    expect(row.net_gex).toBe(12);
    expect(row).toMatchObject({ spot: 100, gamma_flip: 95, call_wall: 110, put_wall: 90, max_gamma_strike: 100, regime_above_flip: true });
  });

  it('stores only strikes within 30% of spot', () => {
    const row = parseGexSnapshot(payload, 'SMH', '2026-10-02')!;
    expect(row.strikes).toEqual([[90, -4], [100, 15]]);
  });

  it('falls back to top-level level fields and null regime', () => {
    const row = parseGexSnapshot({ current_price: 50, gammaFlipLevel: 48, callWall: 55 }, 'X', '2026-10-02')!;
    expect(row).toMatchObject({ spot: 50, gamma_flip: 48, call_wall: 55, regime_above_flip: null, net_gex: null });
  });

  it('returns null for failed responses', () => {
    expect(parseGexSnapshot(null, 'X', '2026-10-02')).toBeNull();
    expect(parseGexSnapshot({ ok: false }, 'X', '2026-10-02')).toBeNull();
  });
});

describe('parseSignalSnapshot', () => {
  it('reads engine direction (primary) plus signa grade/action and data price', () => {
    const row = parseSignalSnapshot({
      ok: true,
      engine: { direction: 'NEUTRAL', score: 58, grade: 'C', entry: null, stop: 600, target: null },
      data: { direction: 'WAIT', price: 630.6, entry: 625, target: 663 },
      signa: { grade: 'C', action: 'WAIT', conviction: 65 },
    }, 'smh', '2026-10-05')!;
    expect(row).toMatchObject({
      symbol: 'SMH', engine_direction: 'NEUTRAL', engine_score: 58, engine_grade: 'C',
      signa_action: 'WAIT', signa_grade: 'C', conviction: 65, price: 630.6,
      entry: 625, stop: 600, target: 663,
    });
  });

  it('returns null for failed responses', () => {
    expect(parseSignalSnapshot({ ok: false }, 'X', '2026-10-05')).toBeNull();
  });
});

describe('pickSwingExpiries', () => {
  const now = new Date('2026-10-05T14:00:00Z');
  const epoch = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;

  it('picks the expiries closest to 30 and 60 DTE within 21-75 days', () => {
    const list = ['2026-10-09', '2026-10-30', '2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18', '2027-01-15'].map(epoch);
    expect(pickSwingExpiries(list, now)).toEqual([epoch('2026-11-06'), epoch('2026-12-04')]);
  });

  it('returns one expiry when the same date is closest to both targets', () => {
    expect(pickSwingExpiries([epoch('2026-11-20')], now)).toEqual([epoch('2026-11-20')]);
  });

  it('returns [] when nothing is in the swing window', () => {
    expect(pickSwingExpiries([epoch('2026-10-09'), epoch('2027-06-18')], now)).toEqual([]);
  });
});

describe('parseOptionChain', () => {
  const payload = {
    optionChain: {
      result: [{
        quote: { regularMarketPrice: 100 },
        options: [{
          calls: [
            { contractSymbol: 'X261120C00100000', strike: 100, expiration: 1795132800, bid: 4.9, ask: 5.1, lastPrice: 5, impliedVolatility: 0.45, openInterest: 1200, volume: 300 },
            { contractSymbol: 'X261120C00150000', strike: 150, expiration: 1795132800, bid: 0.1, ask: 0.2 },
          ],
          puts: [
            { contractSymbol: 'X261120P00095000', strike: 95, expiration: 1795132800, bid: 2, ask: 2.2 },
          ],
        }],
      }],
    },
  };

  it('keeps contracts within 15% of spot for calls and puts', () => {
    const rows = parseOptionChain(payload, 'x', '2026-10-05');
    expect(rows.map(r => r.contract_symbol)).toEqual(['X261120C00100000', 'X261120P00095000']);
    expect(rows[0]).toMatchObject({
      symbol: 'X', option_type: 'CALL', expiry: '2026-11-20', bid: 4.9, ask: 5.1, last: 5,
      iv: 0.45, open_interest: 1200, volume: 300, spot: 100,
    });
    expect(rows[1].option_type).toBe('PUT');
  });

  it('returns [] for an empty or failed chain', () => {
    expect(parseOptionChain({ optionChain: { result: [] } }, 'X', '2026-10-05')).toEqual([]);
    expect(parseOptionChain(null, 'X', '2026-10-05')).toEqual([]);
  });
});
