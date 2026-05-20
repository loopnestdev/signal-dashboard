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
import { ModeToggle } from './components/ModeToggle';
import { AuthButton } from './components/AuthButton';
import { StockSearch } from './components/StockSearch';
import { StockPanel } from './components/StockPanel';
import { OptionsPanel } from './components/OptionsPanel';
import { FundamentalsPanel } from './components/FundamentalsPanel';
import { SectorSkeleton } from './components/Skeleton';
import { C } from './lib/colors';
import type { TradingMode } from './types/market';

type SectorTimeframe = '1d' | '5d' | '20d';

export default function App() {
  const { data, loading, error, secondsAgo, refresh } = useMarketData();
  const { data: stockData, loading: stockLoading, error: stockError, activeTicker, load: loadStock } = useStockData();
  const { user, authLoading, signInWithGoogle, signOut } = useAuth();
  const {
    groups, activeGroup, activeTickers,
    setActiveGroup, createGroup, deleteGroup,
    add: addToWatchlist, remove: removeFromWatchlist,
    getGroupsForTicker,
  } = useWatchlist(user);
  const [mode, setMode] = useState<TradingMode>('swing');
  const [sectorTimeframe, setSectorTimeframe] = useState<SectorTimeframe>('5d');
  const { dark, toggle: toggleTheme } = useTheme();

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
      <div className="mesh-bg" style={{ padding: '28px 32px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AuthButton
              user={user}
              authLoading={authLoading}
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
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px 64px' }}>

        {/* Error state */}
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

            {/* Options Intelligence — always shown when ticker is active */}
            {stockData && stockData.optionsInsight && (
              <OptionsPanel
                insight={stockData.optionsInsight}
                currentPrice={stockData.price}
              />
            )}

            {/* Fundamentals — always shown when ticker is active */}
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

        {/* Terminal analysis — full width */}
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
      </main>
    </div>
  );
}
