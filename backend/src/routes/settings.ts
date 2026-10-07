import { Router } from 'express';
import { requireAdmin } from '../lib/adminAuth.js';
import { isSupabaseAdminConfigured } from '../lib/supabaseRest.js';
import { DEFAULT_SETTINGS, RULES_VERSION, getSettings, riskPerTrade, saveSettings, validateSettings, type TradingSettings } from '../lib/settings.js';
import { providerKeyStatus } from '../services/llm.js';

const router = Router();

const PREVIEW_BALANCES = [8_000, 10_000, 20_000, 40_000, 60_000, 100_000];

function payload(settings: TradingSettings, updatedAt: string | null) {
  return {
    settings,
    defaults: DEFAULT_SETTINGS,
    updatedAt,
    rulesVersion: RULES_VERSION,
    aiKeys: providerKeyStatus(),
    riskPreview: PREVIEW_BALANCES.map(balance => ({ balance, risk: riskPerTrade(balance, settings.sizing) })),
  };
}

router.get('/settings', async (_req, res) => {
  const { settings, updatedAt } = await getSettings();
  res.json(payload(settings, updatedAt));
});

router.put('/settings', requireAdmin, async (req, res) => {
  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ error: 'Settings storage not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }
  const { settings, errors } = validateSettings(req.body);
  if (!settings) return res.status(400).json({ error: 'Invalid settings', details: errors });
  try {
    await saveSettings(settings, String(res.locals.adminEmail ?? 'unknown'));
    res.json(payload(settings, new Date().toISOString()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'save failed';
    if (message.includes('PGRST205')) {
      return res.status(503).json({ error: 'Settings table not found - run supabase/migrations/20261007_app_settings.sql' });
    }
    console.warn('[settings] save failed:', err);
    res.status(500).json({ error: message });
  }
});

export default router;
