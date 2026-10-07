import { recordApiCall } from '../lib/apiUsage.js';

// Free Nasdaq earnings calendar: every company reporting on one date. The API rejects requests without browser-like headers.
const BASE = 'https://api.nasdaq.com/api/calendar/earnings';

export async function fetchNasdaqEarnings(date: string): Promise<unknown> {
  recordApiCall('nasdaq-earnings');
  const res = await fetch(`${BASE}?date=${date}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Nasdaq earnings ${date}: HTTP ${res.status}`);
  return res.json();
}
