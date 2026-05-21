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
