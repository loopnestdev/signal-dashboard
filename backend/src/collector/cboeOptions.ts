import { recordApiCall } from '../lib/apiUsage.js';

// Cboe's free delayed (~15 min) option chain: one request per symbol returns every listed contract
// with bid/ask, IV, open interest and Greeks. No cookie or key; cdn.cboe.com redirects here.
const BASE = 'https://cdn-api.cboe.com/api/global/delayed_quotes/options';

export async function fetchCboeChain(symbol: string): Promise<unknown> {
  recordApiCall('cboe-options');
  const res = await fetch(`${BASE}/${encodeURIComponent(symbol.toUpperCase())}.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (signal-dashboard collector)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Cboe options ${symbol}: HTTP ${res.status}`);
  return res.json();
}
