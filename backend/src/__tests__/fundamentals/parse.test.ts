import { describe, it, expect } from 'vitest';
import { classifyFiler, daysBetween, isUsTickerFormat, parseQuarters } from '../../fundamentals/parse.js';

const submissions = (rows: [form: string, filingDate: string, accession: string][]) => ({
  filings: { recent: { form: rows.map(r => r[0]), filingDate: rows.map(r => r[1]), accessionNumber: rows.map(r => r[2]) } },
});

type F = { start: string; end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string };
const facts = (concepts: Record<string, F[]>) => ({
  facts: { 'us-gaap': Object.fromEntries(Object.entries(concepts).map(([k, v]) => [k, { units: { USD: v.map(f => ({ form: '10-Q', filed: '2026-01-01', ...f })) } }])) },
});

describe('isUsTickerFormat', () => {
  it('accepts plain and class-share US tickers', () => {
    for (const t of ['MU', 'AVGO', 'A', 'GOOGL', 'BRK-B']) expect(isUsTickerFormat(t)).toBe(true);
  });
  it('rejects exchange suffixes and numeric foreign codes', () => {
    for (const t of ['005930.KR', '000660.KQ', 'EOS.AX', 'IFX.DE', '285A.TK', 'TOOLONG']) expect(isUsTickerFormat(t)).toBe(false);
  });
});

describe('classifyFiler', () => {
  it('is eligible with the newest 10-Q/10-K as the change marker, ignoring 8-Ks', () => {
    const c = classifyFiler(submissions([
      ['8-K', '2026-09-20', 'a3'], ['10-Q', '2026-08-07', 'a2'], ['10-K', '2026-02-26', 'a1'],
    ]));
    expect(c).toEqual({ status: 'eligible', reason: null, lastAccession: 'a2', lastFiled: '2026-08-07', lastForm: '10-Q' });
  });

  it('excludes 20-F and 40-F filers (ADRs / foreign private issuers)', () => {
    expect(classifyFiler(submissions([['6-K', '2026-08-01', 'b2'], ['20-F', '2026-03-01', 'b1']])).status).toBe('excluded');
    const c = classifyFiler(submissions([['40-F', '2026-03-01', 'c1']]));
    expect(c.status).toBe('excluded');
    expect(c.reason).toContain('40-F');
  });

  it('treats a former 20-F filer that now files 10-Qs as domestic', () => {
    const c = classifyFiler(submissions([['10-Q', '2026-08-01', 'd2'], ['20-F', '2025-03-01', 'd1']]));
    expect(c.status).toBe('eligible');
    expect(c.lastAccession).toBe('d2');
  });

  it('is pending with no periodic report yet (fresh IPO) or no payload', () => {
    expect(classifyFiler(submissions([['S-1', '2026-06-01', 'e1'], ['424B4', '2026-07-01', 'e2']])).status).toBe('pending');
    expect(classifyFiler(null).status).toBe('pending');
  });
});

describe('parseQuarters', () => {
  it('keeps quarter-length periods only and the latest filing value, with fy/fp from the first filing', () => {
    const rows = parseQuarters(facts({
      Revenues: [
        { start: '2026-01-01', end: '2026-03-31', val: 100, fy: 2026, fp: 'Q1', filed: '2026-05-01' },
        { start: '2026-01-01', end: '2026-03-31', val: 105, fy: 2027, fp: 'Q1', filed: '2027-05-01' },  // restated comparative
        { start: '2026-01-01', end: '2026-06-30', val: 220, fy: 2026, fp: 'Q2' },                        // 6-month YTD
      ],
      OperatingIncomeLoss: [{ start: '2026-01-01', end: '2026-03-31', val: 20, fy: 2026, fp: 'Q1' }],
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period_end: '2026-03-31', revenue: 105, operating_income: 20, fiscal_year: 2026, fiscal_period: 'Q1', derived: false, op_computed: false });
  });

  it('ignores facts from non-periodic forms such as 8-K or S-1', () => {
    const rows = parseQuarters(facts({ Revenues: [{ start: '2026-01-01', end: '2026-03-31', val: 1, form: '8-K' }] }));
    expect(rows).toEqual([]);
  });

  it('derives Q4 as the annual total minus the three reported quarters', () => {
    const q = (start: string, end: string, rev: number, op: number) => ({ rev: { start, end, val: rev }, op: { start, end, val: op } });
    const qs = [q('2025-09-01', '2025-11-30', 10, 1), q('2025-12-01', '2026-02-28', 20, 2), q('2026-03-01', '2026-05-31', 30, 3)];
    const rows = parseQuarters(facts({
      Revenues: [...qs.map(x => x.rev), { start: '2025-09-01', end: '2026-08-31', val: 100, fy: 2026, fp: 'FY', form: '10-K' }],
      OperatingIncomeLoss: [...qs.map(x => x.op), { start: '2025-09-01', end: '2026-08-31', val: 16, fy: 2026, fp: 'FY', form: '10-K' }],
    }));
    const q4 = rows.find(r => r.period_end === '2026-08-31')!;
    expect(q4).toMatchObject({ period_start: '2026-06-01', revenue: 40, operating_income: 10, derived: true, fiscal_period: 'Q4', fiscal_year: 2026 });
  });

  it('does not derive Q4 when a quarter inside the year is missing', () => {
    const rows = parseQuarters(facts({
      Revenues: [
        { start: '2025-09-01', end: '2025-11-30', val: 10 },
        { start: '2026-03-01', end: '2026-05-31', val: 30 },
        { start: '2025-09-01', end: '2026-08-31', val: 100, form: '10-K' },
      ],
    }));
    expect(rows.map(r => r.period_end)).toEqual(['2025-11-30', '2026-05-31']);
  });

  it('labels a quarter-length fact filed with fp FY as Q4', () => {
    const rows = parseQuarters(facts({ Revenues: [{ start: '2026-06-01', end: '2026-08-28', val: 5, fy: 2026, fp: 'FY', form: '10-K' }] }));
    expect(rows[0].fiscal_period).toBe('Q4');
  });

  it('takes the largest revenue tag for a period (total Revenues over a contract-revenue subtotal)', () => {
    const rows = parseQuarters(facts({
      RevenueFromContractWithCustomerExcludingAssessedTax: [{ start: '2026-01-01', end: '2026-03-31', val: 80 }],
      Revenues: [{ start: '2026-01-01', end: '2026-03-31', val: 95 }],
    }));
    expect(rows[0].revenue).toBe(95);
  });

  it('falls back to revenue minus CostsAndExpenses when OperatingIncomeLoss is not tagged', () => {
    const rows = parseQuarters(facts({
      RevenueFromContractWithCustomerExcludingAssessedTax: [{ start: '2026-01-01', end: '2026-03-31', val: 1000 }],
      CostsAndExpenses: [{ start: '2026-01-01', end: '2026-03-31', val: 860 }],
    }));
    expect(rows[0]).toMatchObject({ revenue: 1000, operating_income: 140, op_computed: true });
  });

  it('prefers the tagged operating income over the fallback', () => {
    const rows = parseQuarters(facts({
      Revenues: [{ start: '2026-01-01', end: '2026-03-31', val: 1000 }],
      CostsAndExpenses: [{ start: '2026-01-01', end: '2026-03-31', val: 860 }],
      OperatingIncomeLoss: [{ start: '2026-01-01', end: '2026-03-31', val: 150 }],
    }));
    expect(rows[0]).toMatchObject({ operating_income: 150, op_computed: false });
  });

  it('returns nothing for an empty or malformed payload', () => {
    expect(parseQuarters(null)).toEqual([]);
    expect(parseQuarters({ facts: {} })).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2025-08-02', '2026-08-02')).toBe(365);
    expect(daysBetween('2026-03-31', '2026-03-31')).toBe(0);
  });
});
