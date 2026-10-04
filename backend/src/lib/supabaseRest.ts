// Minimal PostgREST client for the `signal` schema, authenticated with the service role key.
// The collector tables have RLS with no policies, so the anon key cannot reach them.

const SCHEMA = 'signal';

function config(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function isSupabaseAdminConfigured(): boolean {
  return config() !== null;
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Accept-Profile': SCHEMA,
    'Content-Profile': SCHEMA,
    ...extra,
  };
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error('Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: headers(cfg.key, init.headers),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Supabase ${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

const CHUNK = 500;

// upsertRows:
//   - 'ignore' keeps the first copy of a row (append-only data such as prints)
//   - 'merge' overwrites with the latest copy (snapshots, alerts whose size grows intraday)
export async function upsertRows(
  table: string,
  rows: object[],
  mode: 'ignore' | 'merge',
  onConflict?: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const qs = onConflict ? `?on_conflict=${onConflict}` : '';
  for (let i = 0; i < rows.length; i += CHUNK) {
    await request(`${table}${qs}`, {
      method: 'POST',
      headers: { Prefer: `resolution=${mode === 'ignore' ? 'ignore' : 'merge'}-duplicates,return=minimal` },
      body: JSON.stringify(rows.slice(i, i + CHUNK)),
    });
  }
  return rows.length;
}

export async function insertRow<T>(table: string, row: object): Promise<T> {
  const res = await request(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const [inserted] = (await res.json()) as T[];
  return inserted;
}

export async function updateRows(table: string, filter: string, patch: object): Promise<void> {
  await request(`${table}?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

export async function selectRows<T>(table: string, query: string): Promise<T[]> {
  const res = await request(`${table}?${query}`, { method: 'GET' });
  return (await res.json()) as T[];
}

export async function countRows(table: string): Promise<number | null> {
  const res = await request(`${table}?select=*&limit=1`, {
    method: 'HEAD',
    headers: { Prefer: 'count=estimated' },
  });
  const range = res.headers.get('content-range');
  const total = range?.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

export async function rpc<T>(fn: string, args: object): Promise<T> {
  const res = await request(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
