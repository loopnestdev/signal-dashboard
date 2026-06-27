import { useState, useEffect } from 'react';
import { useMarketData } from './hooks/useMarketData';
import { useStockData } from './hooks/useStockData';
import { useWatchlist } from './hooks/useWatchlist';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { useMoatData } from './hooks/useMoatData';
import { TickerBar } from './components/TickerBar';
import { SectorHeatmap } from './components/SectorHeatmap';
import { AlertBanner } from './components/AlertBanner';
import { TerminalAnalysis } from './components/TerminalAnalysis';
import { AdminPanel } from './components/AdminPanel';
import { StockPanel } from './components/StockPanel';
import type { StockTab } from './components/StockPanel';
import { UnusualFlowSection } from './components/UnusualFlowSection';
import { FundamentalsPanel } from './components/FundamentalsPanel';
import { MoatPanel } from './components/MoatPanel';
import { OptionsFlowView } from './components/OptionsFlowView';
import { DarkPoolView } from './components/DarkPoolView';
import { GammaView } from './components/GammaView';
import { MarketScanView } from './components/MarketScanView';
import { SectorSkeleton } from './components/Skeleton';
import { Sidebar } from './components/layout/Sidebar';
import type { View } from './components/layout/Sidebar';
import { Topnav } from './components/layout/Topnav';
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
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StockTab>('signal');

  // Reset to Signal tab whenever a new ticker is loaded
  useEffect(() => { setActiveTab('signal'); }, [activeTicker]);

  // Moat research for active ticker
  const { data: moatData, loading: moatLoading } = useMoatData(activeTicker);

  const supabaseEnabled = supabase !== null;
  const isApproved = !supabaseEnabled || userStatus === 'approved' || isAdmin;

  const userProfile = user ? {
    email: user.email ?? undefined,
    name: (user.user_metadata?.full_name as string | undefined),
    avatar: (user.user_metadata?.avatar_url as string | undefined),
  } : {};

  return (
    <div className="app-shell">
      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        groups={groups}
        activeGroup={activeGroup}
        activeTickers={activeTickers}
        activeTicker={activeTicker}
        onSetActiveGroup={setActiveGroup}
        onCreateGroup={createGroup}
        onDeleteGroup={deleteGroup}
        onAnalyze={loadStock}
        userEmail={userProfile.email}
        userName={userProfile.name}
        userAvatar={userProfile.avatar}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="app-main">
        {/* Top nav */}
        <Topnav
          onAnalyze={loadStock}
          tickers={data?.ticker ?? []}
          dark={dark}
          onToggleTheme={toggleTheme}
          onMobileOpen={() => setSidebarOpen(true)}
          user={user}
          authLoading={authLoading}
          userStatus={userStatus}
          onSignIn={signInWithGoogle}
          onSignOut={signOut}
        />

        {/* Live ticker strip */}
        <TickerBar
          items={data?.ticker ?? []}
          loading={loading && !data}
          secondsAgo={secondsAgo}
          onRefresh={refresh}
          isRefreshing={loading}
        />

        {/* Page content */}
        <div className="app-content">

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
                  {error}{import.meta.env.DEV && ' — ensure the backend is running on :3001'}
                </div>
              </div>
              <button onClick={refresh} style={{
                background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9999,
                padding: '7px 16px', color: C.ink, fontSize: '14px', cursor: 'pointer',
              }}>
                ↻ Retry
              </button>
            </div>
          )}

          {/* Auth gate */}
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
                      Signal Dashboard is invite-only. Sign in with Google to request access.
                    </div>
                    <button
                      onClick={signInWithGoogle}
                      style={{
                        background: C.primary, border: 'none', borderRadius: 9999,
                        padding: '10px 28px', color: C.onPrimary,
                        fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
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
                        padding: '8px 22px', color: C.inkMute, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Sign out
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Approved content */}
          {isApproved && (
            <>
              {/* Admin panel */}
              {isAdmin && pendingUsers.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <AdminPanel pendingUsers={pendingUsers} onApprove={approveUser} />
                </div>
              )}

              {/* Alerts */}
              {data?.alerts && data.alerts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <AlertBanner alerts={data.alerts} />
                </div>
              )}

              {/* Dashboard view — stock analysis */}
              {activeView === 'dashboard' && activeTicker && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  <StockPanel
                    data={stockData}
                    loading={stockLoading}
                    error={stockError}
                    activeTicker={activeTicker}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    watchlistGroups={groups}
                    activeWatchlistGroup={activeGroup}
                    getGroupsForTicker={getGroupsForTicker}
                    onWatch={addToWatchlist}
                    onUnwatch={removeFromWatchlist}
                  />

                  {activeTab === 'options' && (
                    <div style={{
                      background: C.canvas, border: `1px solid ${C.border}`,
                      borderRadius: 12, boxShadow: C.s1, padding: '20px 24px',
                    }}>
                      {activeTicker && <UnusualFlowSection ticker={activeTicker} currentPrice={stockData?.price} />}
                    </div>
                  )}

                  {activeTab === 'fundamentals' && (
                    <FundamentalsPanel data={stockData?.fundamentals ?? null} />
                  )}

                  {activeTab === 'moat' && (
                    <MoatPanel
                      ticker={activeTicker}
                      data={moatData}
                      loading={moatLoading}
                      currentPrice={stockData?.price}
                    />
                  )}
                </div>
              )}

              {/* Market Analysis view */}
              {activeView === 'market' && (
                loading && !data ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>
                    Loading market analysis…
                  </div>
                ) : data ? (
                  <>
                    <div style={{ marginBottom: 20 }}>
                      <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
                        Market Analysis
                      </h2>
                      <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 4, marginBottom: 0 }}>
                        Signa.ai · {new Date(data.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <TerminalAnalysis analysis={data.analysis} timestamp={data.timestamp} />
                  </>
                ) : null
              )}

              {/* Sectors view */}
              {activeView === 'sector-map' && (
                loading && !data ? (
                  <SectorSkeleton />
                ) : data ? (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 16, flexWrap: 'wrap', gap: 8,
                    }}>
                      <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em' }}>
                        Sector Performance
                      </h2>
                      <div style={{ display: 'flex', gap: 4 }}>
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
                    </div>
                    <SectorHeatmap
                      sectors={data.sectors}
                      subsectors={data.subsectors}
                      timeframe={sectorTimeframe}
                    />
                  </>
                ) : null
              )}

              {/* Options Flow view */}
              {activeView === 'options-flow' && (
                <OptionsFlowView onAnalyze={t => { loadStock(t); setActiveView('dashboard'); }} />
              )}

              {/* Dark Pool view */}
              {activeView === 'dark-pool' && (
                <DarkPoolView onAnalyze={t => { loadStock(t); setActiveView('dashboard'); }} />
              )}

              {/* Gamma / GEX view */}
              {activeView === 'gamma' && (
                <GammaView onAnalyze={t => { loadStock(t); setActiveView('dashboard'); }} />
              )}

              {/* Market Scanner view */}
              {activeView === 'market-scan' && (
                <MarketScanView onAnalyze={t => { loadStock(t); setActiveView('dashboard'); }} />
              )}

              {/* Footer */}
              <div style={{
                marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 8,
              }}>
                <span style={{ fontSize: '12px', color: C.inkMute }}>
                  Data via Yahoo Finance · Signals via Signa.ai · Not financial advice
                </span>
                <span style={{ fontSize: '12px', color: C.inkMute, fontFeatureSettings: '"tnum"' }}>
                  {data?.fromCache ? '⟳ cached' : '● fresh'} · {data ? new Date(data.timestamp).toLocaleTimeString() : '—'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
