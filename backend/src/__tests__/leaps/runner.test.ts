import { describe, it, expect } from 'vitest';
import { parseLeapsRunRequest } from '../../leaps/runner.js';
import { marketCapNow } from '../../leaps/data.js';

describe('parseLeapsRunRequest', () => {
  it('accepts a multi-year range up to the last session', () => {
    expect(parseLeapsRunRequest({ from: '2016-10-25', to: '2026-10-23' }, '2026-10-23')).toEqual({ request: { from: '2016-10-25', to: '2026-10-23' } });
  });
  it('rejects bad dates, reversed ranges, too-early starts and the future', () => {
    expect(parseLeapsRunRequest({ from: 'x', to: '2026-10-23' }, '2026-10-23')).toHaveProperty('error');
    expect(parseLeapsRunRequest({ from: '2026-10-23', to: '2026-10-01' }, '2026-10-23')).toHaveProperty('error');
    expect(parseLeapsRunRequest({ from: '2005-01-03', to: '2026-10-23' }, '2026-10-23')).toHaveProperty('error');
    expect(parseLeapsRunRequest({ from: '2020-01-02', to: '2026-10-24' }, '2026-10-23')).toHaveProperty('error');
  });
});

describe('marketCapNow', () => {
  const q = (period_end: string, diluted_shares: number | null) => ({ period_end, revenue: 1, operating_income: 1, net_income: 1, diluted_shares });
  it('uses the newest share count and scales it for later splits', () => {
    expect(marketCapNow([q('2026-03-31', 2e9), q('2026-06-30', 2.5e9)], 100, [])).toBe(250e9);
    expect(marketCapNow([q('2024-04-28', 2.5e9)], 100, [{ date: '2024-06-10', ratio: 10 }])).toBe(2.5e12);
  });
  it('is null without a share count', () => {
    expect(marketCapNow([q('2026-06-30', null)], 100, [])).toBeNull();
  });
});
