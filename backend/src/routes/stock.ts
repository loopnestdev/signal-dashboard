import { Router } from 'express';
import { getHistoryAndQuote, getStockProfile } from '../lib/yahooClient.js';
import { getFromCache } from '../lib/cache.js';
import {
  getSignaSignal,
  getSignaWeeklySignal,
  getSignaAnalysis,
  getSignaThesis,
  getSignaNews,
  getSignaCongress,
  getOptionsFlow,
  getDarkpool,
  getGammaExposure,
  getFundamentals,
  synthesizeOptionsInsight,
  type SignaData,
} from '../lib/signaClient.js';
import {
  SECTOR_TO_ETF,
  computeStockTechnicalScore,
  computeSectorETFScore,
  getStockDecision,
  buildStockAnalysis,
  computeFibonacci,
  computeMovingAverages,
  type StockSectorData,
} from '../services/stockScoring.js';

const router = Router();
const MARKET_CACHE_KEY = 'market-data-v1';

interface CachedMarket {
  marketQualityScore: number;
  regime: string;
  sectors: StockSectorData[];
}

router.get('/stock/:ticker', async (req, res) => {
  const { ticker } = req.params;

  if (!/^[A-Za-z^.\-]{1,10}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker symbol' });
  }

  const symbol = ticker.toUpperCase();

  try {
    const [stockData, profile, signaData, signaWeekly, signaAnalysis, signaThesis, signaNews, signaCongress, optionsFlow, darkpoolData, gammaData, fundamentalsData] = await Promise.all([
      getHistoryAndQuote(symbol, '1y'),
      getStockProfile(symbol),
      getSignaSignal(symbol),
      getSignaWeeklySignal(symbol),
      getSignaAnalysis(symbol),
      getSignaThesis(symbol),
      getSignaNews(symbol),
      getSignaCongress(symbol),
      getOptionsFlow(symbol),
      getDarkpool(symbol),
      getGammaExposure(symbol),
      getFundamentals(symbol),
    ]);

    const cachedMarket = getFromCache<CachedMarket>(MARKET_CACHE_KEY);
    const marketScore = cachedMarket?.marketQualityScore ?? 50;
    const regime = cachedMarket?.regime ?? 'chop';

    const sectorEtf = profile.sector ? (SECTOR_TO_ETF[profile.sector] ?? null) : null;
    const sectorData = sectorEtf && cachedMarket?.sectors
      ? cachedMarket.sectors.find(s => s.ticker === sectorEtf)
      : undefined;

    const { score: stockScore, metrics, isBearish } = computeStockTechnicalScore(
      stockData.history,
      stockData.price,
    );
    const sectorScore = computeSectorETFScore(sectorData);

    // Blend Signa's overallScore if available (20% weight)
    const baseComposite = stockScore * 0.40 + sectorScore * 0.30 + marketScore * 0.30;
    const compositeScore = signaData
      ? Math.round(baseComposite * 0.80 + signaData.overallScore * 0.20)
      : Math.round(baseComposite);

    // Merge weekly signal, analysis, and news into signaData
    const enrichedSigna: SignaData | null = signaData ? {
      ...signaData,
      weeklyDirection: signaWeekly?.direction,
      weeklyGrade: signaWeekly?.grade,
      weeklyConfidence: signaWeekly?.confidence,
      actionCard: signaAnalysis?.actionCard ?? undefined,
      sentiment: signaAnalysis?.sentiment ?? undefined,
      thesis: signaThesis ?? undefined,
      newsItems: signaNews ?? undefined,
      congress: signaCongress ?? undefined,
    } : null;

    // Engine uses BULLISH/BEARISH; data field uses LONG/SHORT/WAIT — handle both
    const signaShort = signaData?.direction === 'SHORT'
      || signaData?.direction === 'BEARISH'
      || signaData?.action === 'SELL';
    const decision = getStockDecision(
      compositeScore, marketScore, regime, isBearish || signaShort,
      signaData?.direction, signaData?.confidence, signaData?.grade,
    );

    const analysis = buildStockAnalysis(
      symbol, decision, compositeScore, stockScore, sectorScore, marketScore, sectorEtf, regime,
    );

    const fibonacci = computeFibonacci(stockData.history);
    const movingAverages = computeMovingAverages(stockData.history, signaData);
    const optionsInsight = synthesizeOptionsInsight(optionsFlow, darkpoolData, gammaData, stockData.price, symbol);

    return res.json({
      symbol,
      name: profile.name,
      sector: profile.sector,
      sectorEtf,
      exchange: profile.exchange,
      price: stockData.price,
      change1d: stockData.change1d,
      stockScore,
      sectorScore,
      marketScore,
      compositeScore,
      decision,
      regime,
      metrics,
      analysis,
      signa: enrichedSigna,
      fibonacci,
      movingAverages,
      optionsInsight,
      fundamentals: fundamentalsData,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[stock error] ${symbol}:`, err);
    return res.status(500).json({ error: `Failed to fetch data for ${symbol}`, detail: String(err) });
  }
});

export default router;
