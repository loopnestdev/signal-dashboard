import { describe, expect, it } from 'vitest';
import { describeLegs, fmtPct, fmtUsd, mergeCurves } from '../../lib/performance';

describe('mergeCurves', () => {
  it('joins book curves and SPY by date, skipping null points', () => {
    const rows = mergeCurves(
      { A: [{ date: '2026-10-05', equity: 10_100 }, { date: '2026-10-02', equity: 10_000 }], C: [{ date: '2026-10-02', equity: 10_000 }] },
      [{ date: '2026-10-02', equity: null }, { date: '2026-10-05', equity: 10_050 }],
    );
    expect(rows).toEqual([
      { date: '2026-10-02', A: 10_000, C: 10_000 },
      { date: '2026-10-05', A: 10_100, SPY: 10_050 },
    ]);
  });

  it('coerces numeric strings from the database', () => {
    expect(mergeCurves({ B: [{ date: '2026-10-02', equity: '9990.5' as unknown as number }] }, [])).toEqual([{ date: '2026-10-02', B: 9990.5 }]);
  });
});

describe('describeLegs', () => {
  it('formats single options, spreads (long strike first) and shares', () => {
    expect(describeLegs('NVDA', [{ contract: 'x', type: 'CALL', strike: 140, expiry: '2026-11-20', side: 1 }])).toBe('NVDA 140C 2026-11-20');
    expect(describeLegs('SPY', [
      { contract: 's', type: 'PUT', strike: 560, expiry: '2026-11-20', side: -1 },
      { contract: 'l', type: 'PUT', strike: 580, expiry: '2026-11-20', side: 1 },
    ])).toBe('SPY 580/560P 2026-11-20');
    expect(describeLegs('AAPL', [])).toBe('AAPL');
  });
});

describe('formatters', () => {
  it('formats dollars and percents with signs', () => {
    expect(fmtUsd(-1234.4)).toBe('-$1,234');
    expect(fmtUsd(250, true)).toBe('+$250');
    expect(fmtUsd(0, true)).toBe('$0');
    expect(fmtUsd(null)).toBe('-');
    expect(fmtPct(1.5)).toBe('+1.50%');
    expect(fmtPct(-0.25)).toBe('-0.25%');
    expect(fmtPct(null)).toBe('-');
  });
});
