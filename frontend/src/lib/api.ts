import type { MarketResponse } from '../types/market';
import type { UnusualFlowResponse } from '../types/stock';

const BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchMarketData(): Promise<MarketResponse> {
  const res = await fetch(`${BASE}/api/market-data`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function triggerRefresh(): Promise<void> {
  await fetch(`${BASE}/api/refresh`, { method: 'POST' });
}

export async function fetchUnusualFlow(ticker: string): Promise<UnusualFlowResponse> {
  const res = await fetch(`${BASE}/api/unusual-flow?ticker=${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<UnusualFlowResponse>;
}
