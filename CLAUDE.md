# CLAUDE.md — Signal Dashboard

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
| AI analysis | Signa.ai → Gemini 1.5 Flash → template fallback |
| Auth + access control | Supabase **coredb** (optional — Google OAuth + Postgres; invite-only when configured) |
| Watchlist fallback | `localStorage` when Supabase is unconfigured |
| Frontend hosting | Cloudflare Pages |
| Backend hosting | Railway |

---

## Repository Structure

```text
signal-dashboard/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Main layout, polling, theme, auth
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx         # Admin: pending access requests + approve button
│   │   │   ├── AlertBanner.tsx        # FOMC / VIX spike alerts
│   │   │   ├── AuthButton.tsx         # Google sign-in / sign-out pill + pending badge
│   │   │   ├── FundamentalsPanel.tsx  # Fundamentals section (valuation/growth/margins)
│   │   │   ├── OptionsPanel.tsx       # Options flow + dark pool + gamma exposure
│   │   │   ├── ScoringBreakdown.tsx   # (legacy — not used in layout, kept for reference)
│   │   │   ├── SectorHeatmap.tsx      # Sectors + accordion sub-sectors (incl. TAN, FCG)
│   │   │   ├── SignaCard.tsx          # Signa.ai signal: entry/stop/target/triggers
│   │   │   ├── Skeleton.tsx           # Loading shimmer skeletons
│   │   │   ├── StockPanel.tsx         # Full stock analysis panel (no composite ring)
│   │   │   ├── StockSearch.tsx        # Search bar + named watchlist groups
│   │   │   ├── TerminalAnalysis.tsx   # Structured AI market analysis
│   │   │   └── TickerBar.tsx          # Scrolling live ticker
│   │   ├── hooks/
│   │   │   ├── useAuth.ts             # Supabase session state + Google OAuth
│   │   │   ├── useMarketData.ts       # 45s polling + secondsAgo counter
│   │   │   ├── useStockData.ts        # Stock/Signa data fetch on ticker change
│   │   │   ├── useTheme.ts            # Light/dark mode toggle (localStorage)
│   │   │   └── useWatchlist.ts        # Named watchlist groups (Supabase or localStorage)
│   │   ├── lib/
│   │   │   ├── api.ts                 # fetch wrappers for backend routes
│   │   │   ├── colors.ts              # CSS custom property design tokens
│   │   │   ├── priceLevels.ts         # validatePriceLevels() — stop/target directional validation
│   │   │   ├── stockApi.ts            # Stock-specific API client
│   │   │   └── supabase.ts            # Typed Supabase client (null when unconfigured)
│   │   └── types/
│   │       ├── market.ts              # MarketResponse, SectorData, etc.
│   │       └── stock.ts               # StockResponse, SignaData, FibLevel, OptionsInsight, FundamentalsData, etc.
│   ├── index.html
│   ├── vite.config.ts                 # /api proxy to :3001
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── index.ts                   # Express entry point
│   │   ├── routes/
│   │   │   ├── market.ts              # GET /api/market-data, POST /api/refresh
│   │   │   └── stock.ts               # GET /api/stock/:symbol
│   │   ├── services/
│   │   │   ├── ai.ts                  # Signa → Gemini → template priority chain
│   │   │   ├── marketData.ts          # Parallel data fetch orchestration
│   │   │   ├── scoring.ts             # 5 market scoring functions
│   │   │   └── stockScoring.ts        # Stock score + Fibonacci + Moving Averages
│   │   └── lib/
│   │       ├── cache.ts               # NodeCache wrapper (30s TTL)
│   │       ├── fomc.ts                # FOMC calendar + Fed stance (update annually)
│   │       ├── signaClient.ts         # Signa.ai API client
│   │       ├── technical.ts           # sma, ema, rsi, slope, percentileRank
│   │       └── yahooClient.ts         # Yahoo Finance v8 Chart API client
│   ├── .env.example
│   └── package.json
│
├── package.json     # Root: concurrently dev, install:all
├── DESIGN.md        # Stripe-inspired light design tokens (source of truth)
├── CLAUDE.md        # This file
├── CHANGELOG.md     # Version history
├── PROMPT.md        # Full reconstruction specification
└── README.md        # User-facing documentation
```

---

## Local Development

```bash
# Install all dependencies (root + frontend + backend)
npm run install:all

# Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env — only API keys are optional

# Start both servers
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

The frontend Vite dev proxy routes `/api/*` → `http://localhost:3001`, so no CORS issues locally.

---

## Environment Variables

**`backend/.env`**

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | Backend HTTP port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `SIGNA_API_KEY` | No | — | Signa.ai API key (stock signals + terminal analysis) |
| `GEMINI_API_KEY` | No | — | Google AI Studio key (terminal analysis fallback) |
| `AI_PROVIDER` | No | `gemini` | `gemini` \| `none` |

**`frontend/.env`** (optional — enables Google sign-in and cross-device watchlist sync)

This project uses the shared **coredb** Supabase project (`lcqsatefkutiakhgexue`) — the same Supabase instance used by moat-finder and folio-app. All three apps share auth (one Google sign-in works across all) and have their own tables in the same project.

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | No | `https://lcqsatefkutiakhgexue.supabase.co` (coredb) |
| `VITE_SUPABASE_ANON_KEY` | No | coredb anon/public key — Dashboard → Settings → API |
| `VITE_SUPABASE_REDIRECT_URL` | **Production only** | `https://signal.ailab.build`. Must match a Supabase → Authentication → URL Configuration → Redirect URL entry. Leave blank locally — falls back to `window.location.origin`. |

When both Supabase vars are absent, `supabase` client is `null` and the app runs in localStorage-only mode with no auth UI shown.

All scoring, market data, Fibonacci, and moving averages work without any API keys.

---

## Design System

**Do not use ad-hoc color values.** All colors come from `frontend/src/lib/colors.ts`:

```typescript
import { C, scoreColor, changeColor } from '../lib/colors';
```

All `C.*` values are CSS custom property references (`var(--c-*)`). The actual color values are defined in `frontend/src/index.css` under `:root` (light mode) and `[data-theme="dark"]` (dark mode). This means every component inherits both themes automatically — no per-component dark mode code needed.

Key tokens:

- `C.ink` — primary text
- `C.inkSec` — secondary text
- `C.inkMute` — muted/label text
- `C.canvas` — white/dark background
- `C.canvasSoft` — panel/card background
- `C.border` — hairline borders
- `C.primary` — indigo accent
- `C.bull` — green (bullish)
- `C.bear` — red (bearish)
- `C.warn` — amber (caution)
- `C.s1` — card shadow

Helper functions:

- `scoreColor(score: number)` — returns green/amber/red based on 0–100 score
- `changeColor(pct: number)` — returns bull/warn/bear color based on % change

### Theme Toggle

- `useTheme()` hook (`frontend/src/hooks/useTheme.ts`) — returns `{ dark: boolean, toggle: () => void }`
- Theme is set via `data-theme="dark"` on `<html>`; preference persists in `localStorage` key `signal-theme`
- An inline `<script>` in `index.html` applies the saved theme before first paint (no flicker)
- The mesh backdrop is a CSS class `mesh-bg` defined in `frontend/src/index.css`; the dark mode override is `[data-theme="dark"] .mesh-bg`

---

## Key Conventions

### Typography

- Labels/headers: `fontSize: '11px', letterSpacing: '0.10em', fontWeight: 400` (uppercase label style)
- Body: `fontSize: '13px', color: C.inkSec, lineHeight: 1.5`
- Data values: `fontFeatureSettings: '"tnum"'` for tabular numbers
- Pill badges: `borderRadius: 9999, padding: '4px 12px'`

### Components

- All inline styles (no Tailwind in components — Tailwind is used only in `index.css` for global reset/utilities)
- No external UI component libraries
- No comments unless the WHY is non-obvious
- **Mobile responsiveness:** fixed-width grids that overflow on small screens use `overflowX: 'auto'` scroll containers + `minWidth` on inner content. Layouts that should *reflow* (e.g. multi-column → single-column) use CSS classes in `index.css` with `@media (max-width: 640px)` breakpoints (e.g. `.fib-grid`, `.header-band`, `.main-content`). Never add per-component dark-mode or responsive code — use CSS classes instead.

### API Routes

- `GET /api/market-data` — full market payload (cached 30s)
- `POST /api/refresh` — invalidate cache
- `GET /api/stock/:symbol` — individual stock signal (Signa.ai + Yahoo Finance)
- `GET /health` — health check

### Auth, Access Control & Watchlist

**Access model:** When `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, the app is **invite-only**. Unauthenticated users see an auth gate. Authenticated users with `status='pending'` see an "Access Pending" screen. Only `status='approved'` users reach the full dashboard. When Supabase is not configured (`supabase === null`), the app is fully open (local dev mode).

**`useAuth`** (`hooks/useAuth.ts`) — wraps Supabase session and `user_profiles` table. Exports:

- `user: User | null` — raw Supabase auth user
- `authLoading: boolean` — true while session + profile are loading
- `profile: UserProfile | null` — `{ id, email, display_name, status, is_admin, requested_at, approved_at }`
- `userStatus: 'pending' | 'approved' | null` — null when Supabase is unconfigured
- `isAdmin: boolean` — true when `profile.is_admin`
- `pendingUsers: UserProfile[]` — populated for admins; all users awaiting approval
- `signInWithGoogle()` — triggers Supabase Google OAuth popup
- `signOut()` — clears session and profile state
- `approveUser(userId)` — admin only; sets status='approved' and approved_at in Supabase

**`AdminPanel`** (`components/AdminPanel.tsx`) — rendered in `App.tsx` only when `isAdmin && pendingUsers.length > 0`. Lists pending users with name, email, request date, and an Approve button. Optimistically removes approved users from the list.

**`AuthButton`** (`components/AuthButton.tsx`) — accepts `userStatus` prop. Renders nothing when Supabase is unconfigured or loading. Shows "Sign in" button → full user row (avatar, name, "Pending" amber badge when status=pending, "Sign out") when logged in.

**Auth gate in `App.tsx`:** `const isApproved = !supabaseEnabled || userStatus === 'approved' || isAdmin`. When `supabaseEnabled && !authLoading && !isApproved`, renders a centered card with sign-in CTA (unauthenticated) or pending-approval message (authenticated but pending). All stock search and market data is inside the `isApproved` branch.

**`useWatchlist(user)`** (`hooks/useWatchlist.ts`): Accepts `user: User | null`. When non-null and Supabase is configured, reads/writes go to the `watchlists` Postgres table (watchlists are always tied to the authenticated user). When `user` is null, falls back to `localStorage` (key: `signal-dashboard-watchlists-v2`). First login automatically migrates existing localStorage groups into Supabase. Uses `useRef`-based `userRef` / `stateRef` pattern to eliminate stale closures. **Dual persistence:** `persistLocal()` is called unconditionally on every mutation (Supabase and localStorage modes alike) — localStorage is always an up-to-date write-through backup. **Cross-device sync:** On sign-in the effect immediately merges Supabase groups with any locally-only groups (optimistic state) before firing recovery INSERTs. This ensures all groups from any device are visible immediately without waiting for network writes. `activeGroup` is validated after each Supabase load (falls back to first group if current group no longer exists). SELECT and INSERT errors are logged via `console.warn`. Exports: `groups`, `activeGroup`, `activeTickers`, `setActiveGroup`, `createGroup`, `renameGroup`, `deleteGroup`, `add`, `remove`, `isInWatchlist`, `getGroupsForTicker`.

**Supabase schema (full DDL in README):** signal-dashboard uses the **`signal`** PostgreSQL schema within the shared coredb Supabase project (moat-finder uses `moat`, folio-app uses `folio`). Two tables — `signal.watchlists` (RLS: user owns their rows) and `signal.user_profiles` (status, is_admin; RLS via `signal.is_admin()` security-definer function). A trigger `on_auth_user_created` on `auth.users` auto-inserts a `pending` profile on first sign-in. Admin grants themselves `is_admin=true` via SQL; all subsequent approvals happen in the app UI. The `signal` schema must be added to **Supabase Dashboard → Settings → API → Exposed schemas** before the JS client can query it.

**CRITICAL — `signal.is_admin()` must NOT query `signal.user_profiles`**: doing so causes PostgreSQL error `42P17 infinite recursion detected in policy` because the RLS policy on `user_profiles` calls `is_admin()` which re-triggers the same policy. The function reads from the JWT `app_metadata` claim instead: `coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)`. This requires the admin user's `auth.users.raw_app_meta_data` to include `{"is_admin": true}` (set via SQL) AND a fresh sign-in to get a JWT with the updated claim.

**`supabase.ts`** — exports `supabase: SupabaseClient<Database, 'signal'> | null`. `Database` type uses `signal` as the top-level key (not `public`). Client is created with `{ db: { schema: 'signal' } }`. The type must include `Relationships`, `Views`, `Functions`, `Enums`, `CompositeTypes` (required by `SupabaseClient<T>` generics).

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
cd backend && npm test          # 134 tests — one-shot
cd frontend && npm test         # 64 tests  — one-shot

cd backend && npm run test:watch   # watch mode
cd frontend && npm run test:watch  # watch mode
```

**Framework:** Vitest (ESM-native, TypeScript-native, no transpile step needed).

**Backend config:** `backend/vitest.config.ts` — node environment.
**Frontend config:** `vite.config.ts` `test` block — jsdom, `globals: true`, setup in `src/__tests__/setup.ts`.

### Test file map

| File | Covers |
| --- | --- |
| `backend/src/__tests__/lib/technical.test.ts` | All 7 functions in `technical.ts` — edge cases, boundary values, known arithmetic |
| `backend/src/__tests__/services/stockScoring.test.ts` | `getStockDecision` (both BULLISH/BEARISH + LONG/SHORT vocabularies), `computeStockTechnicalScore`, `computeSectorETFScore`, `computeFibonacci`, `computeMovingAverages`, `SECTOR_TO_ETF` |
| `backend/src/__tests__/lib/signaInsight.test.ts` | `synthesizeOptionsInsight` — null data, single source, agreement, mixed signals, key points, summary |
| `backend/src/__tests__/services/scoring.test.ts` | `scoreVolatility`, `scoreTrend`, `computeMarketQualityScore`, `getDecision` — each weight verified |
| `frontend/src/__tests__/lib/priceLevels.test.ts` | `validatePriceLevels` — direction detection, entryRef fallback, LONG/SHORT level validation, **ASTS regression** |
| `frontend/src/__tests__/hooks/useWatchlist.test.ts` | `useWatchlist` localStorage path — add/remove, groups CRUD, persistence, legacy migration, **page-refresh regression** |
| `frontend/src/__tests__/hooks/useWatchlist.supabase.test.ts` | `useWatchlist` Supabase-mode path — all mutations write to localStorage (dual persistence), in-memory state correct immediately |

### Price level validation utility

`frontend/src/lib/priceLevels.ts` exports `validatePriceLevels()` — the stop/target directional validation logic extracted from `SignaCard.tsx`. `SignaCard` imports it from here. Always use this utility when displaying price levels; do not duplicate the logic inline.

```typescript
validatePriceLevels(direction, entry, stop, target, rr, currentPrice)
// → { isLong, entryRef, stopValid, targetValid, rrValid }
```

For LONG: stop must be below entryRef, target above. For SHORT: reversed. Valid levels get directional colour (`C.bear` for stop, `C.bull` for target); invalid-but-present levels show `C.inkSec` (neutral); zero/missing values show `—`. Validation controls **colour only**, not visibility.

---

## Sector / Sub-Sector Tickers (as of v0.5.5)

**Main sectors** (`SECTORS` array in `marketData.ts`):
`QQQ` Nasdaq 100 · `XLF` Financials · `XLE` Energy · `XLV` Health Care · `XLI` Industrials · `XLY` Consumer Disc. · `XLP` Consumer Staples · `XLU` Utilities · `XLB` Materials · `XLRE` Real Estate · `XLC` Comm. Services · `ITA` Aerospace & Defense · `SPY` S&P 500 · `PDBC` Commodities

**Display-only sectors** (in `DISPLAY_ONLY_SECTORS` Set — excluded from breadth scoring and leader/lagger ranking): `SPY`, `PDBC`

**Sub-sectors** (`SUBSECTORS` array, as of v0.6.1):
`SMH` Semiconductors (Nasdaq 100) · `IGV` Software (Nasdaq 100) · `AIPO` AI Power Stocks (Nasdaq 100) · `AIS` AI Supercycle Stocks (Nasdaq 100) · `DRAM` AI Memory (Nasdaq 100) · `EUV` AI Photonics (Nasdaq 100) · `XBI` Biotech (Health Care) · `IHI` Medical Devices (Health Care) · `URA` Uranium (Energy) · `XOP` Oil & Gas E&P (Energy) · `KRE` Regional Banks (Financials) · `ICLN` Clean Energy (Energy) · `TAN` Solar (Energy) · `FCG` Natural Gas (Energy) · `GC=F` Gold (Commodities) · `SI=F` Silver (Commodities) · `COPX` Copper (Commodities) · `CL=F` Crude Oil WTI (Commodities) · `NASA` Space (Aerospace & Defense)

**Stock sector → ETF mapping** (`SECTOR_TO_ETF` in `stockScoring.ts`): Technology → QQQ (was XLK)

**Important:** `GC=F`, `SI=F`, and `CL=F` are COMEX/NYMEX futures symbols on Yahoo Finance. `XAUUSD=X` / `XAGUSD=X` (forex-style) return 404 from the v8 Chart API and must NOT be used. Futures symbols use `encodeURIComponent()` in `yahooClient.ts`, so the `=` and `^` characters are handled automatically.

## Scoring System

```text
Market Quality Score = Volatility×20% + Trend×25% + Breadth×20% + Momentum×25% + Macro×10%
```

| Score | Decision | Guidance |
| --- | --- | --- |
| 80–100 | BULLISH | Full position sizing |
| 60–79 | CAUTION | Half size, A+ setups only |
| < 60 | BEARISH / AVOID | Preserve capital |

The composite score shown in `StockPanel` is computed from: stock technical score (40%) + sector ETF score (30%) + market quality score (30%).

---

## Data Sources

| Metric | Source |
| --- | --- |
| All price history + quotes | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals (entry/stop/target/triggers) | Signa.ai API (`SIGNA_API_KEY`) |
| Terminal analysis | Signa.ai → Gemini 1.5 Flash → built-in template |
| FOMC calendar, Fed stance | Hardcoded in `backend/src/lib/fomc.ts` — update annually |

**Important:** The `yahooClient.ts` uses direct `fetch` to the Yahoo Finance v8 Chart API. Do NOT switch to `yahoo-finance2` — its `historical` module was removed in recent versions.

---

## Signa API Signal Sources

The Signa API `/api/v1/signal` response contains **three distinct signal sources**. Always use them for the correct purpose:

| Field | Pipeline | Use for |
| --- | --- | --- |
| `engine` | Nightly 30+ model consensus | **Primary direction** — matches Signa Canvas Action Card |
| `signa` | Proprietary synthesis | Grade, conviction, action, risk rating, proprietary triggers |
| `data` | Live single-pass technical | Price levels (entry, stop, target), RSI, EMAs, patterns, stage |

`engine.direction` values: `BULLISH` / `BEARISH` / `NEUTRAL`
`data.direction` values: `LONG` / `SHORT` / `WAIT`

**Never use `data.direction` as the primary direction** — it is a live single-pass result that does not match what Signa Canvas shows. The API documentation explicitly states: "Use `engine` to match the in-app Action Card."

`getStockDecision()` in `stockScoring.ts` accepts both vocabularies: `BULLISH`/`BEARISH` (engine) and `LONG`/`SHORT` (data).

### Signa API endpoints used

| Endpoint | Function | Cache |
| --- | --- | --- |
| `/api/v1/signal?sym={sym}&tf=1day` | `getSignaSignal()` | 15 min |
| `/api/v1/signal?sym={sym}&tf=1W` | `getSignaWeeklySignal()` | 15 min |
| `/api/v1/analysis?sym={sym}` | `getSignaAnalysis()` | 15 min |
| `/api/v1/news?sym={sym}` | `getSignaNews()` | 30 min |
| `/api/v1/options?sym={sym}` | `getOptionsFlow()` | 5 min |
| `/api/v1/darkpool?sym={sym}` | `getDarkpool()` | 5 min |
| `/api/v1/gamma?sym={sym}` | `getGammaExposure()` | 15 min |
| `/api/v1/fundamentals?sym={sym}` | `getFundamentals()` | 60 min |

---

## Updating the FOMC Calendar

Edit `backend/src/lib/fomc.ts` — update `FOMC_DATES` array annually when the Fed publishes its schedule. Also update `getFedStance()` to reflect current monetary policy direction.
