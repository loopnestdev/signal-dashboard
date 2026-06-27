import type { MarketResponse, MarketFlowResponse, MarketDpResponse, MarketScanResponse, GammaGexResponse } from '../types/market';
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

export async function fetchOptionsFlow(): Promise<MarketFlowResponse> {
  const res = await fetch(`${BASE}/api/options-flow`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<MarketFlowResponse>;
}

export async function fetchDarkPool(): Promise<MarketDpResponse> {
  const res = await fetch(`${BASE}/api/dark-pool`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<MarketDpResponse>;
}

export async function fetchGammaGex(): Promise<GammaGexResponse> {
  const res = await fetch(`${BASE}/api/gamma-gex`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<GammaGexResponse>;
}

export async function fetchMarketScan(direction?: 'bullish' | 'bearish'): Promise<MarketScanResponse> {
  const params = direction ? `?direction=${direction}` : '';
  const res = await fetch(`${BASE}/api/market-scan${params}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<MarketScanResponse>;
}
