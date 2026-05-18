import type { MarketResponse } from '../types/market';

const BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchMarketData(): Promise<MarketResponse> {
  const res = await fetch(`${BASE}/api/market-data`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function triggerRefresh(): Promise<void> {
  await fetch(`${BASE}/api/refresh`, { method: 'POST' });
}
