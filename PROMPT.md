# Reconstruction Prompt

This file contains the complete specification to recreate the **Signal Dashboard** repository from scratch. Hand this to any capable AI coding assistant along with the design tokens file.

---

## Project Brief

Build a full-stack web application called **"Signal Dashboard"** — a Stripe-inspired live market dashboard for swing traders with light and dark mode support. The app fetches real-time US market data, computes a weighted Market Quality Score (0–100), and outputs a composite score with clear trading signals: **BULLISH / BEARISH / CAUTION / AVOID**.

---

## Architecture

```
User → Cloudflare (WAF + CDN) → Cloudflare Pages (React SPA)
                                        ↓ /api/*
                               Railway (Node.js/Express backend)
                                        ↓
                               Yahoo Finance v8 Chart API (free, no key)
                               Google Gemini 1.5 Flash (optional, template fallback)

Supabase (optional):
  - Google OAuth for sign-in
  - Postgres `watchlists` table for cross-device watchlist sync
  - Row-level security — users can only read/write their own rows
  - When not configured, watchlist falls back to localStorage (no auth UI shown)
```

- **Frontend:** React 18 + Vite 5 + Tailwind CSS v4, hosted on Cloudflare Pages
- **Backend:** Node.js + Express + TypeScript, run via `tsx` (no compile step), hosted on Railway
- **Database:** Supabase Postgres (optional) — only needed for cross-device watchlist sync
- **Authentication:** Supabase Google OAuth (optional) — app is fully usable without it

---

## Repository Structure

```
signal-dashboard/
├── frontend/
├── backend/
├── package.json            ← root scripts using concurrently
├── .gitignore
├── README.md
├── CHANGELOG.md
├── PROMPT.md
└── DESIGN.md               ← provided externally (design token reference)
```

Root `package.json`:
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "cd backend && npm run dev",
    "install:all": "npm install && cd frontend && npm install && cd ../backend && npm install"
  },
  "devDependencies": { "concurrently": "^8.2.2" }
}
```

---

## Backend Specification

### Stack

- `express` ^4.19.2
- `cors` ^2.8.5
- `dotenv` ^16.4.5
- `node-cache` ^5.1.2
- `tsx` ^4.16.2 (runtime + dev server)
- `@google/generative-ai` ^0.21.0
- TypeScript 5, `"type": "module"`, `"moduleResolution": "Bundler"`, `noEmit: true`

### File: `backend/src/lib/yahooClient.ts`

Write a direct HTTP client against Yahoo Finance's **v8 Chart API** (no library, plain `fetch`). Do NOT use the `yahoo-finance2` npm package for historical data — it only exposes `quote` and `autoc` in recent versions.

Key design:
- Base URL: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={range}&includePrePost=false`
- Fallback base: `https://query2.finance.yahoo.com` if query1 fails
- User-Agent header to avoid bot blocks
- Export:
  - `getHistory(symbol, range)` → `number[]` of closing prices
  - `getHistoryAndQuote(symbol, range)` → `{ symbol, price, change1d, closes, history }`
- For `change1d`: use `regularMarketPrice` (real-time) minus `history[last]` (yesterday's EOD close). During market hours this is intraday change. After close / weekends, shows 0% (correct — no change since last close).
- Supported ranges: `'5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y'`

### File: `backend/src/lib/technical.ts`

Pure utility functions — no external dependencies:
- `sma(prices: number[], period: number): number | null`
- `ema(prices: number[], period: number): number | null` — seeds from SMA, then iterates with `k = 2/(period+1)`
- `rsi(closes: number[], period = 14): number | null` — Wilder's smoothed RSI
- `percentileRank(value: number, data: number[]): number` — 0–100
- `linearSlope(values: number[]): number` — OLS slope
- `pctReturn(prices: number[], days: number): number | null`
- `clamp(value: number, min: number, max: number): number`

### File: `backend/src/lib/fomc.ts`

Hardcoded FOMC decision dates for 2025–2027 (second day of each 2-day meeting, announcement ~2pm ET = 19:00 UTC). Export:
- `getUpcomingFOMC()` — returns `{ date, hoursUntil }` if any meeting is within 72 hours, else `null`
- `getFedStance()` — returns `'hawkish' | 'neutral' | 'dovish'` (hardcode as `'neutral'` for 2026 easing cycle; update as conditions change)

### File: `backend/src/lib/cache.ts`

NodeCache wrapper with 30-second default TTL. Export `getFromCache<T>`, `setToCache<T>` (with optional ttl override).

### File: `backend/src/services/marketData.ts`

Orchestrates all data fetching in a single `Promise.all`:
- `^VIX` — 2-year range (for 1-year percentile calculation across ~252 trading days)
- `SPY` — 2-year range (need 200 days for 200-day SMA)
- `QQQ`, `IWM`, `^TNX`, `UUP` — 1-year range
- All 11 sector ETFs: `XLK XLF XLE XLV XLI XLY XLP XLU XLB XLRE XLC` — 1-year range
- All 8 sub-sector ETFs: `SOXX IGV XBI IHI URA XOP KRE ICLN` — 1-year range (appended to same `Promise.all`)

Sub-sector constants exported:
- `SUBSECTORS` — tuple of 8 tickers
- `SUBSECTOR_NAMES` — ticker → display name (e.g., `SOXX → 'Semiconductors'`)
- `SUBSECTOR_PARENT` — ticker → parent sector name (e.g., `SOXX → 'Technology'`, `XBI → 'Health Care'`)

Compute and return:
- VIX: `{ current, slope5d (linearSlope of last 5), percentile1yr (percentileRank in last 252) }`
- SPY: `{ current, ma20, ma50, ma200, rsi14, return1d, return5d, return20d, closes (last 15) }`
- QQQ: `{ current, ma50, return1d }`
- IWM: `{ current, return5d }`
- Macro: `{ tnx, tnxReturn30d, tnxSlope20d, uup, uupSlope20d, fedStance, fomcEvent }`
- Breadth: `{ sectorsAbove50d, pctSectorsAbove50d }`
- Sectors array: each with `{ ticker, name, price, change1d, change5d, change20d, aboveSMA50, aboveSMA200 }`
- Subsectors array: each with `{ ticker, name, parentSector, price, change1d, change5d, change20d, aboveSMA50, aboveSMA200 }`
- Regime: `'uptrend'` (above all 3 MAs + positive 20d return), `'downtrend'` (below 200d + >3% 20d decline), else `'chop'`
- `top3Sectors` and `bottom3Sectors` (names, by 5-day return)

### File: `backend/src/services/scoring.ts`

Five independent scoring functions, each returning `CategoryScore`:
```typescript
interface CategoryScore {
  score: number;       // 0–100
  weight: number;      // percent weight in total
  label: string;
  interpretation: 'healthy' | 'neutral' | 'weakening' | 'risk-off';
  metrics: Array<{ label: string; value: string; direction: 'up'|'down'|'flat'; note: string }>;
}
```

**scoreVolatility (weight: 20)**

- Base score from VIX level: ≤12→95, ≤15→83, ≤18→70, ≤22→52, ≤28→34, ≤35→18, >35→8
- Trend adjustment: slope5d < -0.5 → +10, < -0.1 → +5, > 0.5 → -15, > 0.1 → -7
- Percentile adjustment: <20th → +10, <40th → +5, >80th → -15, >60th → -7
- Clamp 0–100

**scoreTrend (weight: 25)**

- SPY > 200d MA → +28, else −5
- SPY > 50d MA → +22, else −5
- SPY > 20d MA → +16
- QQQ > 50d MA → +12, else −5
- RSI 50–65 → +12; 40–50 or 65–75 → +6; >75 → +2; 30–40 → −5; <30 → −12
- Regime uptrend → +5; downtrend → −15; chop → −5
- Clamp 0–100

**scoreBreadth (weight: 20)**

- % sectors above 50d MA: ≥82% → +55, ≥65% → +42, ≥50% → +28, ≥35% → +14, else 0
- IWM 5d vs SPY 5d spread: >1.5% → +30, >0% → +20, >-1% → +10, >-2.5% → 0, else −10
- Bonus: if pct ≥73% → +15
- Clamp 0–100

**scoreMomentum (weight: 25)**

- Sectors outperforming SPY 5d: ≥9 → +40, ≥7 → +30, ≥5 → +20, ≥3 → +10
- Top 3 sector tickers — growth leaders (XLK XLY XLF XLI XLC) → +12 each; defensive (XLP XLU XLRE) → −12 each
- Sectors above 50d MA count → +(count/total × 20) rounded
- Clamp 0–100

**scoreMacro (weight: 10)**

- Start at 50 (neutral base)
- TNX level: <3.5% → +10, <4.5% → +5, <5.5% → −5, ≥5.5% → −15
- TNX 30d return: <−20% → +15, <−5% → +8, <5% → 0, <20% → −8, ≥20% → −15
- UUP slope20d: <−0.005 → +8, >0.005 → −8
- Fed dovish → +15; hawkish → −15
- FOMC within 72h → −15
- Clamp 0–100

**scoreExecutionWindow** (not weighted in main score, shown separately)
- Start at 50
- Count up-days in last 5: ≥4 → +25, ≥3 → +15, ≤1 → −20
- SPY 5d return: >2.5% → +20, >0.5% → +10, <−2.5% → −25, <−0.5% → −10
- Distance from 20d MA: 0–2.5% above → +10; 0–2% below → −5
- Clamp 0–100

**computeMarketQualityScore**: `vol×0.20 + trend×0.25 + breadth×0.20 + momentum×0.25 + macro×0.10`, rounded

**getDecision(score, regime)**: score≥80 → `'YES_BUY'` (or `'YES_SELL'` if downtrend); score≥60 → `'CAUTION'`; else `'NO'`

### File: `backend/src/services/stockScoring.ts`

In addition to `computeStockTechnicalScore`, `computeSectorETFScore`, `getStockDecision`, `buildStockAnalysis`:

**`computeFibonacci(history: number[]): FibLevel[] | null`**
- Uses the last 252 days (or full history if shorter); returns `null` if fewer than 20 bars or range < 0.01
- Computes `high = Math.max(...recent)`, `low = Math.min(...recent)`, `range = high - low`
- 9 levels: `price = high - ratio * range` where ratios are −0.618 (161.8% ext), −0.272 (127.2% ext), 0 (high), 0.236, 0.382, 0.5, 0.618, 0.786, 1.0 (low)
- Returns `FibLevel[]`: `{ ratio, label, price, isExtension }`

**`computeMovingAverages(history: number[], signaData?: SignaData | null): MovingAverages`**
- Yahoo Finance computed: `ema5`, `ema21`, `ema55` (from `ema()`), `sma20`, `sma200` (from `sma()`)
- Signa.ai sourced: `signaEma20`, `signaEma50`, `signaEma200` (from `signaData.ema20/50/200 ?? null`)

### File: `backend/src/lib/signaClient.ts`

`SignaData` interface includes `ema20: number | null`, `ema50: number | null`, `ema200: number | null` mapped from `raw.data.ema20/50/200`.

`formatSignaMarketAnalysis(signal, marketQualityScore, vix, regime, topSectors, bottomSectors): string` — formats SPY Signa data as Bloomberg-style terminal text including direction/grade/confidence, 30+ model consensus reasons (`engine.reasons[]`), active signals (triggers + signaTriggers), and risk factors.

### File: `backend/src/services/ai.ts`

Priority chain for terminal analysis:
1. **Signa.ai** — calls `getSignaSignal('SPY')`; if available, returns `formatSignaMarketAnalysis()` rich text
2. **Gemini 1.5 Flash** — if `GEMINI_API_KEY` set and `AI_PROVIDER !== 'none'`
3. **Template** — deterministic fallback always available

Fallback `templateAnalysis(data)` for when no API keys:
- YES BUY: strong conditions, leaders, full size
- YES SELL: deteriorating, reduce longs, defensive
- CAUTION: mixed, A+ only, half size, quick profits
- NO: poor conditions, preserve capital, wait

Always return a string; never throw.

### File: `backend/src/routes/market.ts`

`GET /api/market-data`:
1. Return from cache if available (`fromCache: true`)
2. `fetchMarketData()` → compute all 5 scores → `computeMarketQualityScore` → `scoreExecutionWindow` → `getDecision`
3. `generateAnalysis(...)` for terminal text
4. Build ticker array (SPY, QQQ, IWM, VIX, TNX, then all 11 sectors)
5. Build alerts array (FOMC event + VIX > 30 spike)
6. Set cache and return result with `fromCache: false`

`POST /api/refresh`: invalidate cache (set TTL to 0)

### File: `backend/src/index.ts`

Standard Express setup: `dotenv/config`, cors with `FRONTEND_URL` env var, JSON parser, mount router at `/api`, health endpoint at `/health`.

### Backend `.env.example`

```
PORT=3001
FRONTEND_URL=http://localhost:5173
GEMINI_API_KEY=
AI_PROVIDER=gemini
SIGNA_API_KEY=
```

### Frontend `.env.example`

```
# Optional — enables Google sign-in and cross-device watchlist sync.
# Get both from: Supabase Dashboard → your project → Settings → API
# Leave blank to run in localStorage-only mode (no auth required).
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Frontend Specification

### Stack

- React 18 + Vite 5
- Tailwind CSS v4 via `@tailwindcss/vite` plugin (no separate config file)
- TypeScript 5 strict mode
- `lucide-react` for icons (imported but optional in v0.1)
- JetBrains Mono + Inter from Google Fonts (loaded in `index.html`)
- No UI component library

### `index.html`

Standard Vite HTML. Load Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
```

### `src/index.css`

Use Tailwind v4 `@theme` directive to define the DESIGN.md color tokens as CSS variables:
- All `--color-*` tokens map to Tailwind utility classes (`bg-canvas`, `text-ink`, etc.)
- Define `--font-mono` (JetBrains Mono) and `--font-ui` (Inter)
- Set `body { font-family: JetBrains Mono, monospace; background: #000; color: #fcfdff; }`
- CSS keyframe animations: `ticker-scroll` (horizontal marquee), `pulse-dot` (LIVE indicator), `shimmer` (skeleton loading), `bar-fill` (score bars on mount)
- Utility classes: `.skeleton`, `.card`, `.hairline`, `.glow-green`, `.glow-yellow`, `.glow-red`

### `src/types/market.ts`

Define all TypeScript interfaces matching the backend response:
- `Decision`, `Interpretation`, `Direction`, `Regime`, `TradingMode` string unions
- `Metric`, `CategoryScore`, `SectorData`, `TickerItem`, `Alert`, `MarketResponse`

### `src/lib/api.ts`

Two functions:
- `fetchMarketData()` — `GET /api/market-data`, throws on non-OK
- `triggerRefresh()` — `POST /api/refresh`
- Base URL from `import.meta.env.VITE_API_URL ?? ''`

### `src/hooks/useMarketData.ts`

`useMarketData()` hook:
- State: `data`, `loading`, `error`, `lastUpdated`, `secondsAgo`
- Polls every 45 seconds via `setInterval`
- Separate 1-second tick to increment `secondsAgo` from `lastUpdated`
- `refresh(forceRefresh = true)` calls `triggerRefresh()` then `fetchMarketData()`
- Clean up intervals on unmount

### Components

**`TickerBar`** (`items, loading, secondsAgo, onRefresh, isRefreshing`)
- Sticky `top: 0`, `z-index: 50`, `height: 40px`, background `#06060a`, 1px hairline bottom border
- Left: pulsing green/yellow dot + "LIVE"/"UPDATING" label
- Center: `overflow: hidden` container with `ticker-track` CSS animation class; duplicated item array for seamless loop; hover pauses animation
- Right: "Xs ago" timestamp + "↻ Refresh" button
- Each ticker item: symbol (muted), price (tabular-nums), direction arrow + change % (green/red)
- Show skeleton block while loading and no data yet

**`HeroPanel`** (`decision, marketQualityScore, executionWindowScore, regime, mode`)
- Two-column grid: left = decision, right = score rings
- Background atmospheric radial glow keyed to decision color
- Decision badge: inline-block with color background tint, colored border, box-shadow glow, large font
- Decision config map for all 4 states: `{ label, color, glow, bg, desc }`:
  - `YES_BUY` → `#11ff99` green
  - `YES_SELL` → `#ff2047` red
  - `CAUTION` → `#ffc53d` yellow
  - `NO` → `#ff2047` red (dimmer glow)
- Regime pill + mode pill (ghost pill style)
- `ScoreRing` sub-component: SVG circle with animated `stroke-dashoffset` from 0 to (score/100×circumference); score number + "/ 100" label centered; ring color: ≥80→green, ≥60→yellow, else red; `filter: drop-shadow` glow on the arc
- Two rings: 168px (Market Quality, label "MARKET QUALITY") + 120px (Execution Window, label "EXEC. WINDOW")

**`MetricPanel`** (`category: CategoryScore`)
- Card layout: label (muted, spaced caps), score number (large, color-coded), interpretation badge (pill with color tint border), weight display
- Score bar: 3px track with animated fill on mount
- Metrics list: 3–4 items each with label + note (two lines) | direction arrow (colored) | value (right-aligned tabular-nums)
- Score/bar color: ≥70→green, ≥50→yellow, ≥30→orange, else red
- Interpretation colors: healthy→green, neutral→yellow, weakening→orange, risk-off→red

**`SectorHeatmap`** (`sectors: SectorData[], timeframe: '1d'|'5d'|'20d'`)
- Sort sectors by selected timeframe descending
- Each row: ticker (bold) | name (muted) | heat bar | % change (colored) | 50d MA flag (▲50d green / ▼50d red) | star for top 3 / arrow for bottom 3
- Heat bar: `<div>` fill proportional to `|value| / max`; direction (left or right fill based on positive/negative)
- Row background tint: positive → green tint, negative → red tint; subtle leader/lagger border
- Bar colors: ≥3% → `#11ff99`, ≥1.5% → green 80%, ≥0.5% → yellow, ≥−0.5% → muted, ≥−1.5% → orange, ≥−3% → red 80%, else → `#ff2047`
- Legend row at bottom

**`ScoringBreakdown`** (`categories, totalScore`)
- One row per category (ORDER: volatility, trend, breadth, momentum, macro)
- Row: category label + weight badge | score/100 (muted) | contribution (weight×score/100 in color) | animated bar
- Divider and total score (large, colored)
- 3-column reference card: 80–100 green / 60–79 yellow / <60 red with guidance text

**`AlertBanner`** (`alerts: Alert[]`)
- Hidden when `alerts.length === 0`
- Each alert: icon + type label (colored) + message text
- Severity styles: `info`→blue, `warning`→yellow, `danger`→red

**`TerminalAnalysis`** (`analysis, timestamp`)
- Code window chrome: `#0a0a0c` header bar with traffic-light dots (red/yellow/green 10px circles) + "terminal — market analysis" title + time
- Content area: `$` prompt + `signal-dashboard --analysis` command line, then the analysis paragraph in Inter font at 14px, then blinking cursor `$`

**`ModeToggle`** (`mode, onChange`)
- Pill group: "↻ SWING" and "⚡ DAY" buttons
- Active: `background: #fcfdff; color: #000` (white pill, black text — primary button style from DESIGN.md)
- Inactive: transparent + muted text

**`Skeleton`**
- `Block` primitive: `className="skeleton"` div with configurable width/height/borderRadius
- Compose into `HeroPanelSkeleton`, `MetricPanelSkeleton`, `SectorSkeleton` matching the real component layouts

### `src/App.tsx`

Layout (no library, pure inline styles):
1. `<TickerBar>` — sticky
2. `<main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 48px' }}>`
3. Title row + `<ModeToggle>` (flex justify-between)
4. Error card (when `error && !data`) with retry button
5. `<AlertBanner>` (conditional)
6. `<HeroPanel>` or `<HeroPanelSkeleton>`
7. Metric grid: `display: grid; gridTemplateColumns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px` — 5 `<MetricPanel>` or skeletons
8. Sector timeframe toggle buttons + `<SectorHeatmap>` or skeleton
9. Bottom row: `display: grid; gridTemplateColumns: 380px 1fr; gap: 16px` — `<ScoringBreakdown>` + `<TerminalAnalysis>`
10. Footer: "Data via Yahoo Finance · Not financial advice" + cache/timestamp status

State: `mode` (swing/day), `sectorTimeframe` (1d/5d/20d)

---

## Design Principles

Follow DESIGN.md throughout:

1. **Canvas is always `#000000`** — true black, never `#0a0a0a` or near-black
2. **No drop shadows** — depth via surface luminance steps and `rgba(255,255,255,0.14)` hairline borders
3. **Accent colors as atmospheric glows only** — never solid fills for backgrounds; use `color + 10–18% opacity` for tints
4. **One bright surface rule** — the primary CTA / active element is the only solid bright pixel; everything else is dark
5. **Monospace for data** — all numeric values, ticker symbols, and terminal text in JetBrains Mono; Inter only for prose labels and analysis text
6. **Score colors**: green `#11ff99` ≥70 (healthy), yellow `#ffc53d` ≥50 (neutral), orange `#ff801f` ≥30 (weakening), red `#ff2047` <30 (risk-off)
7. **Dense, high-signal layout** — Bloomberg Terminal aesthetic; no empty whitespace, no decorative chrome

---

## Key Implementation Notes

### Why direct Yahoo Finance API instead of yahoo-finance2

`yahoo-finance2` v2.14.0 only exposes `quote` and `autoc` modules — `historical` was removed. Use direct `fetch` to `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2y` instead.

### change1d computation

`regularMarketPrice` (real-time) vs `history[last]` (last historical EOD close):
- **During market hours:** gives today's intraday change ✓
- **After close / weekends:** gives ~0% (price hasn't changed since last close) — correct

Do NOT use `chartPreviousClose` from the meta object — it refers to the close at the start of the chart range (e.g., 1 year ago), producing ~40% spurious daily changes.

### VIX percentile

Fetch 2-year VIX history. Use `percentileRank(currentVix, vixHistory.slice(-252))` for the 1-year percentile. A VIX at its 80th percentile over the past year is historically stressed, even if the absolute level is moderate.

### Breadth approximation

True breadth (% of all NYSE stocks above MAs) requires a paid data feed. This dashboard approximates it using sector ETF participation (11/11 sectors above their 50d MA = 100% breadth). This is directionally accurate but represents large-cap universe only.

### Ticker-scroll infinite loop

Duplicate the ticker items array `[...items, ...items]`. Apply `animation: ticker-scroll Xs linear infinite` to the inner container. CSS pauses on hover (`animation-play-state: paused`). Width set to `max-content`.

### Tailwind v4 custom colors

In `@theme { }`:
```css
--color-canvas: #000000;
--color-accent-green: #11ff99;
/* etc */
```
These become `bg-canvas`, `text-accent-green` etc. For rgba values, Tailwind v4 generates the utilities correctly. No separate config file.

---

## Environment & Deployment

### Local development

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # optional — only needed for Supabase auth
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

### Cloudflare Pages (frontend)

- Root: `frontend/`
- Build command: `npm run build`
- Output: `dist`
- Node version: 20
- Env: `VITE_API_URL=https://your-backend.up.railway.app`
- Env (optional): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — enables Google sign-in and cross-device watchlist sync

### Railway (backend)

- Root: `backend/`
- Start: `npm start` → `tsx src/index.ts`
- Env: `FRONTEND_URL`, `SIGNA_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`

### Supabase (optional)

Only needed for cross-device watchlist sync and Google sign-in. Create a project at supabase.com, run the `watchlists` table DDL (see CLAUDE.md → Auth & Watchlist), enable Google OAuth provider, and add the redirect URL for your Cloudflare Pages domain.

---

## Success Criteria

- [ ] Dashboard loads and shows real-time data within 10 seconds
- [ ] Market Quality Score updates every 45 seconds automatically
- [ ] All 5 category panels show current values with direction indicators
- [ ] Sector heatmap sorts correctly across all 3 timeframes; sub-sectors expand via ▸ toggle
- [ ] Composite score ring shows numeric score; decision badge below shows BULLISH/BEARISH/CAUTION/AVOID
- [ ] Terminal analysis renders structured sections (consensus, signals, warnings, environment) for Signa output
- [ ] Moving average heat bars extend green right / red left from center based on price vs MA
- [ ] FOMC alert appears when within 72 hours of a meeting date
- [ ] Error state shows retry button when backend is unreachable
- [ ] Watchlist persists across page reloads via localStorage; "Save to Watchlist" button is prominent
- [ ] No API keys required to run (all scoring works; AI uses template fallback)
- [ ] TypeScript compiles with no errors in both `frontend/` and `backend/`

---

## v0.4.0 Design Changes

The following design changes were applied on top of the v0.3.0 specification:

### Design System

Replace all dark-mode colors with Stripe light-mode tokens from `frontend/src/lib/colors.ts`:

- Canvas: `#ffffff`, card background: `#f6f9fc`, border: `#e3e8ee`
- Primary/accent: `#533afd` (indigo), ink: `#0d253d`, muted: `#64748d`
- Bull: `#059669`, Bear: `#ea2261`, Warn: `#d97706`
- Font: Inter only (300/400/500); `font-feature-settings: "ss01"` globally

Apply `mesh-bg` CSS class to the page header band — radial gradient approximation of Stripe's atmospheric mesh.

### Component Changes (v0.4.0)

**`StockPanel`** — Key changes:

- `SignaCard` renders FIRST, before composite score
- `CompositeRing` — 110px SVG ring; score number only; colored by `scoreColor()`; no "YES/NO" text
- Decision badge below ring: BULLISH / BEARISH / CAUTION / AVOID
- `MABar` — centered heat bar: `price > ma` → green extends right; `price < ma` → red extends left; only EMA5/EMA21/EMA55/SMA200
- "☆ Save to Watchlist" / "★ Saved" prominent pill button in stock panel header

**`SectorHeatmap`** — Accordion pattern:

- `expanded: Set<string>` state; `toggle(ticker)` function
- If sector has sub-sectors: render `▸`/`▾` button; expanded → sub-sectors indented with `└` indicator
- `subByParent: Record<string, SectorData[]>` built from `subsectors` prop grouped by `parentSector`

**`TerminalAnalysis`** — Structured rendering:

- `parseAnalysis(text): ParsedSection[]` — classifies each line by type
- `isSignaFormat(text)` — detects Signa vs plain text
- `StructuredAnalysis` — renders typed sections as HTML; `PlainAnalysis` for plain text
- Header shows "SIGNA.AI" or "AI ANALYSIS" pill badge

**`SignaCard`** — Pill-first layout:

- Direction pill (`● LONG`/`● SHORT`) is primary indicator
- Grade, Stage, Confidence, Risk all in same flex wrap row as pill badges
- No dark backgrounds
