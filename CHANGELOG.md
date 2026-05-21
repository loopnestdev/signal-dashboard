# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.4] — 2026-05-21

### Fixed — Signa Signal Source: engine (nightly) replaces data (live single-pass)

#### Root cause

The Signa API returns three distinct signal sources in a single `/signal` response:

| Field | Pipeline | Matches Canvas? |
| --- | --- | --- |
| `engine` | Nightly 30+ model consensus | **Yes — use this** |
| `signa` | Proprietary synthesis (grade, conviction) | Partial |
| `data` | Live single-pass technical analysis | No |

The previous implementation mapped `data.direction` as the primary direction, which is the live single-pass result. Signa Canvas ("Action Card") uses `engine.direction` from the nightly pipeline. For ASTS, `data` returned `WAIT` while `engine` (and the Canvas) showed `BULLISH` — a complete directional mismatch.

#### Fix

`getSignaSignal()` in `signaClient.ts` now maps `engine.direction` / `engine.confidence` as the primary signal source. The `data` field is still used exclusively for live price levels (entry, stop, target, R:R, RSI, EMAs, stage, patterns). The `signa` field continues to provide grade, conviction, action, risk rating, and proprietary triggers.

`getStockDecision()` in `stockScoring.ts` now accepts `BULLISH` and `BEARISH` (engine vocabulary) alongside the legacy `LONG` / `SHORT` (data vocabulary).

`signaShort` detection in `stock.ts` now includes `BEARISH`.

#### Added — Weekly signal (tf=1W)

`getSignaWeeklySignal(symbol)` calls `/api/v1/signal?sym={sym}&tf=1W` and returns the engine's weekly direction, grade, and confidence. Displayed in `SignaCard` as a "WEEKLY (1W)" alignment row showing whether daily and weekly timeframes agree or diverge.

#### Added — Analysis endpoint (actionCard + sentiment)

`getSignaAnalysis(symbol)` calls `/api/v1/analysis?sym={sym}` and extracts:
- `actionCard`: direction, confidence, riskScore, riskFactors, triggers, recommendedAction
- `sentiment`: bullish %, bearish %, daysOfHistory

Displayed in `SignaCard` as a sentiment bar showing bull/bear percentage over N days.

#### Added — News endpoint

`getSignaNews(symbol)` calls `/api/v1/news?sym={sym}` and returns up to 4 articles (title, source, date, sentiment, url). Displayed at the bottom of `SignaCard` as clickable article cards with sentiment arrows (▲ bullish / ▼ bearish).

#### Changed — SignaCard display

- Engine source attribution line: "↑ Nightly 30+ model pipeline — matches Signa Canvas Action Card"
- Weekly timeframe alignment row (when available): direction + grade + conf. + aligned/diverging flag
- Sentiment bar: bull/bear % gauge with days-of-history label
- News section: top 4 articles with source, date, sentiment, and outbound link

#### Changed — `stock.ts` route

All new fetches run in the existing `Promise.all` block (no sequential latency added): `getSignaWeeklySignal`, `getSignaAnalysis`, `getSignaNews`. Weekly/analysis/news fields are merged into the `signa` response object as optional fields so no breaking schema change is required.

Changed files: `backend/src/lib/signaClient.ts`, `backend/src/routes/stock.ts`, `backend/src/services/stockScoring.ts`, `frontend/src/types/stock.ts`, `frontend/src/components/SignaCard.tsx`

---

## [0.6.3] — 2026-05-21

### Fixed — Google OAuth redirect to localhost:3000 (code + config)

#### Why localhost:3000 appears

Supabase validates the post-OAuth `redirectTo` URL server-side against its "Redirect URLs" allow-list. The app was passing `window.location.origin` (correct at runtime), but Supabase rejected it because the production domain was absent from the allow-list, silently falling back to its default "Site URL" (`http://localhost:3000`).

#### Code fix — `VITE_SUPABASE_REDIRECT_URL`

Added explicit `VITE_SUPABASE_REDIRECT_URL` environment variable. The app now uses this value as `redirectTo` in `signInWithOAuth`, falling back to `window.location.origin` only when the var is absent (local dev). Setting this var in Cloudflare Pages creates a direct, auditable link between what the code sends to Supabase and what must appear in Supabase's Redirect URLs list.

Changed files: `frontend/src/hooks/useAuth.ts`, `frontend/.env.example`

#### Required configuration (two places must match)

1. **Supabase Dashboard → Authentication → URL Configuration:**
   - **Site URL**: set to production domain (e.g. `https://signal.ailab.build`)
   - **Redirect URLs**: add `https://signal.ailab.build` and `http://localhost:5173`

2. **Cloudflare Pages → Settings → Environment Variables:**
   - Add `VITE_SUPABASE_REDIRECT_URL=https://signal.ailab.build`
   - Trigger a new deployment after adding (VITE_* vars are baked in at build time)

### Reviewed — Cloudflare PR #1 (do not merge)

Cloudflare's `cloudflare-workers-and-pages` bot opened PR #1 ("Add Cloudflare Workers configuration") via Wrangler autoconfig. **Do not merge.** The PR migrates the SPA from Cloudflare Pages (static hosting, correct) to Cloudflare Workers (serverless runtime, incompatible with the current architecture):

- Breaks the `frontend/public/_headers` security file (Pages-only feature)
- Changes `preview` script to use `wrangler dev` instead of `vite preview`
- Adds ~1,100 lines to `package-lock.json` for `wrangler` + `@cloudflare/vite-plugin`
- Cloudflare Pages already handles SPA routing, CDN, and HTTPS — Workers adds no value here
- Different pricing model (Workers: 100k req/day free vs Pages: unlimited)

### Docs — README, CLAUDE.md, PROMPT.md

- Added `VITE_SUPABASE_REDIRECT_URL` to env var tables in all docs
- README Supabase Step 4a: rewrote with exact URL Configuration instructions and explanation of why the default causes localhost redirect
- README Troubleshooting: updated localhost:3000 entry — two-step checklist (Supabase config + Cloudflare Pages env var)

---

## [0.6.2] — 2026-05-21

### Fixed — OAuth Redirect to localhost:3000

Root cause: Supabase creates every new project with **Site URL** defaulting to `http://localhost:3000`. OAuth redirects are validated against the allowed-URL list; if the production domain is absent, Supabase falls back to the Site URL after the Google callback. The app code was already correct (`redirectTo: window.location.origin`).

**Fix (configuration only — no code change):** In Supabase → Authentication → URL Configuration, set Site URL to the production domain and add the production domain wildcard plus `http://localhost:5173/**` to Redirect URLs.

### Fixed — tsconfig.tsbuildinfo committed to git

`frontend/tsconfig.tsbuildinfo` is a TypeScript incremental build cache generated by `tsc -b`. It changes on every build and should never be versioned.

**Fix:** Added `*.tsbuildinfo` to root `.gitignore` and untracked the file from git.

### Fixed — Docs discrepancies

- **Vite version**: all docs referenced "Vite 5" — corrected to "Vite 8" in README.md, CLAUDE.md, and PROMPT.md.
- **Package versions in PROMPT.md**: `tsx ^4.16.2` → `^4.22.3`; `@google/generative-ai ^0.21.0` → `^0.24.1`.
- **README — project structure**: removed stale `ModeToggle.tsx` entry (deleted in v0.6.1); added `AdminPanel.tsx`.
- **README — features table**: removed "Mode toggle" row (deleted in v0.6.1).
- **README — layout diagram**: removed `MODE [Swing] [Day]` from header.
- **README — API reference**: sub-sector count corrected from 13 to 19.
- **README — Supabase Step 4**: expanded OAuth URL Configuration instructions with explicit Site URL and Redirect URL examples.
- **README — deployment step headings**: converted `**Step N —**` bold pseudo-headings to proper `#### Step N —` markdown headings (Railway + Cloudflare Pages sections) to fix MD036 linter warnings.
- **README — Troubleshooting**: added "Sign-in redirects to localhost:3000" entry with root cause and fix.
- **PROMPT.md — scoring functions**: converted `**scoreX**` bold pseudo-headings to `#### scoreX` proper headings (MD036 fix).

---

## [0.6.1] — 2026-05-20

### Added — Invite-Only Access Control + Admin Approval

#### Auth gate

When Supabase is configured the app is now invite-only. Anonymous users see a centered sign-in card explaining the invite-only policy. Signing in with Google triggers the Supabase trigger which auto-creates a `user_profiles` row with `status='pending'`. The user then sees an "Access Pending" screen until an admin approves their account. All stock search, watchlist, and market data are hidden until approved.

#### Admin approval panel

Admin users (`is_admin=true` in `user_profiles`) see a PENDING ACCESS REQUESTS banner at the top of the dashboard listing every pending user with their name, email, and request date. A single "Approve" click sets `status='approved'` and `approved_at` in Supabase and removes the user from the pending list. The admin sets their own `is_admin` flag once via the Supabase SQL Editor; all subsequent approvals happen in the app.

#### New Supabase schema (`user_profiles`)

```sql
create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  status       text not null default 'pending' check (status in ('pending', 'approved')),
  is_admin     boolean not null default false,
  requested_at timestamptz not null default now(),
  approved_at  timestamptz
);
```

RLS uses a `security definer` helper `public.is_admin()` to avoid recursive policy checks. A `on_auth_user_created` trigger auto-inserts a pending profile on every new Google sign-in.

### Added — FCG Natural Gas sub-sector

- `FCG` (First Trust Natural Gas ETF) added as Natural Gas sub-sector under Energy, alongside URA, XOP, ICLN, and TAN.

### Changed — Components & Auth

- **`useAuth`** — now fetches `user_profiles` after sign-in; exports `profile`, `userStatus`, `isAdmin`, `pendingUsers`, `approveUser` in addition to existing fields.
- **`AuthButton`** — accepts `userStatus` prop; shows an amber "Pending" badge next to the user's name when `status='pending'`.
- **`App.tsx`** — removed Mode/Swing/Day toggle (was connected to `HeroPanel` which has not been rendered since v0.3.0; the toggle had no visible effect). Added favicon.svg next to the "Signal Dashboard" title in the header. Auth gate and admin panel wired in.
- **`supabase.ts`** — `Database` type extended with `user_profiles` table.
- **`ModeToggle.tsx`** — deleted (dead code; `TradingMode` type kept in `market.ts` for `HeroPanel` reference).
- **`AdminPanel.tsx`** — new component.

### Docs & Configuration

- **README** — Supabase section rewritten: now covers `user_profiles` schema, full DDL, RLS policies, trigger, and step-by-step admin bootstrap instructions.
- **CLAUDE.md** — Auth & Watchlist section updated with full `useAuth` API, access-model rules, and new sub-sector list.
- **PROMPT.md** — updated to reflect invite-only auth model and new sub-sectors.

---

## [0.5.8] — 2026-05-20

### Fixed — "Failed to fetch" Connection Error + CORS + Hardcoded Port

#### Root cause

With `VITE_API_URL` now pointing to Railway, the browser makes a cross-origin request. If `FRONTEND_URL` on Railway only lists one origin (or the wrong one), CORS blocks the request and the browser surfaces it as "Failed to fetch". Additionally, the error banner in `App.tsx` had `:3001` hardcoded in its message, which is always wrong in production (Railway maps to a public HTTPS URL, not localhost:3001).

#### Fixed

- **`App.tsx`** — `:3001` hint in the connection error message is now gated to `import.meta.env.DEV`. In production, only the raw error is shown; the localhost hint only appears during local development.
- **`backend/src/index.ts`** — CORS now supports multiple allowed origins. Set `FRONTEND_URL` to a comma-separated list (e.g. `https://signal.ailab.build,https://signal-dashboard.pages.dev`) to allow both a custom domain and the Cloudflare Pages URL simultaneously. Requests with no `Origin` header (server-to-server, curl) are always allowed.
- **`backend/package.json`** — removed `yahoo-finance2` ghost dependency. It was listed as a dependency but never imported anywhere. The backend uses direct `fetch` to the Yahoo Finance v8 Chart API via `yahooClient.ts`. Removing it eliminates unnecessary attack surface and reduces cold-start time.

#### Dependencies — minor/patch updates (0 CVEs)

| Package | From | To | Scope |
| --- | --- | --- | --- |
| `tsx` | 4.22.1 | 4.22.3 | backend |
| `@google/generative-ai` | 0.21.0 | 0.24.1 | backend |
| `@supabase/supabase-js` | 2.105.4 | 2.106.0 | frontend |

Major version bumps (express 4→5, react 18→19, typescript 5→6, dotenv 16→17) deferred — breaking changes require dedicated testing.

`npm audit` reports **0 vulnerabilities** across both packages.

---

## [0.5.7] — 2026-05-20

### Fixed — Production Deployment: Connection Error ("Unexpected token '<'")

Root cause: `VITE_API_URL` was not set in Cloudflare Pages environment variables. Because `api.ts` and `stockApi.ts` fall back to an empty base URL (`VITE_API_URL ?? ''`), all `/api/*` fetch calls became relative URLs that hit the Cloudflare Pages static host rather than the Railway backend. Cloudflare returns an HTML 404 page for unknown routes; the frontend tried to parse that as JSON and threw `Unexpected token '<', '<!doctype'... is not valid JSON`.

Two env vars must be set for a working production deployment:

| Service | Variable | Value |
| --- | --- | --- |
| Cloudflare Pages | `VITE_API_URL` | Railway backend public URL (e.g. `https://your-app.up.railway.app`) |
| Railway | `FRONTEND_URL` | Production frontend domain (e.g. `https://signal.ailab.build`) |

Without `VITE_API_URL` the frontend cannot reach the backend. Without `FRONTEND_URL` the Railway CORS policy blocks browser requests from the live domain.

### Docs & Configuration

- **`frontend/.env.example`** — added `VITE_API_URL` entry with explanation; marked it as required for production.
- **README** — Cloudflare Pages Step 3 now explicitly marks `VITE_API_URL` as required; new **Troubleshooting** section at the end of Deployment documents the connection error cause and fix.

---

## [0.5.6] — 2026-05-20

### Changed — Vite 8 Upgrade

- **Vite upgraded from 5.4.x to 8.0.13** — satisfies Cloudflare Pages build requirement (minimum Vite 6). Vite 8 uses the Rolldown bundler for faster builds.
- **`@vitejs/plugin-react` upgraded from 4.3.x to 6.0.2** — required peer dependency for Vite 8.
- All four checks pass with zero errors: backend typecheck, backend build, frontend typecheck, frontend build.

---

## [0.5.5] — 2026-05-19

### Changed — Sector & Sub-Sector Updates

#### New Main Sector

- **ITA** (iShares US Aerospace & Defense ETF) added as a new **Aerospace & Defense** sector. Participates in breadth scoring and leader/lagger ranking.

#### Sector Promoted to Sub-Sector

- **NASA** (Procure Space ETF) moved from main sectors to a sub-sector under **Aerospace & Defense**. Removed from `DISPLAY_ONLY_SECTORS`.

#### New Sub-Sectors under Nasdaq 100 (QQQ)

- **AIPO** — AI Power Stocks
- **AIS** — AI Supercycle Stocks
- **DRAM** — AI Memory
- **EUV** — AI Photonics

---

## [0.5.4] — 2026-05-18

### Added — Supabase Google Auth + Cross-Device Watchlist Sync

- **Google Sign-In** — "Sign in" pill button in the header (visible only when Supabase is configured). Clicking opens Google OAuth via Supabase's `signInWithOAuth`. On success, avatar + display name + "Sign out" button appear.
- **Cross-device watchlist sync** — when signed in, watchlist groups are stored in a Supabase `watchlists` Postgres table instead of localStorage. All mutations (create/rename/delete group, add/remove ticker) sync to Supabase in real time.
- **First-login migration** — when a user signs in for the first time, their existing localStorage watchlist groups are automatically inserted into Supabase so nothing is lost.
- **localStorage-only fallback** — when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are absent, `supabase` client is `null` and the app works exactly as before (localStorage only, no auth).
- **`useAuth` hook** (`frontend/src/hooks/useAuth.ts`) — manages Supabase session state, exposes `{ user, authLoading, signInWithGoogle, signOut }`.
- **`AuthButton` component** (`frontend/src/components/AuthButton.tsx`) — renders nothing when Supabase is unconfigured or session is resolving; "Sign in" when logged out; avatar + name + "Sign out" when logged in.
- **`frontend/.env.example`** — documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Supabase `Database` type** in `frontend/src/lib/supabase.ts` — fully typed schema including `Relationships`, `Views`, `Functions`, `Enums`, `CompositeTypes` (required by `SupabaseClient<T>` generics).

### Changed

- `useWatchlist` now accepts `user: User | null` parameter. When `user` is non-null and Supabase is configured, all reads/writes go to Supabase. When `user` is null, localStorage is used.
- `WatchlistGroup` interface gains optional `id?: string` (Supabase UUID — undefined in localStorage mode).
- `useWatchlist` uses `useRef`-based `userRef` / `stateRef` pattern for stale-closure-free callbacks.
- Optimistic creates: group appears immediately in UI; Supabase-assigned UUID is patched in asynchronously.
- `App.tsx` wires `useAuth()` and passes `user` to `useWatchlist(user)`.

---

## [0.5.3] — 2026-05-18

### Changed — README Overhaul

- Documented GitHub deployment environments table (Production = Cloudflare Pages, `{project}/production` = Railway)
- Clarified `AI_PROVIDER` and `GEMINI_API_KEY` are optional; added missing `SIGNA_API_KEY` to Railway env vars table
- Updated layout ASCII, features table, data sources table, sub-sector list

---

## [0.5.2] — 2026-05-18

### Added — Dark Mode

- **Light / Dark mode toggle** — pill button in the header (◐ Dark / ◑ Light) switches between Stripe-inspired light and dark themes. Preference is persisted to `localStorage` key `signal-theme`.
- **Zero-flicker theme init** — inline `<script>` in `index.html` reads `localStorage` and sets `data-theme` on `<html>` before the first paint, so dark mode users never see a light flash on page load.
- **CSS custom properties** — all design tokens in `index.css` are now defined as CSS custom properties (`--c-ink`, `--c-canvas`, etc.) with `:root` (light mode) and `[data-theme="dark"]` overrides. `colors.ts` references these variables, so every component inherits both themes automatically without any per-component changes.
- **Dark mesh backdrop** — `[data-theme="dark"] .mesh-bg` uses deep indigo/teal radial gradients on a dark navy canvas, matching the Stripe aesthetic.
- **`useTheme` hook** (`frontend/src/hooks/useTheme.ts`) — exposes `{ dark, toggle }`.

---

## [0.5.1] — 2026-05-18

### Changed — Sector Performance

#### Replaced ETFs

- **XLK → QQQ** (Invesco Nasdaq-100 ETF) as the Technology/Nasdaq sector entry. `SECTOR_TO_ETF['Technology']` updated accordingly for stock sector scoring.
- **SOXX → SMH** (VanEck Semiconductor ETF) for the Semiconductors sub-sector; SMH is more liquid and widely tracked.

#### New Main Sectors

- **SPY** (S&P 500) added as a display row in Sector Performance — appears alongside sectors for quick benchmark comparison. Excluded from breadth scoring and leader/lagger ranking (it's the index, not a sector).
- **PDBC** (Invesco Optimum Yield Diversified Commodity Strategy) added as a new "Commodities" sector parent.
- **NASA** (Procure Space ETF) added as a new "Space" sector.

#### New Commodity Sub-Sectors (parent: Commodities / PDBC)

- **XAUUSD=X** — Gold spot price
- **XAGUSD=X** — Silver spot price
- **COPX** (Global X Copper Miners ETF) — Copper
- **CL=F** — Crude Oil WTI futures

#### Architecture

- `DISPLAY_ONLY_SECTORS` constant (`Set<string>`) added to `marketData.ts` — excludes SPY, PDBC, NASA from breadth score and top3/bottom3 leader ranking so they don't distort market quality scoring.
- Ticker bar in `market.ts` deduplicates SPY and QQQ (already pinned as index entries) from the sector loop via `PINNED_SYMBOLS` filter.
- SMH sub-sector parent changed from 'Technology' to 'Nasdaq 100' (matching the renamed sector).

---

## [0.5.0] — 2026-05-18

### Added

#### Named Watchlist Groups

- Watchlist refactored from a flat ticker array to named groups (e.g. "Swing Trades", "Watchlist A")
- Watchlist header shows named group tabs — click to switch, `×` to delete
- "+ New list" button creates a named group inline (Enter to confirm, Escape to cancel)
- "Save to Watchlist" button in stock panel opens a group picker dropdown, showing which groups the ticker is already in (★)
- Clicking a group toggles the ticker in/out of that group — no separate save/unsave button needed
- Migrates legacy flat watchlist data from `localStorage` to the new format automatically

#### Options Intelligence Panel (`OptionsPanel.tsx`)

- New panel displayed below the stock analysis card when a ticker is active
- Fetches options flow, dark pool, and gamma exposure from Signa.ai API (gracefully empty if unavailable or no key)
- **Options Flow**: call/put ratio, bullish vs bearish premium, notable trades with unusual flag
- **Dark Pool**: off-exchange volume %, average fill price, bull/bear volume bar, recent prints
- **Gamma Exposure**: net GEX, gamma flip point (with above/below indicator), key strike levels within 10%, pin risk warning
- Overall direction badge (BULLISH / BEARISH / NEUTRAL) + confidence rating synthesized across all three sources
- Human-readable key points summarize each data source in one line

#### Fundamentals Panel (`FundamentalsPanel.tsx`)

- New section fetched from Signa.ai `GET /fundamentals?sym={symbol}` — always rendered (shows empty state if data unavailable or no key)
- Five sections: Valuation (P/E, Forward P/E, PEG, P/B, P/S, EV/EBITDA), Growth (revenue/earnings YoY, EPS), Profitability (margins, ROE, ROA, FCF yield), Financial Health (debt/equity, current ratio, dividend), Ownership & Analyst (price target, insider %, institutional %, short float)
- Color-coded values: green for strong metrics, amber for caution, red for weak

#### Sector — Solar Sub-Sector

- TAN (Invesco Solar ETF) added as Solar sub-sector under Energy
- Fetched from Yahoo Finance alongside all other sub-sector ETFs

### Fixed — Sector & Signal

#### Sector Performance Row Alignment

- All sector rows now start at the same horizontal position regardless of whether they have sub-sectors
- Fixed by replacing the conditional expand button with a fixed-width 22px placeholder — button appears inside it only when sub-sectors exist

#### Stock Status Respects Signa Signal

- `getStockDecision()` now accepts Signa `direction`, `confidence`, and `grade` as optional parameters
- When Signa signals LONG with confidence ≥ 65% and a strong grade (A+/A/B+/B): decision is at least CAUTION, YES_BUY if composite score ≥ 60 — bypasses the `marketScore < 55` gate that previously forced NO/AVOID
- When Signa signals SHORT with confidence ≥ 65%: decision is always YES_SHORT regardless of composite score
- MU showing AVOID despite Signa saying BUY B+ is now fixed — Signa's high-confidence signal takes precedence

### Removed

- **Composite Score** ring and sub-score (Stock / Sector / Market) section removed from stock panel — signal noise, replaced by Signa data which is the primary authority
- **Scoring Breakdown** panel removed from market overview — the weighted category bars were confusing without clear guidance

### Changed

- `App.tsx`: removed `ScoringBreakdown` import and usage; bottom row is now full-width `TerminalAnalysis` only
- `StockPanel.tsx`: removed `CompositeRing`, `SubScore` components; watchlist button is now a group-picker dropdown
- `useWatchlist.ts`: complete rewrite — now exports `WatchlistGroup[]`, `activeGroup`, `activeTickers`, `setActiveGroup`, `createGroup`, `renameGroup`, `deleteGroup`, `add(ticker, groupName?)`, `remove(ticker, groupName?)`, `isInWatchlist(ticker, groupName?)`, `getGroupsForTicker(ticker)`
- `signaClient.ts`: added `getOptionsFlow()`, `getDarkpool()`, `getGammaExposure()`, `getFundamentals()`, `synthesizeOptionsInsight()` with full TypeScript types and 5-minute/1-hour cache TTLs
- `stock.ts` route: now fetches options, darkpool, gamma, fundamentals in parallel; response includes `optionsInsight` and `fundamentals`
- `frontend/src/types/stock.ts`: added `OptionsFlowItem`, `OptionsFlowData`, `DarkpoolTrade`, `DarkpoolData`, `GammaLevel`, `GammaData`, `OptionsInsight`, `FundamentalsData`; `StockResponse` extended with `optionsInsight` and `fundamentals`

---

## [0.4.0] — 2026-05-18

### Added

#### Stripe-Inspired Light Mode Design

- Complete UI redesign to Stripe-inspired light mode — white canvas (`#ffffff`), deep navy text (`#0d253d`), indigo primary (`#533afd`)
- Shared design token file `frontend/src/lib/colors.ts` — single `C` object + `scoreColor()` and `changeColor()` helpers; all components import from here
- Mesh backdrop: CSS radial gradients approximating Stripe's atmospheric gradient in the page header (`mesh-bg` class in `index.css`)
- Inter font (weights 300/400/500) replacing JetBrains Mono; `font-feature-settings: "ss01"` globally; `"tnum"` for numeric values
- Semantic pill badges throughout: `borderRadius: 9999` with tinted backgrounds and hairline borders for all status indicators
- Subtle card shadows (`0 1px 3px rgba(0,55,112,0.08)`) replacing dark glow effects

#### SIGNA.AI Signal Section

- Signa.ai signal displayed at the top of the stock panel as the primary indicator
- Direction pill (`● LONG` / `● SHORT`) is the most prominent element — green for bullish, red for bearish
- All status fields shown as pill badges in one flex row: Direction, Grade, Stage, Confidence %, Risk Rating
- No more secondary text-only display — all Signa status is badge-first

#### Composite Score Ring

- Replaced YES/NO/CAUTION/BULLISH decision banner with a clean 110px SVG score ring
- Ring shows only the numeric composite score (no label text like "YES" or "CAUTION")
- Decision badge below ring maps to BULLISH / BEARISH / CAUTION / AVOID
- Sub-scores (Stock / Sector / Market) displayed as small numbers beneath the ring
- Score color: green ≥70, amber 50–69, red <50

#### Moving Averages — Centered Heat Bars

- MA display redesigned to centered heat bars — same visual pattern as Sector Heatmap
- Price above MA: green bar extends rightward from center
- Price below MA: red bar extends leftward from center
- Only 4 MAs shown: EMA5, EMA21, EMA55, SMA200 — Signa EMAs and SMA20 removed
- % deviation from price shown alongside each MA

#### Structured Terminal Analysis

- Signa terminal output is now parsed and rendered as structured HTML instead of raw text
- `parseAnalysis()` detects and classifies lines into: `title`, `meta`, `consensus`, `signal`, `warning`, `environment`, `section-header`, `plain`
- `→` consensus items rendered with indigo arrow; `▶` signals rendered in green bordered cards; `⚠` risks in amber box; `ENVIRONMENT:` in indigo background block
- `isSignaFormat()` detects Signa output vs Gemini/template; plain text uses clean paragraph renderer
- Header badge shows "SIGNA.AI" or "AI ANALYSIS" depending on source

#### Sector Heatmap — Accordion Sub-Sectors

- Main sectors shown only by default; sub-sectors hidden
- Sectors with sub-sectors show a `▸`/`▾` toggle button; clicking expands sub-sectors indented below (folder/file UX)
- Sub-sectors rendered with `└` indicator and `isSubsector` row styling
- `expanded: Set<string>` state tracks open sectors; independent per-session

#### Watchlist UX

- "☆ Save to Watchlist" / "★ Saved" buttons are now prominent pill buttons in the stock panel header
- Watchlist section in sidebar labeled "WATCHLIST" with clear instruction text when empty: "Analyze a stock, then click 'Save to Watchlist' to pin it here"
- Watchlist chips styled as pill badges with `×` remove button
- Watchlist uses `localStorage` — persistent per browser, no backend/database required

#### Documentation

- `CLAUDE.md` created — AI assistant onboarding: project overview, stack, directory structure, design system, conventions, build commands, scoring system, data sources
- `README.md` — updated feature table, design system section, project structure, environment variables

### Changed

- App title renamed from "Should I Be Trading?" to "Signal Dashboard" (index.html, App.tsx, all visible headings)
- Decision terminology updated: YES/NO → BULLISH/BEARISH; CAUTION → CAUTION; added AVOID
- Score weight breakdown bars removed from composite score display — composite number only
- All components ported from dark mode to light mode using `C` tokens from `colors.ts`
- `TerminalAnalysis` code-window chrome replaced with clean card with header badge
- `ScoringBreakdown` total score display updated to use 30px number with `scoreColor()`
- `SignaCard` direction pill is now the primary status indicator (was secondary table row)

---

## [0.3.0] — 2026-05-17

### Added

#### Decision Signal — Big & Bold

- Stock decision badge (BUY / SHORT / CAUTION / NO) is now a full-width banner at 48px with glow shadow — immediately visible on load
- Decision text now uses the full label: "YES — BUY", "YES — SHORT", "CAUTION", "NO"
- Score rings moved inline with the decision banner (right side)

#### Fibonacci Retracement Levels

- `computeFibonacci(history): FibLevel[] | null` in `stockScoring.ts` — computes 9 levels from 52-week high/low
- Levels: 161.8% ext, 127.2% ext, 0% (High), 23.6%, 38.2%, 50.0%, 61.8%, 78.6%, 100% (Low)
- `FibonacciPanel` component in `StockPanel.tsx` — two-column layout (retracement | extensions + current price)
- Current level highlighted in yellow with "← NEAR" label when price is within 1.5% of a Fibonacci level
- Levels above current price labeled "resistance", below labeled "support"

#### Moving Averages Panel

- `computeMovingAverages(history, signaData?): MovingAverages` in `stockScoring.ts`
- Yahoo Finance computed: EMA5, EMA21, EMA55, SMA20, SMA200 (from 1y history via `ema()` and `sma()` functions)
- Signa.ai sourced: EMA20, EMA50, EMA200 (from signal response `data.ema20/50/200`)
- `MovingAveragesPanel` component in `StockPanel.tsx` — two-column grid (Yahoo Finance | Signa.ai) with % deviation from current price and a mini-bar indicator

#### Sub-Sector Performance Heatmap

- 8 sub-sector ETFs added: SOXX (Semiconductors), IGV (Software), XBI (Biotech), IHI (Medical Devices), URA (Uranium), XOP (Oil & Gas E&P), KRE (Regional Banks), ICLN (Clean Energy)
- All fetched from Yahoo Finance (free, no API key) in the same `Promise.all` as the 11 main sectors
- `SectorHeatmap` now renders a "SUB-SECTOR PERFORMANCE" section below the main sector section
- Sub-sectors include `parentSector` field for context (e.g., SOXX → Technology, XBI → Health Care)
- `SUBSECTORS`, `SUBSECTOR_NAMES`, `SUBSECTOR_PARENT` exported from `marketData.ts`

#### Terminal Analysis via Signa.ai

- `generateAnalysis()` in `ai.ts` now calls `getSignaSignal('SPY')` first
- If Signa.ai key is available, uses `formatSignaMarketAnalysis()` to produce a rich terminal summary from SPY's 30-model consensus (`engine.reasons[]`), active signals, grade, conviction, and risk factors
- Falls back to Gemini 1.5 Flash, then template text — same fallback chain as before

#### Signa.ai — EMA Fields

- `SignaData` interface extended with `ema20`, `ema50`, `ema200` (mapped from `data.ema20/50/200` in the API response)
- These are surfaced in the MovingAverages panel as the "Signa.ai" column

### Changed

- Removed `HeroPanel` ("Should I Be Trading?" decision panel) from the main layout — Signa.ai stock signal is the primary status indicator
- Removed `HeroPanelSkeleton` import from `App.tsx`
- `backend/src/routes/stock.ts` — response now includes `fibonacci: FibLevel[] | null` and `movingAverages: MovingAverages | null`
- `backend/src/routes/market.ts` — response now includes `subsectors: SectorData[]` (sorted by 5d return)
- `frontend/src/types/stock.ts` — added `FibLevel`, `MovingAverages` interfaces; extended `SignaData` with EMA fields; extended `StockResponse` with `fibonacci` and `movingAverages`
- `frontend/src/types/market.ts` — added `parentSector?: string` to `SectorData`; added `subsectors: SectorData[]` to `MarketResponse`

---

## [0.2.0] — 2026-05-17

### Added

#### Individual Stock Analysis

- Search box at the top of the page to look up any ticker symbol
- Watchlist — save tickers as persistent pills (localStorage, per-browser)
- `StockPanel` — decision badge, 4 score rings (Composite / Stock / Sector / Market), score-weight bars, technicals grid, analysis text
- Stock composite score: stock technicals × 40% + sector ETF health × 30% + market quality × 30%; Signa overallScore blended at 20% weight when available
- Stock decisions: YES BUY / YES SHORT / CAUTION / NO; market quality < 55 forces NO
- `GET /api/stock/:ticker` backend endpoint with 1y Yahoo Finance history + Signa signal

#### Signa.ai Integration (`backend/src/lib/signaClient.ts`)

- `getSignaSignal(symbol)` — calls `GET /api/v1/signal?sym={symbol}&tf=1day` with 15-minute cache
- Price levels displayed: Current Price, Best Entry, Stop Loss, Target Price, Risk:Reward ratio
- Signal checklist — all fired triggers from Signa's 29-driver action card (technical + proprietary)
- Early Warnings — shown when `riskScore ≥ 5`: risk factors and bearish chart patterns with confidence
- Signa grade (A/B/C), direction (LONG/SHORT/WAIT), conviction %, stage + description, risk rating, tier
- `SignaCard` frontend component rendering the full Signa analysis block
- Graceful fallback: if `SIGNA_API_KEY` is absent or API returns error, stock analysis continues without Signa data
- Signa direction (SHORT/SELL) incorporated into `getStockDecision` for YES_SHORT signal

#### UX

- Stock search section moved to top of page — immediately visible on load
- Visual divider separates stock analysis from market overview
- Sector heatmap bars now share a common center zero-line: positive bars extend right (green), negative bars extend left (red)
- Footer attribution updated: "Data via Yahoo Finance · Signals via Signa.ai"

### Changed

- Removed 5 individual metric panel cards (Volatility / Trend / Breadth / Momentum / Macro) — Scoring Breakdown card is sufficient
- `backend/package.json` — added `typecheck` script
- `frontend/package.json` — added `typecheck` script
- `SIGNA_API_KEY` environment variable documented in `.env.example`

---

## [0.1.0] — 2026-05-17

Initial public release of **Should I Be Trading?** — a Bloomberg Terminal-style swing trading environment dashboard.

### Added

#### Core Decision Engine

- Market Quality Score (0–100) computed from five weighted categories:
  - **Volatility** (20%) — VIX level, 5-day slope, 1-year percentile rank
  - **Trend** (25%) — SPY vs 20/50/200-day MAs, QQQ vs 50-day MA, SPY RSI(14), regime classification
  - **Breadth** (20%) — sector ETF MA participation rate, IWM vs SPY breadth proxy
  - **Momentum** (25%) — sector outperformance count, leadership quality (growth vs defensive rotation)
  - **Macro** (10%) — 10-year Treasury level/trend, UUP dollar proxy, Fed stance, FOMC proximity
- Execution Window Score (0–100) — separate signal evaluating whether setups are following through
- Decision logic: **YES BUY** (≥80, uptrend), **YES SELL** (≥80, downtrend), **CAUTION** (60–79), **NO** (<60)
- Swing Trading and Day Trading modes with per-mode threshold display

#### Backend (`backend/`)

- Express 4 server with TypeScript, running via `tsx` (no compile step in production)
- `yahooClient.ts` — direct Yahoo Finance v8 Chart API client; fetches 2-year VIX history and 1-year history for SPY, QQQ, IWM, ^TNX, UUP, and all 11 sector ETFs in a single parallel `Promise.all`
- `technical.ts` — SMA, RSI(14), linear slope, percentile rank, and percent-return utility functions
- `fomc.ts` — hardcoded 2025–2027 FOMC meeting calendar; `getUpcomingFOMC()` flags events within 72 hours
- `cache.ts` — NodeCache wrapper with 30-second TTL to reduce Yahoo Finance API load
- `scoring.ts` — five independent scoring functions, each returning score + weight + label + per-metric interpretation + direction arrow
- `ai.ts` — Gemini 1.5 Flash integration for plain-English terminal analysis; template-based fallback when no API key is configured
- `GET /api/market-data` — full market data + scores + analysis + ticker + alerts, served from cache when available
- `POST /api/refresh` — cache invalidation endpoint for manual force-refresh
- `GET /health` — health check endpoint
- CORS configured via `FRONTEND_URL` environment variable

#### Frontend (`frontend/`)

- React 18 SPA with Vite 5 and Tailwind CSS v4
- `useMarketData` hook — 45-second polling interval with live "Xs ago" counter
- `TickerBar` — sticky scrolling ticker bar (SPY, QQQ, IWM, VIX, TNX, 11 sectors) with LIVE/UPDATING status dot and manual refresh button
- `HeroPanel` — decision badge with color-coded glow, dual SVG score rings (Market Quality + Execution Window), regime pill, mode pill
- `MetricPanel` — per-category panel with score, weight, interpretation badge, score bar, and 3–4 sub-metrics with direction arrows and contextual notes
- `SectorHeatmap` — all 11 sector ETFs sorted by performance with heat bars, 1d/5d/20d timeframe toggle, 50-day MA flag, leader/lagger highlights
- `ScoringBreakdown` — per-category weighted contribution bars with total score and threshold reference card
- `TerminalAnalysis` — Bloomberg-style code window chrome (traffic lights, monospace prompt) rendering AI or template analysis text
- `AlertBanner` — FOMC event and VIX spike warnings with severity-coded styling (info / warning / danger)
- `ModeToggle` — Swing / Day mode pill toggle
- `Skeleton` — pulsing shimmer skeletons for hero, metric panels, and sector heatmap loading states
- Error state with specific backend connection message and Retry button

#### Design System

- Pure black canvas (`#000000`) throughout; no near-blacks
- DESIGN.md color tokens applied: `#11ff99` green, `#ff2047` red, `#ffc53d` yellow, `#ff801f` orange, `#3b9eff` blue
- Hairline borders (`rgba(255,255,255,0.14)`) replace drop shadows
- Atmospheric radial glows behind the hero decision badge keyed to signal color
- JetBrains Mono for all terminal/data display; Inter for labels and analysis prose
- Responsive grid: 5 metric panels reflow at `minmax(260px, 1fr)`; scoring/analysis bottom row collapses on narrow viewports

#### Infrastructure

- Root `package.json` with `npm run dev` running both servers concurrently via `concurrently`
- `npm run install:all` bootstraps all three `package.json` files in one command
- Vite dev proxy routes `/api/*` to `:3001` — no local CORS issues
- `.env.example` documenting all backend environment variables
- `.gitignore` covering `node_modules/`, `dist/`, all `.env*` files, OS artefacts, and IDE files
- Deployment-ready for Cloudflare Pages (frontend) + Railway (backend)

---

## Planned / Roadmap

The following items were documented as known gaps or future work:

- **True market breadth** — % of NYSE/Nasdaq stocks above MAs, McClellan Oscillator, and Advance/Decline line (requires paid data feed such as Polygon.io or Tiingo)
- **Logged-in admin panel** — Supabase Google OAuth + admin-configurable AI provider, scoring weights, and FOMC calendar via UI
- **Day Trading mode differentiation** — tighter scoring thresholds and faster VIX/execution-window weighting when Day mode is active
- **Historical score chart** — chart of Market Quality Score over the past 30/90 days stored in Supabase
- **Push notifications** — alert when score crosses a threshold (email or browser push)
- **Additional macro inputs** — CPI and Jobs Report calendar flags, DXY futures, Fed Funds futures-implied expectations
- **Interactive score editor** — allow users to adjust category weights via UI sliders
- **Pressed/active states** — visual feedback for all interactive elements beyond the hero badge

[0.1.0]: https://github.com/loopnestdev/signal-dashboard/releases/tag/v0.1.0
