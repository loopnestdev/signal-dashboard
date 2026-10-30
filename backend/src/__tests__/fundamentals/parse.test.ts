import { describe, it, expect } from 'vitest';
import { classifyFiler, daysBetween, factAccessions, isUsTickerFormat, mergeFacts, parseQuarters, periodicFilingsMissing } from '../../fundamentals/parse.js';

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

describe('parseQuarters cash flow', () => {
  // Fiscal year from Jan 1: cash flow facts are year to date (Q1, H1, 9M, FY).
  const ytd = (end: string, val: number, fp: string, form = '10-Q') => ({ start: '2026-01-01', end, val, fy: 2026, fp, form });
  const withIncome = (extra: Record<string, F[]>) => facts({
    NetIncomeLoss: [
      { start: '2026-01-01', end: '2026-03-31', val: 1, fy: 2026, fp: 'Q1' },
      { start: '2026-04-01', end: '2026-06-30', val: 1, fy: 2026, fp: 'Q2' },
      { start: '2026-07-01', end: '2026-09-30', val: 1, fy: 2026, fp: 'Q3' },
      { start: '2026-10-01', end: '2026-12-31', val: 1, fy: 2026, fp: 'Q4' },
    ],
    ...extra,
  });

  it('turns year-to-date operating cash flow and capex into quarters (Q4 = full year minus nine months)', () => {
    const rows = parseQuarters(withIncome({
      NetCashProvidedByUsedInOperatingActivities: [ytd('2026-03-31', 100, 'Q1'), ytd('2026-06-30', 250, 'Q2'), ytd('2026-09-30', 300, 'Q3'), ytd('2026-12-31', 500, 'FY', '10-K')],
      PaymentsToAcquirePropertyPlantAndEquipment: [ytd('2026-03-31', 10, 'Q1'), ytd('2026-06-30', 30, 'Q2'), ytd('2026-09-30', 60, 'Q3'), ytd('2026-12-31', 100, 'FY', '10-K')],
    }));
    expect(rows.map(r => [r.period_end, r.operating_cash_flow, r.capex])).toEqual([
      ['2026-03-31', 100, 10], ['2026-06-30', 150, 20], ['2026-09-30', 50, 30], ['2026-12-31', 200, 40],
    ]);
  });

  it('leaves a quarter empty when the previous year-to-date total is missing', () => {
    const rows = parseQuarters(withIncome({ NetCashProvidedByUsedInOperatingActivities: [ytd('2026-03-31', 100, 'Q1'), ytd('2026-09-30', 300, 'Q3')] }));
    expect(rows.map(r => r.operating_cash_flow)).toEqual([100, null, null, null]);
  });

  it('prefers a reported 3-month period over a subtracted one, and the first tag over a fallback', () => {
    const rows = parseQuarters(withIncome({
      NetCashProvidedByUsedInOperatingActivities: [ytd('2026-03-31', 100, 'Q1'), ytd('2026-06-30', 250, 'Q2'), { start: '2026-04-01', end: '2026-06-30', val: 140, fy: 2026, fp: 'Q2' }],
      NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: [ytd('2026-03-31', 90, 'Q1'), ytd('2026-09-30', 999, 'Q3'), ytd('2026-06-30', 900, 'Q2')],
      PaymentsToAcquireProductiveAssets: [ytd('2026-03-31', 7, 'Q1')],
    }));
    expect(rows.slice(0, 3).map(r => [r.operating_cash_flow, r.capex])).toEqual([[100, 7], [140, null], [99, null]]);
  });

  it('reads cash and equivalents at each quarter end from balance-sheet instants, latest filing wins', () => {
    const inst = (end: string, val: number, filed: string) => ({ end, val, form: '10-Q', filed });
    const f = withIncome({}) as { facts: Record<string, Record<string, { units: Record<string, unknown[]> }>> };
    f.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue = { units: { USD: [inst('2026-03-31', 50, '2026-05-01'), inst('2026-03-31', 55, '2026-08-01')] } };
    f.facts['us-gaap'].CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents = { units: { USD: [inst('2026-03-31', 70, '2026-05-01'), inst('2026-06-30', 60, '2026-08-01')] } };
    expect(parseQuarters(f).slice(0, 2).map(r => r.cash)).toEqual([55, 60]);
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

describe('parseQuarters operating income fallbacks', () => {
  const p = { start: '2026-04-01', end: '2026-06-30' };
  const one = (val: number) => [{ ...p, val }];

  it('reads utility revenue tagged RegulatedAndUnregulatedOperatingRevenue (DTE)', () => {
    const rows = parseQuarters(facts({ RegulatedAndUnregulatedOperatingRevenue: one(3419), OperatingIncomeLoss: one(427) }));
    expect(rows[0]).toMatchObject({ revenue: 3419, operating_income: 427, op_computed: false });
  });

  it('uses gross profit minus operating expenses (CC)', () => {
    const rows = parseQuarters(facts({ RevenueFromContractWithCustomerExcludingAssessedTax: one(1591), GrossProfit: one(286), OperatingExpenses: one(499) }));
    expect(rows[0]).toMatchObject({ operating_income: -213, op_computed: true });
  });

  it('uses revenue minus cost of revenue minus operating expenses without a gross profit tag', () => {
    const rows = parseQuarters(facts({ Revenues: one(100), CostOfGoodsAndServicesSold: one(60), OperatingExpenses: one(25) }));
    expect(rows[0].operating_income).toBe(15);
  });

  it('uses revenue minus cost of revenue, SG&A and R&D when only income statement lines are tagged (ETN)', () => {
    const rows = parseQuarters(facts({
      RevenueFromContractWithCustomerExcludingAssessedTax: one(8531), CostOfRevenue: one(5676),
      SellingGeneralAndAdministrativeExpense: one(1236), ResearchAndDevelopmentExpense: one(227),
    }));
    expect(rows[0]).toMatchObject({ operating_income: 1392, op_computed: true });
  });

  it('computes nothing from operating expenses alone, which may or may not include cost of sales', () => {
    const rows = parseQuarters(facts({ Revenues: one(32), OperatingExpenses: one(329) }));
    expect(rows[0]).toMatchObject({ revenue: 32, operating_income: null });
  });
});

describe('companyfacts lag helpers', () => {
  const cf = {
    facts: {
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-07-20', val: 1, accn: 'q2', form: '10-Q', filed: '2026-07-29' }] } } },
      'us-gaap': {
        Revenues: { units: { USD: [
          { start: '2026-01-01', end: '2026-03-31', val: 10, accn: 'q1', form: '10-Q', filed: '2026-05-01' },
          { start: '2026-01-01', end: '2026-03-31', val: 10, accn: 's8', form: 'S-8', filed: '2026-09-01' },
        ] } },
      },
    },
  };

  it('collects accessions across taxonomies and the newest periodic filing date', () => {
    const { accessions, latestFiled } = factAccessions(cf);
    expect([...accessions].sort()).toEqual(['q1', 'q2', 's8']);
    expect(latestFiled).toBe('2026-07-29');
    expect(factAccessions(null)).toEqual({ accessions: new Set(), latestFiled: null });
  });

  it('lists original 10-Q/10-K filings missing from companyfacts, newest first', () => {
    const subs = {
      filings: { recent: {
        form: ['10-Q', '8-K', '10-Q/A', '10-K', '10-Q', '10-Q'],
        filingDate: ['2026-10-28', '2026-10-01', '2026-09-01', '2026-08-15', '2026-07-29', '2026-05-01'],
        accessionNumber: ['q3', 'k8', 'qa', 'k1', 'q2', 'q1'],
        primaryDocument: ['q3.htm', 'k8.htm', 'qa.htm', 'k1.htm', 'q2.htm', 'q1.htm'],
      } },
    };
    const missing = periodicFilingsMissing(subs, new Set(['q1']), '2026-05-01');
    expect(missing.map(m => m.accession)).toEqual(['q3', 'k1', 'q2']);
    expect(missing[0]).toEqual({ accession: 'q3', form: '10-Q', filed: '2026-10-28', primaryDocument: 'q3.htm' });
    expect(periodicFilingsMissing(subs, new Set(['q1', 'q2']), '2026-07-29').map(m => m.accession)).toEqual(['q3', 'k1']);
    expect(periodicFilingsMissing(null, new Set(), null)).toEqual([]);
  });

  it('merges extra facts without mutating the original payload', () => {
    const extra = { facts: { 'us-gaap': {
      Revenues: { units: { USD: [{ start: '2026-04-01', end: '2026-06-30', val: 12, accn: 'q2', form: '10-Q', filed: '2026-07-29' }] } },
      OperatingIncomeLoss: { units: { USD: [{ start: '2026-04-01', end: '2026-06-30', val: 3, accn: 'q2', form: '10-Q', filed: '2026-07-29' }] } },
    } } };
    const merged = mergeFacts(cf, extra);
    expect(merged.facts!['us-gaap'].Revenues.units!.USD).toHaveLength(3);
    expect(merged.facts!['us-gaap'].OperatingIncomeLoss.units!.USD).toHaveLength(1);
    expect(merged.facts!.dei).toBe(cf.facts.dei);
    expect(cf.facts['us-gaap'].Revenues.units.USD).toHaveLength(2);
    expect(parseQuarters(merged).map(r => r.period_end)).toEqual(['2026-03-31', '2026-06-30']);
  });
});

describe('parseQuarters - net income and diluted shares (LEAPS universe)', () => {
  const withShares = (base: ReturnType<typeof facts>, list: F[]) => {
    base.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding = { units: { shares: list.map(f => ({ form: '10-Q', filed: '2026-01-01', ...f })) } } as never;
    return base;
  };

  it('reads net income and the quarter\'s diluted share count', () => {
    const rows = parseQuarters(withShares(facts({
      Revenues: [{ start: '2026-01-01', end: '2026-03-31', val: 100, fy: 2026, fp: 'Q1' }],
      OperatingIncomeLoss: [{ start: '2026-01-01', end: '2026-03-31', val: 20, fy: 2026, fp: 'Q1' }],
      NetIncomeLoss: [{ start: '2026-01-01', end: '2026-03-31', val: 15, fy: 2026, fp: 'Q1' }],
    }), [{ start: '2026-01-01', end: '2026-03-31', val: 7.4e9 }]));
    expect(rows[0]).toMatchObject({ net_income: 15, diluted_shares: 7.4e9 });
  });

  it('keeps bank quarters that have net income but no operating income line', () => {
    const rows = parseQuarters(facts({
      RevenuesNetOfInterestExpense: [{ start: '2026-01-01', end: '2026-03-31', val: 45_000, fy: 2026, fp: 'Q1' }],
      NetIncomeLoss: [{ start: '2026-01-01', end: '2026-03-31', val: 14_000, fy: 2026, fp: 'Q1' }],
    }));
    expect(rows[0]).toMatchObject({ revenue: 45_000, operating_income: null, net_income: 14_000, op_computed: false });
  });

  it('uses the fiscal-year average share count for Q4 instead of subtracting averages', () => {
    const q = (s: string, e: string, fp: string) => ({ start: s, end: e, val: 10, fy: 2026, fp });
    const rows = parseQuarters(withShares(facts({
      Revenues: [q('2026-01-01', '2026-03-31', 'Q1'), q('2026-04-01', '2026-06-30', 'Q2'), q('2026-07-01', '2026-09-30', 'Q3'),
        { start: '2026-01-01', end: '2026-12-31', val: 50, fy: 2026, fp: 'FY', form: '10-K' }],
    }), [{ start: '2026-01-01', end: '2026-12-31', val: 3e9, form: '10-K' }]));
    expect(rows.find(r => r.period_end === '2026-12-31')).toMatchObject({ revenue: 20, derived: true, diluted_shares: 3e9 });
  });
});

describe('parseQuarters - share count fallbacks', () => {
  const sharesFacts = (concepts: Record<string, Array<{ start?: string; end: string; val: number }>>) => {
    const base = facts({ Revenues: [{ start: '2026-01-01', end: '2026-03-31', val: 100, fy: 2026, fp: 'Q1' }] });
    for (const [k, list] of Object.entries(concepts)) {
      base.facts['us-gaap'][k] = { units: { shares: list.map(f => ({ form: '10-Q', filed: '2026-05-01', ...f })) } } as never;
    }
    return base;
  };
  it('falls back to basic weighted shares (XOM)', () => {
    const rows = parseQuarters(sharesFacts({ WeightedAverageNumberOfSharesOutstandingBasic: [{ start: '2026-01-01', end: '2026-03-31', val: 4.2e9 }] }));
    expect(rows[0].diluted_shares).toBe(4.2e9);
  });
  it('falls back to period-end shares outstanding (KKR)', () => {
    const rows = parseQuarters(sharesFacts({ CommonStockSharesOutstanding: [{ end: '2026-03-31', val: 8.9e8 }] }));
    expect(rows[0].diluted_shares).toBe(8.9e8);
  });
  it('scales share counts tagged in millions (MCD)', () => {
    const rows = parseQuarters(sharesFacts({ WeightedAverageNumberOfDilutedSharesOutstanding: [{ start: '2026-01-01', end: '2026-03-31', val: 716.4 }] }));
    expect(rows[0].diluted_shares).toBeCloseTo(716.4e6, 0);
  });
});
