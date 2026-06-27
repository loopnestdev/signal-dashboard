import { useState, type KeyboardEvent } from 'react';
import {
  LayoutDashboard, Activity, BarChart2, Eye, Map,
  Plus, X, ChevronRight, LogOut, LogIn, User,
} from 'lucide-react';
import { C } from '../../lib/colors';
import type { WatchlistGroup } from '../../hooks/useWatchlist';

type View = 'dashboard' | 'options-flow' | 'gamma' | 'dark-pool' | 'sector-map';

const NAV = [
  { id: 'dashboard' as View, label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'options-flow' as View, label: 'Options Flow', Icon: Activity, soon: true },
  { id: 'gamma' as View, label: 'Gamma / GEX', Icon: BarChart2, soon: true },
  { id: 'dark-pool' as View, label: 'Dark Pool', Icon: Eye, soon: true },
  { id: 'sector-map' as View, label: 'Sector Map', Icon: Map, soon: true },
];

interface Props {
  activeView: View;
  onViewChange: (v: View) => void;
  groups: WatchlistGroup[];
  activeGroup: string;
  activeTickers: string[];
  activeTicker: string | null;
  onSetActiveGroup: (n: string) => void;
  onCreateGroup: (n: string) => void;
  onDeleteGroup: (n: string) => void;
  onAnalyze: (t: string) => void;
  userEmail?: string;
  userName?: string;
  userAvatar?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  activeView, onViewChange,
  groups, activeGroup, activeTickers, activeTicker,
  onSetActiveGroup, onCreateGroup, onDeleteGroup, onAnalyze,
  userEmail, userName, userAvatar,
  onSignIn, onSignOut,
  mobileOpen, onClose,
}: Props) {
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const confirmCreate = () => {
    const n = newGroupName.trim();
    if (n) onCreateGroup(n);
    setCreatingGroup(false);
    setNewGroupName('');
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') confirmCreate();
    if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); }
  };

  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : userEmail?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <nav className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      {/* Logo */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <img src="/favicon.svg" alt="" style={{ width: 26, height: 26 }} />
          <span style={{ fontSize: '15px', fontWeight: 500, color: C.ink, letterSpacing: '-0.3px' }}>
            Signal
          </span>
        </div>
        {/* Mobile close */}
        <button
          onClick={onClose}
          style={{
            display: 'none', background: 'none', border: 'none',
            color: C.inkMute, cursor: 'pointer', padding: 4,
          }}
          className="sidebar-close-btn"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav items */}
      <div style={{ padding: '10px 8px 0' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', padding: '4px 8px 6px' }}>
          MARKET
        </div>
        {NAV.map(({ id, label, Icon, soon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => { if (!soon) { onViewChange(id); onClose(); } }}
              disabled={soon}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 10, padding: '8px 10px', borderRadius: 12,
                border: 'none', background: active ? C.primaryBg : 'none',
                color: active ? C.primary : soon ? C.inkMute : C.ink,
                fontSize: '15px', fontWeight: active ? 600 : 500,
                cursor: soon ? 'default' : 'pointer',
                marginBottom: 2, opacity: soon ? 0.5 : 1,
                transition: 'background 0.12s',
              }}
            >
              <Icon size={17} />
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              {soon && (
                <span style={{
                  fontSize: '9px', color: C.inkMute,
                  border: `1px solid ${C.border}`, borderRadius: 9999,
                  padding: '1px 5px', letterSpacing: '0.06em',
                }}>
                  SOON
                </span>
              )}
              {active && !soon && <ChevronRight size={13} color={C.primary} />}
            </button>
          );
        })}
      </div>

      {/* Watchlist */}
      <div style={{ padding: '14px 8px 0', flex: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.08em', padding: '4px 8px 6px' }}>
          WATCHLIST
        </div>

        {/* Group tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {groups.map(g => {
            const active = activeGroup === g.name;
            return (
              <div key={g.name}>
                <button
                  onClick={() => onSetActiveGroup(g.name)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    gap: 8, padding: '7px 10px', borderRadius: 12,
                    border: 'none', background: active ? C.primaryBg : 'none',
                    color: active ? C.primary : C.ink,
                    fontSize: '14px', cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left', fontWeight: active ? 600 : 500 }}>
                    {g.name}
                  </span>
                  <span style={{ fontSize: '10px', color: active ? C.primary : C.inkMute }}>
                    {g.tickers.length}
                  </span>
                  {g.name !== 'Default' && (
                    <span
                      onClick={e => { e.stopPropagation(); onDeleteGroup(g.name); }}
                      style={{ color: C.inkMute, cursor: 'pointer', lineHeight: 1, fontSize: '13px', opacity: 0.6 }}
                      title="Delete list"
                    >
                      ×
                    </span>
                  )}
                </button>

                {/* Tickers for active group */}
                {active && activeTickers.length > 0 && (
                  <div style={{ marginLeft: 12, borderLeft: `1px solid ${C.border}`, paddingLeft: 10, marginBottom: 2 }}>
                    {activeTickers.map(t => (
                      <button
                        key={t}
                        onClick={() => { onAnalyze(t); onClose(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '4px 6px', background: activeTicker === t ? C.primaryBg : 'none',
                          border: 'none', borderRadius: 5,
                          color: activeTicker === t ? C.primary : C.inkMute,
                          fontSize: '12px', cursor: 'pointer',
                          fontFeatureSettings: '"tnum"',
                          transition: 'background 0.1s',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* New group input */}
        {creatingGroup ? (
          <div style={{ padding: '6px 8px', display: 'flex', gap: 4 }}>
            <input
              autoFocus
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={handleKey}
              placeholder="List name…"
              style={{
                flex: 1, background: C.canvasSoft, border: `1px solid ${C.borderInput}`,
                borderRadius: 6, padding: '4px 8px', fontSize: '12px',
                color: C.ink, outline: 'none',
              }}
            />
            <button
              onClick={confirmCreate}
              style={{
                background: C.primary, border: 'none', borderRadius: 6,
                padding: '4px 8px', color: C.onPrimary, fontSize: '11px', cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingGroup(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '6px 8px', border: 'none',
              background: 'none', color: C.inkMute, fontSize: '12px',
              cursor: 'pointer', borderRadius: 7,
            }}
          >
            <Plus size={13} /> New list
          </button>
        )}
      </div>

      {/* User pill */}
      <div style={{
        padding: '12px 12px 14px',
        borderTop: `1px solid ${C.border}`,
      }}>
        {userEmail ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {userAvatar ? (
              <img src={userAvatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: C.primaryBg, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 500, color: C.primary, flexShrink: 0,
              }}>
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {userName && (
                <div style={{ fontSize: '12px', color: C.inkSec, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {userName}
                </div>
              )}
              <div style={{ fontSize: '11px', color: C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userEmail}
              </div>
            </div>
            <button
              onClick={onSignOut}
              title="Sign out"
              style={{ background: 'none', border: 'none', color: C.inkMute, cursor: 'pointer', padding: 4 }}
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={onSignIn}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`,
              borderRadius: 9999, background: 'none',
              color: C.inkMute, fontSize: '12px', cursor: 'pointer',
            }}
          >
            <LogIn size={13} /> Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
