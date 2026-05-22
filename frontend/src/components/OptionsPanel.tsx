import { C } from '../lib/colors';
import type { OptionsInsight, OptionsFlowData, DarkpoolData, GammaData } from '../types/stock';

function directionColor(d: 'bullish' | 'bearish' | 'neutral') {
  return d === 'bullish' ? C.bull : d === 'bearish' ? C.bear : C.inkMute;
}
function directionBg(d: 'bullish' | 'bearish' | 'neutral') {
  return d === 'bullish' ? C.bullBg : d === 'bearish' ? C.bearBg : C.canvasSoft;
}
function directionBorder(d: 'bullish' | 'bearish' | 'neutral') {
  return d === 'bullish' ? C.bullBorder : d === 'bearish' ? C.bearBorder : C.border;
}
function confidenceColor(c: 'high' | 'medium' | 'low') {
  return c === 'high' ? C.bull : c === 'medium' ? C.warn : C.inkMute;
}

function fmt(n: number | null | undefined, prefix = '', suffix = '', decimals = 1): string {
  if (n == null) return '—';
  const formatted = n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toFixed(decimals);
  return `${prefix}${formatted}${suffix}`;
}

function FlowSection({ flow }: { flow: OptionsFlowData }) {
  const topItems = flow.items
    .filter(i => i.unusual || i.premium > 100000)
    .slice(0, 5);

  return (
    <div>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', marginBottom: 8 }}>OPTIONS FLOW</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>C/P Ratio</div>
          <div style={{
            fontSize: '15px', fontWeight: 500, fontFeatureSettings: '"tnum"',
            color: flow.callPutRatio > 1 ? C.bull : flow.callPutRatio < 0.8 ? C.bear : C.inkSec,
          }}>
            {flow.callPutRatio.toFixed(2)}
          </div>
        </div>
        <div style={{ background: C.bullBg, border: `1px solid ${C.bullBorder}`, borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>Bullish $</div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: C.bull, fontFeatureSettings: '"tnum"' }}>
            {fmt(flow.bullishPremium, '$')}
          </div>
        </div>
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>Bearish $</div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: C.bear, fontFeatureSettings: '"tnum"' }}>
            {fmt(flow.bearishPremium, '$')}
          </div>
        </div>
      </div>

      {topItems.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 2 }}>NOTABLE TRADES</div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 340 }}>
              {topItems.map((item, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '50px 70px 70px 60px 1fr',
                  gap: 8, alignItems: 'center', padding: '5px 10px',
                  background: item.unusual ? (item.type === 'CALL' ? C.bullBg : C.bearBg) : C.canvasSoft,
                  border: `1px solid ${item.unusual ? (item.type === 'CALL' ? C.bullBorder : C.bearBorder) : C.border}`,
                  borderRadius: 6, fontSize: '11px',
                }}>
                  <span style={{
                    color: item.type === 'CALL' ? C.bull : C.bear,
                    fontWeight: 500,
                  }}>
                    {item.type}
                  </span>
                  <span style={{ color: C.inkSec, fontFeatureSettings: '"tnum"' }}>
                    ${item.strike.toFixed(0)} · {item.expiry}
                  </span>
                  <span style={{ color: C.inkSec, fontFeatureSettings: '"tnum"' }}>
                    {fmt(item.premium, '$')}
                  </span>
                  <span style={{ color: C.inkMute, fontFeatureSettings: '"tnum"' }}>
                    ×{item.size.toLocaleString()}
                  </span>
                  {item.unusual && (
                    <span style={{ color: C.warn, fontSize: '10px' }}>⚡ unusual</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DarkpoolSection({ dp }: { dp: DarkpoolData }) {
  const topTrades = dp.trades.slice(0, 4);
  const bullPct = dp.totalVolume > 0 ? (dp.bullishVolume / dp.totalVolume) * 100 : 0;
  const bearPct = dp.totalVolume > 0 ? (dp.bearishVolume / dp.totalVolume) * 100 : 0;

  return (
    <div>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', marginBottom: 8 }}>DARK POOL</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>Off-Exchange %</div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: C.inkSec, fontFeatureSettings: '"tnum"' }}>
            {dp.darkpoolPercent.toFixed(1)}%
          </div>
        </div>
        <div style={{ background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>Avg Fill</div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: C.inkSec, fontFeatureSettings: '"tnum"' }}>
            ${dp.avgPrice.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Bull/bear volume bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: C.inkMute, marginBottom: 4 }}>
          <span style={{ color: C.bull }}>Bullish {bullPct.toFixed(0)}%</span>
          <span style={{ color: C.bear }}>Bearish {bearPct.toFixed(0)}%</span>
        </div>
        <div style={{ height: 6, background: C.bearBg, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${bullPct}%`, background: C.bull, transition: 'width 0.8s ease' }} />
        </div>
      </div>

      {topTrades.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 2 }}>RECENT PRINTS</div>
          {topTrades.map((t, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '60px 80px 80px 1fr',
              gap: 8, alignItems: 'center', padding: '5px 10px',
              background: t.sentiment === 'bullish' ? C.bullBg : t.sentiment === 'bearish' ? C.bearBg : C.canvasSoft,
              border: `1px solid ${t.sentiment === 'bullish' ? C.bullBorder : t.sentiment === 'bearish' ? C.bearBorder : C.border}`,
              borderRadius: 6, fontSize: '11px',
            }}>
              <span style={{ color: C.inkMute }}>{t.time}</span>
              <span style={{ color: C.inkSec, fontFeatureSettings: '"tnum"' }}>${t.price.toFixed(2)}</span>
              <span style={{ color: C.inkSec, fontFeatureSettings: '"tnum"' }}>{fmt(t.size)} shares</span>
              <span style={{
                color: t.sentiment === 'bullish' ? C.bull : t.sentiment === 'bearish' ? C.bear : C.inkMute,
                fontSize: '10px',
              }}>
                {t.exchange}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GammaSection({ gamma, currentPrice }: { gamma: GammaData; currentPrice: number }) {
  const topLevels = gamma.keyLevels
    .filter(l => Math.abs(l.strike - currentPrice) / currentPrice < 0.10)
    .sort((a, b) => Math.abs(b.netGamma) - Math.abs(a.netGamma))
    .slice(0, 5);

  return (
    <div>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.08em', marginBottom: 8 }}>GAMMA EXPOSURE</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{
          background: gamma.netGamma > 0 ? C.bullBg : C.bearBg,
          border: `1px solid ${gamma.netGamma > 0 ? C.bullBorder : C.bearBorder}`,
          borderRadius: 8, padding: '8px 12px',
        }}>
          <div style={{ fontSize: '10px', color: C.inkMute }}>Net GEX</div>
          <div style={{
            fontSize: '15px', fontWeight: 500, fontFeatureSettings: '"tnum"',
            color: gamma.netGamma > 0 ? C.bull : C.bear,
          }}>
            {gamma.netGamma > 0 ? '+' : ''}{fmt(gamma.netGamma)}
          </div>
        </div>
        {gamma.gammaFlipPoint != null && (
          <div style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: '10px', color: C.inkMute }}>Gamma Flip</div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: C.warn, fontFeatureSettings: '"tnum"' }}>
              ${gamma.gammaFlipPoint.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {gamma.pinRisk && (
        <div style={{
          background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 6,
          padding: '6px 10px', fontSize: '12px', color: C.warn, marginBottom: 8,
        }}>
          ⚠ Pin risk — price may be drawn toward a high-OI strike near expiry
        </div>
      )}

      {topLevels.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '10px', color: C.inkMute, marginBottom: 2 }}>KEY GAMMA LEVELS (within 10%)</div>
          {topLevels.map((l, i) => {
            const isAbove = l.strike > currentPrice;
            const isNear = Math.abs(l.strike - currentPrice) / currentPrice < 0.02;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 80px',
                gap: 8, alignItems: 'center', padding: '5px 10px',
                background: isNear ? C.warnBg : C.canvasSoft,
                border: `1px solid ${isNear ? C.warnBorder : C.border}`,
                borderRadius: 6, fontSize: '11px',
              }}>
                <span style={{ color: isNear ? C.warn : C.inkSec, fontFeatureSettings: '"tnum"', fontWeight: isNear ? 500 : 400 }}>
                  ${l.strike.toFixed(0)}
                </span>
                <span style={{ color: C.inkMute }}>
                  {isNear ? '← current zone' : isAbove ? 'resistance / call wall' : 'support / put wall'}
                </span>
                <span style={{
                  color: l.netGamma > 0 ? C.bull : C.bear, textAlign: 'right',
                  fontSize: '10px', fontFeatureSettings: '"tnum"',
                }}>
                  {l.netGamma > 0 ? '+' : ''}{fmt(l.netGamma)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OptionsPanel({ insight, currentPrice }: { insight: OptionsInsight; currentPrice: number }) {
  const hasAnyData = insight.flow != null || insight.darkpool != null || insight.gamma != null;

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: C.s1,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, background: C.canvasSoft }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.10em', fontWeight: 400 }}>
            OPTIONS INTELLIGENCE
          </span>

          {hasAnyData && (
            <>
              <span style={{
                fontSize: '11px', fontWeight: 400,
                background: directionBg(insight.overallDirection),
                border: `1px solid ${directionBorder(insight.overallDirection)}`,
                color: directionColor(insight.overallDirection),
                borderRadius: 9999, padding: '2px 10px',
              }}>
                {insight.overallDirection.toUpperCase()}
              </span>
              <span style={{
                fontSize: '11px', color: confidenceColor(insight.confidence),
              }}>
                {insight.confidence.toUpperCase()} confidence
              </span>
            </>
          )}
        </div>

        {hasAnyData && (
          <div style={{ fontSize: '12px', color: C.inkSec, marginTop: 6, lineHeight: 1.5 }}>
            {insight.summary}
          </div>
        )}

        {hasAnyData && insight.keyPoints.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {insight.keyPoints.map((pt, i) => (
              <div key={i} style={{ fontSize: '12px', color: C.inkMute, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ color: C.primary, flexShrink: 0 }}>→</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {!hasAnyData ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '13px', color: C.inkMute }}>
              Options data not available for this ticker
            </div>
            <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 4, opacity: 0.7 }}>
              Requires Signa.ai API key with options access
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
            {insight.flow && <FlowSection flow={insight.flow} />}
            {insight.darkpool && <DarkpoolSection dp={insight.darkpool} />}
            {insight.gamma && <GammaSection gamma={insight.gamma} currentPrice={currentPrice} />}
          </div>
        )}
      </div>
    </div>
  );
}
