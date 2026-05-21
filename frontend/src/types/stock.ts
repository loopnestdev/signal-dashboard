export type StockDecision = 'YES_BUY' | 'YES_SHORT' | 'CAUTION' | 'NO';

export interface StockMetric {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'flat';
  note: string;
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
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  // Weekly signal (tf=1W engine)
  weeklyDirection?: string;
  weeklyGrade?: string;
  weeklyConfidence?: number;
  // Analysis endpoint
  actionCard?: SignaActionCard;
  sentiment?: SignaSentiment;
  // Thesis
  thesis?: string;
  // News
  newsItems?: SignaNewsArticle[];
}

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
  isExtension: boolean;
}

export interface MovingAverages {
  ema5: number | null;
  ema21: number | null;
  ema55: number | null;
  sma20: number | null;
  sma200: number | null;
  signaEma20: number | null;
  signaEma50: number | null;
  signaEma200: number | null;
}

// ── Options flow ──────────────────────────────────────────────────────────────
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

export interface OptionsInsight {
  flow: OptionsFlowData | null;
  darkpool: DarkpoolData | null;
  gamma: GammaData | null;
  overallDirection: 'bullish' | 'bearish' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  keyPoints: string[];
}

// ── Fundamentals ──────────────────────────────────────────────────────────────
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

export interface StockResponse {
  symbol: string;
  name: string;
  sector: string | null;
  sectorEtf: string | null;
  exchange: string | null;
  price: number;
  change1d: number;
  stockScore: number;
  sectorScore: number;
  marketScore: number;
  compositeScore: number;
  decision: StockDecision;
  regime: string;
  metrics: StockMetric[];
  analysis: string;
  signa: SignaData | null;
  fibonacci: FibLevel[] | null;
  movingAverages: MovingAverages | null;
  optionsInsight: OptionsInsight | null;
  fundamentals: FundamentalsData | null;
  timestamp: string;
}
