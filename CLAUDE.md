# CLAUDE.md — Signal Dashboard

This file is for AI coding assistants. It documents the project architecture, conventions, and key implementation details so you can contribute effectively without reading every file first.

---

## Project Overview

**Signal Dashboard** is a full-stack market environment dashboard for swing traders. It fetches live US market data, computes a weighted composite score, and displays a Stripe-inspired light-mode UI. Auto-refreshes every 45 seconds. No paid data subscriptions required.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS v4 |
| Backend | Node.js 20 + Express 4 + TypeScript 5 (run via `tsx`, no compile step) |
| Market data | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals | Signa.ai API (optional, `SIGNA_API_KEY`) |
| AI analysis | Signa.ai → Gemini 1.5 Flash → template fallback |
| Watchlist | `localStorage` (no database) |
| Frontend hosting | Cloudflare Pages |
| Backend hosting | Railway |

---

## Repository Structure

```
signal-dashboard/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Main layout, polling, section assembly
│   │   ├── components/
│   │   │   ├── AlertBanner.tsx        # FOMC / VIX spike alerts
│   │   │   ├── FundamentalsPanel.tsx  # Fundamentals section (valuation/growth/margins)
│   │   │   ├── ModeToggle.tsx         # Swing / Day mode pill toggle
│   │   │   ├── OptionsPanel.tsx       # Options flow + dark pool + gamma exposure
│   │   │   ├── ScoringBreakdown.tsx   # (legacy — not used in layout, kept for reference)
│   │   │   ├── SectorHeatmap.tsx      # Sectors + accordion sub-sectors (incl. TAN)
│   │   │   ├── SignaCard.tsx          # Signa.ai signal: entry/stop/target/triggers
│   │   │   ├── Skeleton.tsx           # Loading shimmer skeletons
│   │   │   ├── StockPanel.tsx         # Full stock analysis panel (no composite ring)
│   │   │   ├── StockSearch.tsx        # Search bar + named watchlist groups
│   │   │   ├── TerminalAnalysis.tsx   # Structured AI market analysis
│   │   │   └── TickerBar.tsx          # Scrolling live ticker
│   │   ├── hooks/
│   │   │   ├── useMarketData.ts       # 45s polling + secondsAgo counter
│   │   │   ├── useStockData.ts        # Stock/Signa data fetch on ticker change
│   │   │   └── useWatchlist.ts        # Named watchlist groups (localStorage)
│   │   ├── lib/
│   │   │   ├── api.ts                 # fetch wrappers for backend routes
│   │   │   ├── colors.ts              # Shared Stripe light-mode design tokens
│   │   │   └── stockApi.ts            # Stock-specific API client
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
|---|---|---|---|
| `PORT` | No | `3001` | Backend HTTP port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `SIGNA_API_KEY` | No | — | Signa.ai API key (stock signals + terminal analysis) |
| `GEMINI_API_KEY` | No | — | Google AI Studio key (terminal analysis fallback) |
| `AI_PROVIDER` | No | `gemini` | `gemini` \| `none` |

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

### API Routes
- `GET /api/market-data` — full market payload (cached 30s)
- `POST /api/refresh` — invalidate cache
- `GET /api/stock/:symbol` — individual stock signal (Signa.ai + Yahoo Finance)
- `GET /health` — health check

### Watchlist
- Named watchlist groups stored in `localStorage` via `useWatchlist.ts` hook (key: `signal-dashboard-watchlists-v2`)
- Each group has a `name` and `tickers: string[]`; user can create/delete groups and switch between them
- `useWatchlist()` exports: `groups`, `activeGroup`, `activeTickers`, `setActiveGroup`, `createGroup`, `deleteGroup`, `add(ticker, groupName?)`, `remove(ticker, groupName?)`, `isInWatchlist(ticker, groupName?)`, `getGroupsForTicker(ticker)`
- Migrates legacy flat watchlist from old localStorage key automatically
- No database, no Supabase — persists per browser/device

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

## Sector / Sub-Sector Tickers (as of v0.5.1)

**Main sectors** (`SECTORS` array in `marketData.ts`):
`QQQ` Nasdaq 100 · `XLF` Financials · `XLE` Energy · `XLV` Health Care · `XLI` Industrials · `XLY` Consumer Disc. · `XLP` Consumer Staples · `XLU` Utilities · `XLB` Materials · `XLRE` Real Estate · `XLC` Comm. Services · `SPY` S&P 500 · `PDBC` Commodities · `NASA` Space

**Display-only sectors** (in `DISPLAY_ONLY_SECTORS` Set — excluded from breadth scoring and leader/lagger ranking): `SPY`, `PDBC`, `NASA`

**Sub-sectors** (`SUBSECTORS` array):
`SMH` Semiconductors (Nasdaq 100) · `IGV` Software (Nasdaq 100) · `XBI` Biotech (Health Care) · `IHI` Medical Devices (Health Care) · `URA` Uranium (Energy) · `XOP` Oil & Gas E&P (Energy) · `KRE` Regional Banks (Financials) · `ICLN` Clean Energy (Energy) · `TAN` Solar (Energy) · `GC=F` Gold (Commodities) · `SI=F` Silver (Commodities) · `COPX` Copper (Commodities) · `CL=F` Crude Oil WTI (Commodities)

**Stock sector → ETF mapping** (`SECTOR_TO_ETF` in `stockScoring.ts`): Technology → QQQ (was XLK)

**Important:** `GC=F`, `SI=F`, and `CL=F` are COMEX/NYMEX futures symbols on Yahoo Finance. `XAUUSD=X` / `XAGUSD=X` (forex-style) return 404 from the v8 Chart API and must NOT be used. Futures symbols use `encodeURIComponent()` in `yahooClient.ts`, so the `=` and `^` characters are handled automatically.

## Scoring System

```
Market Quality Score = Volatility×20% + Trend×25% + Breadth×20% + Momentum×25% + Macro×10%
```

| Score | Decision | Guidance |
|---|---|---|
| 80–100 | BULLISH | Full position sizing |
| 60–79 | CAUTION | Half size, A+ setups only |
| < 60 | BEARISH / AVOID | Preserve capital |

The composite score shown in `StockPanel` is computed from: stock technical score (40%) + sector ETF score (30%) + market quality score (30%).

---

## Data Sources

| Metric | Source |
|---|---|
| All price history + quotes | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals (entry/stop/target/triggers) | Signa.ai API (`SIGNA_API_KEY`) |
| Terminal analysis | Signa.ai → Gemini 1.5 Flash → built-in template |
| FOMC calendar, Fed stance | Hardcoded in `backend/src/lib/fomc.ts` — update annually |

**Important:** The `yahooClient.ts` uses direct `fetch` to the Yahoo Finance v8 Chart API. Do NOT switch to `yahoo-finance2` — its `historical` module was removed in recent versions.

---

## Updating the FOMC Calendar

Edit `backend/src/lib/fomc.ts` — update `FOMC_DATES` array annually when the Fed publishes its schedule. Also update `getFedStance()` to reflect current monetary policy direction.
