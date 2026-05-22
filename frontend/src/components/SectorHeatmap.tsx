import { useState } from 'react';
import { C, changeColor } from '../lib/colors';
import type { SectorData } from '../types/market';

interface Props {
  sectors: SectorData[];
  subsectors?: SectorData[];
  timeframe: '1d' | '5d' | '20d';
}

function val(s: SectorData, tf: '1d' | '5d' | '20d'): number {
  return tf === '1d' ? s.change1d : tf === '5d' ? s.change5d : s.change20d;
}

function HeatBar({ pct, max }: { pct: number; max: number }) {
  const halfW = max > 0 ? (Math.abs(pct) / max) * 46 : 0;
  const color = changeColor(pct);
  return (
    <div style={{ position: 'relative', height: 6, background: C.border, borderRadius: 3 }}>
      <div style={{
        position: 'absolute', left: '50%', top: 0, height: '100%',
        width: 1, background: C.inkMute, transform: 'translateX(-50%)', zIndex: 1,
      }} />
      {pct >= 0 ? (
        <div style={{
          position: 'absolute', left: '50%', top: 0, height: '100%',
          width: `${halfW}%`, background: color,
          borderRadius: '0 3px 3px 0', transition: 'width 0.8s ease',
        }} />
      ) : (
        <div style={{
          position: 'absolute', right: '50%', top: 0, height: '100%',
          width: `${halfW}%`, background: color,
          borderRadius: '3px 0 0 3px', transition: 'width 0.8s ease',
        }} />
      )}
    </div>
  );
}

function SectorRow({
  s, i, total, max, timeframe, isSubsector, children,
}: {
  s: SectorData; i: number; total: number; max: number;
  timeframe: '1d' | '5d' | '20d'; isSubsector?: boolean;
  children?: React.ReactNode;
}) {
  const v = val(s, timeframe);
  const color = changeColor(v);
  const isLeader = !isSubsector && i < 3;
  const isLagger = !isSubsector && i >= total - 3;

  const rowBg = isSubsector
    ? C.canvasSoft
    : isLeader
    ? 'rgba(5,150,105,0.04)'
    : isLagger
    ? 'rgba(234,34,97,0.04)'
    : C.canvas;

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `${isSubsector ? '24px ' : ''}60px 1fr 1fr 72px 52px 32px`,
        gap: 10, alignItems: 'center',
        padding: '7px 10px',
        background: rowBg, borderRadius: 7,
        border: `1px solid ${isLeader ? C.bullBorder : isLagger ? C.bearBorder : C.border}`,
        marginLeft: isSubsector ? 8 : 0,
      }}>
        {isSubsector && (
          <span style={{ fontSize: '10px', color: C.inkMute, textAlign: 'center' }}>└</span>
        )}
        <span style={{ fontSize: '12px', color: C.ink, fontWeight: 400 }}>{s.ticker}</span>
        <span style={{ fontSize: '11px', color: C.inkMute }}>{s.name}</span>
        <HeatBar pct={v} max={max} />
        <span style={{
          fontSize: '13px', color, textAlign: 'right',
          fontFeatureSettings: '"tnum"', fontWeight: 500,
        }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
        <span style={{ fontSize: '10px', textAlign: 'center' }}>
          {s.aboveSMA50
            ? <span style={{ color: C.bull }}>▲50d</span>
            : <span style={{ color: C.bear }}>▼50d</span>}
        </span>
        <span style={{ fontSize: '10px', color: C.inkMute, textAlign: 'right' }}>
          {isLeader ? '★' : isLagger ? '↓' : ''}
        </span>
      </div>
      {children}
    </>
  );
}

export function SectorHeatmap({ sectors, subsectors, timeframe }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = [...sectors].sort((a, b) => val(b, timeframe) - val(a, timeframe));
  const allVals = sorted.map(s => val(s, timeframe));
  const max = Math.max(...allVals.map(Math.abs), 0.1);

  const toggle = (ticker: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  };

  // Group sub-sectors by parent sector name
  const subByParent: Record<string, SectorData[]> = {};
  (subsectors ?? []).forEach(sub => {
    const p = sub.parentSector ?? 'Other';
    if (!subByParent[p]) subByParent[p] = [];
    subByParent[p].push(sub);
  });

  // Map sector name → ticker for looking up sub-sectors
  const sectorNameMap: Record<string, string> = {};
  sectors.forEach(s => { sectorNameMap[s.name] = s.ticker; });

  const tfLabel = timeframe === '1d' ? '1 DAY' : timeframe === '5d' ? '5 DAY' : '20 DAY';

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px', boxShadow: C.s1,
    }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.10em', fontWeight: 400, marginBottom: 16 }}>
        SECTOR PERFORMANCE — {tfLabel}
      </div>

      <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 480 }}>
        {sorted.map((s, i) => {
          const subs = subByParent[s.name];
          const hasSubs = subs && subs.length > 0;
          const isOpen = expanded.has(s.ticker);
          const subVals = subs ? subs.map(sub => val(sub, timeframe)) : [];
          const subMax = subVals.length > 0 ? Math.max(...subVals.map(Math.abs), 0.1) : 0.1;

          return (
            <div key={s.ticker}>
              {/* Main sector row — fixed-width toggle placeholder keeps all rows aligned */}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                <div style={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hasSubs && (
                    <button
                      onClick={() => toggle(s.ticker)}
                      title={isOpen ? 'Collapse sub-sectors' : 'Expand sub-sectors'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '2px 4px', color: C.inkMute, fontSize: '11px',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <SectorRow s={s} i={i} total={sorted.length} max={max} timeframe={timeframe}>
                    {null}
                  </SectorRow>
                </div>
              </div>

              {/* Sub-sector rows (accordion) */}
              {hasSubs && isOpen && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 20 }}>
                  {subs
                    .slice()
                    .sort((a, b) => val(b, timeframe) - val(a, timeframe))
                    .map((sub, j) => (
                      <SectorRow key={sub.ticker} s={sub} i={j} total={subs.length} max={subMax} timeframe={timeframe} isSubsector>
                        {null}
                      </SectorRow>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 14, paddingTop: 12,
        borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {[['#059669', 'Leader'], ['#d97706', 'Neutral'], ['#ea2261', 'Lagger']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
            <span style={{ fontSize: '11px', color: C.inkMute }}>{l}</span>
          </div>
        ))}
        {subsectors && subsectors.length > 0 && (
          <span style={{ fontSize: '11px', color: C.inkMute, marginLeft: 'auto' }}>
            ▸ = expand sub-sectors
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '10px', color: C.bull }}>▲50d</span>
          <span style={{ fontSize: '11px', color: C.inkMute }}>= above 50-day MA</span>
        </div>
      </div>
    </div>
  );
}
