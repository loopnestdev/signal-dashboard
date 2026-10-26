# CLAUDE.md - Signal Dashboard

This file is for AI coding assistants. It documents the project architecture, conventions, and key implementation details so you can contribute effectively without reading every file first.

---

## Project Overview

**Signal Dashboard** is a full-stack market environment dashboard for swing traders. It fetches live US market data, computes a weighted composite score, and displays a Stripe-inspired light-mode UI. Auto-refreshes every 45 seconds. No paid data subscriptions required.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + Vite 8 + Tailwind CSS v4 |
| Backend | Node.js 20 + Express 4 + TypeScript 5 (run via `tsx`, no compile step) |
| Market data | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals | Signa.ai API (optional, `SIGNA_API_KEY`) |
| AI analysis | Signa.ai --> provider chosen in Settings (Gemini `gemini-3.5-flash-lite` default via `@google/genai`, or Claude `claude-opus-5-5` at low effort via `@anthropic-ai/sdk`) --> template fallback |
| Auth + access control | Supabase **coredb** (optional - Google OAuth + Postgres; invite-only when configured) |
| Watchlist fallback | `localStorage` when Supabase is unconfigured |
| Frontend hosting | Cloudflare Pages |
| Backend hosting | Railway (Railpack builder via `backend/railway.json` - secrets passed as BuildKit secrets, never baked into the image) |

---

## Repository Structure

```text
signal-dashboard/
+-- frontend/
|   +-- src/
|   |   +-- App.tsx                   # Main layout, polling, theme, auth
|   |   +-- components/
|   |   |   +-- layout/
|   |   |   |   +-- Sidebar.tsx        # Left sidebar: nav items, watchlist groups, user pill
|   |   |   |   +-- Topnav.tsx         # Sticky topnav: search, Analyze, index pills, theme toggle
|   |   |   +-- AdminPanel.tsx         # Admin: pending access requests + approve button
|   |   |   +-- AlertBanner.tsx        # FOMC / VIX spike alerts
|   |   |   +-- AuthButton.tsx         # Google sign-in / sign-out pill + pending badge
|   |   |   +-- DataCollectionView.tsx # Data Collection view: collector jobs, API usage, stored history
|   |   |   +-- FlowScannerView.tsx    # Flow Scanner view: Radon-scored candidates, promoted names, Signa scan cross-check
|   |   |   +-- DarkPoolView.tsx       # Dark Pool view: Radon-scored off-exchange block prints
|   |   |   +-- FlowDirectionChart.tsx # Mini SVG arrow + full Recharts chart (Options tab)
|   |   |   +-- FundamentalsPanel.tsx  # Fundamentals section (valuation/growth/margins)
|   |   |   +-- FundamentalsView.tsx   # Fundamentals view: SEC operating leverage table for moat-finder tickers, sync buttons (admin)
|   |   |   +-- InfoTip.tsx            # "?" tooltip badge (hover + tap, portal-rendered) for headers and card titles
|   |   |   +-- GammaView.tsx          # Gamma/GEX view: SPY/QQQ/IWM cards with flip level/walls
|   |   |   +-- MarketScanView.tsx     # Market Scanner view: Signa 30-model ranked setups
|   |   |   +-- PlaybookView.tsx       # Playbook view: static strategy reference (GEX, Radon, combined read)
|   |   |   +-- LeapsView.tsx          # LEAPS view: market state, proposed contracts + break-even / +100% levels per book, paper positions, backtest (admin run)
|   |   |   +-- SettingsView.tsx       # Settings view: paper sizing/limits/costs, live risk preview, AI provider
|   |   |   +-- PerformanceView.tsx    # Performance view: saved replays per book, equity vs SPY, go-live checklist, trades, skips, Run replay (admin)
|   |   |   +-- MoatPanel.tsx          # Moat research: peer chart (Recharts), table, scenarios
|   |   |   +-- OptionsFlowView.tsx    # Options Flow view: market-wide unusual flow feed
|   |   |   +-- ScoringBreakdown.tsx   # (legacy - not used in layout, kept for reference)
|   |   |   +-- SectorHeatmap.tsx      # Sectors + accordion sub-sectors (incl. TAN, FCG)
|   |   |   +-- SignaCard.tsx          # Signa.ai signal: entry/stop/target/triggers
|   |   |   +-- Skeleton.tsx           # Loading shimmer skeletons
|   |   |   +-- StockPanel.tsx         # Stock header + tab bar (Signal/Technical/Options/Fundamentals/Moat)
|   |   |   +-- StockSearch.tsx        # (legacy - superseded by Sidebar/Topnav, kept for reference)
|   |   |   +-- TerminalAnalysis.tsx   # Structured AI market analysis
|   |   |   +-- TickerBar.tsx          # Scrolling live ticker
|   |   |   +-- UnusualFlowSection.tsx # Unusual flow events: scored rows, backtest strip (Options tab)
|   |   +-- hooks/
|   |   |   +-- useAuth.ts             # Supabase session state + Google OAuth
|   |   |   +-- useMarketData.ts       # 45s polling + secondsAgo counter
|   |   |   +-- useMoatData.ts         # Fetch moat research from Supabase moat schema
|   |   |   +-- useStockData.ts        # Stock/Signa data fetch on ticker change
|   |   |   +-- useTheme.ts            # Light/dark mode toggle (localStorage); default dark
|   |   |   +-- useWatchlist.ts        # Named watchlist groups (Supabase or localStorage)
|   |   +-- lib/
|   |   |   +-- api.ts                 # fetch wrappers for backend routes
|   |   |   +-- colors.ts              # CSS custom property design tokens
|   |   |   +-- priceLevels.ts         # validatePriceLevels() - stop/target directional validation
|   |   |   +-- risk.ts                # riskPerTrade() mirror for the Settings live preview
|   |   |   +-- fundamentals.ts        # fmtMoney/fmtRatioPct/fmtMargin, sortLeverage() for the leverage table
|   |   |   +-- leaps.ts               # pctTo/fmtLevel, fmtCap, sortScreen, positionReturnPct, positionStatus, mergeNamedCurves, buyAndHoldRows, indexAction
|   |   |   +-- performance.ts         # mergeCurves() for the equity chart, describeLegs(), $/% formatters
|   |   |   +-- stockApi.ts            # Stock-specific API client
|   |   |   +-- supabase.ts            # Typed Supabase client (null when unconfigured)
|   |   +-- types/
|   |       +-- market.ts              # MarketResponse, SectorData, etc.
|   |       +-- stock.ts               # StockResponse, SignaData, FibLevel, OptionsInsight, FundamentalsData, etc.
|   |       +-- leaps.ts               # LeapsResponse, LeapsScreenRow, LeapsPosition, LeapsRunRow, PriceLevels, etc.
|   +-- index.html
|   +-- vite.config.ts                 # /api proxy to :3001
|   +-- wrangler.jsonc                 # Cloudflare Workers Builds deploy (static dist, SPA fallback); without it wrangler's auto-setup crashes npm
|   +-- package.json
|
+-- backend/
|   +-- src/
|   |   +-- index.ts                   # Express entry point
|   |   +-- routes/
|   |   |   +-- market.ts              # GET /api/market-data, POST /api/refresh
|   |   |   +-- moat.ts                # GET /api/moat/:ticker - Supabase moat schema proxy
|   |   |   +-- stock.ts               # GET /api/stock/:symbol
|   |   |   +-- unusualFlow.ts         # GET /api/unusual-flow?ticker=AAPL
|   |   |   +-- collector.ts           # GET /api/collector/status
|   |   |   +-- scanner.ts             # GET /api/scanner?date=YYYY-MM-DD
|   |   |   +-- settings.ts            # GET /api/settings, PUT /api/settings (admin)
|   |   |   +-- fundamentals.ts        # GET /api/fundamentals/leverage, POST /api/fundamentals/sync (admin)
|   |   |   +-- backtest.ts            # GET /api/backtest/runs[/:id], POST /api/backtest/run + DELETE /api/backtest/runs/:id (admin)
|   |   +-- collector/
|   |   |   +-- index.ts               # startCollector(): 30s ET-clock tick, runs due jobs sequentially
|   |   |   +-- schedule.ts            # Job slots (ET), dueJobs(), Signa call estimate
|   |   |   +-- jobs.ts                # runJob(): budget guard, per-symbol Signa MCP pulls, collector_runs log
|   |   |   +-- parsers.ts             # Pure payload --> row transforms (dark pool, flow, curated, GEX, signal, option chain, raw flow, Signa scan)
|   |   |   +-- scanner.ts             # Pure Radon discover.py port: aggregate, dark pool analysis, score, filters, promotions
|   |   |   +-- cboeOptions.ts         # Cboe delayed option chain (primary option quotes source)
|   |   |   +-- nasdaqEarnings.ts      # Nasdaq earnings calendar (one request per date)
|   |   |   +-- yahooOptions.ts        # Yahoo v7 option chain (cookie + crumb) - fallback only
|   |   |   +-- cli.ts                 # npm run collect -- <job> [date]
|   |   +-- backtest/
|   |   |   +-- types.ts               # DayData, MarketData, Position, ClosedTrade, EquityPoint
|   |   |   +-- data.ts                # loadMarketData(): collector tables (paged) + Yahoo daily bars, one session at a time
|   |   |   +-- engine.ts              # runBacktest(data, book, settings): day-by-day replay, fills, limits, earnings, shadows
|   |   |   +-- strategies.ts          # Book A/B/C entry signals + exit rules (pure)
|   |   |   +-- contracts.ts           # Rules 1.6 contract selection: monthly expiry, 0.40-delta single or 2:1 debit spread
|   |   |   +-- earnings.ts            # Entry window, last close before report, exit timing
|   |   |   +-- pricing.ts             # Black-Scholes for held contracts missing a quote (flagged modeled)
|   |   |   +-- metrics.ts             # summarize(): win rate, R, profit factor, drawdown, SPY, skips, go-live checklist
|   |   |   +-- store.ts               # saveRun() -> backtest_runs / backtest_trades / backtest_equity
|   |   |   +-- report.ts              # Pure: parseRunRequest, barsRangeFor, benchmarkCurve (SPY same start), latestRunSet
|   |   |   +-- flowStudy.ts           # Pure: call-heavy / put-heavy flow days vs forward returns (1/5/10/20 sessions) vs all flow days
|   |   |   +-- runner.ts              # replay() shared by CLI + API; one background replay job at a time
|   |   |   +-- cli.ts                 # npm run backtest -- --from --to [--book] [--save] [--trades]
|   |   +-- fundamentals/
|   |   |   +-- secClient.ts           # SEC EDGAR fetches (ticker map, submissions, companyfacts) through one ~4 req/s queue, SEC_USER_AGENT
|   |   |   +-- parse.ts               # Pure: classifyFiler (10-Q/10-K vs 20-F/40-F), parseQuarters (quarters, derived Q4, revenue/op income tags + fallbacks), companyfacts lag helpers
|   |   |   +-- instance.ts            # Pure: parseInstanceFacts - a filing's own XBRL instance (`*_htm.xml`) in companyfacts shape
|   |   |   +-- plan.ts                # Pure: planSync (new/daily/full), needsFacts (download only on a new filing)
|   |   |   +-- leverage.ts            # Pure: leverageFor (margins, YoY, incremental margin, DOL), rankLeverage
|   |   |   +-- sync.ts                # syncFundamentals + one-at-a-time background job (collector, page, admin, CLI)
|   |   |   +-- cli.ts                 # npm run fundamentals -- [new|daily|full]
|   |   +-- leaps/                     # LEAPS book (docs/leaps-rules.md); everything but data/screen/runner is pure
|   |   |   +-- rules.ts               # LEAPS_RULES_VERSION, RULES thresholds, book deltas (L1 0.75 / L2 0.50 / L3 0.30 / IS, IQ 0.85), INDEX_BOOK, isIndexBook, benchmarkOf, QUOTE_GRID, date helpers
|   |   |   +-- universe.ts            # LEAPS_UNIVERSE: S&P 100 + other US large caps (update annually)
|   |   |   +-- market.ts              # marketState (correction / pullback / normal), rollingHigh, rollingVol, splitFactorSince
|   |   |   +-- quality.ts             # Point-in-time checks: market cap, 4 profitable quarters (net income for banks), revenue YoY, IV/VIX
|   |   |   +-- contracts.ts           # pickLeapsExpiry + expiryWindow (stocks 15-27 months, IS / IQ 500-900 days), modeled Jan/Jun expiries, pickContract, quoteGrid
|   |   |   +-- levels.ts              # callDelta, invNorm, strikeForDelta, snapStrike, spotForValue, priceLevels (break-even / +100% / sell limit)
|   |   |   +-- exits.ts               # decideExit (half at +100%, halfway-and-50% stop, runner trail, 120-day time exit, quality break), sizePosition
|   |   |   +-- confirm.ts             # confirmationFor: dark pool / call flow / LEAPS print (recorded, never blocks)
|   |   |   +-- paper.ts               # bookState, stepPosition: one session's fills, marks and exit decisions for a paper position
|   |   |   +-- backtest.ts            # runLeapsBacktest (modeled prices, fractional contracts), modeledIv, marketStates/episodes, summarizeLeaps
|   |   |   +-- data.ts                # loadLeapsHistory (Yahoo bars since a date + sec_quarters), marketCapNow
|   |   |   +-- screen.ts              # runLeapsScreen: collector job 'leaps' - market state, screen, Cboe LEAPS quotes, paper books
|   |   |   +-- runner.ts              # replayLeaps + one background backtest job; parseLeapsRunRequest
|   |   |   +-- cli.ts                 # npm run leaps -- [--from] [--to] [--book L1|L2|L3|all] [--save] [--trades]
|   |   +-- services/
|   |   |   +-- ai.ts                  # Signa --> Settings AI provider --> template priority chain
|   |   |   +-- llm.ts                 # generateText(prompt, provider): Gemini or Claude, null on failure
|   |   |   +-- flowScoring.ts         # Unusual flow direction scoring (Radon-adapted)
|   |   |   +-- marketData.ts          # Parallel data fetch orchestration
|   |   |   +-- scoring.ts             # 5 market scoring functions
|   |   |   +-- stockScoring.ts        # Stock score + Fibonacci + Moving Averages
|   |   +-- lib/
|   |       +-- adminAuth.ts           # requireAdmin: verifies Supabase session + is_admin (loopback bypass off Railway)
|   |       +-- apiUsage.ts            # signaFetch() call counter --> signal.api_usage
|   |       +-- settings.ts            # TradingSettings defaults, validateSettings, riskPerTrade, get/save (signal.app_settings)
|   |       +-- cache.ts               # NodeCache wrapper (30s TTL)
|   |       +-- marketCalendar.ts      # ET clock, NYSE holidays + early closes (update annually)
|   |       +-- supabaseRest.ts        # Service-role PostgREST client for the signal schema
|   |       +-- fomc.ts                # FOMC calendar + Fed stance (update annually)
|   |       +-- signaClient.ts         # Signa.ai API client (REST + MCP Streamable HTTP)
|   |       +-- technical.ts           # sma, ema, rsi, slope, percentileRank
|   |       +-- yahooClient.ts         # Yahoo Finance v8 Chart API client
|   +-- .env.example
|   +-- package.json
|
+-- docs/release2-trading-rules.md  # Paper-trading rules for release 2 (draft until approved; frozen once approved)
+-- docs/leaps-rules.md             # LEAPS book rules (v1.3: stock books L1-L3 + index books IS / IQ; thresholds live in backend/src/leaps/rules.ts)
+-- supabase/migrations/            # SQL to run in the Supabase SQL editor (collector tables)
+-- package.json     # Root: concurrently dev, install:all
+-- DESIGN.md        # Stripe-inspired light design tokens (source of truth)
+-- CLAUDE.md        # This file
+-- CHANGELOG.md     # Version history
+-- PROMPT.md        # Full reconstruction specification
+-- README.md        # User-facing documentation
```

---

## Local Development

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env - only API keys are optional

# Start both servers
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

The frontend Vite dev proxy routes `/api/*` --> `http://localhost:3001`, so no CORS issues locally.

---

## Environment Variables

**`backend/.env`**

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | Backend HTTP port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `SIGNA_API_KEY` | No | - | Signa.ai API key (stock signals + terminal analysis) |
| `GEMINI_API_KEY` | No | - | Google AI Studio key (Gemini provider) |
| `ANTHROPIC_API_KEY` | No | - | Anthropic key (Claude provider) |
| `AI_PROVIDER` | No | - | `none` forces template text regardless of Settings; the provider itself is chosen in Settings |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | For collector | - | Backend writes the collector tables with the service role key |
| `COLLECTOR_ENABLED` | No | `false` | `true` on exactly one deployment (Railway) |
| `SIGNA_DAILY_LIMIT` | No | `1000` | Signa quota; REST + MCP share it |
| `SIGNA_RESERVE_CALLS` | No | `200` | Collector skips jobs once usage reaches `limit - reserve` |
| `SEC_USER_AGENT` | For Fundamentals | - | `<app name> <contact email>` on every SEC EDGAR request; without it no new filings are fetched |

**`frontend/.env`** (optional - enables Google sign-in and cross-device watchlist sync)

This project uses the shared **coredb** Supabase project (`lcqsatefkutiakhgexue`) - the same Supabase instance used by moat-finder and folio-app. All three apps share auth (one Google sign-in works across all) and have their own tables in the same project.

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | No | `https://lcqsatefkutiakhgexue.supabase.co` (coredb) |
| `VITE_SUPABASE_ANON_KEY` | No | coredb anon/public key - Dashboard --> Settings --> API |
| `VITE_SUPABASE_REDIRECT_URL` | **Production only** | `https://signal.ailab.build`. Must match a Supabase --> Authentication --> URL Configuration --> Redirect URL entry. Leave blank locally - falls back to `window.location.origin`. |

When both Supabase vars are absent, `supabase` client is `null` and the app runs in localStorage-only mode with no auth UI shown.

All scoring, market data, Fibonacci, and moving averages work without any API keys.

---

## Design System

**Do not use ad-hoc color values.** All colors come from `frontend/src/lib/colors.ts`:

```typescript
import { C, scoreColor, changeColor } from '../lib/colors';
```

All `C.*` values are CSS custom property references (`var(--c-*)`). The actual color values are defined in `frontend/src/index.css` under `:root` (light mode) and `[data-theme="dark"]` (dark mode). This means every component inherits both themes automatically - no per-component dark mode code needed.

Key tokens:

- `C.ink` - primary text
- `C.inkSec` - secondary text
- `C.inkMute` - muted/label text
- `C.canvas` - white/dark background
- `C.canvasSoft` - panel/card background
- `C.border` - hairline borders
- `C.primary` - indigo accent
- `C.bull` - green (bullish)
- `C.bear` - red (bearish)
- `C.warn` - amber (caution)
- `C.s1` - card shadow

Helper functions:

- `scoreColor(score: number)` - returns green/amber/red based on 0-100 score
- `changeColor(pct: number)` - returns bull/warn/bear color based on % change

### Theme Toggle

- `useTheme()` hook (`frontend/src/hooks/useTheme.ts`) - returns `{ dark: boolean, toggle: () => void }`
- Theme is set via `data-theme="dark"` on `<html>`; preference persists in `localStorage` key `signal-theme`
- An inline `<script>` in `index.html` applies the saved theme before first paint (no flicker)
- The mesh backdrop is a CSS class `mesh-bg` defined in `frontend/src/index.css`; the dark mode override is `[data-theme="dark"] .mesh-bg`

---

## Key Conventions

### Typography

- UI font: **Plus Jakarta Sans** (weights 200-800; loaded via Google Fonts)
- Mono/numeric font: **JetBrains Mono** (weights 400, 500; loaded via Google Fonts)
- Labels/headers: `fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600` (uppercase label style)
- Sidebar nav items: `fontSize: '15px'`, `fontWeight: 600` active / `500` inactive, `borderRadius: 12`
- Body: `fontSize: '13px', color: C.inkSec, lineHeight: 1.5`
- Data values: use `.tnum` class - sets `font-family: "JetBrains Mono"` + `font-feature-settings: "tnum"`. Always use `.tnum` on prices, percentages, and tabular numbers. Never use `fontFeatureSettings` inline without also setting the mono font.
- Pill badges: `borderRadius: 9999, padding: '4px 12px'`

### Components

- All inline styles (no Tailwind in components - Tailwind is used only in `index.css` for global reset/utilities)
- No external UI component libraries
- No comments unless the WHY is non-obvious
- **Layout shell:** `App.tsx` uses a flexbox shell (`div.app-shell`) with a sticky 220px `Sidebar` (`div.app-sidebar`) and a `div.app-main` (`flex: 1`). The topnav is `div.app-topnav` (sticky, `z-index: 30`). Content lives in `div.app-content`. All layout classes are in `index.css`. On mobile (`<=768px`) the sidebar becomes `position: fixed` and slides in via `.mobile-open` class; a `.sidebar-overlay` backdrop handles dismiss-on-tap.
- **View routing:** `View` type is exported from `Sidebar.tsx` and imported by `App.tsx` (single source). `activeView` state in App controls what renders in `.app-content`: `'dashboard'` --> stock panels (tabs: Signal / Technical / Options / Fundamentals / Moat); `'market'` --> `TerminalAnalysis`; `'sector-map'` --> `SectorHeatmap`; `'options-flow'` --> `OptionsFlowView`; `'dark-pool'` --> `DarkPoolView`; `'gamma'` --> `GammaView`; `'market-scan'` --> `MarketScanView`; `'playbook'` --> `PlaybookView` (static strategy reference, no data deps); `'flow-scanner'` --> `FlowScannerView`; `'fundamentals'` --> `FundamentalsView` (receives `canSync = !supabaseEnabled || isAdmin`); `'leaps'` --> `LeapsView` (receives `canRun = !supabaseEnabled || isAdmin`); `'data-collection'` --> `DataCollectionView` (collector health); `'performance'` --> `PerformanceView` (receives `canRun = !supabaseEnabled || isAdmin`); `'settings'` --> `SettingsView` (receives `canEdit = !supabaseEnabled || isAdmin`). All intelligence views pass `onAnalyze` that loads the ticker and switches to `'dashboard'`. No SOON items remain in the sidebar.
- **Mobile responsiveness:** fixed-width grids that overflow on small screens use `overflowX: 'auto'` scroll containers + `minWidth` on inner content. Layouts that should *reflow* (e.g. multi-column --> single-column) use CSS classes in `index.css` with `@media (max-width: 768px)` breakpoints (e.g. `.fib-grid`). Never add per-component dark-mode or responsive code - use CSS classes instead.

### API Routes

- `GET /api/market-data` - full market payload (cached 30s)
- `POST /api/refresh` - invalidate cache
- `GET /api/stock/:symbol` - individual stock signal (Signa.ai + Yahoo Finance)
- `GET /api/moat/:ticker` - proxy to Supabase `moat` schema; returns 503 if `SUPABASE_URL`/`SUPABASE_ANON_KEY` not set, 404 if ticker not found. Note: `useMoatData` queries Supabase directly from the browser (not via this route), so Railway Supabase vars are optional.
- `GET /api/unusual-flow?ticker=AAPL` - AI-curated high-conviction options events (Signa `get_curated_flow` via MCP Streamable HTTP), scored with Radon-adapted confluence algorithm. Returns `{ events: ScoredFlowEvent[], summary: FlowSummary | null }`. Requires `SIGNA_API_KEY`; returns empty events array when key is absent. 5 min cache.
- `GET /api/options-flow` - market-wide unusual options flow (Signa `get_options_flow` MCP, no ticker required). Returns `{ flow: MarketFlowItem[] }`. 2 min cache.
- `GET /api/dark-pool` - market-wide dark pool prints (Signa `get_dark_pool` MCP), Radon-scored by NBBO positioning. Returns `{ prints: DpPrint[] }`. 2 min cache.
- `GET /api/gamma-gex` - GEX data for SPY, QQQ, IWM in parallel (Signa `get_gex` MCP). Returns `{ spy, qqq, iwm }`. 15 min cache. Call/put walls derived from levels if not in response.
- `GET /api/market-scan?direction=bullish|bearish` - ranked market setups from Signa `scan_symbols` MCP. Returns `{ results: ScanItem[], count }`. 5 min cache.
- `GET /api/collector/status` - collector health: enabled flag, symbols, Signa usage today vs limit, job schedule + last run, table row counts, daily rows. 60s cache. 503 when service role key or migration is missing.
- `GET /api/scanner?date=YYYY-MM-DD` - Flow Scanner payload for a session (default: latest scanned): candidates sorted by score, active core + scanner-promoted symbols, Signa scan top lists, scanner thresholds. 60s cache.
- `GET /api/settings` - trading settings (+ defaults, rules version, which AI keys are set, risk-per-trade preview). `PUT /api/settings` - validated save; requires `Authorization: Bearer <Supabase access token>` of an `is_admin` user (loopback requests without a token are allowed only when not on Railway). Settings live in `signal.app_settings` (key `trading`).
- `GET /api/backtest/runs` - last 60 saved replays (header + summary, newest first), `latest` (ids of the newest run per book sharing the newest range + rules version), the current replay `job`, `dataFrom` (first `signal_snapshots` date), `lastSession` (newest session with complete data: today from close+30 ET, else the previous trading day - `lastCompleteSession`; also the latest allowed replay end). `GET /api/backtest/runs/:id` - run + trades + equity + `benchmark` (SPY scaled to the starting balance on each equity date). `POST /api/backtest/run` `{from, to, books?}` (admin) - starts a background replay with the saved settings and saves each book (202; 409 while one runs; max one year, not in the future). `DELETE /api/backtest/runs/:id` (admin) - cascades to trades and equity. `GET /api/backtest/flow-study?share=0.75&minPremium=1000000` - flow study over `signal.flow_daily` (view, migration `20261008_flow_daily.sql`) + Yahoo daily bars, cached 15 min per parameter set. 503 without the service role key or migration.
- `GET /api/fundamentals/leverage` - operating leverage rows for eligible moat-finder tickers (from `sec_quarters`), skipped tickers with reasons, current sync job; starts a background `'new'` sync when moat-finder has unclassified tickers (2 min cooldown). `POST /api/fundamentals/sync` `{mode: 'daily'|'full'}` (admin) - 202; 409 while a sync runs. 503 without the service role key or migration `20261021_sec_fundamentals.sql`.
- `GET /api/leaps` - latest LEAPS screen (`leaps_market` + `leaps_screen` rows with per-book contracts and price levels), paper positions with levels from their fill, per-book cash/equity. `GET /api/leaps/runs` - last 60 LEAPS backtests, `latest` set (one per book, same range + rules version), running `job`, `lastSession`, `defaultFrom` (10 years back). `GET /api/leaps/runs/:id` - run + trades + equity + SPY `benchmark`. `POST /api/leaps/run` `{from, to}` (admin, 202, 409 while running, from 2012). `DELETE /api/leaps/runs/:id` (admin). 503 without the service role key or migration `20261025_leaps.sql`.
- `GET /health` - health check

### Data Collector (Release 1 of the trading roadmap)

Records history that Signa cannot serve retroactively, so Radon-style strategies can be backtested later. Signa only returns live/latest data for flow, dark pool and GEX; **a missed slot cannot be back-filled.**

- **Universe:** `signal.tracked_symbols` (active rows). `source='core'` never expires: SPY, QQQ, IWM, SMH, MU, AMZN, SPCX, AAPL, NVDA, META, GOOGL, AVGO, MSFT, TSLA. `source='scanner'` rows are added/renewed/expired by the Flow Scanner. Not tied to the user's watchlist.
- **Schedule (ET, NYSE trading days, `schedule.ts`):** SEC fundamentals 07:00 (see Fundamentals below, no Signa calls); earnings calendar 08:30 (next 30 calendar days, ~22 Nasdaq requests, no Signa calls); signals 09:00; Signa scan 09:15 (top 100 bullish + 100 bearish, 2 calls - also the input for a future shares-only "Signa top picks" backtest); raw flow hourly 10:15-15:15 + close+5; scanner 11:45, 14:45, close+30; dark pool every 30 min 10:05-16:05; flow alerts hourly 10:35-15:35 + close+10 (active names hit Signa's 50-alert cap); curated flow 10:30, 12:30, 14:30, close+10; Cboe option chain close+25; GEX close+20; dark pool rollup close+40; LEAPS screen + paper books close+45 (no Signa calls). Close-relative slots follow early closes.
- **Budget:** about `symbols x 22 + 13 + 3 x SCANNER_DP_LOOKUPS` Signa calls per trading day (14 core + 12 promoted = 615). Every Signa request goes through `signaFetch()` (`lib/apiUsage.ts`), which counts it and flushes to `signal.api_usage` every 5 min. `runJob()` skips a Signa job when `used + planned > SIGNA_DAILY_LIMIT - SIGNA_RESERVE_CALLS`.
- **Dark pool:** Signa returns at most 50 latest prints per call, so 30-minute pulls are a *sample* (13 snapshots/day), not the full tape Radon uses with direct UW access. Side classification matches Radon `analyze_darkpool` (price >= NBBO mid = buy). Raw prints are kept 60 days; `signal.rollup_dp_daily()` keeps permanent daily aggregates in `dp_daily`. Signa API change (2026-10): `volume` becomes the print's own size (deprecated) and `day_volume` the running day total, so the parser reads `day_volume` when present and `volume` only on older payloads; `is_ext_hours` is stored (migration `20261026_dp_ext_hours.sql`) only when the payload carries it; `notional` backs up `premium`.
- **Signa dark pool coverage is thin:** a 50-print pull spans only minutes of tape for liquid names (often after-hours); treat `dp_daily` as a noisy estimate.
- **GEX:** a payload whose `snapshot.session_date` is not the job's trade date is refused (counted as a failed symbol) so a stale session is never stored under today's date. Call `get_gex` without strike filters - Signa computes flip/walls inside the filtered range, so filtered calls return wrong levels. Stored strikes are summed across expiries and limited to +/-30% of spot.
- **Option quotes:** Cboe delayed chain (`collector/cboeOptions.ts`, `https://cdn-api.cboe.com/api/global/delayed_quotes/options/<SYM>.json`, free, ~15 min delayed, one request per symbol, Greeks included) at close+25. Two expiries nearest 30 and 60 DTE (21-75 DTE window), strikes within +/-15% of spot, plus the symbol's `iv30` into `iv_daily`. Yahoo v7 (cookie + crumb) is only a per-symbol fallback: it returns 429 on Railway's shared IPs. Needed later to price paper trades; uses no Signa calls.
- **Enable:** `COLLECTOR_ENABLED=true` + `SUPABASE_SERVICE_ROLE_KEY` + `SIGNA_API_KEY`. Leave it off locally so two collectors don't double the quota. Manual run: `cd backend && npm run collect -- <job> [YYYY-MM-DD]`.
- **Flow Scanner (`collector/scanner.ts`, port of Radon `scripts/discover.py`):**
  - Feed: `get_raw_flow` (UW executions >= $250k stored in `raw_flow`); scoring uses prints >= `SCANNER_MIN_PREMIUM` ($500k) with >= `SCANNER_MIN_DTE` (7) days to expiry - 0DTE flow is ignored for a swing horizon
  - Per symbol: call/put print counts (bias = 1.5x rule), sweeps, avg vol/OI, total premium, max OI, latest price
  - Dark pool: last 3 sessions from `dp_daily` (scanner refreshes today's rollup first); untracked names get one live `get_dark_pool` pull, up to `SCANNER_DP_LOOKUPS` per run, biggest premium first
  - Score = Radon weights: dp strength 30, sustained days 20, confluence 20, vol/OI 15, sweeps 15 (0-100)
  - Filters (`rejectReason`): index options, `DUPLICATE_ETFS` (ETFs tracking or levering a core index - VOO/IVV/SPLG/SPYM -> SPY, QQQM/TQQQ -> QQQ, VTWO/TNA -> IWM, SOXX/SOXL -> SMH, etc.; reason names the core ETF, and any already-promoted one is demoted on the next run), < `SCANNER_MIN_ALERTS` prints, < `SCANNER_MIN_TOTAL_PREMIUM`, price < `SCANNER_MIN_PRICE`, max OI < `SCANNER_MIN_OPEN_INTEREST` (default 0 = off; low OI on a big print usually means a new opening position), no dark pool data
  - Promotion (`planPromotions`): passed + score >= `SCANNER_PROMOTE_SCORE` (45 - promotion only starts collection; untracked names max out near 69 because Signa gives them just 1 day of dark pool) --> `tracked_symbols` source 'scanner' for `SCANNER_PROMOTION_DAYS` (14 calendar days), renewed on requalifying; capped at `SCANNER_MAX_PROMOTED` (12) by score; core rows are never modified
  - Every scored symbol is stored in `scanner_candidates` (one row per symbol per session, latest run wins) so promotion thresholds can be backtested later
  - The feed is a sample: 200 prints >= $250k span ~5 trading hours (pulled hourly, deduped by id), far sparser than Radon's full UW alert walk; on 2026-10-02 only ~80 prints were >= $500k, about half of them SPX/SPXW
- **Earnings calendar:** `api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD` (needs browser-like User-Agent + Accept headers) into `earnings_calendar`. Every company, not just tracked ones, so scanner-promoted names are covered. Each fetched date is deleted and re-inserted so moved report dates disappear; a failed date keeps its old rows. Used by the release 2 earnings rules in `docs/release2-trading-rules.md` section 5.
- **Option quote expiries:** besides the two nearest 30/60 DTE, every standard monthly (third Friday; Thursday when that Friday is a holiday - `isMonthlyExpiry`) within 14-75 DTE is recorded, so a monthly contract the paper books hold is priced every day until its 21-days-left exit.
- **Holidays:** `NYSE_HOLIDAYS` / `NYSE_EARLY_CLOSES` in `lib/marketCalendar.ts` - update annually with `fomc.ts`.

### Fundamentals (SEC operating leverage)

Universe = `moat.research_reports` tickers (read with the service role via `selectRowsIn('moat', ...)`) plus `LEAPS_UNIVERSE` (the LEAPS book's quality checks read the same tables), not the watchlist or tracked symbols. The Fundamentals page and route show moat-finder tickers only. `sec_quarters` also stores `net_income` (bank profit check) and `diluted_shares` (market cap: weighted diluted, else basic, else period-end shares outstanding; values under 100k are treated as millions - MCD). V files shares per class only, so it has no market cap.

- **Classification (`sec_companies`):** exchange-suffixed tickers (`.KR`, `.AX`, ...) -> `non-US listing`; not in SEC's `company_tickers.json` -> excluded; latest periodic report 20-F/40-F -> excluded as ADR / foreign private issuer; no 10-Q/10-K yet -> pending. Re-evaluated on every daily run; a ticker dropped from moat-finder is marked `removed from moat-finder` but keeps its quarters.
- **Quarters (`sec_quarters`, permanent history):** from `companyfacts`. Quarter = 75-105 day duration, latest filing wins (restatements), fy/fp from the earliest filing. Revenue = largest of the total-revenue tags per period (incl. `RegulatedAndUnregulatedOperatingRevenue` for utilities - DTE); operating income = `OperatingIncomeLoss`, else (flagged `op_computed`, shown as a dagger) revenue - `CostsAndExpenses` (COHR), `GrossProfit` - `OperatingExpenses` (CC), revenue - cost of revenue - `OperatingExpenses`, or revenue - cost of revenue - SG&A - R&D (ETN, Qnity). Nothing is computed without a cost-of-revenue figure (ASTS stays skipped). Q4 = annual minus the three quarters inside it (`derived`, shown as Q4*).
- **Metrics (`leverage.ts`):** year-ago quarter = 350-380 days earlier. Incremental margin = change in op income / change in revenue (null when revenue fell). DOL = % op income change / % revenue change; n/m when last year's op income <= 0 or margin < 1%. Rank = incremental margin desc (ties: margin expansion), growing companies only. Latest quarter > 150 days old -> stale, listed as skipped rather than ranked. Verified against a third-party table: MU, AVGO, SNDK, MCHP, ADI, AMD, LITE, CRDO, MPWR, VIAV, MTSI, ALAB, AXTI match exactly.
- **Updates:** collector job `fundamentals` at 07:00 ET (`daily`: one submissions request per ticker, `companyfacts` only when the newest 10-Q/10-K accession changed); page load (`new`: only unseen tickers); admin buttons / `npm run fundamentals -- daily|full`. One sync per process at a time.
- **companyfacts lag:** SEC's companyfacts API can miss a filing for months (CDNS's 2026-07-29 10-Q was still absent in late October) while the filing itself is on EDGAR. Each fact carries `accn`, so the sync checks whether the newest 10-Q/10-K is in companyfacts. If not: up to 2 missing filings are read from their XBRL instance (`<primary doc>_htm.xml`, else found via the filing's `index.json`) and merged in, and `last_accession` is set to null so every daily run downloads again until companyfacts catches up. On 2026-10-23 this applied to AEP, AMKR, CDNS, DTE, FE, ROG, SMTC, VICR.
- **Rate limit:** SEC allows 10 req/s per IP and blocks ~10 min when exceeded. `secClient.ts` spaces every request 250 ms apart and backs off on 403/429/5xx. A full run is ~2 requests x ~100 filers.

### LEAPS book

Rules: `docs/leaps-rules.md` v1.3; every threshold in `backend/src/leaps/rules.ts` (`LEAPS_RULES_VERSION` stored with every position and run). Starting balance per book: Settings `leaps.startingBalance` (default $50,000).

- **Screen (collector job `leaps`, close+45, `screen.ts`):** SPY 52-week high / VIX / Market Quality Score -> `leaps_market` state. For every `LEAPS_UNIVERSE` SEC filer: Yahoo bars (price, 52-week high, splits), market cap = newest filed share count x split factor x price, SEC profit/revenue checks; names passing those (or held) get one Cboe chain request for IV30 and calls. Per book: first monthly expiry 15-27 months out, delta nearest 0.75 / 0.50 / 0.30, liquidity, `priceLevels`, cost of 2 contracts and whether a $25k book could afford them -> `leaps_screen`. Only the chosen and held contracts go to `leaps_quotes`.
- **Paper books (`paper.ts`):** pending buys fill at the next session's ask (cut to cash, cancelled below 2 contracts), half sales / closes at the bid; exit decisions queue `pending_action` for the next session. The job is idempotent per session (a re-run only refreshes the screen).
- **Index books IS (SPY) / IQ (QQQ) (rules 6b):** each always holds one 0.85-delta LEAPS on its index (30% of its own equity, expiry 500-900 days, rolled at 120 days left), fractional contracts on paper (`leaps_positions.qty` is numeric), no OI floor. `indexOrders()` in `screen.ts` re-buys in the same session a position's roll is decided; sells fill before buys. Summaries carry `benchmark` (QQQ for IQ, SPY otherwise, via `benchmarkOf`); legacy v1.2 `IX` rows stay allowed in the tables.
- **Interest:** idle cash earns `^IRX` in the backtest (daily) and in the paper books (`leaps_interest`, one row per book per processed session; also the job's idempotency marker).
- **Research quote grid:** every `leaps` run fetches a Cboe chain for every candidate plus SPY/QQQ and stores calls nearest deltas 0.20-0.85 on monthly expiries 270+ days out (`leaps_quotes.grid = true`, ~4k rows/session) to recheck the IV model later.
- **Confirmation:** `dp_daily`, `flow_alerts`, `raw_flow` (no Signa calls); dark pool / flow alerts exist for tracked symbols only.
- **Backtest (`backtest.ts`):** modeled prices - IV = (0.07 + 0.75 x 1-year realized vol) x clamp(sqrt(VIX6M / 22), 0.75, 2), fitted to real Cboe LEAPS IV on 2026-10-23; 2% half-spread; fractional contracts; next-close fills; market cap scaled by price from today's; volatility check = realized vol / VIX. Yahoo `range=max` returns quarterly bars, so histories are fetched by start date (`getDailyBarsWithSplits(symbol, { since })`).
- **Results (2016-10-25 -> 2026-10-23, $50k per book, v1.3):** IS CAGR 14.8% (max DD 26%) vs SPY 15.3% (34%); IQ 20.6% (28%) vs QQQ 20.3% (35%); L1 12.8% (36%), L2 13.1% (38%), L3 3.9% (52%). Research (2026-10-25) found no stock-book variant that beat SPY at equal risk out of sample; only always-on index LEAPS held a (small since 2022) edge.

### Replay engine (release 2 step 3)

`backend/src/backtest/` replays one paper book over stored history under `docs/release2-trading-rules.md` v1.1 (`RULES_VERSION` in `lib/settings.ts`, stored with every run). Pure modules (strategies, contracts, earnings, pricing, metrics, engine) take a `MarketData` interface, so tests run on in-memory fixtures (`src/__tests__/backtest/fixtures.ts`); only `data.ts` touches Supabase/Yahoo.

- **Timing:** decisions use a session's data after its close. Options fill at the next session's close quotes (buy at ask, sell at bid); shares at the next session's open; share stops/targets trigger intraday on the daily bar (stop assumed first if both). Nothing is decided on the last session.
- **Missing quotes:** a held contract without a quote is priced by Black-Scholes from its last seen IV (else the symbol's IV30) with a 3% half-spread, counted in `modeledMarks` / `modeledFills`. New entries always need a real quote ("no quote at fill").
- **Contracts:** latest monthly expiry 30-75 DTE (else latest expiry in that window); single option nearest 0.40 delta within budget, else debit spread (long ~0.50 delta, nearest further strike with max gain >= 2x debit), else skip with reason. Liquidity: spread <= 10% of mid, OI >= 100. Book B adds its 2:1-at-GEX-target test via `accept`.
- **Direction:** Books A and B trade both sides - calls / call debit spreads when bullish, puts / bear put debit spreads (long the higher strike) when bearish. Book C is long shares only.
- **Sizing/limits:** `riskPerTrade` (options) or `shares.riskPct` (Book C); half-Kelly after `kellyMinTrades` closed trades (skip when Kelly <= 0); max open trades, total open risk (budget shrinks to the remaining room), one position per ticker.
- **Earnings:** entries blocked when a report is today or within 10 trading days; exits decided so the fill lands on the last close before the report (rules v1.1: after-hours -> that day; pre-market or unknown -> previous session). Book C holds instead if up >= 2R, moving the stop to entry. Each earnings exit spawns a shadow twin (no cash, no limits) whose result is stored as `shadowPnl`.
- **Data hygiene:** signal snapshots captured before their own session (manual test runs) are ignored.
- **Persistence:** `--save` writes `backtest_runs` (settings + summary + skips + open positions), `backtest_trades`, `backtest_equity` (migration `20261007_backtest_runs.sql`).
- **Performance page (step 4):** `PerformanceView` reads those tables through `/api/backtest/*`. Admins start replays from the page; the API runs one job at a time in memory (lost on a restart - just run again) and the page polls every 4s while it runs. The page also hosts the **flow study** (`flowStudy.ts`): each tracked ticker-day with >= $1M flow-alert premium is call-heavy (calls >= 75% of premium), put-heavy (<= 25%) or mixed; "surge" = total premium >= 2x the ticker's median of its previous 20 flow days (needs 5+). Reports mean forward return, % up and difference vs all flow days per horizon; groups under 30 cases are shown faded. Daily bars use a Yahoo range long enough for the replay start plus the ATR lookback (`barsRangeFor`).

### Signa MCP Streamable HTTP

The Signa `get_curated_flow` tool is only available via MCP, not REST. `signaClient.getCuratedFlow()` calls it by POSTing a JSON-RPC 2.0 body to `https://app.getsigna.ai/api/mcp/sse` and parsing the SSE `data:` line from the response:

```typescript
POST https://app.getsigna.ai/api/mcp/sse
Content-Type: application/json
Authorization: Bearer <SIGNA_API_KEY>

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_curated_flow","arguments":{...}}}
```

Response is SSE (`data: {...}` lines). Parse with `text.split('\n').find(l => l.startsWith('data:'))`. The JSON-RPC result wraps the payload in `result.content[0].text` (a double-stringified JSON string).

### Auth, Access Control & Watchlist

**Access model:** When `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, the app is **invite-only**. Unauthenticated users see an auth gate. Authenticated users with `status='pending'` see an "Access Pending" screen. Only `status='approved'` users reach the full dashboard. When Supabase is not configured (`supabase === null`), the app is fully open (local dev mode).

**`useAuth`** (`hooks/useAuth.ts`) - wraps Supabase session and `user_profiles` table. Exports:

- `user: User | null` - raw Supabase auth user
- `authLoading: boolean` - true while session + profile are loading
- `profile: UserProfile | null` - `{ id, email, display_name, status, is_admin, requested_at, approved_at }`
- `userStatus: 'pending' | 'approved' | null` - null when Supabase is unconfigured
- `isAdmin: boolean` - true when `profile.is_admin`
- `pendingUsers: UserProfile[]` - populated for admins; all users awaiting approval
- `signInWithGoogle()` - triggers Supabase Google OAuth popup
- `signOut()` - clears session and profile state
- `approveUser(userId)` - admin only; sets status='approved' and approved_at in Supabase

**`AdminPanel`** (`components/AdminPanel.tsx`) - rendered in `App.tsx` only when `isAdmin && pendingUsers.length > 0`. Lists pending users with name, email, request date, and an Approve button. Optimistically removes approved users from the list.

**`AuthButton`** (`components/AuthButton.tsx`) - accepts `userStatus` prop. Renders nothing when Supabase is unconfigured or loading. Shows "Sign in" button --> full user row (avatar, name, "Pending" amber badge when status=pending, "Sign out") when logged in.

**Auth gate in `App.tsx`:** `const isApproved = !supabaseEnabled || userStatus === 'approved' || isAdmin`. When `supabaseEnabled && !authLoading && !isApproved`, renders a centered card with sign-in CTA (unauthenticated) or pending-approval message (authenticated but pending). All stock search and market data is inside the `isApproved` branch.

**`useWatchlist(user)`** (`hooks/useWatchlist.ts`): Accepts `user: User | null`. When non-null and Supabase is configured, reads/writes go to the `watchlists` Postgres table (watchlists are always tied to the authenticated user). When `user` is null, falls back to `localStorage` (key: `signal-dashboard-watchlists-v2`). First login automatically migrates existing localStorage groups into Supabase. Uses `useRef`-based `userRef` / `stateRef` pattern to eliminate stale closures. **Dual persistence:** `persistLocal()` is called unconditionally on every mutation (Supabase and localStorage modes alike) - localStorage is always an up-to-date write-through backup. **Cross-device sync:** On sign-in the effect immediately merges Supabase groups with any locally-only groups (optimistic state) before firing recovery INSERTs. This ensures all groups from any device are visible immediately without waiting for network writes. `activeGroup` is validated after each Supabase load (falls back to first group if current group no longer exists). SELECT and INSERT errors are logged via `console.warn`. Exports: `groups`, `activeGroup`, `activeTickers`, `setActiveGroup`, `createGroup`, `renameGroup`, `deleteGroup`, `add`, `remove`, `isInWatchlist`, `getGroupsForTicker`.

**Supabase schema (full DDL in README):** signal-dashboard uses the **`signal`** PostgreSQL schema within the shared coredb Supabase project (moat-finder uses `moat`, folio-app uses `folio`). Two tables - `signal.watchlists` (RLS: user owns their rows) and `signal.user_profiles` (status, is_admin; RLS via `signal.is_admin()` security-definer function). A trigger `on_auth_user_created` on `auth.users` auto-inserts a `pending` profile on first sign-in. Admin grants themselves `is_admin=true` via SQL; all subsequent approvals happen in the app UI. The `signal` schema must be added to **Supabase Dashboard --> Settings --> API --> Exposed schemas** before the JS client can query it.

**CRITICAL - `signal.is_admin()` must NOT query `signal.user_profiles`**: doing so causes PostgreSQL error `42P17 infinite recursion detected in policy` because the RLS policy on `user_profiles` calls `is_admin()` which re-triggers the same policy. The function reads from the JWT `app_metadata` claim instead: `coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)`. This requires the admin user's `auth.users.raw_app_meta_data` to include `{"is_admin": true}` (set via SQL) AND a fresh sign-in to get a JWT with the updated claim.

**`supabase.ts`** - exports `supabase: SupabaseClient<Database, 'signal'> | null`. `Database` type uses `signal` as the top-level key (not `public`). Client is created with `{ db: { schema: 'signal' } }`. The type must include `Relationships`, `Views`, `Functions`, `Enums`, `CompositeTypes` (required by `SupabaseClient<T>` generics).

---

## Build & Type Check

Always run these after changes. All must pass with zero errors:

```bash
cd backend && npm run typecheck
cd backend && npm run build

cd frontend && npm run typecheck
cd frontend && npm run build
```

---

## Test Suite

Run the test suite to catch regressions before committing:

```bash
cd backend && npm test          # 462 tests - one-shot
cd frontend && npm test         # 91 tests  - one-shot

cd backend && npm run test:watch   # watch mode
cd frontend && npm run test:watch  # watch mode
```

**Framework:** Vitest (ESM-native, TypeScript-native, no transpile step needed).

**Backend config:** `backend/vitest.config.ts` - node environment.
**Frontend config:** `vite.config.ts` `test` block - jsdom, `globals: true`, setup in `src/__tests__/setup.ts`.

### Test file map

| File | Covers |
| --- | --- |
| `backend/src/__tests__/lib/technical.test.ts` | All 7 functions in `technical.ts` - edge cases, boundary values, known arithmetic |
| `backend/src/__tests__/services/stockScoring.test.ts` | `getStockDecision` (both BULLISH/BEARISH + LONG/SHORT vocabularies), `computeStockTechnicalScore`, `computeSectorETFScore`, `computeFibonacci`, `computeMovingAverages`, `SECTOR_TO_ETF` |
| `backend/src/__tests__/services/scoring.test.ts` | `scoreVolatility`, `scoreTrend`, `computeMarketQualityScore`, `getDecision` - each weight verified |
| `frontend/src/__tests__/lib/priceLevels.test.ts` | `validatePriceLevels` - direction detection, entryRef fallback, LONG/SHORT level validation, **ASTS regression** |
| `frontend/src/__tests__/hooks/useWatchlist.test.ts` | `useWatchlist` localStorage path - add/remove, groups CRUD, persistence, legacy migration, **page-refresh regression** |
| `frontend/src/__tests__/hooks/useWatchlist.supabase.test.ts` | `useWatchlist` Supabase-mode path - all mutations write to localStorage (dual persistence), in-memory state correct immediately |
| `backend/src/__tests__/services/flowScoring.test.ts` | `scoreFlowEvent`: all Radon-adapted scoring branches (CALL/PUT base, sentiment, sweep multiplier, vol/OI bonus, confirms/contradicts signal, mega premium, gamma pin, negative GEX amplifier, combined stacking, +/-2 boundary, field preservation); `summarizeFlow`: direction counts, premium totals, avg conviction, market bias tie-breaking |
| `backend/src/__tests__/collector/parsers.test.ts` | Collector row transforms: dark pool side classification (Radon mid rule), day_volume vs per-print volume + ext-hours flag, GEX snapshot session date, ET trade dates, dedupe, flow-alert stable ids, curated universe filter, GEX strike aggregation + band, signal field extraction, swing expiry selection (30/60 + monthlies), monthly expiry detection, option chain band filter, OCC symbol decoding, Cboe chain selection + Greeks + IV30, Nasdaq earnings rows (timing, EPS parsing, dedupe), earnings lookahead window |
| `backend/src/__tests__/collector/schedule.test.ts` | ET clock across DST, NYSE holidays/early closes, job slots, `dueJobs` grace window, Signa daily call estimate |
| `backend/src/__tests__/collector/scanner.test.ts` | Radon discover port: config defaults, flow aggregation (premium/DTE floors), 1.5x bias rule, dark pool day/multi-day analysis + sustained days, vol/OI scale, weighted score, confluence, reject reasons, promotion cap/expiry/renewal, trading-day lookback, raw flow + Signa scan parsers |
| `backend/src/__tests__/lib/settings.test.ts` | `riskPerTrade` (fixed $1,000 band, 2.5% above $40k with no jump, 10% cap below $10k), `validateSettings` (defaults merge, every-error reporting, Kelly <= 0.5, integer fields, risk <= balance, no default mutation), `isLoopback` |
| `frontend/src/__tests__/lib/risk.test.ts` | Frontend `riskPerTrade` mirror matches the backend at preview balances; NaN handling for half-typed fields |
| `backend/src/__tests__/backtest/engine.test.ts` | Replay on fixtures: next-close ask fill, bearish put trade with +100% exit, -50% exit at bid with commissions/R, mid marks, too-expensive-at-fill skip, earnings window skip, earnings exit + shadow P&L, max open trades, open-risk budget cap, Black-Scholes marks; Book C open fills, 1% sizing, intraday stop, gap fill, target, 2% entry rule, 2R earnings hold, earnings exit + shadow |
| `backend/src/__tests__/backtest/report.test.ts` | Replay request validation (dates, range, future, books), Yahoo bar range choice, SPY same-start benchmark (carry-forward, leading gaps), latest run set grouping, last complete session (close+30, weekends, holidays, early closes) |
| `backend/src/__tests__/backtest/flowStudy.test.ts` | Flow study: call/put-heavy classification + premium floor, close-to-close forward returns (incomplete horizons), surge vs median history, bucket stats vs all flow days, recent one-sided day list |
| `frontend/src/__tests__/lib/performance.test.ts` | Equity chart curve merge (by date, null skip, numeric strings), leg descriptions (single, spread, shares), $/% formatters |
| `backend/src/__tests__/backtest/units.test.ts` | normCdf, Black-Scholes (textbook value, parity, expiry), expiry choice, contract selection (single, spread 2:1, skip reasons, liquidity, bearish put + bear put spread), payoff, earnings dates/windows/exit timing, Book A/B/C signals and exits, ATR, drawdown, profit factor, losing streak, SPY return, trading-day ranges |
| `backend/src/__tests__/fundamentals/parse.test.ts` | US ticker format, `classifyFiler` (10-Q/10-K eligible, 20-F/40-F excluded, former 20-F filer, pending IPO), `parseQuarters` (quarter durations, restatement wins with first-filed fy/fp, non-periodic forms ignored, derived Q4, missing-quarter guard, FY->Q4 label, largest revenue tag, utility revenue tag, every operating income fallback, no fallback from OperatingExpenses alone), `factAccessions`, `periodicFilingsMissing` (amendments skipped, newest first), `mergeFacts` (no mutation) |
| `backend/src/__tests__/fundamentals/instance.test.ts` | `parseInstanceFacts` (consolidated USD durations, filer-chosen unit ids, segment / instant / nil / per-share / share facts skipped, duplicates, dei fy/fp, no namespace), `instanceFileName` |
| `backend/src/__tests__/fundamentals/leverage.test.ts` | `leverageFor` (AVGO reference row, numeric strings, DOL n/m on loss / thin base, falling revenue, no year-ago quarter, missing values, stale cutoff, derived/computed flags), `rankLeverage` (incremental-margin rank, op income order, tie-break) |
| `backend/src/__tests__/leaps/levels.test.ts` | `invNorm`, `strikeForDelta` round trip, `callDelta` at expiry, `snapStrike` grid, `spotForValue`, `priceLevels` (expiry formulas, commission, today < 6 months < expiry, no IV) |
| `backend/src/__tests__/leaps/market.test.ts` | `marketState` (correction, pullback via VIX or score, normal), `offHighPct`, `rollingHigh`, `rollingVol`, `splitFactorSince` |
| `backend/src/__tests__/leaps/quality.test.ts` | Filing lag (no look-ahead), profit check (loss, bank net income, too few / stale quarters), revenue YoY, market cap / volatility thresholds, first failed reason, `latestShares` |
| `backend/src/__tests__/leaps/contracts.test.ts` | LEAPS expiry window (monthlies 457-822 days), modeled Jan/Jun expiries, contract per book delta, OI / spread / missing quote reasons |
| `backend/src/__tests__/leaps/exits.test.ts` | `decideExit` (half at +100%, no stop before halfway, halfway-and-50% stop, 120-day time exit first, quality break, runner trail after 6 months), `sizePosition` (correction / pullback size, 2-contract minimum, fractional, 8 positions, 60% deployed, cash), `affordableAt` |
| `backend/src/__tests__/leaps/confirm.test.ts` | Confirmation: dark pool + flow, dark pool + long-dated call print (365-day and call filters), missing data as null |
| `backend/src/__tests__/leaps/paper.test.ts` | `bookState` (open cost, marks, realized, pending reservations), `stepPosition` (fill at ask, cash cut / cancel, half sale at bid, P&L across both halves, waiting order, runner peak, quality-break decision) |
| `backend/src/__tests__/leaps/backtest.test.ts` | `modeledQuote` spread, `modeledIv` (regime clamp), episodes from SPY drawdowns, each stock book buys the eligible name next session and sells half on the recovery, IS / IQ always invested in their own index + rolls held > 12 months, per-book benchmark (IQ vs QQQ), T-bill interest on idle cash, summary half/runner split |
| `backend/src/__tests__/leaps/runner.test.ts` | `parseLeapsRunRequest` (range, earliest start, future), `marketCapNow` (split scaling, no shares) |
| `frontend/src/__tests__/lib/leaps.test.ts` | `pctTo` / `fmtLevel`, `fmtCap`, `sortScreen`, `positionReturnPct` (both halves), `positionStatus`, `mergeNamedCurves`, `buyAndHoldRows` (SPY / QQQ from run benchmarks), `indexAction` (buy, ordered, hold until roll date, roll) |
| `backend/src/__tests__/fundamentals/plan.test.ts` | `planSync` (suffix / non-SEC exclusions, new vs daily modes, re-added and removed tickers, dedupe), `needsFacts` (new filing, never fetched, full resync, excluded) |
| `frontend/src/__tests__/lib/fundamentals.test.ts` | `fmtMoney`, `fmtRatioPct`, `fmtMargin`, `sortLeverage` (directions, rank order, missing values last, margin change, no mutation) |
| `backend/src/__tests__/lib/apiUsage.test.ts` | UTC day key, pending call accumulation per source |
| `backend/src/__tests__/lib/gexParsing.test.ts` | `parseGexRawResponse`: Signa camelCase vs snake_case field fallback chains (`gammaFlipLevel`/`gamma_flip`/`gammaFlipPoint`, `callWall`/`call_wall`, `putWall`, `regimeAboveFlip`/`above_flip`/`aboveFlip`, `current_price`/`currentPrice`), per-expiry `rawLevels` preservation, cross-expiry strike aggregation, `net_gex` explicit vs sum-all-levels fallback vs null, zero-strike skip, symbol normalisation |

### Test policy

All new exported pure functions must have unit tests before they are committed. The test count must not decrease between commits. When extracting logic from a route or component into a standalone function, add tests for the new function at the same time.

### Price level validation utility

`frontend/src/lib/priceLevels.ts` exports `validatePriceLevels()` - the stop/target directional validation logic extracted from `SignaCard.tsx`. `SignaCard` imports it from here. Always use this utility when displaying price levels; do not duplicate the logic inline.

```typescript
validatePriceLevels(direction, entry, stop, target, rr, currentPrice)
// --> { isLong, entryRef, stopValid, targetValid, rrValid }
```

For LONG: stop must be below entryRef, target above. For SHORT: reversed. Valid levels get directional colour (`C.bear` for stop, `C.bull` for target); invalid-but-present levels show `C.inkSec` (neutral); zero/missing values show `-`. Validation controls **colour only**, not visibility.

---

## Sector / Sub-Sector Tickers (as of v0.5.5)

**Main sectors** (`SECTORS` array in `marketData.ts`):
`QQQ` Nasdaq 100 - `XLF` Financials - `XLE` Energy - `XLV` Health Care - `XLI` Industrials - `XLY` Consumer Disc. - `XLP` Consumer Staples - `XLU` Utilities - `XLB` Materials - `XLRE` Real Estate - `XLC` Comm. Services - `ITA` Aerospace & Defense - `SPY` S&P 500 - `PDBC` Commodities

**Display-only sectors** (in `DISPLAY_ONLY_SECTORS` Set - excluded from breadth scoring and leader/lagger ranking): `SPY`, `PDBC`

**Sub-sectors** (`SUBSECTORS` array, as of v0.6.1):
`SMH` Semiconductors (Nasdaq 100) - `IGV` Software (Nasdaq 100) - `AIPO` AI Power Stocks (Nasdaq 100) - `AIS` AI Supercycle Stocks (Nasdaq 100) - `DRAM` AI Memory (Nasdaq 100) - `EUV` AI Photonics (Nasdaq 100) - `XBI` Biotech (Health Care) - `IHI` Medical Devices (Health Care) - `URA` Uranium (Energy) - `XOP` Oil & Gas E&P (Energy) - `KRE` Regional Banks (Financials) - `ICLN` Clean Energy (Energy) - `TAN` Solar (Energy) - `FCG` Natural Gas (Energy) - `GC=F` Gold (Commodities) - `SI=F` Silver (Commodities) - `COPX` Copper (Commodities) - `CL=F` Crude Oil WTI (Commodities) - `NASA` Space (Aerospace & Defense)

**Stock sector --> ETF mapping** (`SECTOR_TO_ETF` in `stockScoring.ts`): Technology --> QQQ (was XLK)

**Important:** `GC=F`, `SI=F`, and `CL=F` are COMEX/NYMEX futures symbols on Yahoo Finance. `XAUUSD=X` / `XAGUSD=X` (forex-style) return 404 from the v8 Chart API and must NOT be used. Futures symbols use `encodeURIComponent()` in `yahooClient.ts`, so the `=` and `^` characters are handled automatically.

## Scoring System

```text
Market Quality Score = Volatilityx20% + Trendx25% + Breadthx20% + Momentumx25% + Macrox10%
```

| Score | Decision | Guidance |
| --- | --- | --- |
| 80-100 | BULLISH | Full position sizing |
| 60-79 | CAUTION | Half size, A+ setups only |
| < 60 | BEARISH / AVOID | Preserve capital |

The composite score shown in `StockPanel` is computed from: stock technical score (40%) + sector ETF score (30%) + market quality score (30%).

---

## Data Sources

| Metric | Source |
| --- | --- |
| All price history + quotes | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals (entry/stop/target/triggers) | Signa.ai API (`SIGNA_API_KEY`) |
| Terminal analysis | Signa.ai --> Gemini 1.5 Flash --> built-in template |
| FOMC calendar, Fed stance | Hardcoded in `backend/src/lib/fomc.ts` - update annually |

**Important:** The `yahooClient.ts` uses direct `fetch` to the Yahoo Finance v8 Chart API. Do NOT switch to `yahoo-finance2` - its `historical` module was removed in recent versions.

---

## Signa API Signal Sources

The Signa API `/api/v1/signal` response contains **three distinct signal sources**. Always use them for the correct purpose:

| Field | Pipeline | Use for |
| --- | --- | --- |
| `engine` | Nightly 30+ model consensus | **Primary direction** - matches Signa Canvas Action Card |
| `signa` | Proprietary synthesis | Grade, conviction, action, risk rating, proprietary triggers |
| `data` | Live single-pass technical | Price levels (entry, stop, target), RSI, EMAs, patterns, stage |

`engine.direction` values: `BULLISH` / `BEARISH` / `NEUTRAL`
`data.direction` values: `LONG` / `SHORT` / `WAIT`

**Never use `data.direction` as the primary direction** - it is a live single-pass result that does not match what Signa Canvas shows. The API documentation explicitly states: "Use `engine` to match the in-app Action Card."

`getStockDecision()` in `stockScoring.ts` accepts both vocabularies: `BULLISH`/`BEARISH` (engine) and `LONG`/`SHORT` (data).

### Signa API endpoints used

| Endpoint | Function | Cache |
| --- | --- | --- |
| `/api/v1/signal?sym={sym}&tf=1day` | `getSignaSignal()` | 15 min |
| `/api/v1/signal?sym={sym}&tf=1W` | `getSignaWeeklySignal()` | 15 min |
| `/api/v1/analysis?sym={sym}` | `getSignaAnalysis()` | 15 min |
| `/api/v1/news?sym={sym}` | `getSignaNews()` | 30 min |
| `/api/v1/fundamentals?sym={sym}` | `getFundamentals()` | 60 min |

Signa's REST `/options`, `/darkpool` and `/gamma` paths return 404 (checked 2026-10-26; not in Signa's API reference). Flow, dark pool and GEX come from MCP tools (`get_options_flow`, `get_dark_pool`, `get_gex`) instead.

---

## Updating the FOMC Calendar

Edit `backend/src/lib/fomc.ts` - update `FOMC_DATES` array annually when the Fed publishes its schedule. Also update `getFedStance()` to reflect current monetary policy direction.
