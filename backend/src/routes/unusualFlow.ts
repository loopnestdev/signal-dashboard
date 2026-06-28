import { Router } from 'express';
import { getCuratedFlow } from '../lib/signaClient.js';
import { scoreFlowEvent, summarizeFlow } from '../services/flowScoring.js';
import type { ScoredFlowEvent } from '../services/flowScoring.js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

function sbEnabled() {
  return !!(SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY));
}

function sbReadHeaders() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Accept-Profile': 'signal',
  };
}

function sbWriteHeaders() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Profile': 'signal',
    'Content-Type': 'application/json',
    Prefer: 'resolution=ignore-duplicates,return=minimal',
  };
}

async function fetchHistorical(ticker: string): Promise<ScoredFlowEvent[]> {
  if (!sbEnabled()) return [];
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      select: 'scored_event',
      ticker: `eq.${ticker}`,
      captured_at: `gte.${cutoff}`,
      order: 'captured_at.desc',
      limit: '100',
    });
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/flow_events?${params}`, {
      headers: sbReadHeaders(),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[unusual-flow] Supabase read ${resp.status}: ${text}`);
      return [];
    }
    const rows = (await resp.json()) as Array<{ scored_event: ScoredFlowEvent }>;
    return rows.map(r => r.scored_event);
  } catch (err) {
    console.warn('[unusual-flow] Supabase read error:', err);
    return [];
  }
}

async function upsertEvents(events: ScoredFlowEvent[]): Promise<void> {
  if (!sbEnabled() || !events.length) return;
  try {
    const rows = events.map(e => ({
      event_id: e.event_id,
      ticker: e.flow_events.symbol,
      scored_event: e,
      expires_at: e.flow_events.expiry
        ? new Date(e.flow_events.expiry).toISOString()
        : null,
    }));
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/flow_events`, {
      method: 'POST',
      headers: sbWriteHeaders(),
      body: JSON.stringify(rows),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[unusual-flow] Supabase upsert ${resp.status}: ${text}`);
    }
  } catch (err) {
    console.warn('[unusual-flow] Supabase upsert error:', err);
  }
}

router.get('/unusual-flow', async (req, res) => {
  const ticker =
    typeof req.query.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
  if (!ticker) {
    res.status(400).json({ error: 'ticker query param required' });
    return;
  }

  // Fetch live Signa data + Supabase history in parallel
  const [raw, historical] = await Promise.all([
    getCuratedFlow(ticker, { minScore: 60, limit: 20 }).catch(() => null),
    fetchHistorical(ticker),
  ]);

  // Score fresh events and persist them (fire-and-forget)
  const fresh: ScoredFlowEvent[] = raw?.events?.length
    ? raw.events.map(scoreFlowEvent)
    : [];

  if (fresh.length) void upsertEvents(fresh);

  // Merge fresh + historical, dedup by event_id (fresh wins on conflict)
  const seen = new Set<string>();
  const merged: ScoredFlowEvent[] = [];
  for (const e of [...fresh, ...historical]) {
    if (!seen.has(e.event_id)) {
      seen.add(e.event_id);
      merged.push(e);
    }
  }

  if (!merged.length) {
    res.json({ events: [], summary: null, fromCache: false, historicalCount: 0 });
    return;
  }

  merged.sort((a, b) => {
    const diff = b.flow_score - a.flow_score;
    if (diff !== 0) return diff;
    return b.flow_events.premium_size - a.flow_events.premium_size;
  });

  const summary = summarizeFlow(merged);
  res.json({
    events: merged,
    summary,
    fromCache: fresh.length === 0,
    historicalCount: historical.length,
  });
});

export default router;
