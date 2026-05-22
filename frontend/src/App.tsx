import { useState } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { useStockData } from './hooks/useStockData';
import { useWatchlist } from './hooks/useWatchlist';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { TickerBar } from './components/TickerBar';
import { SectorHeatmap } from './components/SectorHeatmap';
import { AlertBanner } from './components/AlertBanner';
import { TerminalAnalysis } from './components/TerminalAnalysis';
import { AuthButton } from './components/AuthButton';
import { AdminPanel } from './components/AdminPanel';
import { StockSearch } from './components/StockSearch';
import { StockPanel } from './components/StockPanel';
import { OptionsPanel } from './components/OptionsPanel';
import { FundamentalsPanel } from './components/FundamentalsPanel';
import { SectorSkeleton } from './components/Skeleton';
import { C } from './lib/colors';
import { supabase } from './lib/supabase';

type SectorTimeframe = '1d' | '5d' | '20d';

export default function App() {
  const { data, loading, error, secondsAgo, refresh } = useMarketData();
  const { data: stockData, loading: stockLoading, error: stockError, activeTicker, load: loadStock } = useStockData();
  const { user, authLoading, userStatus, isAdmin, pendingUsers, signInWithGoogle, signOut, approveUser } = useAuth();
  const {
    groups, activeGroup, activeTickers,
    setActiveGroup, createGroup, deleteGroup,
    add: addToWatchlist, remove: removeFromWatchlist,
    getGroupsForTicker,
  } = useWatchlist(user);
  const [sectorTimeframe, setSectorTimeframe] = useState<SectorTimeframe>('5d');
  const { dark, toggle: toggleTheme } = useTheme();

  // When Supabase is configured, only approved users get full access.
  // When Supabase is NOT configured (local dev), supabase === null → full access.
  const supabaseEnabled = supabase !== null;
  const isApproved = !supabaseEnabled || userStatus === 'approved' || isAdmin;

  return (
    <div style={{ minHeight: '100vh', background: C.canvasSoft, color: C.ink }}>
      {/* Sticky ticker bar */}
      <TickerBar
        items={data?.ticker ?? []}
        loading={loading && !data}
        secondsAgo={secondsAgo}
        onRefresh={refresh}
        isRefreshing={loading}
      />

      {/* Gradient mesh header band */}
      <div className="mesh-bg header-band" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Title with favicon */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <img
              src="/favicon.svg"
              alt=""
              style={{ width: 36, height: 36, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <h1 style={{
                margin: 0, fontSize: '28px', fontWeight: 300, letterSpacing: '-0.64px',
                color: C.ink, lineHeight: 1.1,
              }}>
                Signal Dashboard
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: '14px', color: C.inkMute, fontWeight: 300 }}>
                Real-time swing trading signals · auto-refreshes every 45s
              </p>
            </div>
          </div>

          {/* Header controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AuthButton
              user={user}
              authLoading={authLoading}
              userStatus={userStatus}
              onSignIn={signInWithGoogle}
              onSignOut={signOut}
            />
            <button
              onClick={toggleTheme}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: C.canvas, border: `1px solid ${C.border}`,
                borderRadius: 9999, padding: '6px 14px',
                fontSize: '13px', color: C.inkMute, cursor: 'pointer',
                boxShadow: C.s1, fontFamily: 'inherit', letterSpacing: 0,
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
            >
              {dark ? '◑ Light' : '◐ Dark'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="main-content" style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Connection error */}
        {error && !data && (
          <div style={{
            background: C.bearBg, border: `1px solid ${C.bearBorder}`,
            borderRadius: 12, padding: '16px 20px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '14px', color: C.bear, fontWeight: 500 }}>Connection Error</div>
              <div style={{ fontSize: '13px', color: C.inkMute, marginTop: 4 }}>
                {error}
                {import.meta.env.DEV && ' — ensure the backend is running on :3001'}
              </div>
            </div>
            <button onClick={refresh} style={{
              background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9999,
              padding: '7px 16px', color: C.ink, fontSize: '14px', cursor: 'pointer',
              boxShadow: C.s1,
            }}>
              ↻ Retry
            </button>
          </div>
        )}

        {/* ── AUTH GATE ── shown when Supabase is enabled and user is not approved */}
        {supabaseEnabled && !authLoading && !isApproved && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: 320, padding: '40px 0',
          }}>
            <div style={{
              background: C.canvas, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '40px 48px', textAlign: 'center',
              boxShadow: C.s2, maxWidth: 420, width: '100%',
            }}>
              <img src="/favicon.svg" alt="" style={{ width: 48, height: 48, marginBottom: 20 }} />

              {!user ? (
                <>
                  <div style={{ fontSize: '20px', fontWeight: 500, color: C.ink, marginBottom: 8 }}>
                    Sign in to access
                  </div>
                  <div style={{ fontSize: '14px', color: C.inkMute, lineHeight: 1.6, marginBottom: 28 }}>
                    Signal Dashboard is invite-only. Sign in with Google to request access — an admin will review your request.
                  </div>
                  <button
                    onClick={signInWithGoogle}
                    style={{
                      background: C.primary, border: 'none', borderRadius: 9999,
                      padding: '10px 28px', color: C.onPrimary,
                      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 2px 8px rgba(83,58,253,0.30)',
                    }}
                  >
                    Sign in with Google
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '20px', fontWeight: 500, color: C.ink, marginBottom: 8 }}>
                    Access Pending
                  </div>
                  <div style={{ fontSize: '14px', color: C.inkMute, lineHeight: 1.6, marginBottom: 28 }}>
                    Your request has been submitted. You'll have full access once an admin approves your account.
                  </div>
                  <button
                    onClick={signOut}
                    style={{
                      background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999,
                      padding: '8px 22px', color: C.inkMute,
                      fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── FULL APP — only rendered for approved users ── */}
        {isApproved && (
          <>
            {/* Admin: pending approval requests */}
            {isAdmin && pendingUsers.length > 0 && (
              <AdminPanel pendingUsers={pendingUsers} onApprove={approveUser} />
            )}

            {/* Alerts */}
            {data?.alerts && data.alerts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <AlertBanner alerts={data.alerts} />
              </div>
            )}

            {/* ── STOCK ANALYSIS ── */}
            <div style={{ marginBottom: 24 }}>
              <StockSearch
                onAnalyze={loadStock}
                groups={groups}
                activeGroup={activeGroup}
                activeTickers={activeTickers}
                activeTicker={activeTicker}
                onRemoveFromWatchlist={(ticker) => removeFromWatchlist(ticker, activeGroup)}
                onSetActiveGroup={setActiveGroup}
                onCreateGroup={createGroup}
                onDeleteGroup={deleteGroup}
              />
            </div>

            {activeTicker && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                <StockPanel
                  data={stockData}
                  loading={stockLoading}
                  error={stockError}
                  activeTicker={activeTicker}
                  watchlistGroups={groups}
                  activeWatchlistGroup={activeGroup}
                  getGroupsForTicker={getGroupsForTicker}
                  onWatch={addToWatchlist}
                  onUnwatch={removeFromWatchlist}
                />
                {stockData?.optionsInsight && (
                  <OptionsPanel
                    insight={stockData.optionsInsight}
                    currentPrice={stockData.price}
                  />
                )}
                {stockData && (
                  <FundamentalsPanel data={stockData.fundamentals ?? null} />
                )}
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 24 }} />

            {/* Sector heatmap */}
            <div style={{ marginBottom: 24 }}>
              {loading && !data ? (
                <SectorSkeleton />
              ) : data ? (
                <div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {(['1d', '5d', '20d'] as SectorTimeframe[]).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setSectorTimeframe(tf)}
                        style={{
                          padding: '5px 14px', borderRadius: 9999, fontSize: '13px',
                          fontWeight: 400, cursor: 'pointer',
                          border: `1px solid ${sectorTimeframe === tf ? C.primary : C.border}`,
                          background: sectorTimeframe === tf ? C.primaryBg : C.canvas,
                          color: sectorTimeframe === tf ? C.primary : C.inkMute,
                          boxShadow: sectorTimeframe === tf ? 'none' : C.s1,
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <SectorHeatmap sectors={data.sectors} subsectors={data.subsectors} timeframe={sectorTimeframe} />
                </div>
              ) : null}
            </div>

            {/* Terminal analysis */}
            {data && (
              <TerminalAnalysis analysis={data.analysis} timestamp={data.timestamp} />
            )}

            {/* Footer */}
            <div style={{
              marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '12px', color: C.inkMute }}>
                Data via Yahoo Finance · Signals via Signa.ai · Not financial advice · Educational purposes only
              </span>
              <span style={{ fontSize: '12px', color: C.inkMute }}>
                {data?.fromCache ? '⟳ cached' : '● fresh'} · {data ? new Date(data.timestamp).toLocaleTimeString() : '—'}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
