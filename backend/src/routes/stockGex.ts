import { Router } from 'express';
import { getGexMcp } from '../lib/signaClient.js';
import { getQuote } from '../lib/yahooClient.js';
import type { GexData } from '../lib/signaClient.js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

function sbEnabled() {
  return !!(SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY));
}

function sbKey() { return SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY; }

function sbReadHeaders() {
  return { apikey: sbKey(), Authorization: `Bearer ${sbKey()}`, 'Accept-Profile': 'signal' };
}

function sbWriteHeaders() {
  return {
    apikey: sbKey(), Authorization: `Bearer ${sbKey()}`,
    'Content-Profile': 'signal', 'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
}

async function fetchCachedGex(ticker: string): Promise<{ snapshot: GexData; capturedAt: string } | null> {
  if (!sbEnabled()) return null;
  try {
    const params = new URLSearchParams({ select: 'snapshot,captured_at', ticker: `eq.${ticker}`, limit: '1' });
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/gex_snapshots?${params}`, { headers: sbReadHeaders() });
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<{ snapshot: GexData; captured_at: string }>;
    if (!rows.length) return null;
    return { snapshot: rows[0].snapshot, capturedAt: rows[0].captured_at };
  } catch { return null; }
}

async function upsertGex(ticker: string, data: GexData): Promise<void> {
  if (!sbEnabled()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/gex_snapshots`, {
      method: 'POST',
      headers: sbWriteHeaders(),
      body: JSON.stringify([{ ticker, snapshot: data, captured_at: new Date().toISOString() }]),
    });
  } catch { /* silent */ }
}

router.get('/gex/:ticker', async (req, res) => {
  const ticker = (req.params.ticker ?? '').trim().toUpperCase();
  if (!/^[A-Za-z^.\-]{1,10}$/.test(ticker)) {
    res.status(400).json({ error: 'Invalid ticker' });
    return;
  }

  const [gex, quote] = await Promise.all([
    getGexMcp(ticker).catch(() => null),
    getQuote(ticker).catch(() => null),
  ]);

  if (gex && gex.levels.length > 0) {
    if (quote) gex.current_price = quote.price;
    void upsertGex(ticker, gex);
    res.json({ ...gex, fromCache: false });
    return;
  }

  // Signa returned nothing — fall back to Supabase
  const cached = await fetchCachedGex(ticker);
  if (cached) {
    // Always attach live price even for cached GEX
    if (quote) cached.snapshot.current_price = quote.price;
    res.json({ ...cached.snapshot, fromCache: true, capturedAt: cached.capturedAt });
    return;
  }

  // Nothing anywhere
  res.json({
    symbol: ticker,
    current_price: quote?.price ?? 0,
    gamma_flip: null, call_wall: null, put_wall: null,
    above_flip: null, net_gex: null, levels: [],
    fromCache: false,
  });
});

export default router;
