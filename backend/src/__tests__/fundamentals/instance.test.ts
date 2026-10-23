import { describe, it, expect } from 'vitest';
import { instanceFileName, parseInstanceFacts } from '../../fundamentals/instance.js';

const filing = { accession: '0000813672-26-000092', form: '10-Q', filed: '2026-07-29', primaryDocument: 'cdns-20260630.htm' };

// Trimmed from an EDGAR-extracted inline XBRL instance: filer-chosen unit ids, a segment context, a share unit.
const xml = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025"
  xmlns:dei="http://xbrl.sec.gov/dei/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi">
  <xbrli:context id="c-q2"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000813672</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="c-ytd"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000813672</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="c-seg"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000813672</xbrli:identifier>
    <xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">cdns:IPMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
    <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="c-inst"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000813672</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
  <xbrli:unit id="U_USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
  <xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator>
    <xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
  <dei:DocumentFiscalYearFocus contextRef="c-ytd">2026</dei:DocumentFiscalYearFocus>
  <dei:DocumentFiscalPeriodFocus contextRef="c-ytd">Q2</dei:DocumentFiscalPeriodFocus>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax
      contextRef="c-q2" decimals="-3" unitRef="U_USD">1585000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="c-ytd" decimals="-3" unitRef="U_USD">3059220000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="c-seg" decimals="-3" unitRef="U_USD">400000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="c-q2" decimals="-3" unitRef="U_USD">1585000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:OperatingIncomeLoss contextRef="c-q2" decimals="-3" unitRef="U_USD">450315000</us-gaap:OperatingIncomeLoss>
  <us-gaap:OperatingExpenses contextRef="c-q2" unitRef="U_USD" xsi:nil="true"></us-gaap:OperatingExpenses>
  <us-gaap:EarningsPerShareBasic contextRef="c-q2" decimals="2" unitRef="usdPerShare">1.21</us-gaap:EarningsPerShareBasic>
  <us-gaap:CostOfRevenue contextRef="c-q2" decimals="-3" unitRef="shares">5</us-gaap:CostOfRevenue>
  <us-gaap:GrossProfit contextRef="c-inst" decimals="-3" unitRef="U_USD">7</us-gaap:GrossProfit>
</xbrli:xbrl>`;

const concepts = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'OperatingIncomeLoss', 'OperatingExpenses', 'EarningsPerShareBasic', 'CostOfRevenue', 'GrossProfit'];

describe('parseInstanceFacts', () => {
  const out = parseInstanceFacts(xml, filing, concepts).facts!['us-gaap'];

  it('reads consolidated USD duration facts in companyfacts shape, stamped with the filing', () => {
    expect(out.OperatingIncomeLoss.units!.USD).toEqual([{
      start: '2026-04-01', end: '2026-06-30', val: 450315000, accn: filing.accession, fy: 2026, fp: 'Q2', form: '10-Q', filed: '2026-07-29',
    }]);
  });

  it('keeps quarter and year-to-date periods, drops segment contexts and duplicates', () => {
    expect(out.RevenueFromContractWithCustomerExcludingAssessedTax.units!.USD.map(f => [f.start, f.val])).toEqual([
      ['2026-04-01', 1585000000], ['2026-01-01', 3059220000],
    ]);
  });

  it('skips nil values, per-share and share units, and instant contexts', () => {
    expect(out.OperatingExpenses).toBeUndefined();
    expect(out.EarningsPerShareBasic).toBeUndefined();
    expect(out.CostOfRevenue).toBeUndefined();
    expect(out.GrossProfit).toBeUndefined();
  });

  it('returns no facts when the document has no us-gaap namespace', () => {
    expect(parseInstanceFacts('<xbrl></xbrl>', filing, concepts)).toEqual({ facts: {} });
  });
});

describe('instanceFileName', () => {
  it('derives the EDGAR instance name from the primary document', () => {
    expect(instanceFileName('cdns-20260630.htm')).toBe('cdns-20260630_htm.xml');
    expect(instanceFileName('form10q.pdf')).toBeNull();
  });
});
