# Signal Dashboard

A Stripe-inspired market environment dashboard for swing traders, with light and dark mode support. Pulls live market data, computes a weighted **Market Quality Score**, and outputs a clear trading signal. Includes Signa.ai stock signals with entry/stop/target, options intelligence, fundamentals, Fibonacci levels, moving average heat bars, and structured AI market analysis.

Auto-refreshes every 45 seconds. No brokerage account or paid data subscription required.

---

## Layout

```text
┌─ SIGNAL DASHBOARD ───────────────────────────────────────────── [◐ Dark] ─┐
│  ● LIVE  SPY 739.17 ▲  QQQ 708.93 ▲  VIX 18.43  TNX 4.59%  XLF ▲ …        │
├───────────────────────────────────────────────────────────────────────────┤
│  WATCHLIST  [Default]  [AI-MEM ×]  [+ New list]                           │
│  [Search ticker…]  [Analyze →]    AAPL ×  NVDA ×                          │
│                                                                           │
│  ┌─ SIGNA.AI SIGNAL ──────────────────────────────────────────────────┐   │
│  │  ● BULLISH  Grade A  Stage 3 — Mark-up  87% conf.  Risk: Low       │   │
│  │  ↑ Nightly 30+ model pipeline — matches Signa Canvas Action Card   │   │
│  │  WEEKLY (1W)  ● BULLISH  Grade A  87% conf.  ✓ Aligned             │   │
│  │  ENTRY $181.00  STOP $174.50  TARGET $198.00  2.3×                 │   │
│  │  SENTIMENT · 61d  ████████████░░░  92% Bullish  8% Bearish         │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─ MOVING AVERAGES ──────────────────────────────────────────────────┐   │
│  │  EMA5   ████████████▌·········  +1.2%  $180.12                     │   │
│  │  EMA21  ···········▌████████    -0.8%  $183.80                     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─ OPTIONS INTELLIGENCE ─────────────────────────────────────────────┐   │
│  │  BULLISH  High confidence  C/P 1.8  GEX flip $178                  │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─ FUNDAMENTALS ─────────────────────────────────────────────────────┐   │
│  │  P/E 24.1  Fwd P/E 21.8  Revenue +18%  Margin 26%  ROE 38%         │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─ SECTOR PERFORMANCE ───────────────────────────────────────────────┐   │
│  │  ▸ QQQ Nasdaq 100  ████████  +2.1%  ▲50d                           │   │
│  │      SMH Semiconductors  ██████  +3.4%  ▲50d                       │   │
│  │    XLF Financials  ██████    +1.4%  ▲50d                           │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─ SIGNA.AI · Market Analysis ───────────────────────────────────────┐   │
│  │  ENVIRONMENT: Bull trend | VIX 18.4                                │   │
│  │  → SPY above all major MAs  ✓ Breadth expanding  ⚠ FOMC in 3d      │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Detail |
| --- | --- |
| Light / Dark mode | Header toggle persists preference to localStorage; zero-flicker init via inline script |
| Invite-only access | When Supabase is configured, users must sign in with Google and be approved by an admin before gaining access |
| Admin approval panel | Admin sees pending access requests in-app and approves with one click; new users see "Access Pending" until approved |
| Google Sign-In | Supabase Google OAuth — watchlist syncs across devices when signed in; localStorage fallback when unconfigured |
| Signa.ai signal | Nightly 30+ model engine direction (BULLISH/BEARISH) matching Signa Canvas; Grade, Stage, Confidence, Risk — pill badges; weekly (1W) alignment row; sentiment gauge; news |
| Stock watchlist — named groups | Create named watchlist groups; syncs to Supabase when signed in, localStorage otherwise |
| Options Intelligence | Options flow (C/P, premium, notable trades), dark pool (off-exchange vol, fills), gamma exposure (GEX, flip point, key strikes) — synthesized with directional assessment |
| Fundamentals panel | Valuation, Growth, Profitability, Financial Health, Ownership & Analyst — always rendered, empty state when unavailable |
| Fibonacci levels | 9 auto-computed retracement + extension levels from 52-week high/low |
| Moving averages — heat bars | EMA5, EMA21, EMA55, SMA200; centered heat bar (green right if above, red left if below) |
| Sector heatmap — accordion | 14 sectors incl. Aerospace & Defense; click ▸ to expand sub-sectors (SMH, IGV, AI Power, AI Memory, AI Photonics, XBI, TAN, Gold, Silver, Crude Oil, Space, and more) |
| Market Quality Score | Weighted 0–100 across 5 categories (Volatility 20%, Trend 25%, Breadth 20%, Momentum 25%, Macro 10%) |
| Execution Window Score | Separate 0–100 evaluating near-term setup follow-through |
| Live ticker bar | SPY, QQQ, IWM, VIX, TNX, all sector ETFs scrolling |
| Structured terminal analysis | Signa output parsed into sections; plain text for Gemini/template fallback |
| Alert banner | FOMC event (within 72h), VIX spike (>30) warnings |
| Auto-refresh | Every 45 seconds with manual refresh and "updated Xs ago" counter |

---

## Scoring System

```text
Market Quality Score = Volatility×20% + Trend×25% + Breadth×20% + Momentum×25% + Macro×10%
```

| Score | Decision | Guidance |
| --- | --- | --- |
| 80–100 | YES BUY / YES SELL | Full position sizing |
| 60–79 | CAUTION | Half size, A+ setups only |
| < 60 | NO | Avoid trading, preserve capital |

### Category Inputs

**Volatility (20%)** — VIX level (tiered), VIX 5d slope, VIX 1yr percentile rank

**Trend (25%)** — SPY vs 20/50/200d MA · QQQ vs 50d MA · SPY RSI(14) · regime (uptrend / downtrend / chop)

**Breadth (20%)** — % of 11 sector ETFs above 50d MA · IWM vs SPY 5d relative return

**Momentum (25%)** — Sectors outperforming SPY (5d) · leadership quality (growth vs defensive rotation)

**Macro (10%)** — 10Y Treasury level + 30d trend · Dollar Index slope · Fed stance · FOMC proximity (−15 pts within 72h)

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + Vite 8 + Tailwind CSS v4 |
| Backend | Node.js 20 + Express 4 + TypeScript 5 |
| Data | Yahoo Finance v8 Chart API (free, no key) |
| Stock signals + AI | Signa.ai API (optional `SIGNA_API_KEY`) |
| AI analysis fallback | Google Gemini 1.5 Flash (optional `GEMINI_API_KEY`) |
| Auth + watchlist sync | Supabase (optional — Google OAuth + Postgres) |
| Caching | NodeCache, 30-second TTL |
| Frontend hosting | Cloudflare Pages |
| Backend hosting | Railway (Node.js) |

---

## Project Structure

```text
signal-dashboard/
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Main layout, polling, theme, auth
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx         # Admin: pending access requests + approve button
│   │   │   ├── AlertBanner.tsx        # FOMC / VIX spike alerts
│   │   │   ├── AuthButton.tsx         # Google sign-in / sign-out pill + pending badge
│   │   │   ├── FundamentalsPanel.tsx  # Valuation/growth/margins section
│   │   │   ├── OptionsPanel.tsx       # Options flow + dark pool + gamma
│   │   │   ├── SectorHeatmap.tsx      # Sectors + accordion sub-sectors
│   │   │   ├── SignaCard.tsx          # Signa.ai signal card
│   │   │   ├── Skeleton.tsx           # Loading shimmer skeletons
│   │   │   ├── StockPanel.tsx         # Full stock analysis panel
│   │   │   ├── StockSearch.tsx        # Search bar + named watchlist groups
│   │   │   ├── TerminalAnalysis.tsx   # Structured AI market analysis
│   │   │   └── TickerBar.tsx          # Scrolling live ticker
│   │   ├── hooks/
│   │   │   ├── useAuth.ts             # Supabase session + Google OAuth
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
│   │       └── stock.ts               # StockResponse, SignaData, OptionsInsight, FundamentalsData, etc.
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
│   │       ├── technical.ts           # SMA, EMA, RSI, slope, percentile utils
│   │       └── yahooClient.ts         # Yahoo Finance v8 Chart API client
│   ├── .env.example
│   └── package.json
│
├── package.json      # Root: concurrently dev, install:all
├── DESIGN.md         # Stripe-inspired design tokens (source of truth)
├── CLAUDE.md         # AI assistant onboarding guide
├── CHANGELOG.md      # Version history
├── PROMPT.md         # Full reconstruction specification
└── README.md         # This file
```

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
# 1. Clone
git clone https://github.com/loopnestdev/signal-dashboard.git
cd signal-dashboard

# 2. Install all dependencies (root + frontend + backend)
npm run install:all

# 3. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env — see Environment Variables below

# 4. (Optional) Configure Supabase for Google auth + cross-device watchlist sync
cp frontend/.env.example frontend/.env
# Edit frontend/.env — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# Leave blank to run in localStorage-only mode (no sign-in required)

# 5. Start both servers
npm run dev
```

Frontend: [Signal Dashboard Frontend](http://localhost:5173)
Backend: [Signal Dashboard Backend](http://localhost:3001)

The frontend proxies `/api/*` to `:3001` via Vite's dev proxy — no CORS config needed locally.

### Environment Variables

**`backend/.env`**

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3001` | Backend HTTP port |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS allowed origin |
| `SIGNA_API_KEY` | No | — | Signa.ai API key — enables stock signals, options intelligence, fundamentals, and AI market analysis |
| `GEMINI_API_KEY` | No | — | Google AI Studio key — used as AI analysis fallback when `SIGNA_API_KEY` is absent |
| `AI_PROVIDER` | No | `gemini` | Set to `none` to skip Gemini entirely and always use template analysis |

**Priority chain for AI market analysis:** Signa.ai → Gemini 1.5 Flash → built-in template

- With `SIGNA_API_KEY`: Signa provides analysis; Gemini is not called.
- With `GEMINI_API_KEY` only: Gemini generates analysis.
- With neither key: a built-in template is used.
- `AI_PROVIDER=none`: forces template regardless of keys.

All scoring, market data, Fibonacci, and moving averages work fully without any API keys.

**`frontend/.env`**

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | **Production only** | Railway backend public URL — required in Cloudflare Pages; leave blank locally (Vite proxy covers it) |
| `VITE_SUPABASE_URL` | No | Your Supabase project URL — from Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | No | Your Supabase anon/public key — same location |
| `VITE_SUPABASE_REDIRECT_URL` | **Required if using auth** | Your exact production domain (e.g. `https://signal.ailab.build`). Must match one of the URLs added to Supabase → Authentication → URL Configuration → Redirect URLs. Without this, Google sign-in redirects to `localhost:3000` after OAuth |

Leave `VITE_SUPABASE_*` blank (or omit the file entirely) to run in localStorage-only mode with no authentication.

---

## Deployment

### Overview

```text
User → Cloudflare (WAF + CDN) → Cloudflare Pages (React SPA)
                                        ↓ /api/*
                               Railway (Express backend)
                                        ↓
                               Yahoo Finance API (free)
                               Signa.ai API (optional)
                               Google Gemini API (optional)
```

### GitHub Deployment Environments

When both services are connected to your GitHub repo, you will see multiple entries under the **Deployments** tab:

| GitHub environment name | Service | Trigger |
| --- | --- | --- |
| **Production** | Cloudflare Pages — frontend | Push to main branch |
| **Preview** | Cloudflare Pages — frontend | Every pull request |
| **`{project}` / production** | Railway — backend | Push to main branch |

> Railway names its GitHub deployment environment after your Railway project name (e.g., `moat-finder / production`). Cloudflare Pages always uses `Production` and `Preview`.

---

### Supabase — Access Control, Google Auth + Watchlist Sync

When Supabase is configured the app becomes **invite-only**: anonymous users can sign in with Google to request access, but a human admin must approve each account before it gains access. Without Supabase the app is open (suitable for local development).

> **loopnestdev shared database:** This project uses the centralised **coredb** Supabase project — the same instance used by moat-finder and folio-app. One Google sign-in works across all apps. Each app is isolated in its own PostgreSQL schema within coredb (signal-dashboard → `signal`, moat-finder → `moat`, folio-app → `folio`). If you are setting up a fresh deployment for your own use, follow Steps 1–6 below. If you are a loopnestdev contributor, skip to **Step 2** (coredb exists — expose the `signal` schema and run the DDL if not already done).

#### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Note your **Project URL** and **anon/public key** from **Settings → API**

#### Step 2 — Expose the `signal` schema via Supabase API settings

Before creating tables, tell PostgREST to expose the `signal` schema:

1. Supabase Dashboard → **Settings → API**
2. Under **"Exposed schemas"**, add `signal` to the list (alongside `public`)
3. Click **Save** — the API restarts automatically

> This is required once per Supabase project. Without it, PostgREST returns a 404 for every `signal.*` table query even if the tables exist.

#### Step 3 — Create tables

In **SQL Editor**, run the full schema:

```sql
-- ─── signal schema ──────────────────────────────────────────────────────────
create schema if not exists signal;

-- Grant PostgREST access (anon + authenticated roles)
grant usage on schema signal to anon, authenticated, service_role;
alter default privileges in schema signal
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema signal
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema signal
  grant all on routines  to anon, authenticated, service_role;

-- Watchlists (cross-device sync)
create table signal.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  tickers    text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table signal.watchlists enable row level security;
create policy "Users manage their own watchlists"
  on signal.watchlists for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User access approval
create table signal.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  status       text not null default 'pending' check (status in ('pending', 'approved')),
  is_admin     boolean not null default false,
  requested_at timestamptz not null default now(),
  approved_at  timestamptz
);
alter table signal.user_profiles enable row level security;

-- is_admin reads from the JWT app_metadata claim (set via Step 4 below).
-- Using a table lookup here causes infinite recursion in PostgreSQL RLS.
create or replace function signal.is_admin()
returns boolean as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$ language sql stable security definer;

create policy "Users or admin read profiles"
  on signal.user_profiles for select
  using (auth.uid() = id or signal.is_admin());
create policy "Admins approve profiles"
  on signal.user_profiles for update
  using (signal.is_admin());
create policy "Insert own profile"
  on signal.user_profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on first sign-in
create or replace function signal.handle_new_user()
returns trigger as $$
begin
  insert into signal.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure signal.handle_new_user();
```

#### Step 4 — Grant yourself admin access

After your first sign-in, run both statements in the SQL Editor (replace with your email).

The first updates your profile row (what the app reads). The second adds `is_admin: true` to your JWT `app_metadata` (what the RLS `signal.is_admin()` function reads — required because a table lookup would cause infinite recursion).

```sql
-- Approve in the profile table
update signal.user_profiles
set status = 'approved', is_admin = true
where email = 'you@example.com';

-- Set is_admin in JWT claims (sign out and back in after running this)
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
where email = 'you@example.com';
```

After running both, **sign out and sign back in** so your browser gets a fresh JWT that includes `app_metadata.is_admin: true`.

From that point you can approve other users directly in the app.

#### Step 5 — Enable Google OAuth

1. Supabase Dashboard → **Authentication → Providers → Google → Enable**
2. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorised redirect URI (in Google Console): `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client Secret** back into Supabase → Google provider settings

#### Step 5a — Configure Supabase redirect URLs (REQUIRED — fixes localhost:3000 redirect)

> **Why this matters:** Every Supabase project defaults "Site URL" to `http://localhost:3000`. After Google OAuth completes, Supabase redirects the user to the `redirectTo` URL only if it appears in the approved list below. If it does not appear there, Supabase silently falls back to "Site URL" — sending the user to `localhost:3000` regardless of where the app is deployed. This is the most common cause of a broken sign-in flow.

In Supabase Dashboard → **Authentication → URL Configuration**, make these two changes:

1. **Site URL** — change from `http://localhost:3000` to your production domain: `https://signal.ailab.build`

2. **Redirect URLs** — add each of the following (one per line, click **Add URL** for each): `https://signal.ailab.build` and `http://localhost:5173`

   Use the exact origin (no trailing slash, no wildcard). These must match the value you will set in `VITE_SUPABASE_REDIRECT_URL` in Step 5.

#### Step 6 — Add env vars to Cloudflare Pages

In Cloudflare Pages → **Settings → Environment Variables**, add:

| Variable | Environment | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Production | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Production | Your anon/public key |
| `VITE_SUPABASE_REDIRECT_URL` | Production | `https://signal.ailab.build` (your exact production domain) |

> **`VITE_SUPABASE_REDIRECT_URL` is the value the app sends to Supabase as the post-OAuth destination. It must exactly match one of the URLs you added in Step 4a. After adding or changing this variable, trigger a new Cloudflare Pages deployment** (`VITE_*` vars are baked in at build time).

For local development, copy `frontend/.env.example` to `frontend/.env`. Leave `VITE_SUPABASE_REDIRECT_URL` blank locally — the app falls back to `window.location.origin` (`http://localhost:5173`).

---

### Backend — Railway

Railway auto-detects Node.js, runs `npm start`, and provides HTTPS out of the box.

#### Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your repository
3. Set the **Root Directory** to `backend` in **Settings → Source** (Railway may not auto-detect this)

#### Step 2 — Set environment variables

In Railway → your service → **Variables**, add:

| Key | Value |
| --- | --- |
| `PORT` | `3001` |
| `FRONTEND_URL` | `https://your-app.pages.dev` (your Cloudflare Pages URL — fill in after the next section) |
| `SIGNA_API_KEY` | Your Signa.ai API key (get it from [app.getsigna.ai](https://app.getsigna.ai)) |
| `GEMINI_API_KEY` | Your key from [aistudio.google.com](https://aistudio.google.com) *(optional — only needed if you don't have a Signa key)* |

> `AI_PROVIDER` and `PORT` have sensible defaults — only add them if you want to override.

#### Step 3 — Configure start command

Railway should pick up `"start": "tsx src/index.ts"` from `backend/package.json` automatically.  
If not, set **Start Command** to `npm start`.

#### Step 4 — Get your Railway URL

After deploy, Railway gives you a public URL like:

```url
https://signal-dashboard-production.up.railway.app
```

Copy this — you'll need it for Cloudflare Pages.

---

### Frontend — Cloudflare Pages

#### Step 1 — Create a Pages project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select your repository

#### Step 2 — Build settings

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `20` |

#### Step 3 — Environment variables

In **Settings → Environment Variables**, add:

| Variable | Environment | Value |
| --- | --- | --- |
| `VITE_API_URL` | Production | `https://signal-dashboard-production.up.railway.app` |
| `VITE_SUPABASE_URL` | Production | Your Supabase project URL *(optional — only if using auth)* |
| `VITE_SUPABASE_ANON_KEY` | Production | Your Supabase anon key *(optional — only if using auth)* |

Replace `VITE_API_URL` with your actual Railway URL.

> **`VITE_API_URL` is required.** Without it, the frontend falls back to relative `/api/*` URLs that hit the Cloudflare Pages static host instead of the Railway backend — resulting in a "Unexpected token '<'" JSON parse error on every API call. The Vite dev proxy that handles this automatically in local development is not active in production builds.

#### Step 4 — Deploy

Click **Save and Deploy**. Your frontend will be live at:

```text
https://signal-dashboard.pages.dev
```

#### Step 5 — Update CORS on Railway

Go back to Railway → Variables and update `FRONTEND_URL` to your Cloudflare Pages URL:

```text
FRONTEND_URL=https://signal-dashboard.pages.dev
```

Railway redeploys automatically on variable changes.

---

### Troubleshooting

#### Sign-in with Google redirects to `localhost:3000`

Two things must be true simultaneously or the redirect fails:

1. **Supabase dashboard** — `Authentication → URL Configuration`:
   - **Site URL** must be your production domain (e.g. `https://signal.ailab.build`), not `localhost:3000`
   - **Redirect URLs** must include `https://signal.ailab.build` and `http://localhost:5173` (exact origins, no wildcards)

2. **Cloudflare Pages env vars** — `VITE_SUPABASE_REDIRECT_URL` must be set to `https://signal.ailab.build` (the same value as the Supabase Redirect URL entry). After adding this variable, trigger a new deployment — `VITE_*` vars are baked in at build time.

If either is missing, Supabase falls back to its "Site URL" default (`localhost:3000`) regardless of what the app sends.

#### "Unexpected token '<', '<!doctype'... is not valid JSON"

The frontend is making API requests to the Cloudflare Pages static host instead of Railway. This happens when `VITE_API_URL` is missing from Cloudflare Pages environment variables.

**Fix:** In Cloudflare Pages → **Settings → Environment Variables**, set `VITE_API_URL` to your Railway backend URL, then trigger a new deployment. `VITE_*` variables are baked into the bundle at build time — changing them requires a redeploy.

#### "CORS policy: No 'Access-Control-Allow-Origin' header"

The Railway backend is rejecting requests from your production domain. This happens when `FRONTEND_URL` is not set to the live frontend URL.

**Fix:** In Railway → Variables, set `FRONTEND_URL` to your exact production URL (e.g. `https://signal.ailab.build`). Railway redeploys automatically.

#### Connection error persists after setting env vars

Cloudflare Pages caches the old build. After adding `VITE_API_URL`, go to **Deployments** and click **Retry deployment** on the latest build to force a fresh compile with the new variable.

---

### Custom Domain (Optional)

**Cloudflare Pages custom domain:**

1. Pages project → **Custom domains** → Add domain
2. Cloudflare DNS: CNAME pointing to `signal-dashboard.pages.dev`

**Railway custom domain:**

1. Railway service → **Settings → Networking** → **Add Custom Domain**
2. Cloudflare DNS: CNAME pointing to Railway's provided target
3. Update `VITE_API_URL` in Cloudflare Pages env vars to your custom API domain

---

### Cloudflare WAF / Security (Optional)

Cloudflare Pages is automatically behind Cloudflare's WAF. For additional protection:

1. **Rate limiting** — Security → WAF → Rate Limiting Rules: `(http.request.uri.path contains "/api")` → max 60 req/min
2. **Bot Fight Mode** — Security → Bots → **Bot Fight Mode: On**

---

### Testing

The project includes a Vitest test suite covering all business-critical logic. Run tests before pushing changes.

```bash
# Run all backend tests (134 tests)
cd backend && npm test

# Run all frontend tests (55 tests)
cd frontend && npm test

# Watch mode during development
cd backend && npm run test:watch
cd frontend && npm run test:watch
```

Test files live alongside source under `src/__tests__/`:

| Package | File | What it tests |
| --- | --- | --- |
| backend | `__tests__/lib/technical.test.ts` | `sma`, `ema`, `rsi`, `pctReturn`, `linearSlope`, `percentileRank`, `clamp` |
| backend | `__tests__/services/stockScoring.test.ts` | `getStockDecision` (both BULLISH/LONG vocabs), `computeStockTechnicalScore`, `computeSectorETFScore`, `computeFibonacci`, `computeMovingAverages` |
| backend | `__tests__/lib/signaInsight.test.ts` | `synthesizeOptionsInsight` — all direction combinations, key point content |
| backend | `__tests__/services/scoring.test.ts` | `scoreVolatility`, `scoreTrend`, `computeMarketQualityScore`, `getDecision` — all weights |
| frontend | `__tests__/lib/priceLevels.test.ts` | `validatePriceLevels` — LONG/SHORT validation, ASTS inverted-level regression |
| frontend | `__tests__/hooks/useWatchlist.test.ts` | `useWatchlist` localStorage path — all CRUD operations, persistence, migration |

---

### CI / CD

Both Railway and Cloudflare Pages auto-deploy on every push to the main branch. No additional CI configuration needed.

- **Cloudflare Pages** builds a preview deployment for every PR (visible as `Preview` in GitHub Deployments)
- **Railway** deploys from the configured branch via **Settings → Source → Branch**

---

## API Reference

### `GET /api/market-data`

Returns the full market data payload. Cached 30 seconds server-side.

| Field | Type | Description |
| --- | --- | --- |
| `decision` | `YES_BUY \| YES_SELL \| CAUTION \| NO` | Trading signal |
| `marketQualityScore` | `number` | Weighted 0–100 |
| `executionWindowScore` | `number` | Separate 0–100 |
| `categories` | `object` | Scores + metrics for each of 5 categories |
| `sectors` | `array` | 14 sector ETFs with 1d/5d/20d returns and MA flags |
| `subsectors` | `array` | 19 sub-sector ETFs with same fields |
| `regime` | `uptrend \| downtrend \| chop` | Market regime |
| `analysis` | `string` | AI-generated or template analysis |
| `ticker` | `array` | Ticker bar items |
| `alerts` | `array` | Active alerts (FOMC, VIX spike) |
| `fromCache` | `boolean` | Whether from 30s cache |
| `timestamp` | `string` | ISO timestamp of last fetch |

### `POST /api/refresh`

Invalidates the cache. Next `GET /api/market-data` fetches fresh data.

### `GET /api/stock/:symbol`

Returns stock analysis for a symbol. Includes technical score, sector ETF score, composite score, Signa.ai signal, Fibonacci levels, moving averages, options intelligence, and fundamentals.

### `GET /health`

Health check. Returns `{ status: "ok", ts: "..." }`.

---

## Data Sources

| Metric | Source | Notes |
| --- | --- | --- |
| SPY, QQQ, IWM prices + history | Yahoo Finance v8 Chart API | Free, no key |
| VIX (^VIX) | Yahoo Finance | 2-year history for percentile |
| 10Y Treasury (^TNX) | Yahoo Finance | Level + 20d slope |
| Dollar Index (UUP) | Yahoo Finance | UUP ETF as DXY proxy |
| Sector ETFs | Yahoo Finance | QQQ, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, ITA, SPY, PDBC |
| Sub-sector ETFs | Yahoo Finance | SMH, IGV, AIPO, AIS, DRAM, EUV, XBI, IHI, URA, XOP, KRE, ICLN, TAN, FCG, GC=F, SI=F, COPX, CL=F, NASA |
| FOMC dates | Hardcoded | `backend/src/lib/fomc.ts` — update annually |
| Fed stance | Hardcoded | `backend/src/lib/fomc.ts` — update as conditions change |
| Stock signals | Signa.ai API | Entry/stop/target, triggers, risk, EMAs (requires `SIGNA_API_KEY`) |
| Options flow + dark pool + gamma | Signa.ai API | Synthesized into directional assessment (requires `SIGNA_API_KEY`) |
| Fundamentals | Signa.ai API | Valuation, growth, margins, health, analyst data (requires `SIGNA_API_KEY`) |
| Terminal analysis | Signa.ai → Gemini 1.5 Flash → template | Priority chain; template is the built-in fallback |

> **Breadth note:** True market breadth requires paid data. This dashboard approximates breadth using 11 S&P sector ETFs and IWM vs SPY relative performance — directionally accurate but not identical to full-universe breadth.

---

## Configuration & Customisation

### Adjusting scoring thresholds

Edit `backend/src/services/scoring.ts` — each `score*` function is self-contained. Decision thresholds live in `backend/src/routes/market.ts`.

### Switching AI provider

Set `AI_PROVIDER=none` in `.env` to disable Gemini and always use template analysis.

### Refreshing the FOMC calendar

Edit `backend/src/lib/fomc.ts` — update `FOMC_DATES` annually when the Fed publishes its schedule, and update `getFedStance()` to reflect current monetary policy.

---

## Design System

The UI uses a Stripe-inspired design system defined in `frontend/src/lib/colors.ts` as CSS custom properties. Toggle between light and dark mode with the **◐ Dark / ◑ Light** button in the header.

Key tokens (light mode → dark mode):

- **Ink (text):** `#0d253d` → `#e2e8f0`
- **Canvas:** `#ffffff` → `#0d1b2e`
- **Border:** `#e3e8ee` → `#253a55`
- **Primary:** `#533afd` → `#7c6dff`
- **Bull:** `#059669` → `#10b981`
- **Bear:** `#ea2261` → `#f43f6e`
- **Warn:** `#d97706` → `#f59e0b`

All tokens are CSS custom properties in `frontend/src/index.css` under `:root` (light) and `[data-theme="dark"]` (dark). Components never need per-component dark mode code.

---

## Limitations & Disclaimers

- **Not financial advice.** Educational and informational purposes only.
- Market data is delayed or end-of-day depending on Yahoo Finance's cache. Real-time accuracy is not guaranteed.
- Breadth metrics approximate from sector ETFs. Full NYSE/Nasdaq breadth requires a paid subscription.
- The FOMC calendar and Fed stance in `fomc.ts` are hardcoded. Keep them updated.
- Yahoo Finance's unofficial API has no SLA. If it goes down, the app shows an error state with retry.

---

## License

MIT — see [LICENSE](LICENSE).
