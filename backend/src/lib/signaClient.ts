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

export interface SignaData {
  direction: string;
  confidence: number;
  grade: string;
  action: string;
  riskRating: string;
  conviction: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  stage: number;
  stageDescription: string;
  riskScore: number;
  riskFactors: string[];
  triggers: SignaTrigger[];
  signaTriggers: SignaTrigger[];
  patterns: SignaPattern[];
  engineReasons: string[];
  tier: string;
  overallScore: number;
  rsi: number;
  adx: number;
  // EMAs from Signa signal data
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
}

interface SignaRaw {
  ok: boolean;
  engine?: {
    direction?: string;
    confidence?: number;
    grade?: string;
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
  error?: string;
}

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
    if (!raw.ok || !raw.data) return null;

    const d = raw.data;
    const result: SignaData = {
      direction: d.direction ?? raw.engine?.direction ?? 'WAIT',
      confidence: d.confidence ?? raw.engine?.confidence ?? 0,
      grade: raw.signa?.grade ?? raw.engine?.grade ?? '—',
      action: raw.signa?.action ?? d.direction ?? '—',
      riskRating: raw.signa?.riskRating ?? '—',
      conviction: raw.signa?.conviction ?? 0,
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
      signaTriggers: (raw.signa?.triggers ?? []).map(t => ({
        name: t.name,
        description: t.description,
        strength: t.strength,
        type: t.type ?? 'proprietary',
      })),
      patterns: d.patterns ?? [],
      engineReasons: raw.engine?.reasons ?? [],
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
