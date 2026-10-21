// Pure transforms for SEC EDGAR payloads: listing classification and quarterly revenue / operating income.

export type ListingStatus = 'eligible' | 'excluded' | 'pending';

export interface Classification {
  status: ListingStatus;
  reason: string | null;
  lastAccession: string | null;
  lastFiled: string | null;
  lastForm: string | null;
}

const US_TICKER = /^[A-Z]{1,5}(-[A-Z]{1,2})?$/;
const QUARTERLY_FORMS = new Set(['10-Q', '10-K', '10-Q/A', '10-K/A']);
const FOREIGN_ANNUAL_FORMS = new Set(['20-F', '40-F', '20-F/A', '40-F/A']);

// Tickers moat-finder stores with an exchange suffix (005930.KR, EOS.AX, IFX.DE) or digits are not US listings.
export const isUsTickerFormat = (ticker: string): boolean => US_TICKER.test(ticker);

interface RecentFilings {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
}

// classifyFiler:
//   - Domestic filers (10-Q / 10-K) are eligible; their newest 10-Q/10-K accession is the change marker
//   - 20-F / 40-F filers are foreign private issuers: ADRs and Canadian/other non-US listings, excluded
//   - A filer with neither yet (fresh IPO with only an S-1 / 424B) stays pending and is re-checked daily
export function classifyFiler(submissions: unknown): Classification {
  const recent = ((submissions as { filings?: { recent?: RecentFilings } } | null)?.filings?.recent) ?? {};
  const forms = recent.form ?? [];
  let latestDomestic = -1;
  let latestForeign = -1;
  forms.forEach((form, i) => {
    const date = recent.filingDate?.[i] ?? '';
    if (QUARTERLY_FORMS.has(form) && (latestDomestic < 0 || date > (recent.filingDate?.[latestDomestic] ?? ''))) latestDomestic = i;
    if (FOREIGN_ANNUAL_FORMS.has(form) && (latestForeign < 0 || date > (recent.filingDate?.[latestForeign] ?? ''))) latestForeign = i;
  });
  const marker = (i: number) => ({
    lastAccession: recent.accessionNumber?.[i] ?? null,
    lastFiled: recent.filingDate?.[i] ?? null,
    lastForm: forms[i] ?? null,
  });

  if (latestForeign >= 0 && (latestDomestic < 0 || (recent.filingDate?.[latestForeign] ?? '') > (recent.filingDate?.[latestDomestic] ?? ''))) {
    return { status: 'excluded', reason: `foreign private issuer (${forms[latestForeign]}) - ADR / non-US`, ...marker(latestForeign) };
  }
  if (latestDomestic < 0) {
    return { status: 'pending', reason: 'no 10-Q / 10-K filed yet', lastAccession: null, lastFiled: null, lastForm: null };
  }
  return { status: 'eligible', reason: null, ...marker(latestDomestic) };
}

export interface QuarterRow {
  period_start: string;
  period_end: string;
  fiscal_year: number | null;
  fiscal_period: string | null;
  revenue: number | null;
  operating_income: number | null;
  derived: boolean;
  op_computed: boolean;
  form: string | null;
  filed: string | null;
}

interface Fact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

// Total-revenue tags; companies switch tags over the years (ASC 606 in 2018) and some report a contract-revenue subtotal
// next to total `Revenues` (utilities), so each period takes the largest value any of these tags reports.
export const REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
];
export const OPERATING_INCOME_CONCEPTS = ['OperatingIncomeLoss'];
// Some filers moved operating income to a company-specific tag, which companyfacts does not carry (COHR since 2024);
// revenue minus total costs and expenses stands in for those periods and is flagged op_computed.
export const TOTAL_COSTS_CONCEPTS = ['CostsAndExpenses'];

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

const isQuarter = (f: Fact) => f.start != null && daysBetween(f.start, f.end) >= 75 && daysBetween(f.start, f.end) <= 105;
const isAnnual = (f: Fact) => f.start != null && daysBetween(f.start, f.end) >= 340 && daysBetween(f.start, f.end) <= 390;

interface Period {
  start: string;
  end: string;
  val: number;
  fy: number | null;
  fp: string | null;
  form: string | null;
  filed: string | null;
  derived: boolean;
}

// One value per (start, end): the latest filing wins (restatements), while fy/fp come from the earliest filing,
// because a comparative figure in a later 10-Q carries that later filing's fy/fp, not its own.
function periodsOf(facts: Fact[], keep: (f: Fact) => boolean): Map<string, Period> {
  const out = new Map<string, Period>();
  const firstFiled = new Map<string, Fact>();
  for (const f of facts) {
    if (!keep(f) || !f.form || !QUARTERLY_FORMS.has(f.form) || !Number.isFinite(f.val)) continue;
    const key = `${f.start}|${f.end}`;
    const first = firstFiled.get(key);
    if (!first || (f.filed ?? '') < (first.filed ?? '')) firstFiled.set(key, f);
    const cur = out.get(key);
    if (!cur || (f.filed ?? '') > (cur.filed ?? '')) {
      out.set(key, { start: f.start!, end: f.end, val: f.val, fy: null, fp: null, form: f.form ?? null, filed: f.filed ?? null, derived: false });
    }
  }
  for (const [key, p] of out) {
    const first = firstFiled.get(key)!;
    p.fy = first.fy ?? null;
    p.fp = first.fp ?? null;
  }
  return out;
}

function conceptFacts(facts: unknown, concept: string): Fact[] {
  const usd = (facts as { facts?: { 'us-gaap'?: Record<string, { units?: { USD?: Fact[] } }> } } | null)
    ?.facts?.['us-gaap']?.[concept]?.units?.USD;
  return Array.isArray(usd) ? usd : [];
}

const keepLarger = (map: Map<string, Period>, p: Period) => {
  const cur = map.get(p.end);
  if (!cur || p.val > cur.val) map.set(p.end, p);
};

// quartersFor:
//   - Reported quarters keyed by period end; when several concepts report the same period the largest value wins
//   - Q4 (never filed on its own) = fiscal year total minus the three quarters inside it, flagged derived
function quartersFor(facts: unknown, concepts: string[]): Map<string, Period> {
  const byEnd = new Map<string, Period>();
  const annualByEnd = new Map<string, Period>();
  for (const concept of concepts) {
    const list = conceptFacts(facts, concept);
    for (const p of periodsOf(list, isQuarter).values()) keepLarger(byEnd, p.fp === 'FY' ? { ...p, fp: 'Q4' } : p);
    for (const p of periodsOf(list, isAnnual).values()) keepLarger(annualByEnd, p);
  }
  for (const a of annualByEnd.values()) {
    if (byEnd.has(a.end)) continue;
    const inside = [...byEnd.values()]
      .filter(q => !q.derived && q.start >= a.start && q.end < a.end)
      .sort((x, y) => x.end.localeCompare(y.end));
    if (inside.length !== 3) continue;
    const last = inside[2];
    if (daysBetween(last.end, a.end) < 75 || daysBetween(last.end, a.end) > 105) continue;
    byEnd.set(a.end, {
      start: addDays(last.end, 1),
      end: a.end,
      val: a.val - inside.reduce((s, q) => s + q.val, 0),
      fy: a.fy,
      fp: 'Q4',
      form: a.form,
      filed: a.filed,
      derived: true,
    });
  }
  return byEnd;
}

export function parseQuarters(companyFacts: unknown): QuarterRow[] {
  const rev = quartersFor(companyFacts, REVENUE_CONCEPTS);
  const op = quartersFor(companyFacts, OPERATING_INCOME_CONCEPTS);
  const costs = quartersFor(companyFacts, TOTAL_COSTS_CONCEPTS);
  const ends = [...new Set([...rev.keys(), ...op.keys()])].sort();
  return ends.map(end => {
    const r = rev.get(end);
    const reported = op.get(end);
    const c = costs.get(end);
    const o = reported ?? (r && c ? { ...c, val: r.val - c.val } : undefined);
    const base = r ?? o!;
    return {
      period_start: base.start,
      period_end: end,
      fiscal_year: base.fy,
      fiscal_period: base.fp,
      revenue: r?.val ?? null,
      operating_income: o?.val ?? null,
      derived: Boolean(r?.derived || o?.derived),
      op_computed: !reported && o != null,
      form: base.form,
      filed: [r?.filed, o?.filed].filter(Boolean).sort().pop() ?? null,
    };
  });
}
