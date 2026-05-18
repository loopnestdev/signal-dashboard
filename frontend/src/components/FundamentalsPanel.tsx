import { C } from '../lib/colors';
import type { FundamentalsData } from '../types/stock';

function fmtNum(v: number | null | undefined, prefix = '', suffix = '', decimals = 2): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e12) return `${prefix}${(v / 1e12).toFixed(1)}T${suffix}`;
  if (Math.abs(v) >= 1e9) return `${prefix}${(v / 1e9).toFixed(1)}B${suffix}`;
  if (Math.abs(v) >= 1e6) return `${prefix}${(v / 1e6).toFixed(1)}M${suffix}`;
  return `${prefix}${v.toFixed(decimals)}${suffix}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtX(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}x`;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 10px', borderRadius: 6,
    }}>
      <span style={{ fontSize: '12px', color: C.inkMute }}>{label}</span>
      <span style={{
        fontSize: '13px', fontWeight: 400, fontFeatureSettings: '"tnum"',
        color: color ?? C.inkSec,
      }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em',
        marginBottom: 6, padding: '0 10px',
      }}>
        {title}
      </div>
      <div style={{
        background: C.canvasSoft, border: `1px solid ${C.border}`,
        borderRadius: 8, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

export function FundamentalsPanel({ data }: { data: FundamentalsData | null }) {
  const analystColor = (r: string | null) => {
    if (!r) return C.inkMute;
    const rLower = r.toLowerCase();
    if (rLower.includes('buy') || rLower.includes('outperform') || rLower.includes('overweight')) return C.bull;
    if (rLower.includes('sell') || rLower.includes('underperform') || rLower.includes('underweight')) return C.bear;
    return C.warn;
  };

  const growthColor = (v: number | null) => {
    if (v == null) return undefined;
    return v >= 10 ? C.bull : v >= 0 ? C.inkSec : C.bear;
  };

  const marginColor = (v: number | null) => {
    if (v == null) return undefined;
    return v >= 20 ? C.bull : v >= 5 ? C.inkSec : C.bear;
  };

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: C.s1,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${C.border}`, background: C.canvasSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.10em', fontWeight: 400 }}>
          FUNDAMENTALS
        </span>
        {data?.analystRating && (
          <span style={{
            fontSize: '11px', fontWeight: 400,
            color: analystColor(data.analystRating),
            background: C.canvasSoft,
            border: `1px solid ${C.border}`,
            borderRadius: 9999, padding: '2px 10px',
          }}>
            Analyst: {data.analystRating}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {!data ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '13px', color: C.inkMute }}>No fundamental data available</div>
            <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 4, opacity: 0.7 }}>
              Requires Signa.ai API key with fundamentals access
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>

            {/* Valuation */}
            <Section title="VALUATION">
              <MetricRow label="Market Cap" value={fmtNum(data.marketCap, '$')} />
              <MetricRow label="P/E Ratio" value={fmtX(data.peRatio)} />
              <MetricRow label="Forward P/E" value={fmtX(data.forwardPE)} />
              <MetricRow label="PEG Ratio" value={fmtX(data.pegRatio)} />
              <MetricRow label="Price/Book" value={fmtX(data.priceToBook)} />
              <MetricRow label="Price/Sales" value={fmtX(data.priceToSales)} />
              <MetricRow label="EV/EBITDA" value={fmtX(data.evToEbitda)} />
            </Section>

            {/* Growth */}
            <Section title="GROWTH">
              <MetricRow label="Revenue Growth YoY" value={fmtPct(data.revenueGrowthYoy)} color={growthColor(data.revenueGrowthYoy)} />
              <MetricRow label="Earnings Growth YoY" value={fmtPct(data.earningsGrowthYoy)} color={growthColor(data.earningsGrowthYoy)} />
              <MetricRow label="EPS (TTM)" value={fmtNum(data.eps, '$')} />
              <MetricRow label="EPS (Next Year)" value={fmtNum(data.epsNextYear, '$')} />
            </Section>

            {/* Profitability */}
            <Section title="PROFITABILITY">
              <MetricRow label="Gross Margin" value={fmtPct(data.grossMargin)} color={marginColor(data.grossMargin)} />
              <MetricRow label="Operating Margin" value={fmtPct(data.operatingMargin)} color={marginColor(data.operatingMargin)} />
              <MetricRow label="Net Margin" value={fmtPct(data.netMargin)} color={marginColor(data.netMargin)} />
              <MetricRow label="Return on Equity" value={fmtPct(data.returnOnEquity)} color={growthColor(data.returnOnEquity)} />
              <MetricRow label="Return on Assets" value={fmtPct(data.returnOnAssets)} color={growthColor(data.returnOnAssets)} />
              <MetricRow label="FCF Yield" value={fmtPct(data.freeCashFlowYield)} />
            </Section>

            {/* Financial Health */}
            <Section title="FINANCIAL HEALTH">
              <MetricRow label="Debt/Equity" value={fmtX(data.debtToEquity)} color={data.debtToEquity != null ? (data.debtToEquity > 2 ? C.bear : data.debtToEquity > 1 ? C.warn : C.bull) : undefined} />
              <MetricRow label="Current Ratio" value={fmtX(data.currentRatio)} color={data.currentRatio != null ? (data.currentRatio < 1 ? C.bear : data.currentRatio > 2 ? C.bull : C.inkSec) : undefined} />
              <MetricRow label="Dividend Yield" value={fmtPct(data.dividendYield)} />
            </Section>

            {/* Ownership & Analyst */}
            <Section title="OWNERSHIP & ANALYST">
              {data.priceTarget != null && (
                <MetricRow
                  label="Price Target"
                  value={`$${data.priceTarget.toFixed(2)}${data.priceTargetLow != null && data.priceTargetHigh != null ? ` ($${data.priceTargetLow.toFixed(0)}–$${data.priceTargetHigh.toFixed(0)})` : ''}`}
                />
              )}
              <MetricRow label="Insider Ownership" value={fmtPct(data.insiderOwnership)} />
              <MetricRow label="Institutional %" value={fmtPct(data.institutionalOwnership)} />
              <MetricRow
                label="Short Float"
                value={fmtPct(data.shortFloat)}
                color={data.shortFloat != null ? (data.shortFloat > 20 ? C.bear : data.shortFloat > 10 ? C.warn : C.bull) : undefined}
              />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
