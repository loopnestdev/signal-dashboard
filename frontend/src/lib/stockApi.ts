import type { StockResponse } from '../types/stock';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export async function fetchStockData(ticker: string): Promise<StockResponse> {
  const res = await fetch(`${API_BASE}/api/stock/${encodeURIComponent(ticker.toUpperCase())}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<StockResponse>;
}
