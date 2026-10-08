import type { MarketResponse, MarketFlowResponse, MarketDpResponse, MarketScanResponse, GammaGexResponse, StockGexResponse, CollectorStatus, ScannerResponse, SettingsResponse, TradingSettings, BacktestRunsResponse, BacktestRunDetail, BookId, ReplayJob, FlowStudyResponse } from '../types/market';
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

export async function fetchStockGex(ticker: string): Promise<StockGexResponse> {
  const res = await fetch(`${BASE}/api/gex/${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<StockGexResponse>;
}

export async function fetchMarketScan(direction?: 'bullish' | 'bearish'): Promise<MarketScanResponse> {
  const params = direction ? `?direction=${direction}` : '';
  const res = await fetch(`${BASE}/api/market-scan${params}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<MarketScanResponse>;
}

export async function fetchCollectorStatus(): Promise<CollectorStatus> {
  const res = await fetch(`${BASE}/api/collector/status`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<CollectorStatus>;
}

export async function fetchScanner(date?: string): Promise<ScannerResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${BASE}/api/scanner${qs}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ScannerResponse>;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${BASE}/api/settings`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SettingsResponse>;
}

export class SettingsSaveError extends Error {
  constructor(message: string, readonly details: string[]) { super(message); }
}

export async function saveSettings(settings: TradingSettings, accessToken: string | null): Promise<SettingsResponse> {
  const res = await fetch(`${BASE}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(settings),
  });
  const body = await res.json().catch(() => ({})) as { error?: string; details?: string[] };
  if (!res.ok) throw new SettingsSaveError(body.error ?? `API ${res.status}`, body.details ?? []);
  return body as unknown as SettingsResponse;
}

export async function fetchBacktestRuns(): Promise<BacktestRunsResponse> {
  const res = await fetch(`${BASE}/api/backtest/runs`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `API ${res.status}`);
  return res.json() as Promise<BacktestRunsResponse>;
}

export async function fetchBacktestRun(id: string): Promise<BacktestRunDetail> {
  const res = await fetch(`${BASE}/api/backtest/runs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `API ${res.status}`);
  return res.json() as Promise<BacktestRunDetail>;
}

const authHeaders = (accessToken: string | null): Record<string, string> => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {});

export async function startReplay(req: { from: string; to: string; books: BookId[] }, accessToken: string | null): Promise<ReplayJob> {
  const res = await fetch(`${BASE}/api/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify(req),
  });
  const body = await res.json().catch(() => ({})) as { error?: string; job?: ReplayJob };
  if (!res.ok) throw new Error(body.error ?? `API ${res.status}`);
  return body.job!;
}

export async function deleteBacktestRun(id: string, accessToken: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/backtest/runs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(accessToken) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `API ${res.status}`);
}

export async function fetchFlowStudy(share: number): Promise<FlowStudyResponse> {
  const res = await fetch(`${BASE}/api/backtest/flow-study?share=${share}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `API ${res.status}`);
  return res.json() as Promise<FlowStudyResponse>;
}
