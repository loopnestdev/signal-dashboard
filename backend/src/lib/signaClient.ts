import { getFromCache, setToCache } from './cache.js';

const SIGNA_BASE = 'https://app.getsigna.ai/api/v1';
const CACHE_TTL_SIGNAL = 900; // 15 min — nightly pipeline data

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.SIGNA_API_KEY ?? ''}`,
    Accept: 'application/json',
  };
}

export interface SignaTrigger {
  name: string;
  description: string;
  weight?: number;
  strength?: number;
  type?: string;
}

export interface SignaPattern {
  name: string;
  type: string;
  confidence: number;
  description: string;
  status: string;
  targetPrice?: number;
}

export interface SignaActionCard {
  direction: string;
  confidence: number;
  riskScore: number;
  riskFactors: string[];
  triggers: string[];
  recommendedAction: string;
}

export interface SignaSentiment {
  bullish: number;
  bearish: number;
  daysOfHistory: number;
}

export interface SignaNewsArticle {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  sentiment?: string;
  summary?: string;
}

export interface SignaData {
  // ── Engine: nightly 30+ model pipeline — primary source, matches Signa Canvas Action Card ──
  direction: string;      // BULLISH | BEARISH | NEUTRAL
  confidence: number;
  grade: string;          // A+, A, B+, B, C, D  (signa.grade preferred, then engine.grade)
  engineReasons: string[];

  // ── Signa: proprietary synthesis ──
  action: string;         // BUY | SELL | HOLD
  riskRating: string;
  conviction: number;
  signaTriggers: SignaTrigger[];

  // ── Live technical levels (data field — single-pass intraday analysis) ──
  entry: number;
  stop: number;
  target: number;
  rr: number;
  stage: number;
  stageDescription: string;
  riskScore: number;
  riskFactors: string[];
  triggers: SignaTrigger[];
  patterns: SignaPattern[];
  tier: string;
  overallScore: number;
  rsi: number;
  adx: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;

  // ── Weekly signal (tf=1W, engine) ──
  weeklyDirection?: string;
  weeklyGrade?: string;
  weeklyConfidence?: number;

  // ── Analysis endpoint (actionCard + sentiment) ──
  actionCard?: SignaActionCard;
  sentiment?: SignaSentiment;

  // ── Thesis ──
  thesis?: string;

  // ── News ──
  newsItems?: SignaNewsArticle[];
  // ── Congress signal ──
  congress?: CongressData;
}

// ── Raw API response shape ────────────────────────────────────────────────────

interface SignaRaw {
  ok: boolean;
  engine?: {
    direction?: string;
    confidence?: number;
    grade?: string;
    score?: number;
    reasons?: string[];
  };
  signa?: {
    grade?: string;
    conviction?: number;
    action?: string;
    riskRating?: string;
    triggers?: Array<{ name: string; type?: string; strength?: number; description: string }>;
  };
  data?: {
    direction?: string;
    confidence?: number;
    stage?: number;
    stageDescription?: string;
    riskScore?: number;
    riskFactors?: string[];
    triggers?: Array<{ name: string; description: string; weight?: number; type?: string }>;
    entry?: number;
    stop?: number;
    target?: number;
    rr?: number;
    price?: number;
    rsi?: number;
    adx?: number;
    trendStrength?: number;
    ema20?: number;
    ema50?: number;
    ema200?: number;
    tier?: string;
    overallScore?: number;
    patterns?: Array<{
      name: string; type: string; confidence: number;
      description: string; status: string; targetPrice?: number;
    }>;
  };
  // thesis endpoint extras
  thesis?: string;
  congress?: unknown;
  news?: unknown;
  error?: string;
}

// ── Daily signal ──────────────────────────────────────────────────────────────

export async function getSignaSignal(symbol: string): Promise<SignaData | null> {
  if (!process.env.SIGNA_API_KEY) return null;

  const cacheKey = `signa-${symbol.toUpperCase()}`;
  const cached = getFromCache<SignaData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/signal?sym=${encodeURIComponent(symbol)}&tf=1day`,
      { headers: headers() },
    );

    if (!res.ok) {
      console.warn(`[signa] ${symbol}: HTTP ${res.status}`);
      return null;
    }

    const raw = await res.json() as SignaRaw;
    if (!raw.ok) return null;

    // Engine is the primary source — nightly 30+ model pipeline, matches Signa Canvas Action Card.
    // data field is the live single-pass technical analysis (used for price levels only).
    const eng = raw.engine ?? {};
    const sig = raw.signa ?? {};
    const d = raw.data ?? {};

    const result: SignaData = {
      // Engine: direction / grade / confidence
      direction: eng.direction ?? d.direction ?? 'NEUTRAL',
      confidence: eng.confidence ?? d.confidence ?? 0,
      grade: sig.grade ?? eng.grade ?? '—',
      engineReasons: eng.reasons ?? [],

      // Signa: proprietary synthesis
      action: sig.action ?? d.direction ?? '—',
      riskRating: sig.riskRating ?? '—',
      conviction: sig.conviction ?? 0,
      signaTriggers: (sig.triggers ?? []).map(t => ({
        name: t.name,
        description: t.description,
        strength: t.strength,
        type: t.type ?? 'proprietary',
      })),

      // Live technical price levels from data field
      entry: d.entry ?? 0,
      stop: d.stop ?? 0,
      target: d.target ?? 0,
      rr: d.rr ?? 0,
      stage: d.stage ?? 0,
      stageDescription: d.stageDescription ?? '—',
      riskScore: d.riskScore ?? 0,
      riskFactors: d.riskFactors ?? [],
      triggers: (d.triggers ?? []).map(t => ({
        name: t.name,
        description: t.description,
        weight: t.weight,
        type: t.type ?? 'technical',
      })),
      patterns: d.patterns ?? [],
      tier: d.tier ?? '—',
      overallScore: d.overallScore ?? 50,
      rsi: d.rsi ?? 0,
      adx: d.adx ?? 0,
      ema20: d.ema20 ?? null,
      ema50: d.ema50 ?? null,
      ema200: d.ema200 ?? null,
    };

    setToCache(cacheKey, result, CACHE_TTL_SIGNAL);
    return result;
  } catch (err) {
    console.warn(`[signa] ${symbol} error:`, err);
    return null;
  }
}

// ── Weekly signal (tf=1W) ─────────────────────────────────────────────────────

export interface SignaWeeklyResult {
  direction: string;
  grade: string;
  confidence: number;
}

export async function getSignaWeeklySignal(symbol: string): Promise<SignaWeeklyResult | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-weekly-${symbol.toUpperCase()}`;
  const cached = getFromCache<SignaWeeklyResult>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/signal?sym=${encodeURIComponent(symbol)}&tf=1W`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as SignaRaw;
    if (!raw.ok) return null;

    const eng = raw.engine ?? {};
    const sig = raw.signa ?? {};
    const d = raw.data ?? {};

    const result: SignaWeeklyResult = {
      direction: eng.direction ?? d.direction ?? 'NEUTRAL',
      grade: sig.grade ?? eng.grade ?? '—',
      confidence: eng.confidence ?? d.confidence ?? 0,
    };
    setToCache(cacheKey, result, CACHE_TTL_SIGNAL);
    return result;
  } catch {
    return null;
  }
}

// ── Analysis endpoint ─────────────────────────────────────────────────────────

interface SignaAnalysisRaw {
  ok?: boolean;
  actionCard?: {
    direction?: string;
    confidence?: number;
    riskScore?: number;
    riskFactors?: string[];
    triggers?: string[];
    recommendedAction?: string;
  };
  sentiment?: {
    bullish?: number;
    bearish?: number;
    daysOfHistory?: number;
  };
}

export interface SignaAnalysis {
  actionCard: SignaActionCard | null;
  sentiment: SignaSentiment | null;
}

export async function getSignaAnalysis(symbol: string): Promise<SignaAnalysis | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-analysis-${symbol.toUpperCase()}`;
  const cached = getFromCache<SignaAnalysis>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/analysis?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as SignaAnalysisRaw;
    if (!raw.ok) return null;

    const result: SignaAnalysis = {
      actionCard: raw.actionCard ? {
        direction: raw.actionCard.direction ?? '—',
        confidence: raw.actionCard.confidence ?? 0,
        riskScore: raw.actionCard.riskScore ?? 0,
        riskFactors: raw.actionCard.riskFactors ?? [],
        triggers: raw.actionCard.triggers ?? [],
        recommendedAction: raw.actionCard.recommendedAction ?? '—',
      } : null,
      sentiment: raw.sentiment ? {
        bullish: raw.sentiment.bullish ?? 0,
        bearish: raw.sentiment.bearish ?? 0,
        daysOfHistory: raw.sentiment.daysOfHistory ?? 0,
      } : null,
    };
    setToCache(cacheKey, result, CACHE_TTL_SIGNAL);
    return result;
  } catch {
    return null;
  }
}

// ── News ──────────────────────────────────────────────────────────────────────

interface SignaNewsRaw {
  ok?: boolean;
  data?: Array<{
    title?: string;
    url?: string;
    publishedAt?: string;
    source?: string;
    sentiment?: string;
    summary?: string;
  }>;
  articles?: Array<{
    title?: string;
    url?: string;
    publishedAt?: string;
    source?: string;
    sentiment?: string;
    summary?: string;
  }>;
  news?: Array<{
    title?: string;
    url?: string;
    publishedAt?: string;
    source?: string;
    sentiment?: string;
    summary?: string;
  }>;
}

export async function getSignaNews(symbol: string): Promise<SignaNewsArticle[] | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-news-${symbol.toUpperCase()}`;
  const cached = getFromCache<SignaNewsArticle[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/news?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as SignaNewsRaw;
    if (!raw.ok) return null;

    const articles = raw.data ?? raw.articles ?? raw.news ?? [];
    const result: SignaNewsArticle[] = articles
      .map(a => ({
        title: a.title ?? '',
        url: a.url ?? '',
        publishedAt: a.publishedAt ?? '',
        source: a.source ?? '',
        sentiment: a.sentiment,
        summary: a.summary,
      }))
      .filter(a => a.title.length > 0);

    setToCache(cacheKey, result, 1800); // 30 min — news changes slowly
    return result;
  } catch {
    return null;
  }
}

// ── Thesis ────────────────────────────────────────────────────────────────────
// Calls /signal?include=thesis — same endpoint as daily signal but with extra fields

interface SignaThesisRaw {
  ok?: boolean;
  thesis?: string;
  bull?: { thesis?: string; points?: string[] };
  bear?: { thesis?: string; points?: string[] };
  data?: { thesis?: string };
}

export async function getSignaThesis(symbol: string): Promise<string | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-thesis-${symbol.toUpperCase()}`;
  const cached = getFromCache<string>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/signal?sym=${encodeURIComponent(symbol)}&include=thesis`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as SignaThesisRaw;
    if (!raw.ok) return null;

    // Try common response shapes
    const thesis =
      raw.thesis ??
      raw.bull?.thesis ??
      (raw.data as { thesis?: string } | undefined)?.thesis ??
      null;

    if (thesis) setToCache(cacheKey, thesis, CACHE_TTL_SIGNAL);
    return thesis;
  } catch {
    return null;
  }
}

// ── Congress signal ───────────────────────────────────────────────────────────

export interface CongressTrade {
  senator: string;
  party: string;
  chamber: string;
  transactionType: string;
  amount: string;
  transactionDate: string;
  filedDate: string;
}

export interface CongressData {
  ticker: string;
  trades: CongressTrade[];
  purchaseCount: number;
  saleCount: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}

interface CongressRaw {
  ok?: boolean;
  data?: Array<{
    senator?: string;
    representative?: string;
    member?: string;
    name?: string;
    party?: string;
    chamber?: string;
    transactionType?: string;
    transaction?: string;
    type?: string;
    amount?: string;
    transactionDate?: string;
    date?: string;
    filedDate?: string;
    filed?: string;
  }>;
  trades?: CongressRaw['data'];
  ticker?: string;
  summary?: string;
}

export async function getSignaCongress(symbol: string): Promise<CongressData | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-congress-${symbol.toUpperCase()}`;
  const cached = getFromCache<CongressData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/congress?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    // 429 = rate-limited; 403 = tier restriction — both are graceful nulls
    if (!res.ok) return null;
    const raw = await res.json() as CongressRaw;
    if (!raw.ok) return null;

    const items = raw.data ?? raw.trades ?? [];
    const trades: CongressTrade[] = items.map(t => ({
      senator: t.senator ?? t.representative ?? t.member ?? t.name ?? '—',
      party: t.party ?? '—',
      chamber: t.chamber ?? '—',
      transactionType: t.transactionType ?? t.transaction ?? t.type ?? '—',
      amount: t.amount ?? '—',
      transactionDate: t.transactionDate ?? t.date ?? '—',
      filedDate: t.filedDate ?? t.filed ?? '—',
    }));

    const purchaseCount = trades.filter(t =>
      t.transactionType.toLowerCase().includes('purchase') ||
      t.transactionType.toLowerCase().includes('buy'),
    ).length;
    const saleCount = trades.filter(t =>
      t.transactionType.toLowerCase().includes('sale') ||
      t.transactionType.toLowerCase().includes('sell'),
    ).length;
    const direction: CongressData['direction'] =
      purchaseCount > saleCount ? 'bullish' :
      saleCount > purchaseCount ? 'bearish' : 'neutral';

    const result: CongressData = {
      ticker: symbol,
      trades,
      purchaseCount,
      saleCount,
      direction,
      summary: raw.summary ?? `${trades.length} recent congressional trade${trades.length !== 1 ? 's' : ''} — ${purchaseCount} purchase${purchaseCount !== 1 ? 's' : ''}, ${saleCount} sale${saleCount !== 1 ? 's' : ''}.`,
    };
    setToCache(cacheKey, result, 3600); // 1 hr — congress filings don't change frequently
    return result;
  } catch {
    return null;
  }
}

// ── Options flow ─────────────────────────────────────────────────────────────

export interface OptionsFlowItem {
  time: string;
  expiry: string;
  strike: number;
  type: 'CALL' | 'PUT';
  premium: number;
  size: number;
  openInterest: number;
  impliedVolatility: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  unusual: boolean;
}

export interface OptionsFlowData {
  ticker: string;
  items: OptionsFlowItem[];
  callPutRatio: number;
  bullishPremium: number;
  bearishPremium: number;
  unusualCount: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}

export async function getOptionsFlow(symbol: string): Promise<OptionsFlowData | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-options-${symbol.toUpperCase()}`;
  const cached = getFromCache<OptionsFlowData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/options?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as { ok?: boolean; data?: Partial<OptionsFlowData> };
    if (!raw.ok || !raw.data) return null;
    const result = raw.data as OptionsFlowData;
    setToCache(cacheKey, result, 300); // 5 min cache for options flow
    return result;
  } catch {
    return null;
  }
}

// ── Dark pool ────────────────────────────────────────────────────────────────

export interface DarkpoolTrade {
  time: string;
  price: number;
  size: number;
  premium: number;
  exchange: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface DarkpoolData {
  ticker: string;
  trades: DarkpoolTrade[];
  totalVolume: number;
  darkpoolPercent: number;
  avgPrice: number;
  bullishVolume: number;
  bearishVolume: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}

export async function getDarkpool(symbol: string): Promise<DarkpoolData | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-darkpool-${symbol.toUpperCase()}`;
  const cached = getFromCache<DarkpoolData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/darkpool?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as { ok?: boolean; data?: Partial<DarkpoolData> };
    if (!raw.ok || !raw.data) return null;
    const result = raw.data as DarkpoolData;
    setToCache(cacheKey, result, 300);
    return result;
  } catch {
    return null;
  }
}

// ── Gamma exposure ───────────────────────────────────────────────────────────

export interface GammaLevel {
  strike: number;
  gamma: number;
  callGamma: number;
  putGamma: number;
  netGamma: number;
}

export interface GammaData {
  ticker: string;
  currentPrice: number;
  netGamma: number;
  gammaFlipPoint: number | null;
  keyLevels: GammaLevel[];
  dominantFlow: 'call' | 'put' | 'neutral';
  pinRisk: boolean;
  direction: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}

export async function getGammaExposure(symbol: string): Promise<GammaData | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-gamma-${symbol.toUpperCase()}`;
  const cached = getFromCache<GammaData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/gamma?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as { ok?: boolean; data?: Partial<GammaData> };
    if (!raw.ok || !raw.data) return null;
    const result = raw.data as GammaData;
    setToCache(cacheKey, result, 900);
    return result;
  } catch {
    return null;
  }
}

// ── Fundamentals ─────────────────────────────────────────────────────────────

export interface FundamentalsData {
  ticker: string;
  marketCap: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  revenueGrowthYoy: number | null;
  earningsGrowthYoy: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashFlowYield: number | null;
  dividendYield: number | null;
  eps: number | null;
  epsNextYear: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetHigh: number | null;
  priceTargetLow: number | null;
  insiderOwnership: number | null;
  institutionalOwnership: number | null;
  shortFloat: number | null;
}

export async function getFundamentals(symbol: string): Promise<FundamentalsData | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  const cacheKey = `signa-fundamentals-${symbol.toUpperCase()}`;
  const cached = getFromCache<FundamentalsData>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${SIGNA_BASE}/fundamentals?sym=${encodeURIComponent(symbol)}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const raw = await res.json() as { ok?: boolean; data?: Partial<FundamentalsData> };
    if (!raw.ok || !raw.data) return null;
    const result = raw.data as FundamentalsData;
    setToCache(cacheKey, result, 3600); // 1 hr cache — fundamentals change slowly
    return result;
  } catch {
    return null;
  }
}

// ── Curated flow (via MCP Streamable HTTP) ───────────────────────────────────
// Signa exposes curated-flow only through its MCP endpoint, not a REST path.
// We call it using the MCP JSON-RPC protocol over HTTP and parse the SSE response.

import type { CuratedFlowEvent } from '../services/flowScoring.js';

const SIGNA_MCP_URL = 'https://app.getsigna.ai/api/mcp/sse';

interface CuratedFlowPayload {
  events?: CuratedFlowEvent[];
  pagination?: { has_more?: boolean };
}

export interface CuratedFlowResult {
  events: CuratedFlowEvent[];
  hasMore: boolean;
}

export async function getCuratedFlow(
  symbol: string,
  opts: { minScore?: number; limit?: number } = {},
): Promise<CuratedFlowResult | null> {
  if (!process.env.SIGNA_API_KEY) return null;

  const { minScore = 60, limit = 20 } = opts;
  const cacheKey = `signa-curated-${symbol.toUpperCase()}-${minScore}-${limit}`;
  const cached = getFromCache<CuratedFlowResult>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(SIGNA_MCP_URL, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_curated_flow',
          arguments: { symbol, min_score: minScore, limit },
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[signa] curated-flow ${symbol}: HTTP ${res.status}`);
      return null;
    }

    const text = await res.text();
    // SSE response: "event: message\ndata: {...}\n"
    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    if (!dataLine) return null;

    const rpc = JSON.parse(dataLine.slice(5).trim()) as {
      result?: { content?: Array<{ text?: string }> };
    };
    const raw = JSON.parse(rpc.result?.content?.[0]?.text ?? 'null') as CuratedFlowPayload | null;
    if (!raw) return null;

    const result: CuratedFlowResult = {
      events: raw.events ?? [],
      hasMore: raw.pagination?.has_more ?? false,
    };
    setToCache(cacheKey, result, 300); // 5 min
    return result;
  } catch (err) {
    console.warn(`[signa] curated-flow ${symbol} error:`, err);
    return null;
  }
}

// ── Market-wide MCP tool helper ───────────────────────────────────────────────

async function callMcpTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!process.env.SIGNA_API_KEY) return null;
  try {
    const res = await fetch(SIGNA_MCP_URL, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    if (!res.ok) { console.warn(`[signa-mcp] ${toolName}: HTTP ${res.status}`); return null; }
    const text = await res.text();
    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    if (!dataLine) return null;
    const rpc = JSON.parse(dataLine.slice(5).trim()) as { result?: { content?: Array<{ text?: string }> } };
    return JSON.parse(rpc.result?.content?.[0]?.text ?? 'null') as T;
  } catch (err) {
    console.warn(`[signa-mcp] ${toolName} error:`, err);
    return null;
  }
}

// ── Market-wide options flow ──────────────────────────────────────────────────

export interface MarketFlowItem {
  ticker: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  premium: number;
  volume: number;
  open_interest: number;
  vol_oi_ratio: number;
  has_sweep: boolean;
  has_floor: boolean;
  underlying_price: number;
  alert_rule: string;
  start_time: number;
}

export interface MarketFlowResponse {
  flow: MarketFlowItem[];
}

export async function getMarketOptionsFlow(limit = 50): Promise<MarketFlowResponse | null> {
  const cacheKey = `signa-mkt-flow-${limit}`;
  const cached = getFromCache<MarketFlowResponse>(cacheKey);
  if (cached) return cached;

  const raw = await callMcpTool<{ flow?: unknown[] }>('get_options_flow', { limit });
  if (!raw?.flow) return null;

  const result: MarketFlowResponse = {
    flow: raw.flow.map(item => {
      const i = item as Record<string, unknown>;
      return {
        ticker:           String(i.ticker ?? ''),
        type:             (String(i.type ?? 'call').toUpperCase()) as 'CALL' | 'PUT',
        strike:           parseFloat(String(i.strike ?? 0)),
        expiry:           String(i.expiry ?? ''),
        premium:          parseFloat(String(i.premium ?? 0)),
        volume:           Number(i.volume ?? 0),
        open_interest:    Number(i.open_interest ?? 0),
        vol_oi_ratio:     parseFloat(String(i.vol_oi_ratio ?? 0)),
        has_sweep:        Boolean(i.has_sweep),
        has_floor:        Boolean(i.has_floor),
        underlying_price: parseFloat(String(i.underlying_price ?? 0)),
        alert_rule:       String(i.alert_rule ?? ''),
        start_time:       Number(i.start_time ?? 0),
      };
    }),
  };
  setToCache(cacheKey, result, 120);
  return result;
}

// ── Market-wide dark pool ─────────────────────────────────────────────────────

export interface DpPrint {
  ticker: string;
  price: number;
  size: number;
  volume: number;
  premium: number;
  executed_at: string;
  nbbo_bid: number;
  nbbo_ask: number;
  canceled: boolean;
  dp_direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  dp_score: number;
}

export interface MarketDpResponse {
  prints: DpPrint[];
}

function scoreDpPrint(
  price: number,
  nbbo_bid: number,
  nbbo_ask: number,
  premium: number,
  size: number,
): { direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; score: number } {
  let score = 0;
  const spread = nbbo_ask - nbbo_bid;
  const mid = (nbbo_bid + nbbo_ask) / 2;

  if (spread > 0) {
    if (price >= nbbo_ask - spread * 0.1)      score += 2;
    else if (price <= nbbo_bid + spread * 0.1) score -= 2;
    else if (price > mid)                       score += 1;
    else if (price < mid)                       score -= 1;
  }

  if (premium >= 1_000_000)      score += score >= 0 ? 2 : -2;
  else if (premium >= 500_000)   score += score >= 0 ? 1 : -1;

  if (size >= 10_000)            score += score >= 0 ? 1 : -1;
  else if (size >= 1_000)        score += score >= 0 ? 0.5 : -0.5;

  const direction = score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'NEUTRAL';
  return { direction, score: Math.round(score * 10) / 10 };
}

export async function getMarketDarkPool(limit = 50): Promise<MarketDpResponse | null> {
  const cacheKey = `signa-mkt-dp-${limit}`;
  const cached = getFromCache<MarketDpResponse>(cacheKey);
  if (cached) return cached;

  const raw = await callMcpTool<{ prints?: unknown[] }>('get_dark_pool', { limit });
  if (!raw?.prints) return null;

  const result: MarketDpResponse = {
    prints: raw.prints
      .filter(item => !(item as Record<string, unknown>).canceled)
      .map(item => {
        const p = item as Record<string, unknown>;
        const price    = parseFloat(String(p.price ?? 0));
        const nbbo_bid = parseFloat(String(p.nbbo_bid ?? 0));
        const nbbo_ask = parseFloat(String(p.nbbo_ask ?? 0));
        const premium  = parseFloat(String(p.premium ?? 0));
        const size     = Number(p.size ?? 0);
        const { direction, score } = scoreDpPrint(price, nbbo_bid, nbbo_ask, premium, size);
        return {
          ticker:      String(p.ticker ?? ''),
          price,
          size,
          volume:      Number(p.volume ?? 0),
          premium,
          executed_at: String(p.executed_at ?? ''),
          nbbo_bid,
          nbbo_ask,
          canceled:    Boolean(p.canceled),
          dp_direction: direction,
          dp_score:    score,
        };
      }),
  };
  setToCache(cacheKey, result, 120);
  return result;
}

// ── Market scanner ────────────────────────────────────────────────────────────

export interface ScanItem {
  ticker: string;
  signal: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  grade: string;
  confidence: number;
  reasons: string[];
}

export interface MarketScanResponse {
  results: ScanItem[];
  count: number;
}

export async function getMarketScan(opts: {
  direction?: 'bullish' | 'bearish';
  minScore?: number;
  limit?: number;
} = {}): Promise<MarketScanResponse | null> {
  const { direction, minScore, limit = 20 } = opts;
  const cacheKey = `signa-scan-${direction ?? 'all'}-${minScore ?? 0}-${limit}`;
  const cached = getFromCache<MarketScanResponse>(cacheKey);
  if (cached) return cached;

  const args: Record<string, unknown> = { limit };
  if (direction) args.direction = direction;
  if (minScore) args.min_score = minScore;

  const raw = await callMcpTool<{ results?: unknown[]; count?: number }>('scan_symbols', args);
  if (!raw) return null;

  const result: MarketScanResponse = {
    results: (raw.results ?? []).map(item => {
      const r = item as Record<string, unknown>;
      return {
        ticker:     String(r.ticker ?? ''),
        signal:     String(r.signal ?? ''),
        direction:  (String(r.direction ?? 'NEUTRAL').toUpperCase()) as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        score:      Number(r.score ?? 0),
        grade:      String(r.grade ?? '—'),
        confidence: Number(r.confidence ?? 0),
        reasons:    Array.isArray(r.reasons) ? r.reasons.map(String) : [],
      };
    }),
    count: raw.count ?? 0,
  };
  setToCache(cacheKey, result, 300);
  return result;
}

// ── GEX via MCP (richer than REST — includes call/put walls, regime) ──────────

export interface GexLevel {
  strike: number;
  net_gex: number;
}

export interface GexData {
  symbol: string;
  current_price: number;
  gamma_flip: number | null;
  call_wall: number | null;
  put_wall: number | null;
  above_flip: boolean | null;
  net_gex: number | null;
  levels: GexLevel[];
}

export async function getGexMcp(symbol: string): Promise<GexData | null> {
  const cacheKey = `signa-gex-mcp-${symbol.toUpperCase()}`;
  const cached = getFromCache<GexData>(cacheKey);
  if (cached) return cached;

  const raw = await callMcpTool<Record<string, unknown>>('get_gex', { symbol });
  if (!raw) return null;

  // Signa returns netGexByStrike array with { strike, expiry, netGex } entries
  const levels: GexLevel[] = [];
  const rawLevels = raw.netGexByStrike ?? raw.levels ?? raw.strikes ?? raw.key_levels ?? raw.keyLevels;
  if (Array.isArray(rawLevels)) {
    for (const lv of rawLevels) {
      const l = lv as Record<string, unknown>;
      const strike = Number(l.strike ?? l.price ?? 0);
      const net_gex = Number(l.netGex ?? l.net_gex ?? l.netGamma ?? l.gamma ?? 0);
      if (strike > 0) levels.push({ strike, net_gex });
    }
  }

  const result: GexData = {
    symbol: symbol.toUpperCase(),
    current_price: Number(raw.current_price ?? raw.currentPrice ?? raw.price ?? 0),
    gamma_flip:    raw.gammaFlipLevel != null ? Number(raw.gammaFlipLevel) :
                   raw.gamma_flip != null ? Number(raw.gamma_flip) :
                   raw.gammaFlipPoint != null ? Number(raw.gammaFlipPoint) : null,
    call_wall:     raw.callWall != null ? Number(raw.callWall) :
                   raw.call_wall != null ? Number(raw.call_wall) : null,
    put_wall:      raw.putWall != null ? Number(raw.putWall) :
                   raw.put_wall != null ? Number(raw.put_wall) : null,
    above_flip:    raw.regimeAboveFlip != null ? Boolean(raw.regimeAboveFlip) :
                   raw.above_flip != null ? Boolean(raw.above_flip) :
                   raw.aboveFlip != null ? Boolean(raw.aboveFlip) : null,
    net_gex:       raw.net_gex != null ? Number(raw.net_gex) :
                   raw.netGamma != null ? Number(raw.netGamma) :
                   levels.length ? levels.reduce((s, l) => s + l.net_gex, 0) : null,
    levels,
  };

  setToCache(cacheKey, result, 900);
  return result;
}

// ── Synthesize options insight ────────────────────────────────────────────────

export interface OptionsInsight {
  flow: OptionsFlowData | null;
  darkpool: DarkpoolData | null;
  gamma: GammaData | null;
  overallDirection: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  keyPoints: string[];
}

export function synthesizeOptionsInsight(
  flow: OptionsFlowData | null,
  darkpool: DarkpoolData | null,
  gamma: GammaData | null,
  currentPrice: number,
  symbol: string,
): OptionsInsight {
  const signals: ('bullish' | 'bearish' | 'neutral')[] = [];
  const points: string[] = [];

  if (flow) {
    signals.push(flow.direction);
    const cpRatio = flow.callPutRatio.toFixed(2);
    points.push(`Options flow: ${flow.direction.toUpperCase()} — C/P ratio ${cpRatio}${flow.unusualCount > 0 ? `, ${flow.unusualCount} unusual trade${flow.unusualCount > 1 ? 's' : ''}` : ''}`);
  }

  if (darkpool) {
    signals.push(darkpool.direction);
    const dpPct = darkpool.darkpoolPercent.toFixed(1);
    points.push(`Dark pool: ${darkpool.direction.toUpperCase()} — ${dpPct}% of volume off-exchange, avg fill $${darkpool.avgPrice.toFixed(2)}`);
  }

  if (gamma) {
    signals.push(gamma.direction);
    const flipStr = gamma.gammaFlipPoint != null
      ? `, flip point $${gamma.gammaFlipPoint.toFixed(2)} (${currentPrice > gamma.gammaFlipPoint ? 'above — positive gamma' : 'below — negative gamma'})`
      : '';
    points.push(`Gamma exposure: ${gamma.direction.toUpperCase()}${flipStr}${gamma.pinRisk ? ' · pin risk at nearby strike' : ''}`);
  }

  if (points.length === 0) {
    return { flow, darkpool, gamma, overallDirection: 'neutral', confidence: 'low', summary: 'No options data available.', keyPoints: [] };
  }

  const bullCount = signals.filter(s => s === 'bullish').length;
  const bearCount = signals.filter(s => s === 'bearish').length;
  const overallDirection = bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral';
  const agreementCount = Math.max(bullCount, bearCount);
  const confidence: 'high' | 'medium' | 'low' = agreementCount === signals.length ? 'high' : agreementCount >= signals.length - 1 ? 'medium' : 'low';

  const dirLabel = overallDirection.toUpperCase();
  const confLabel = confidence.toUpperCase();
  const summary = `${symbol} options activity points ${dirLabel} with ${confLabel} confidence across ${signals.length} data source${signals.length > 1 ? 's' : ''}.`;

  return { flow, darkpool, gamma, overallDirection, confidence, summary, keyPoints: points };
}

export function formatSignaMarketAnalysis(
  signal: SignaData,
  marketQualityScore: number,
  vix: number,
  regime: string,
  topSectors: string[],
  bottomSectors: string[],
): string {
  const allTriggers = [...signal.triggers, ...signal.signaTriggers];
  const riskLine = signal.riskFactors.length > 0
    ? `\n⚠ RISK FACTORS: ${signal.riskFactors.join(' · ')}`
    : '';

  const triggerLines = allTriggers.length > 0
    ? `\nACTIVE SIGNALS (${allTriggers.length}):\n${allTriggers.map(t => `▶ ${t.name}: ${t.description}`).join('\n')}`
    : '';

  const reasonLines = signal.engineReasons.length > 0
    ? `\n30+ MODEL CONSENSUS:\n${signal.engineReasons.map(r => `→ ${r}`).join('\n')}`
    : '';

  return `MARKET ANALYSIS — SIGNA.AI · SPY
${signal.direction} · Grade ${signal.grade} · ${signal.confidence}% confidence · Stage ${signal.stage}: ${signal.stageDescription}
Conviction: ${signal.conviction}% · Risk: ${signal.riskRating} · Score: ${signal.overallScore.toFixed(1)}/100${riskLine}
${reasonLines}${triggerLines}

ENVIRONMENT: Market Quality ${marketQualityScore}/100 · VIX ${vix.toFixed(1)} · Regime: ${regime.toUpperCase()}
Leading: ${topSectors.join(', ')} | Lagging: ${bottomSectors.join(', ')}`;
}
