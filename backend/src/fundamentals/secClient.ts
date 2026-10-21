import { recordApiCall } from '../lib/apiUsage.js';

// SEC EDGAR fair-access policy:
//   - At most 10 requests per second per IP; going over blocks the IP for about 10 minutes
//   - Every request must carry a User-Agent naming the app and a contact email (SEC_USER_AGENT)
// All requests here go through one queue spaced MIN_GAP_MS apart (~4 req/s), so even a full resync stays well under the cap.
const MIN_GAP_MS = 250;
const RETRY_DELAYS_MS = [2_000, 10_000];

let nextSlot = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function secUserAgent(): string | null {
  const ua = process.env.SEC_USER_AGENT?.trim();
  return ua && ua.includes('@') ? ua : null;
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await sleep(wait);
}

async function secGet(url: string): Promise<unknown> {
  const ua = secUserAgent();
  if (!ua) throw new Error('SEC_USER_AGENT is not set (format: "<app name> <contact email>")');
  for (let attempt = 0; ; attempt++) {
    await throttle();
    recordApiCall('sec');
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    // 403/429 mean SEC is throttling this IP; back off instead of hammering it.
    if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    throw new Error(`SEC ${url.replace(/^https:\/\/[^/]+/, '')}: HTTP ${res.status}`);
  }
}

const pad = (cik: number) => String(cik).padStart(10, '0');

// Every ticker SEC knows, mapped to its CIK (one ~800 KB request).
export async function fetchTickerMap(): Promise<Map<string, { cik: number; name: string }>> {
  const raw = (await secGet('https://www.sec.gov/files/company_tickers.json')) as Record<string, { cik_str: number; ticker: string; title: string }> | null;
  const map = new Map<string, { cik: number; name: string }>();
  for (const v of Object.values(raw ?? {})) map.set(v.ticker.toUpperCase(), { cik: v.cik_str, name: v.title });
  return map;
}

export const fetchSubmissions = (cik: number) => secGet(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`);

export const fetchCompanyFacts = (cik: number) => secGet(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`);
