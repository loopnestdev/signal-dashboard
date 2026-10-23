import type { CompanyFacts, Fact, PeriodicFiling } from './parse.js';

// Pure parser for a filing's XBRL instance (the `<name>_htm.xml` EDGAR extracts from an inline-XBRL 10-Q/10-K).
// Used only while SEC's companyfacts API has not caught up with that filing.

const US_GAAP_NS = /xmlns:([\w-]+)="http:\/\/fasb\.org\/us-gaap\/\d{4}"/;
const DEI_NS = /xmlns:([\w-]+)="http:\/\/xbrl\.sec\.gov\/dei\/\d{4}"/;
const CONTEXT = /<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
const UNIT = /<(?:[\w-]+:)?unit\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?unit>/g;
const DATE = (tag: string) => new RegExp(`<(?:[\\w-]+:)?${tag}>\\s*([0-9-]{10})\\s*<`);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Period {
  start: string;
  end: string;
}

// Contexts with a segment or scenario are dimensional (a business segment, a product line); only entity-wide
// duration contexts carry the consolidated income statement.
function consolidatedDurations(xml: string): Map<string, Period> {
  const out = new Map<string, Period>();
  for (const [, id, body] of xml.matchAll(CONTEXT)) {
    if (/<(?:[\w-]+:)?(segment|scenario)\b/.test(body)) continue;
    const start = body.match(DATE('startDate'))?.[1];
    const end = body.match(DATE('endDate'))?.[1];
    if (start && end) out.set(id, { start, end });
  }
  return out;
}

// Unit ids are filer-chosen ("usd", "U_USD", "Unit1"), so dollars are found by measure, not by id.
function usdUnits(xml: string): Set<string> {
  const out = new Set<string>();
  for (const [, id, body] of xml.matchAll(UNIT)) {
    if (!/divide/i.test(body) && /<(?:[\w-]+:)?measure>\s*iso4217:USD\s*</i.test(body)) out.add(id);
  }
  return out;
}

function deiValue(xml: string, name: string): string | null {
  const prefix = xml.match(DEI_NS)?.[1];
  if (!prefix) return null;
  return xml.match(new RegExp(`<${escape(prefix)}:${name}\\b[^>]*>\\s*([^<]+?)\\s*<`))?.[1] ?? null;
}

// parseInstanceFacts:
//   - Returns the listed us-gaap concepts in companyfacts shape, so parseQuarters reads them like any other fact
//   - USD values on consolidated duration contexts only; nil and non-numeric values are skipped
//   - accn / form / filed come from the filing's submissions entry; fy / fp from its dei cover facts
export function parseInstanceFacts(xml: string, filing: PeriodicFiling, concepts: string[]): CompanyFacts {
  const prefix = xml.match(US_GAAP_NS)?.[1];
  if (!prefix) return { facts: {} };
  const contexts = consolidatedDurations(xml);
  const usd = usdUnits(xml);
  const fyText = deiValue(xml, 'DocumentFiscalYearFocus');
  const fy = fyText && /^\d{4}$/.test(fyText) ? Number(fyText) : undefined;
  const fp = deiValue(xml, 'DocumentFiscalPeriodFocus') ?? undefined;

  const usGaap: Record<string, { units: { USD: Fact[] } }> = {};
  for (const concept of concepts) {
    const tag = new RegExp(`<${escape(prefix)}:${concept}\\b([^>]*)>([^<]*)</${escape(prefix)}:${concept}>`, 'g');
    const facts: Fact[] = [];
    const seen = new Set<string>();
    for (const [, attrs, text] of xml.matchAll(tag)) {
      const ctx = contexts.get(attrs.match(/\bcontextRef="([^"]+)"/)?.[1] ?? '');
      const unit = attrs.match(/\bunitRef="([^"]+)"/)?.[1] ?? '';
      const val = Number(text.trim());
      if (!ctx || !usd.has(unit) || /\bxsi:nil="true"/.test(attrs) || text.trim() === '' || !Number.isFinite(val)) continue;
      const key = `${ctx.start}|${ctx.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ start: ctx.start, end: ctx.end, val, accn: filing.accession, fy, fp, form: filing.form, filed: filing.filed });
    }
    if (facts.length) usGaap[concept] = { units: { USD: facts } };
  }
  return { facts: { 'us-gaap': usGaap } };
}

// EDGAR names the extracted instance after the primary document: cdns-20260630.htm -> cdns-20260630_htm.xml.
export const instanceFileName = (primaryDocument: string): string | null =>
  /\.htm$/i.test(primaryDocument) ? primaryDocument.replace(/\.htm$/i, '_htm.xml') : null;
