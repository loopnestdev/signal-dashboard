// Pure transforms for SEC EDGAR payloads: listing classification, quarterly revenue / operating income and cash flow.

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
  net_income: number | null;
  diluted_shares: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  cash: number | null;
  form: string | null;
  filed: string | null;
}

export interface Fact {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

// Only the parts of SEC's companyfacts payload this module reads: taxonomy -> concept -> unit -> facts.
export interface CompanyFacts {
  facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>>;
}

// Total-revenue tags; companies switch tags over the years (ASC 606 in 2018) and some report a contract-revenue subtotal
// next to total `Revenues` (utilities), so each period takes the largest value any of these tags reports.
export const REVENUE_CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  'RegulatedAndUnregulatedOperatingRevenue',   // utilities (DTE)
  'RevenuesNetOfInterestExpense',              // banks
];
export const OPERATING_INCOME_CONCEPTS = ['OperatingIncomeLoss'];
// Profit check for banks and insurers, which file no operating income line (LEAPS universe, docs/leaps-rules.md 1.3).
export const NET_INCOME_CONCEPTS = ['NetIncomeLoss'];
// Share counts for market cap, first with a value per period wins:
//   - weighted diluted / basic averages cover every share class (GOOGL, META), unlike the dei cover-page count
//   - XOM stopped tagging diluted shares in 2014 (basic only); KKR tags only period-end shares outstanding
//   - V tags shares per class only (dimensional, absent from companyfacts), so it has no count here
export const SHARES_CONCEPTS = [
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
  'WeightedAverageNumberOfSharesOutstandingBasic',
];
export const SHARES_INSTANT_CONCEPTS = ['CommonStockSharesOutstanding'];
// Fallback when a filer has no cover-page share count:
//   - Under 100k = millions (MCD 716.4)
//   - Under 2M = thousands (TEM ~180,000, whose dual-class cover count is not in companyfacts); the few real sub-2M share counts (Seaboard) file a cover count
const MILLIONS_BELOW = 100_000;
const THOUSANDS_BELOW = 2_000_000;
const SHARE_SCALES = [1, 1e3, 1e6];
// Fallback inputs for filers without an OperatingIncomeLoss tag (COHR, ETN, CC, Qnity): see computedOperatingIncome.
export const COST_CONCEPTS = {
  totalCosts: ['CostsAndExpenses'],
  grossProfit: ['GrossProfit'],
  operatingExpenses: ['OperatingExpenses'],
  costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  rnd: ['ResearchAndDevelopmentExpense'],
};
// Free cash flow inputs, first tag with a value per period wins:
//   - operating cash flow incl. discontinued operations, else continuing operations only
//   - capex: PP&E purchases (MSFT, most filers), else productive assets (AMZN: property and equipment incl. software)
//   - cash: balance-sheet cash and equivalents, else the cash flow statement total that includes restricted cash
export const OPERATING_CASH_FLOW_CONCEPTS = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'];
export const CAPEX_CONCEPTS = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements'];
export const CASH_CONCEPTS = ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'];
// Every us-gaap concept the parser reads; the filing-instance fallback extracts only these.
export const USED_CONCEPTS = [
  ...REVENUE_CONCEPTS, ...OPERATING_INCOME_CONCEPTS, ...NET_INCOME_CONCEPTS, ...Object.values(COST_CONCEPTS).flat(),
  ...OPERATING_CASH_FLOW_CONCEPTS, ...CAPEX_CONCEPTS, ...CASH_CONCEPTS,
];

const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

const isQuarter = (f: Fact) => f.start != null && daysBetween(f.start, f.end) >= 75 && daysBetween(f.start, f.end) <= 105;
const isYearToDate = (f: Fact) => f.start != null && daysBetween(f.start, f.end) >= 75 && daysBetween(f.start, f.end) <= 390;
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

function conceptFacts(facts: unknown, concept: string, unit = 'USD'): Fact[] {
  const list = (facts as CompanyFacts | null)?.facts?.['us-gaap']?.[concept]?.units?.[unit];
  return Array.isArray(list) ? list : [];
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

// shareScale:
//   - Some filers tag income-statement share counts in thousands (VPG 13,310; TEM ~170,000) or millions (MCD) instead of shares
//   - The dei cover-page count (EntityCommonStockSharesOutstanding) is filed as an actual count, so each value takes the scale (1, 1e3, 1e6) that lands closest to the cover count nearest in time
//   - The cover count may cover one share class only (GOOGL); classes differ far less than 1000x, so the scale still comes out right
function shareScale(facts: unknown): (end: string, val: number) => number {
  const cover = ((facts as CompanyFacts | null)?.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [])
    .filter(f => Number.isFinite(f.val) && f.val > 0);
  return (end, val) => {
    if (!cover.length) return val < MILLIONS_BELOW ? val * 1e6 : val < THOUSANDS_BELOW ? val * 1e3 : val;
    const ref = cover.reduce((best, f) => (Math.abs(daysBetween(f.end, end)) < Math.abs(daysBetween(best.end, end)) ? f : best)).val;
    const gap = (scale: number) => Math.abs(Math.log(val * scale / ref));
    return val * SHARE_SCALES.reduce((best, scale) => (gap(scale) < gap(best) ? scale : best));
  };
}

// sharesFor:
//   - Share counts are averages, so a Q4 cannot be derived by subtraction; the fiscal-year average stands in for Q4
//   - First concept with a value for a period wins
function sharesFor(facts: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const scaled = shareScale(facts);
  const put = (end: string, val: number) => { if (!out.has(end) && val > 0) out.set(end, scaled(end, val)); };
  for (const concept of SHARES_CONCEPTS) {
    const list = conceptFacts(facts, concept, 'shares');
    for (const p of periodsOf(list, isQuarter).values()) put(p.end, p.val);
    for (const p of periodsOf(list, isAnnual).values()) put(p.end, p.val);
  }
  for (const concept of SHARES_INSTANT_CONCEPTS) {
    for (const f of instantsOf(conceptFacts(facts, concept, 'shares')).values()) put(f.end, f.val);
  }
  return out;
}

// Balance-sheet instants have no start date; the latest filing per period end wins.
function instantsOf(list: Fact[]): Map<string, Fact> {
  const latest = new Map<string, Fact>();
  for (const f of list) {
    if (f.start || !f.form || !QUARTERLY_FORMS.has(f.form) || !Number.isFinite(f.val)) continue;
    const cur = latest.get(f.end);
    if (!cur || (f.filed ?? '') > (cur.filed ?? '')) latest.set(f.end, f);
  }
  return latest;
}

// First concept with a value for a period end wins.
function cashFor(facts: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const concept of CASH_CONCEPTS) {
    for (const f of instantsOf(conceptFacts(facts, concept)).values()) if (!out.has(f.end)) out.set(f.end, f.val);
  }
  return out;
}

// cashFlowQuartersFor:
//   - Cash flow statements are filed year to date (Q1, first half, nine months, full year), all starting on the fiscal year's first day
//   - Each quarter = its year-to-date total minus the previous one with the same start (Q4 = full year minus nine months)
//   - A filer that reports a plain 3-month period has it used as is, ahead of a subtracted value for the same quarter
//   - First concept with a value for a period end wins
function cashFlowQuartersFor(facts: unknown, concepts: string[]): Map<string, Period> {
  const out = new Map<string, Period>();
  for (const concept of concepts) {
    const byStart = new Map<string, Period[]>();
    for (const p of periodsOf(conceptFacts(facts, concept), isYearToDate).values()) byStart.set(p.start, [...(byStart.get(p.start) ?? []), p]);
    const found = new Map<string, Period>();
    for (const periods of byStart.values()) {
      periods.sort((a, b) => a.end.localeCompare(b.end));
      periods.forEach((p, i) => {
        const fp = p.fp === 'FY' ? 'Q4' : p.fp;
        const prev = periods[i - 1];
        const days = daysBetween(p.start, p.end);
        let q: Period | null = null;
        if (days >= 75 && days <= 105) q = { ...p, fp };
        else if (prev && daysBetween(prev.end, p.end) >= 75 && daysBetween(prev.end, p.end) <= 105) {
          q = { ...p, fp, start: addDays(prev.end, 1), val: p.val - prev.val, derived: true };
        }
        const cur = q && found.get(q.end);
        if (q && (!cur || (cur.derived && !q.derived))) found.set(q.end, q);
      });
    }
    for (const [end, q] of found) if (!out.has(end)) out.set(end, q);
  }
  return out;
}

type QuarterMaps = Record<keyof typeof COST_CONCEPTS, Map<string, Period>>;

// computedOperatingIncome, first match wins (all flagged op_computed):
//   - revenue - CostsAndExpenses (total costs; COHR)
//   - GrossProfit - OperatingExpenses (OperatingExpenses here excludes cost of sales; CC, DGXX)
//   - revenue - cost of revenue - OperatingExpenses
//   - revenue - cost of revenue - SG&A - R&D (filers that tag only the income statement lines; ETN, Qnity)
// Without a cost-of-revenue figure nothing is computed, since OperatingExpenses alone may or may not include it.
function computedOperatingIncome(end: string, rev: Period | undefined, m: QuarterMaps): Period | undefined {
  const at = (k: keyof QuarterMaps) => m[k].get(end);
  const total = at('totalCosts');
  if (rev && total) return { ...total, val: rev.val - total.val };
  const gp = at('grossProfit');
  const opex = at('operatingExpenses');
  if (gp && opex) return { ...opex, val: gp.val - opex.val };
  const cor = at('costOfRevenue');
  if (!rev || !cor) return undefined;
  if (opex) return { ...opex, val: rev.val - cor.val - opex.val };
  const sga = at('sga');
  if (sga) return { ...sga, val: rev.val - cor.val - sga.val - (at('rnd')?.val ?? 0) };
  return undefined;
}

export function parseQuarters(companyFacts: unknown): QuarterRow[] {
  const rev = quartersFor(companyFacts, REVENUE_CONCEPTS);
  const op = quartersFor(companyFacts, OPERATING_INCOME_CONCEPTS);
  const costMaps = Object.fromEntries(
    Object.entries(COST_CONCEPTS).map(([k, concepts]) => [k, quartersFor(companyFacts, concepts)]),
  ) as QuarterMaps;
  const ni = quartersFor(companyFacts, NET_INCOME_CONCEPTS);
  const shares = sharesFor(companyFacts);
  const ocf = cashFlowQuartersFor(companyFacts, OPERATING_CASH_FLOW_CONCEPTS);
  const capex = cashFlowQuartersFor(companyFacts, CAPEX_CONCEPTS);
  const cash = cashFor(companyFacts);
  const ends = [...new Set([...rev.keys(), ...op.keys(), ...ni.keys()])].sort();
  return ends.map(end => {
    const r = rev.get(end);
    const reported = op.get(end);
    const o = reported ?? computedOperatingIncome(end, r, costMaps);
    const n = ni.get(end);
    const base = r ?? o ?? n!;
    return {
      period_start: base.start,
      period_end: end,
      fiscal_year: base.fy,
      fiscal_period: base.fp,
      revenue: r?.val ?? null,
      operating_income: o?.val ?? null,
      derived: Boolean(r?.derived || o?.derived || (!r && !o && n?.derived)),
      op_computed: !reported && o != null,
      net_income: n?.val ?? null,
      diluted_shares: shares.get(end) ?? null,
      operating_cash_flow: ocf.get(end)?.val ?? null,
      capex: capex.get(end)?.val ?? null,
      cash: cash.get(end) ?? null,
      form: base.form,
      filed: [r?.filed, o?.filed, n?.filed].filter(Boolean).sort().pop() ?? null,
    };
  });
}

// factAccessions:
//   - Every accession number that contributed any fact, in any taxonomy (dei cover facts included)
//   - latestFiled is the newest 10-Q/10-K filing date present; later 8-K or S-8 cover facts do not count
export function factAccessions(companyFacts: unknown): { accessions: Set<string>; latestFiled: string | null } {
  const accessions = new Set<string>();
  let latestFiled: string | null = null;
  for (const concepts of Object.values((companyFacts as CompanyFacts | null)?.facts ?? {})) {
    for (const concept of Object.values(concepts)) {
      for (const list of Object.values(concept.units ?? {})) {
        for (const f of list) {
          if (f.accn) accessions.add(f.accn);
          if (f.filed && f.form && QUARTERLY_FORMS.has(f.form) && (!latestFiled || f.filed > latestFiled)) latestFiled = f.filed;
        }
      }
    }
  }
  return { accessions, latestFiled };
}

export interface PeriodicFiling {
  accession: string;
  form: string;
  filed: string;
  primaryDocument: string;
}

// periodicFilingsMissing:
//   - 10-Q / 10-K filings (originals, not amendments) whose data is not in companyfacts yet, newest first
//   - SEC's companyfacts API can lag a filing by months (CDNS's July 2026 10-Q), while the filing's own XBRL is on EDGAR
export function periodicFilingsMissing(submissions: unknown, have: Set<string>, latestFiled: string | null): PeriodicFiling[] {
  const recent = ((submissions as { filings?: { recent?: RecentFilings & { primaryDocument?: string[] } } } | null)?.filings?.recent) ?? {};
  const out: PeriodicFiling[] = [];
  (recent.form ?? []).forEach((form, i) => {
    const accession = recent.accessionNumber?.[i];
    const filed = recent.filingDate?.[i];
    const primaryDocument = recent.primaryDocument?.[i];
    if ((form !== '10-Q' && form !== '10-K') || !accession || !filed || !primaryDocument) return;
    if (have.has(accession) || (latestFiled && filed < latestFiled)) return;
    out.push({ accession, form, filed, primaryDocument });
  });
  return out.sort((a, b) => b.filed.localeCompare(a.filed));
}

// Appends extra facts (from a filing's own XBRL) to a companyfacts payload without mutating either.
export function mergeFacts(base: unknown, extra: CompanyFacts): CompanyFacts {
  const out: CompanyFacts = { ...(base as CompanyFacts | null), facts: { ...((base as CompanyFacts | null)?.facts ?? {}) } };
  for (const [ns, concepts] of Object.entries(extra.facts ?? {})) {
    const target = { ...(out.facts![ns] ?? {}) };
    for (const [name, concept] of Object.entries(concepts)) {
      const units = { ...(target[name]?.units ?? {}) };
      for (const [unit, list] of Object.entries(concept.units ?? {})) units[unit] = [...(units[unit] ?? []), ...list];
      target[name] = { ...target[name], units };
    }
    out.facts![ns] = target;
  }
  return out;
}
