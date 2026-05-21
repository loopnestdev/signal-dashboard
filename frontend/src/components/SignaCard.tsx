import { C } from '../lib/colors';
import type { SignaData, SignaNewsArticle, CongressTrade } from '../types/stock';

interface Props {
  signa: SignaData;
  currentPrice: number;
}

function directionStyle(d: string): { color: string; bg: string; border: string } {
  const dir = d.toUpperCase();
  if (dir === 'LONG'  || dir === 'BUY'  || dir === 'BULLISH') return { color: C.bull, bg: C.bullBg, border: C.bullBorder };
  if (dir === 'SHORT' || dir === 'SELL' || dir === 'BEARISH') return { color: C.bear, bg: C.bearBg, border: C.bearBorder };
  return { color: C.warn, bg: C.warnBg, border: C.warnBorder };
}

function gradeStyle(g: string): { color: string; bg: string; border: string } {
  if (g === 'A+' || g === 'A') return { color: C.bull, bg: C.bullBg, border: C.bullBorder };
  if (g === 'B+' || g === 'B') return { color: C.warn, bg: C.warnBg, border: C.warnBorder };
  return { color: C.bear, bg: C.bearBg, border: C.bearBorder };
}

function riskStyle(r: string): { color: string } {
  const rv = r.toUpperCase();
  if (rv === 'LOW')      return { color: C.bull };
  if (rv === 'MODERATE') return { color: C.warn };
  return { color: C.bear };
}

function newsSentimentStyle(s?: string): { color: string; label: string } {
  const v = (s ?? '').toUpperCase();
  if (v === 'BULLISH' || v === 'POSITIVE') return { color: C.bull, label: '▲' };
  if (v === 'BEARISH' || v === 'NEGATIVE') return { color: C.bear, label: '▼' };
  return { color: C.inkMute, label: '—' };
}

function Pill({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      fontSize: '13px', fontWeight: 400, color,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 9999, padding: '4px 12px',
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  );
}

function PriceCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '10px 8px',
      background: C.canvasSoft, borderRadius: 8, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.06em', marginBottom: 5, fontWeight: 400 }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px', fontWeight: 500, color: color ?? C.ink,
        fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
    </div>
  );
}

function NewsItem({ article }: { article: SignaNewsArticle }) {
  const sStyle = newsSentimentStyle(article.sentiment);
  const date = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <a
      href={article.url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        padding: '9px 12px',
        background: C.canvasSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 7,
        textDecoration: 'none',
        cursor: article.url ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: '13px', color: C.ink, flex: 1, lineHeight: 1.4 }}>{article.title}</span>
        <span style={{ fontSize: '12px', color: sStyle.color, fontWeight: 500, flexShrink: 0 }}>{sStyle.label}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {article.source && (
          <span style={{ fontSize: '10px', color: C.inkMute }}>{article.source}</span>
        )}
        {date && (
          <span style={{ fontSize: '10px', color: C.inkMute }}>{date}</span>
        )}
      </div>
    </a>
  );
}

function CongressTradeRow({ trade }: { trade: CongressTrade }) {
  const isBuy = trade.transactionType.toLowerCase().includes('purchase') || trade.transactionType.toLowerCase().includes('buy');
  const color = isBuy ? C.bull : C.bear;
  const partyColor = trade.party === 'D' ? '#3b82f6' : trade.party === 'R' ? C.bear : C.inkMute;
  const date = trade.transactionDate
    ? new Date(trade.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : trade.transactionDate;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      gap: 10, alignItems: 'center',
      padding: '8px 12px',
      background: C.canvasSoft, border: `1px solid ${C.border}`,
      borderRadius: 7,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '13px', color: C.ink }}>{trade.senator}</span>
          <span style={{
            fontSize: '10px', fontWeight: 500, color: partyColor,
            border: `1px solid ${partyColor}`, borderRadius: 4,
            padding: '1px 5px', lineHeight: 1.4,
          }}>
            {trade.party}
          </span>
          <span style={{ fontSize: '10px', color: C.inkMute }}>{trade.chamber}</span>
        </div>
        <div style={{ fontSize: '11px', color: C.inkMute, marginTop: 2 }}>{trade.amount} · {date}</div>
      </div>
      <span style={{
        fontSize: '12px', fontWeight: 500, color,
        background: isBuy ? C.bullBg : C.bearBg,
        border: `1px solid ${isBuy ? C.bullBorder : C.bearBorder}`,
        borderRadius: 9999, padding: '2px 10px',
      }}>
        {isBuy ? '▲ Buy' : '▼ Sell'}
      </span>
    </div>
  );
}

function CongressSection({ congress }: { congress: SignaData['congress'] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400 }}>
          CONGRESS SIGNAL
        </div>
        {congress && congress.trades.length > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 500,
            color: congress.direction === 'bullish' ? C.bull : congress.direction === 'bearish' ? C.bear : C.inkMute,
          }}>
            {congress.purchaseCount} buy · {congress.saleCount} sell
          </span>
        )}
      </div>

      {congress && congress.trades.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {congress.trades.slice(0, 5).map((trade, i) => (
            <CongressTradeRow key={i} trade={trade} />
          ))}
        </div>
      ) : (
        <div style={{
          fontSize: '13px', color: C.inkMute, fontStyle: 'italic',
          padding: '12px 14px', background: C.canvasSoft,
          border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          {congress === undefined
            ? 'No congressional trading data — available on higher-tier Signa plans.'
            : 'No recent congressional trades reported for this ticker.'}
        </div>
      )}
    </div>
  );
}

export function SignaCard({ signa, currentPrice }: Props) {
  const dStyle = directionStyle(signa.direction);
  const gStyle = gradeStyle(signa.grade);
  const rStyle = riskStyle(signa.riskRating);
  const allTriggers = [...signa.triggers, ...signa.signaTriggers];
  const earlyWarnings = signa.riskScore >= 5 ? signa.riskFactors : [];
  const bearishPatterns = signa.patterns.filter(p => p.type === 'bearish' && p.confidence > 0.5);
  const hasWarnings = earlyWarnings.length > 0 || bearishPatterns.length > 0;

  // Validate price levels against engine direction.
  // The data field may compute a SHORT setup while engine says BULLISH — don't show inverted levels.
  const isLong = ['BULLISH', 'LONG', 'BUY'].includes(signa.direction.toUpperCase());
  const entryRef = signa.entry > 0 ? signa.entry : currentPrice;
  const stopValid  = signa.stop   > 0 && (isLong ? signa.stop   < entryRef : signa.stop   > entryRef);
  const targetValid = signa.target > 0 && (isLong ? signa.target > entryRef : signa.target < entryRef);
  const rrValid = stopValid && targetValid && signa.rr > 0;

  const hasWeekly = !!signa.weeklyDirection;
  const weeklyDStyle = hasWeekly ? directionStyle(signa.weeklyDirection!) : null;
  const weeklyGStyle = hasWeekly && signa.weeklyGrade ? gradeStyle(signa.weeklyGrade) : null;

  const hasSentiment = !!signa.sentiment;
  const bullPct = signa.sentiment?.bullish ?? 0;
  const bearPct = signa.sentiment?.bearish ?? 0;
  const sentimentLabel = bullPct >= 60 ? 'Bullish skew' : bearPct >= 60 ? 'Bearish skew' : 'Mixed sentiment';
  const sentimentColor = bullPct >= 60 ? C.bull : bearPct >= 60 ? C.bear : C.warn;

  const news = (signa.newsItems ?? []).slice(0, 4);

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      padding: '20px 0',
    }}>
      {/* ── Status row: direction / grade / stage / confidence / risk ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 10 }}>
          SIGNA.AI SIGNAL
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Direction — most prominent, sourced from nightly engine */}
          <Pill label={`● ${signa.direction}`} {...dStyle} />
          {/* Grade */}
          <Pill label={`Grade ${signa.grade}`} {...gStyle} />
          {/* Stage */}
          <span style={{
            fontSize: '13px', color: C.inkSec, background: C.canvasSoft,
            border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            Stage {signa.stage} — {signa.stageDescription}
          </span>
          {/* Confidence */}
          <span style={{
            fontSize: '13px', color: C.primary, background: C.primaryBg,
            border: `1px solid ${C.primaryBorder}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            Confidence: {signa.confidence}%
          </span>
          {/* Risk */}
          <span style={{
            fontSize: '13px', color: rStyle.color, background: C.canvasSoft,
            border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 12px',
          }}>
            Risk: {signa.riskRating}
          </span>
        </div>
        {/* Source attribution */}
        <div style={{ fontSize: '10px', color: C.inkMute, marginTop: 6, letterSpacing: '0.03em' }}>
          ↑ Nightly 30+ model pipeline — matches Signa Canvas Action Card
        </div>
      </div>

      {/* ── Weekly timeframe alignment ── */}
      {hasWeekly && weeklyDStyle && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 12px', marginBottom: 12,
          background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <span style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.07em', fontWeight: 400, minWidth: 80 }}>
            WEEKLY (1W)
          </span>
          <Pill label={`● ${signa.weeklyDirection!}`} {...weeklyDStyle} />
          {signa.weeklyGrade && weeklyGStyle && (
            <Pill label={`Grade ${signa.weeklyGrade}`} {...weeklyGStyle} />
          )}
          {signa.weeklyConfidence !== undefined && (
            <span style={{ fontSize: '12px', color: C.inkSec }}>
              Confidence: {signa.weeklyConfidence}%
            </span>
          )}
          <span style={{ fontSize: '10px', color: C.inkMute, marginLeft: 'auto' }}>
            {signa.weeklyDirection === signa.direction ? '✓ Aligned' : '⚡ Diverging'}
          </span>
        </div>
      )}

      {/* ── Price levels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        <PriceCell label="CURRENT"    value={`$${currentPrice.toFixed(2)}`} />
        <PriceCell label="BEST ENTRY" value={signa.entry > 0 ? `$${signa.entry.toFixed(2)}` : '—'} color={C.primary} />
        <PriceCell label="STOP LOSS"  value={stopValid   ? `$${signa.stop.toFixed(2)}`   : '—'} color={stopValid   ? C.bear : undefined} />
        <PriceCell label="TARGET"     value={targetValid ? `$${signa.target.toFixed(2)}` : '—'} color={targetValid ? C.bull : undefined} />
        <PriceCell
          label="R : R"
          value={rrValid ? `${signa.rr.toFixed(1)}×` : '—'}
          color={rrValid ? (signa.rr >= 2 ? C.bull : signa.rr >= 1 ? C.warn : C.bear) : undefined}
        />
      </div>

      {/* ── Sentiment bar ── */}
      {hasSentiment && (
        <div style={{
          padding: '10px 14px', marginBottom: 14,
          background: C.canvasSoft, border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400 }}>
              MARKET SENTIMENT · {signa.sentiment!.daysOfHistory}d
            </div>
            <span style={{ fontSize: '12px', color: sentimentColor, fontWeight: 500 }}>
              {sentimentLabel}
            </span>
          </div>
          <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6 }}>
            <div style={{ width: `${bullPct}%`, background: C.bull, transition: 'width 0.8s ease' }} />
            <div style={{ width: `${bearPct}%`, background: C.bear, transition: 'width 0.8s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: '11px', color: C.bull }}>{bullPct.toFixed(1)}% Bullish</span>
            <span style={{ fontSize: '11px', color: C.bear }}>{bearPct.toFixed(1)}% Bearish</span>
          </div>
        </div>
      )}

      {/* ── Early Warnings ── */}
      {hasWarnings && (
        <div style={{
          background: C.warnBg, border: `1px solid ${C.warnBorder}`,
          borderRadius: 8, padding: '12px 14px', marginBottom: 14,
        }}>
          <div style={{ fontSize: '11px', color: C.warn, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
            ⚠ EARLY WARNINGS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {earlyWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: '13px', color: C.inkSec }}>· {w}</div>
            ))}
            {bearishPatterns.map((p, i) => (
              <div key={`bp-${i}`} style={{ fontSize: '13px', color: C.inkSec }}>
                · {p.name} ({(p.confidence * 100).toFixed(0)}% conf.) — {p.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Signal Checklist ── */}
      {allTriggers.length > 0 && (
        <div style={{ marginBottom: news.length > 0 ? 16 : 0 }}>
          <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
            SIGNAL CHECKLIST ({allTriggers.length} triggered)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {allTriggers.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 12px',
                background: C.canvasSoft, border: `1px solid ${C.border}`,
                borderRadius: 7,
              }}>
                <span style={{ color: C.bull, fontSize: '12px', flexShrink: 0, marginTop: 1 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '13px', color: C.ink, fontWeight: 400 }}>{t.name}</span>
                    <span style={{ fontSize: '10px', color: C.inkMute, flexShrink: 0 }}>
                      {t.type === 'proprietary' ? 'SIGNA' : t.weight !== undefined ? `${(t.weight * 100).toFixed(0)}%` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 2, fontWeight: 300 }}>
                    {t.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Thesis — always rendered ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
          BULL THESIS
        </div>
        {signa.thesis ? (
          <div style={{
            fontSize: '13px', color: C.inkSec, lineHeight: 1.65,
            padding: '12px 14px',
            background: C.bullBg, border: `1px solid ${C.bullBorder}`, borderRadius: 8,
          }}>
            {signa.thesis}
          </div>
        ) : (
          <div style={{
            fontSize: '13px', color: C.inkMute, fontStyle: 'italic',
            padding: '12px 14px', background: C.canvasSoft,
            border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            No thesis available — Signa generates this for select tickers on higher-tier plans.
          </div>
        )}
      </div>

      {/* ── Congress signal — always rendered ── */}
      <CongressSection congress={signa.congress} />

      {/* ── News ── */}
      {news.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 8 }}>
            RECENT NEWS ({news.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {news.map((article, i) => (
              <NewsItem key={i} article={article} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
