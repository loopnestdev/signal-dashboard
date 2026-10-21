import { describe, it, expect } from 'vitest';
import { needsFacts, NON_US_REASON, NOT_SEC_REASON, planSync, REMOVED_REASON, type CompanyState } from '../../fundamentals/plan.js';
import type { Classification } from '../../fundamentals/parse.js';

const sec = new Map([
  ['MU', { cik: 723125, name: 'Micron' }],
  ['AVGO', { cik: 1730168, name: 'Broadcom' }],
  ['TSEM', { cik: 928876, name: 'Tower' }],
]);
const known = (ticker: string, extra: Partial<CompanyState> = {}): CompanyState => ({
  ticker, status: 'eligible', reason: null, last_accession: 'acc-1', facts_fetched_at: '2026-10-01T00:00:00Z', ...extra,
});
const eligible = (lastAccession: string): Classification => ({ status: 'eligible', reason: null, lastAccession, lastFiled: '2026-10-01', lastForm: '10-Q' });

describe('planSync', () => {
  it('excludes suffixed and unknown tickers without lookups and checks SEC filers', () => {
    const plan = planSync(['MU', '005930.KR', 'EOS.AX', 'CGEH', 'tsem '], [], sec, 'daily');
    expect(plan.check.map(c => c.ticker)).toEqual(['MU', 'TSEM']);
    expect(plan.check[0]).toEqual({ ticker: 'MU', cik: 723125, name: 'Micron' });
    expect(plan.exclude).toEqual([
      { ticker: '005930.KR', reason: NON_US_REASON, cik: null, name: null },
      { ticker: 'CGEH', reason: NOT_SEC_REASON, cik: null, name: null },
      { ticker: 'EOS.AX', reason: NON_US_REASON, cik: null, name: null },
    ]);
  });

  it("'new' only plans tickers never seen, or re-added after removal", () => {
    const plan = planSync(['MU', 'AVGO', 'TSEM'], [known('MU'), known('TSEM', { status: 'excluded', reason: REMOVED_REASON })], sec, 'new');
    expect(plan.check.map(c => c.ticker)).toEqual(['AVGO', 'TSEM']);
    expect(plan.removed).toEqual([]);
  });

  it("'daily' re-checks everything and marks tickers dropped from moat-finder once", () => {
    const plan = planSync(['MU'], [known('MU'), known('AVGO'), known('OLD', { status: 'excluded', reason: REMOVED_REASON })], sec, 'daily');
    expect(plan.check.map(c => c.ticker)).toEqual(['MU']);
    expect(plan.removed).toEqual(['AVGO']);
  });

  it('dedupes moat tickers', () => {
    expect(planSync(['MU', 'mu', 'MU'], [], sec, 'full').check).toHaveLength(1);
  });
});

describe('needsFacts', () => {
  it('downloads for a never-fetched company or a new filing', () => {
    expect(needsFacts(undefined, eligible('acc-1'), 'daily')).toBe(true);
    expect(needsFacts(known('MU', { facts_fetched_at: null }), eligible('acc-1'), 'daily')).toBe(true);
    expect(needsFacts(known('MU'), eligible('acc-2'), 'daily')).toBe(true);
  });

  it('skips an unchanged filing unless a full resync is asked for', () => {
    expect(needsFacts(known('MU'), eligible('acc-1'), 'daily')).toBe(false);
    expect(needsFacts(known('MU'), eligible('acc-1'), 'full')).toBe(true);
  });

  it('never downloads for excluded or pending filers', () => {
    expect(needsFacts(undefined, { status: 'excluded', reason: 'x', lastAccession: null, lastFiled: null, lastForm: null }, 'full')).toBe(false);
    expect(needsFacts(undefined, { status: 'pending', reason: 'x', lastAccession: null, lastFiled: null, lastForm: null }, 'full')).toBe(false);
  });
});
