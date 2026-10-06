import { isSupabaseAdminConfigured, rpc, selectRows } from './supabaseRest.js';

export type UsageSource = 'signa' | 'yahoo-options' | 'cboe-options';

// Pending (unflushed) call counts keyed by `${utcDay}|${source}`.
const pending = new Map<string, number>();

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function recordApiCall(source: UsageSource, n = 1): void {
  const key = `${utcDay()}|${source}`;
  pending.set(key, (pending.get(key) ?? 0) + n);
}

export function pendingCalls(source: UsageSource, day = utcDay()): number {
  return pending.get(`${day}|${source}`) ?? 0;
}

export async function flushApiUsage(): Promise<void> {
  if (!isSupabaseAdminConfigured() || pending.size === 0) return;
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, calls] of batch) {
    const [day, source] = key.split('|');
    try {
      await rpc('bump_api_usage', { p_day: day, p_source: source, p_calls: calls });
    } catch (err) {
      pending.set(key, (pending.get(key) ?? 0) + calls);
      console.warn('[api-usage] flush failed:', err);
      return;
    }
  }
}

// Calls made today across every process that flushes to Supabase, plus this process's unflushed calls.
export async function callsToday(source: UsageSource): Promise<number> {
  const day = utcDay();
  let stored = 0;
  if (isSupabaseAdminConfigured()) {
    try {
      const rows = await selectRows<{ calls: number }>('api_usage', `select=calls&day=eq.${day}&source=eq.${source}`);
      stored = rows[0]?.calls ?? 0;
    } catch (err) {
      console.warn('[api-usage] read failed:', err);
    }
  }
  return stored + pendingCalls(source, day);
}

// Wrapper used for every Signa REST/MCP request so the 1,000/day quota is measurable.
export function signaFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  recordApiCall('signa');
  return fetch(input, init);
}
