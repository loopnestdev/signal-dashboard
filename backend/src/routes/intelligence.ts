import { Router } from 'express';
import {
  getMarketOptionsFlow,
  getMarketDarkPool,
  getMarketScan,
  getGexMcp,
} from '../lib/signaClient.js';

const router = Router();

router.get('/options-flow', async (_req, res) => {
  const data = await getMarketOptionsFlow(50);
  res.json(data ?? { flow: [] });
});

router.get('/dark-pool', async (_req, res) => {
  const data = await getMarketDarkPool(50);
  res.json(data ?? { prints: [] });
});

router.get('/market-scan', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const dir = req.query.direction as 'bullish' | 'bearish' | undefined;
  const data = await getMarketScan({ limit, direction: dir });
  res.json(data ?? { results: [], count: 0 });
});

router.get('/gamma-gex', async (_req, res) => {
  const [spy, qqq, iwm] = await Promise.all([
    getGexMcp('SPY'),
    getGexMcp('QQQ'),
    getGexMcp('IWM'),
  ]);
  res.json({ spy, qqq, iwm });
});

export default router;
