import { Router } from 'express';
import { getCuratedFlow } from '../lib/signaClient.js';
import { scoreFlowEvent, summarizeFlow } from '../services/flowScoring.js';

const router = Router();

router.get('/unusual-flow', async (req, res) => {
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
  if (!ticker) {
    res.status(400).json({ error: 'ticker query param required' });
    return;
  }

  const raw = await getCuratedFlow(ticker, { minScore: 60, limit: 20 });
  if (!raw || raw.events.length === 0) {
    res.json({ events: [], summary: null });
    return;
  }

  const scored = raw.events.map(scoreFlowEvent);
  scored.sort((a, b) => {
    const diff = b.flow_score - a.flow_score;
    if (diff !== 0) return diff;
    return b.flow_events.premium_size - a.flow_events.premium_size;
  });
  const summary = summarizeFlow(scored);

  res.json({ events: scored, summary });
});

export default router;
