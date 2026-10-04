import { Router } from 'express';
import { getFromCache, setToCache } from '../lib/cache.js';
import { isSupabaseAdminConfigured, selectRows } from '../lib/supabaseRest.js';
import { scannerConfig } from '../collector/scanner.js';

const router = Router();

router.get('/scanner', async (req, res) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'Scanner storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  const requested = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  const cacheKey = `scanner-${requested ?? 'latest'}`;
  const cached = getFromCache<object>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const dates = await selectRows<{ trade_date: string }>('scanner_candidates', 'select=trade_date&order=trade_date.desc&limit=1');
    const tradeDate = requested ?? dates[0]?.trade_date ?? null;

    const [candidates, tracked, signa] = await Promise.all([
      tradeDate
        ? selectRows<Record<string, unknown>>('scanner_candidates', `select=*&trade_date=eq.${tradeDate}&order=score.desc&limit=500`)
        : Promise.resolve([]),
      selectRows<{ symbol: string; source: string; expires_at: string | null; last_score: number | null; promoted_at: string | null }>(
        'tracked_symbols', 'select=symbol,source,expires_at,last_score,promoted_at&active=eq.true&order=symbol',
      ),
      tradeDate
        ? selectRows<Record<string, unknown>>('signa_scans', `select=symbol,direction,signal,score,grade&trade_date=eq.${tradeDate}&order=score.desc&limit=100`)
        : Promise.resolve([]),
    ]);

    const cfg = scannerConfig();
    const payload = {
      tradeDate,
      runAt: (candidates[0]?.run_at as string | undefined) ?? null,
      config: {
        promoteScore: cfg.promoteScore,
        maxPromoted: cfg.maxPromoted,
        minPremium: cfg.minPremium,
        minTotalPremium: cfg.minTotalPremium,
        minPrice: cfg.minPrice,
        minOpenInterest: cfg.minOpenInterest,
        minDte: cfg.minDte,
        promotionDays: cfg.promotionDays,
      },
      candidates,
      core: tracked.filter(t => t.source !== 'scanner').map(t => t.symbol),
      promoted: tracked.filter(t => t.source === 'scanner'),
      signa: {
        bullish: signa.filter(s => s.direction === 'BULLISH').slice(0, 15),
        bearish: signa.filter(s => s.direction === 'BEARISH').slice(0, 15),
      },
    };
    setToCache(cacheKey, payload, 60);
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'scanner failed';
    if (message.includes('PGRST205') || message.includes('42703')) {
      return res.status(503).json({ error: 'Scanner tables not found - run supabase/migrations/20261005_flow_scanner.sql in the Supabase SQL editor' });
    }
    console.warn('[scanner] route failed:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
