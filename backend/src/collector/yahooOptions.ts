import { recordApiCall } from '../lib/apiUsage.js';

// Yahoo's v7 options endpoint requires a session cookie + crumb pair.
// Fetched once per collector run and reused for every symbol.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const BASE = 'https://query2.finance.yahoo.com';

export interface YahooSession {
  cookie: string;
  crumb: string;
}

export async function openYahooSession(): Promise<YahooSession> {
  const seed = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const cookie = seed.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Yahoo session cookie not issued');

  const res = await fetch(`${BASE}/v1/test/getcrumb`, {
    headers: { 'User-Agent': UA, Cookie: cookie },
    signal: AbortSignal.timeout(15_000),
  });
  const crumb = (await res.text()).trim();
  if (!res.ok || !crumb || crumb.includes(' ')) throw new Error(`Yahoo crumb failed: HTTP ${res.status} ${crumb.slice(0, 60)}`);
  return { cookie, crumb };
}

export async function fetchOptionChain(session: YahooSession, symbol: string, expiryEpoch?: number): Promise<unknown> {
  const params = new URLSearchParams({ crumb: session.crumb });
  if (expiryEpoch) params.set('date', String(expiryEpoch));
  recordApiCall('yahoo-options');
  const res = await fetch(`${BASE}/v7/finance/options/${encodeURIComponent(symbol)}?${params}`, {
    headers: { 'User-Agent': UA, Cookie: session.cookie },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Yahoo options ${symbol}: HTTP ${res.status}`);
  return res.json();
}

export function expirationDates(payload: unknown): number[] {
  const result = (payload as { optionChain?: { result?: Array<{ expirationDates?: number[] }> } })?.optionChain?.result;
  return result?.[0]?.expirationDates ?? [];
}
