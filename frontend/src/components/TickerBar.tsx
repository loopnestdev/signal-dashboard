import { C, changeColor } from '../lib/colors';
import type { TickerItem } from '../types/market';

interface Props {
  items: TickerItem[];
  loading: boolean;
  secondsAgo: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function TickerChip({ item }: { item: TickerItem }) {
  const color = changeColor(item.change);
  const arrow = item.change > 0.3 ? '▲' : item.change < -0.3 ? '▼' : '';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px',
      borderRight: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.04em', fontWeight: 400 }}>
        {item.symbol}
      </span>
      <span style={{ fontSize: '12px', color: C.ink, fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em' }}>
        {item.price.toFixed(2)}
      </span>
      {item.change !== 0 && (
        <span style={{ fontSize: '11px', color, fontFeatureSettings: '"tnum"' }}>
          {arrow} {Math.abs(item.change).toFixed(2)}%
        </span>
      )}
    </span>
  );
}

export function TickerBar({ items, loading, secondsAgo, onRefresh, isRefreshing }: Props) {
  const doubled = [...items, ...items];

  return (
    <div style={{
      background: C.canvas, borderBottom: `1px solid ${C.border}`,
      height: 40, display: 'flex', alignItems: 'center',
      position: 'sticky', top: 0, zIndex: 50,
      boxShadow: '0 1px 0 rgba(0,55,112,0.06)',
    }}>
      {/* Status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px',
        flexShrink: 0, borderRight: `1px solid ${C.border}`,
      }}>
        <span
          className="pulse-live"
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isRefreshing ? C.warn : C.bull,
            display: 'inline-block',
          }}
        />
        <span style={{
          fontSize: '11px', fontWeight: 400, letterSpacing: '0.06em',
          color: isRefreshing ? C.warn : C.bull,
        }}>
          {isRefreshing ? 'UPDATING' : 'LIVE'}
        </span>
      </div>

      {/* Scrolling tickers */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {loading ? (
          <div className="skeleton" style={{ height: 12, width: '40%', margin: '0 16px' }} />
        ) : (
          <div className="ticker-track" style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
            {doubled.map((item, i) => (
              <TickerChip key={`${item.symbol}-${i}`} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Right: time + refresh */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        flexShrink: 0, borderLeft: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: '11px', color: C.inkMute }}>
          {secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`}
        </span>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            background: C.canvas, border: `1px solid ${C.border}`,
            borderRadius: 9999, padding: '3px 12px',
            color: C.inkSec, fontSize: '11px', cursor: isRefreshing ? 'wait' : 'pointer',
            fontWeight: 400, letterSpacing: '0.02em',
            boxShadow: C.s1, opacity: isRefreshing ? 0.5 : 1,
          }}
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
