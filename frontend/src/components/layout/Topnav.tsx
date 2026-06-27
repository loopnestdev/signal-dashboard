import { useState, type KeyboardEvent } from 'react';
import { Menu, Search, Sun, Moon } from 'lucide-react';
import { C, changeColor } from '../../lib/colors';
import type { TickerItem } from '../../types/market';
import { AuthButton } from '../AuthButton';
import type { User } from '@supabase/supabase-js';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'DIA'];

interface Props {
  onAnalyze: (ticker: string) => void;
  tickers: TickerItem[];
  dark: boolean;
  onToggleTheme: () => void;
  onMobileOpen: () => void;
  // auth
  user: User | null;
  authLoading: boolean;
  userStatus: 'pending' | 'approved' | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function Topnav({
  onAnalyze, tickers, dark, onToggleTheme, onMobileOpen,
  user, authLoading, userStatus, onSignIn, onSignOut,
}: Props) {
  const [input, setInput] = useState('');

  const submit = () => {
    const t = input.trim().toUpperCase();
    if (t) { onAnalyze(t); setInput(''); }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const indices = INDEX_TICKERS
    .map(sym => tickers.find(t => t.symbol === sym))
    .filter(Boolean) as TickerItem[];

  return (
    <div className="app-topnav" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Hamburger (mobile) */}
      <button
        onClick={onMobileOpen}
        className="topnav-hamburger"
        style={{
          background: 'none', border: 'none', color: C.inkMute,
          cursor: 'pointer', padding: 4, flexShrink: 0,
        }}
        aria-label="Open sidebar"
      >
        <Menu size={20} />
      </button>

      {/* Search */}
      <div style={{ display: 'flex', gap: 6, flex: 1, maxWidth: 360 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={14}
            style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: C.inkMute, pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="Ticker — e.g. NVDA"
            style={{
              width: '100%',
              background: C.canvasSoft,
              border: `1px solid ${C.borderInput}`,
              borderRadius: 9999,
              padding: '7px 12px 7px 30px',
              color: C.ink, fontSize: '13px', outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = C.primary)}
            onBlur={e => (e.target.style.borderColor = C.borderInput)}
          />
        </div>
        <button
          onClick={submit}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? C.primary : C.canvasSoft,
            border: `1px solid ${input.trim() ? C.primary : C.border}`,
            borderRadius: 9999, padding: '7px 16px',
            color: input.trim() ? C.onPrimary : C.inkMute,
            fontSize: '13px', cursor: input.trim() ? 'pointer' : 'default',
            whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          Analyze
        </button>
      </div>

      {/* Index pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {indices.map(item => {
          const color = changeColor(item.change);
          const sign = item.change >= 0 ? '+' : '';
          return (
            <div
              key={item.symbol}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px',
                background: C.canvasSoft,
                border: `1px solid ${C.border}`,
                borderRadius: 9999,
                fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <span style={{ color: C.inkMute }}>{item.symbol}</span>
              <span style={{ color, fontFeatureSettings: '"tnum"', fontWeight: 400 }}>
                {sign}{item.change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          background: 'none', border: `1px solid ${C.border}`,
          borderRadius: 9999, padding: '6px 8px',
          color: C.inkMute, cursor: 'pointer', display: 'flex', alignItems: 'center',
          transition: 'border-color 0.15s',
          flexShrink: 0,
        }}
        aria-label="Toggle theme"
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Auth */}
      <AuthButton
        user={user}
        authLoading={authLoading}
        userStatus={userStatus}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
    </div>
  );
}
