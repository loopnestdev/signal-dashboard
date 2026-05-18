import { useState, type KeyboardEvent } from 'react';
import { C } from '../lib/colors';
import type { WatchlistGroup } from '../hooks/useWatchlist';

interface Props {
  onAnalyze: (ticker: string) => void;
  groups: WatchlistGroup[];
  activeGroup: string;
  activeTickers: string[];
  activeTicker: string | null;
  onRemoveFromWatchlist: (ticker: string) => void;
  onSetActiveGroup: (name: string) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (name: string) => void;
}

export function StockSearch({
  onAnalyze,
  groups,
  activeGroup,
  activeTickers,
  activeTicker,
  onRemoveFromWatchlist,
  onSetActiveGroup,
  onCreateGroup,
  onDeleteGroup,
}: Props) {
  const [input, setInput] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  const submit = () => {
    const t = input.trim().toUpperCase();
    if (t) { onAnalyze(t); setInput(''); }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const confirmNewList = () => {
    const name = newListName.trim();
    if (name) { onCreateGroup(name); }
    setCreatingList(false);
    setNewListName('');
  };

  const handleNewListKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') confirmNewList();
    if (e.key === 'Escape') { setCreatingList(false); setNewListName(''); }
  };

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '20px 24px',
      boxShadow: C.s1,
    }}>
      <div style={{ fontSize: '11px', color: C.inkMute, letterSpacing: '0.08em', fontWeight: 400, marginBottom: 14 }}>
        STOCK ANALYSIS
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="Enter ticker — e.g. AAPL, NVDA, TSLA"
          style={{
            flex: 1,
            background: C.canvasSoft,
            border: `1px solid ${C.borderInput}`,
            borderRadius: 8,
            padding: '9px 14px',
            color: C.ink,
            fontSize: '14px',
            fontWeight: 400,
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = C.primary)}
          onBlur={e => (e.target.style.borderColor = C.borderInput)}
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? C.primary : C.canvasSoft,
            border: `1px solid ${input.trim() ? C.primary : C.border}`,
            borderRadius: 9999,
            padding: '9px 20px',
            color: input.trim() ? C.onPrimary : C.inkMute,
            fontSize: '14px', fontWeight: 400,
            cursor: input.trim() ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            boxShadow: input.trim() ? '0 1px 4px rgba(83,58,253,0.25)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          Analyze →
        </button>
      </div>

      {/* Watchlist section */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        {/* Watchlist header row: label + group selector + new list button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: C.inkMute, fontWeight: 400, letterSpacing: '0.06em', flexShrink: 0 }}>
            WATCHLIST
          </span>

          {/* Group tabs */}
          {groups.map(g => (
            <button
              key={g.name}
              onClick={() => onSetActiveGroup(g.name)}
              style={{
                background: activeGroup === g.name ? C.primaryBg : C.canvasSoft,
                border: `1px solid ${activeGroup === g.name ? C.primaryBorder : C.border}`,
                borderRadius: 9999,
                padding: '3px 10px',
                fontSize: '12px', fontWeight: 400,
                color: activeGroup === g.name ? C.primary : C.inkMute,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {g.name}
              {g.name !== 'Default' && (
                <span
                  onClick={e => { e.stopPropagation(); onDeleteGroup(g.name); }}
                  title="Delete list"
                  style={{ marginLeft: 5, opacity: 0.5, fontSize: '11px', cursor: 'pointer' }}
                >
                  ×
                </span>
              )}
            </button>
          ))}

          {/* New list controls */}
          {creatingList ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                autoFocus
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={handleNewListKey}
                placeholder="List name…"
                style={{
                  background: C.canvasSoft, border: `1px solid ${C.borderInput}`,
                  borderRadius: 6, padding: '3px 8px', fontSize: '12px',
                  color: C.ink, outline: 'none', width: 100,
                }}
                onFocus={e => (e.target.style.borderColor = C.primary)}
                onBlur={e => (e.target.style.borderColor = C.borderInput)}
              />
              <button
                onClick={confirmNewList}
                style={{
                  background: C.primary, border: `1px solid ${C.primary}`,
                  borderRadius: 9999, padding: '3px 10px',
                  fontSize: '12px', color: C.onPrimary, cursor: 'pointer',
                }}
              >
                Create
              </button>
              <button
                onClick={() => { setCreatingList(false); setNewListName(''); }}
                style={{
                  background: 'none', border: `1px solid ${C.border}`,
                  borderRadius: 9999, padding: '3px 8px',
                  fontSize: '12px', color: C.inkMute, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingList(true)}
              title="Create new watchlist"
              style={{
                background: 'none', border: `1px solid ${C.border}`,
                borderRadius: 9999, padding: '3px 10px',
                fontSize: '12px', color: C.inkMute, cursor: 'pointer',
              }}
            >
              + New list
            </button>
          )}
        </div>

        {/* Ticker chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {activeTickers.length === 0 ? (
            <span style={{ fontSize: '13px', color: C.inkMute }}>
              Analyze a stock, then click "Save to Watchlist" to pin it here
            </span>
          ) : (
            activeTickers.map(ticker => (
              <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  onClick={() => onAnalyze(ticker)}
                  style={{
                    background: activeTicker === ticker ? C.primaryBg : C.canvasSoft,
                    border: `1px solid ${activeTicker === ticker ? C.primaryBorder : C.border}`,
                    borderRight: 'none',
                    borderRadius: '9999px 0 0 9999px',
                    padding: '4px 12px',
                    color: activeTicker === ticker ? C.primary : C.inkSec,
                    fontSize: '13px', fontWeight: 400,
                    cursor: 'pointer',
                  }}
                >
                  {ticker}
                </button>
                <button
                  onClick={() => onRemoveFromWatchlist(ticker)}
                  title="Remove from watchlist"
                  style={{
                    background: C.canvasSoft,
                    border: `1px solid ${C.border}`,
                    borderRadius: '0 9999px 9999px 0',
                    padding: '4px 8px',
                    color: C.inkMute, fontSize: '12px',
                    cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
