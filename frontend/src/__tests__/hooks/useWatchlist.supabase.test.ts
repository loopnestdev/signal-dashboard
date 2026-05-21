import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWatchlist } from '../../hooks/useWatchlist';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Simulates a logged-in user whose INSERT calls never resolve (network pending /
// INSERT failure scenario). SELECT returns [] (fresh account or first sign-in).

const neverResolves = new Promise<never>(() => {});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          order: () => ({
            then: (cb: (v: { data: never[]; error: null }) => void) =>
              Promise.resolve().then(() => cb({ data: [], error: null })),
          }),
        }),
      }),
      insert: (_data: unknown) => ({
        select: (_cols: string) => ({
          // Batch insert (migration / recovery path) — returns a pending promise
          then: (_cb: unknown) => neverResolves,
          // Chainable: .select().single()
          single: () => ({
            then: (_cb: unknown) => neverResolves,
          }),
        }),
      }),
      update: (_data: unknown) => ({
        eq: () => ({ then: (cb: (v: { error: null }) => void) => cb({ error: null }) }),
      }),
      delete: () => ({
        eq: () => ({ then: (cb: (v: { error: null }) => void) => cb({ error: null }) }),
      }),
    }),
  },
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

const STORAGE_KEY = 'signal-dashboard-watchlists-v2';

function getStoredState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ── Test user ─────────────────────────────────────────────────────────────────

const mockUser = { id: 'test-uuid-123', email: 'test@test.com' } as Parameters<typeof useWatchlist>[0];

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

describe('useWatchlist (Supabase mode — INSERT pending)', () => {
  // ── Dual persistence: localStorage must always be written ─────────────────

  it('regression: group created while Supabase INSERT is pending persists in localStorage', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {}); // flush sign-in effect (SELECT returns [])
    act(() => { result.current.createGroup('SPACE'); });
    const stored = getStoredState();
    expect(stored?.groups.find((g: { name: string }) => g.name === 'SPACE')).toBeTruthy();
  });

  it('regression: ticker added in Supabase mode persists in localStorage', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.createGroup('SPACE'); });
    act(() => { result.current.add('ASTS', 'SPACE'); });
    const stored = getStoredState();
    const space = stored?.groups.find((g: { name: string; tickers: string[] }) => g.name === 'SPACE');
    expect(space?.tickers).toContain('ASTS');
  });

  it('setActiveGroup persists to localStorage even in Supabase mode', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.createGroup('Tech'); });
    act(() => { result.current.setActiveGroup('Default'); });
    const stored = getStoredState();
    expect(stored?.activeGroup).toBe('Default');
  });

  it('renameGroup persists to localStorage even in Supabase mode', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.renameGroup('Default', 'Main'); });
    const stored = getStoredState();
    expect(stored?.groups.find((g: { name: string }) => g.name === 'Main')).toBeTruthy();
    expect(stored?.groups.find((g: { name: string }) => g.name === 'Default')).toBeFalsy();
  });

  it('deleteGroup persists to localStorage even in Supabase mode', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.createGroup('Temp'); });
    act(() => { result.current.setActiveGroup('Default'); });
    act(() => { result.current.deleteGroup('Temp'); });
    const stored = getStoredState();
    expect(stored?.groups.find((g: { name: string }) => g.name === 'Temp')).toBeFalsy();
  });

  it('remove persists to localStorage even in Supabase mode', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.add('TSLA'); });
    act(() => { result.current.remove('TSLA'); });
    const stored = getStoredState();
    expect(stored?.groups[0]?.tickers).not.toContain('TSLA');
  });

  // ── State is correct in-memory (not just localStorage) ────────────────────

  it('createGroup is reflected immediately in hook state', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.createGroup('SPACE'); });
    expect(result.current.groups.find(g => g.name === 'SPACE')).toBeTruthy();
    expect(result.current.activeGroup).toBe('SPACE');
  });

  it('add is reflected immediately in hook state', async () => {
    const { result } = renderHook(() => useWatchlist(mockUser));
    await act(async () => {});
    act(() => { result.current.createGroup('SPACE'); });
    act(() => { result.current.add('ASTS', 'SPACE'); });
    const space = result.current.groups.find(g => g.name === 'SPACE');
    expect(space?.tickers).toContain('ASTS');
  });
});
