import { useState, useEffect, useCallback } from 'react';
import { C, scoreColor } from '../lib/colors';
import { fetchMarketScan } from '../lib/api';
import type { ScanItem } from '../types/market';

type DirFilter = 'ALL' | 'BULLISH' | 'BEARISH';

export function MarketScanView({ onAnalyze }: { onAnalyze: (ticker: string) => void }) {
  const [results, setResults] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DirFilter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const load = useCallback(async (dir?: DirFilter) => {
    setLoading(true); setError(null);
    try {
      const apiDir = dir === 'BULLISH' ? 'bullish' : dir === 'BEARISH' ? 'bearish' : undefined;
      const data = await fetchMarketScan(apiDir);
      setResults(data.results ?? []);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter === 'ALL' ? undefined : filter as DirFilter); }, [load, filter]);

  const handleFilter = (f: DirFilter) => {
    setFilter(f);
    setExpanded(null);
  };

  const FILTERS: DirFilter[] = ['ALL', 'BULLISH', 'BEARISH'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
            Market Scanner
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Top-ranked setups via Signa.ai 30-model consensus
            {lastUpdated > 0 && <span style={{ marginLeft: 8 }}>· updated just now</span>}
          </p>
        </div>
        <button
          onClick={() => { void load(filter === 'ALL' ? undefined : filter as DirFilter); }}
          disabled={loading}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999,
            padding: '6px 14px', fontSize: '12px', color: C.inkMute,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => handleFilter(f)} style={{
            padding: '5px 14px', borderRadius: 9999, fontSize: '12px',
            border: `1px solid ${filter === f ? C.primary : C.border}`,
            background: filter === f ? C.primaryBg : C.canvas,
            color: filter === f ? C.primary : C.inkMute,
            cursor: 'pointer', fontWeight: filter === f ? 600 : 400,
          }}>
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && results.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Scanning market…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((item, idx) => {
            const isOpen = expanded === item.ticker;
            const dirCol = item.direction === 'BULLISH' ? C.bull : item.direction === 'BEARISH' ? C.bear : C.inkMute;
            const gradeCol = item.grade === 'A' || item.grade === 'A+' ? C.bull : item.grade === 'B' || item.grade === 'B+' ? C.warn : C.bear;
            const scoreCol = scoreColor(item.score);

            return (
              <div key={item.ticker} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.s1, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : item.ticker)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                >
                  {/* Rank */}
                  <span className="tnum" style={{ fontSize: '11px', color: C.inkMute as string, width: 20, textAlign: 'right', flexShrink: 0 }}>
                    {idx + 1}
                  </span>

                  {/* Ticker + signal */}
                  <button
                    onClick={e => { e.stopPropagation(); onAnalyze(item.ticker); }}
                    style={{ background: 'none', border: 'none', padding: 0, color: C.primary as string, fontWeight: 700, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    {item.ticker}
                  </button>

                  {/* Direction badge */}
                  <span style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                    padding: '2px 8px', borderRadius: 9999, flexShrink: 0,
                    color: dirCol as string,
                    background: `${dirCol}15`,
                    border: `1px solid ${dirCol}33`,
                  }}>
                    {item.direction}
                  </span>

                  {/* Signal label */}
                  <span style={{ fontSize: '12px', color: C.inkMute as string, flex: 1 }}>
                    {item.signal.replace(/_/g, ' ')}
                  </span>

                  {/* Grade */}
                  <span style={{ fontWeight: 700, fontSize: '14px', color: gradeCol as string, flexShrink: 0 }}>
                    {item.grade}
                  </span>

                  {/* Score bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ width: 60, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${item.score}%`, height: '100%', background: scoreCol, borderRadius: 2 }} />
                    </div>
                    <span className="tnum" style={{ fontSize: '11px', fontWeight: 600, color: scoreCol, width: 28 }}>
                      {item.score}
                    </span>
                  </div>

                  {/* Confidence */}
                  <span className="tnum" style={{ fontSize: '11px', color: C.inkMute as string, flexShrink: 0, width: 36, textAlign: 'right' }}>
                    {Math.round(item.confidence * 100)}%
                  </span>

                  {/* Expand arrow */}
                  <span style={{ color: C.inkMute as string, fontSize: '12px', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
                </div>

                {/* Expanded reasons */}
                {isOpen && item.reasons.length > 0 && (
                  <div style={{ padding: '0 18px 14px 54px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: C.inkMute as string, letterSpacing: '0.08em', marginBottom: 8, marginTop: 10 }}>
                      SIGNALS ({item.reasons.length})
                    </div>
                    {item.reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: '12px', color: C.inkSec as string, lineHeight: 1.5, paddingBottom: 5, borderBottom: i < item.reasons.length - 1 ? `1px solid ${C.border}` : 'none', marginBottom: 5 }}>
                        <span style={{ color: dirCol as string, marginRight: 6 }}>→</span>{r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {results.length === 0 && !loading && (
            <div style={{ padding: '32px', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>
              No scan results available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
