import { Router } from 'express';
import { getFromCache, setToCache } from '../lib/cache.js';
import { fetchMarketData } from '../services/marketData.js';
import {
  scoreVolatility, scoreTrend, scoreBreadth, scoreMomentum, scoreMacro,
  scoreExecutionWindow, computeMarketQualityScore, getDecision,
} from '../services/scoring.js';
import { generateAnalysis } from '../services/ai.js';

const router = Router();
const CACHE_KEY = 'market-data-v1';

router.get('/market-data', async (req, res) => {
  try {
    const cached = getFromCache<object>(CACHE_KEY);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    const raw = await fetchMarketData();

    const vol = scoreVolatility(raw);
    const trend = scoreTrend(raw);
    const breadth = scoreBreadth(raw);
    const momentum = scoreMomentum(raw);
    const macro = scoreMacro(raw);

    const marketQualityScore = computeMarketQualityScore(
      vol.score, trend.score, breadth.score, momentum.score, macro.score
    );
    const executionWindowScore = scoreExecutionWindow(raw);
    const decision = getDecision(marketQualityScore, raw.regime);

    const analysis = await generateAnalysis({
      marketQualityScore,
      decision,
      vix: raw.vix.current,
      regime: raw.regime,
      volatilityScore: vol.score,
      trendScore: trend.score,
      breadthScore: breadth.score,
      momentumScore: momentum.score,
      macroScore: macro.score,
      topSectors: raw.top3Sectors,
      bottomSectors: raw.bottom3Sectors,
      tnx: raw.macro.tnx,
      fedStance: raw.macro.fedStance,
      executionWindowScore,
    });

    // Build ticker items — SPY/QQQ are pinned as index entries; exclude from sector loop
    const PINNED_SYMBOLS = new Set(['SPY', 'QQQ', 'IWM']);
    const ticker = [
      { symbol: 'SPY', price: raw.spy.current, change: raw.spy.return1d, type: 'index' },
      { symbol: 'QQQ', price: raw.qqq.current, change: raw.qqq.return1d, type: 'index' },
      { symbol: 'IWM', price: raw.iwm.current, change: 0, type: 'index' },
      { symbol: 'VIX', price: raw.vix.current, change: 0, type: 'vix' },
      { symbol: 'TNX', price: raw.macro.tnx, change: 0, type: 'rate' },
      ...raw.sectors
        .filter(s => !PINNED_SYMBOLS.has(s.ticker))
        .map(s => ({ symbol: s.ticker, price: s.price, change: s.change1d, type: 'sector' })),
    ];

    const alerts: Array<{ type: string; message: string; severity: string }> = [];
    if (raw.macro.fomcEvent) {
      alerts.push({
        type: 'FOMC',
        message: `FOMC rate decision in ${raw.macro.fomcEvent.hoursUntil}h — ${raw.macro.fomcEvent.date}. Reduce position sizing.`,
        severity: 'warning',
      });
    }
    if (raw.vix.current > 30) {
      alerts.push({
        type: 'VIX',
        message: `VIX at ${raw.vix.current.toFixed(1)} — extreme fear. Capital preservation mode.`,
        severity: 'danger',
      });
    }

    const result = {
      timestamp: new Date().toISOString(),
      decision,
      marketQualityScore,
      executionWindowScore,
      categories: { volatility: vol, trend, breadth, momentum, macro },
      vix: raw.vix,
      spy: { ...raw.spy, closes: undefined },
      qqq: raw.qqq,
      iwm: raw.iwm,
      macroData: raw.macro,
      breadthData: raw.breadth,
      sectors: [...raw.sectors].sort((a, b) => b.change5d - a.change5d),
      subsectors: [...raw.subsectors].sort((a, b) => b.change5d - a.change5d),
      regime: raw.regime,
      top3Sectors: raw.top3Sectors,
      bottom3Sectors: raw.bottom3Sectors,
      analysis,
      ticker,
      alerts,
    };

    setToCache(CACHE_KEY, result);
    res.json({ ...result, fromCache: false });
  } catch (err) {
    console.error('[market-data error]', err);
    res.status(500).json({ error: 'Failed to fetch market data', detail: String(err) });
  }
});

router.post('/refresh', (req, res) => {
  // Invalidate cache by setting TTL to 0 — next GET will re-fetch
  setToCache(CACHE_KEY, null, 0);
  res.json({ ok: true });
});

export default router;
