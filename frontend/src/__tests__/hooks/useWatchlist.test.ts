import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWatchlist } from '../../hooks/useWatchlist';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// The hook imports supabase from '../lib/supabase'. We mock the entire module
// so the hook always sees supabase=null (localStorage-only path).

vi.mock('../../lib/supabase', () => ({ supabase: null }));

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

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

describe('useWatchlist (localStorage-only mode)', () => {
  // ── Initial state ─────────────────────────────────────────────────────────

  it('starts with a Default group and no tickers', () => {
    const { result } = renderHook(() => useWatchlist(null));
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].name).toBe('Default');
    expect(result.current.activeTickers).toHaveLength(0);
    expect(result.current.activeGroup).toBe('Default');
  });

  it('loads previously persisted state from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      groups: [{ name: 'Tech', tickers: ['AAPL', 'NVDA'] }],
      activeGroup: 'Tech',
    }));
    const { result } = renderHook(() => useWatchlist(null));
    expect(result.current.activeGroup).toBe('Tech');
    expect(result.current.activeTickers).toEqual(['AAPL', 'NVDA']);
  });

  // ── Legacy format migration ───────────────────────────────────────────────

  it('migrates a legacy flat watchlist to the Default group', () => {
    localStorage.setItem('signal-dashboard-watchlist', JSON.stringify(['TSLA', 'AMZN']));
    const { result } = renderHook(() => useWatchlist(null));
    expect(result.current.activeTickers).toEqual(['TSLA', 'AMZN']);
    expect(result.current.activeGroup).toBe('Default');
  });

  // ── add ───────────────────────────────────────────────────────────────────

  it('adds a ticker to the active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('AAPL'); });
    expect(result.current.activeTickers).toContain('AAPL');
  });

  it('normalises tickers to uppercase', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('aapl'); });
    expect(result.current.activeTickers).toContain('AAPL');
    expect(result.current.activeTickers).not.toContain('aapl');
  });

  it('does not add duplicate tickers', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('AAPL'); });
    act(() => { result.current.add('AAPL'); });
    expect(result.current.activeTickers.filter(t => t === 'AAPL')).toHaveLength(1);
  });

  it('persists added ticker to localStorage', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('NVDA'); });
    const stored = getStoredState();
    expect(stored.groups[0].tickers).toContain('NVDA');
  });

  it('adds ticker to a named group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Tech'); });
    act(() => { result.current.add('AAPL', 'Tech'); });
    const techGroup = result.current.groups.find(g => g.name === 'Tech');
    expect(techGroup?.tickers).toContain('AAPL');
  });

  // ── remove ────────────────────────────────────────────────────────────────

  it('removes a ticker from the active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('AAPL'); });
    act(() => { result.current.remove('AAPL'); });
    expect(result.current.activeTickers).not.toContain('AAPL');
  });

  it('persists removal to localStorage', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('AAPL'); });
    act(() => { result.current.remove('AAPL'); });
    const stored = getStoredState();
    expect(stored.groups[0].tickers).not.toContain('AAPL');
  });

  it('remove is a no-op for a ticker that is not in the group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    expect(() => act(() => { result.current.remove('ZZZZZ'); })).not.toThrow();
    expect(result.current.activeTickers).toHaveLength(0);
  });

  // ── isInWatchlist ─────────────────────────────────────────────────────────

  it('returns true for a ticker that was added', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('TSLA'); });
    expect(result.current.isInWatchlist('TSLA')).toBe(true);
  });

  it('returns false for a ticker that was not added', () => {
    const { result } = renderHook(() => useWatchlist(null));
    expect(result.current.isInWatchlist('TSLA')).toBe(false);
  });

  it('isInWatchlist is case-insensitive', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('aapl'); });
    expect(result.current.isInWatchlist('AAPL')).toBe(true);
  });

  // ── createGroup ───────────────────────────────────────────────────────────

  it('creates a new group and switches to it', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('SPACE'); });
    expect(result.current.groups.find(g => g.name === 'SPACE')).toBeTruthy();
    expect(result.current.activeGroup).toBe('SPACE');
  });

  it('does not duplicate an existing group name', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Default'); });
    expect(result.current.groups.filter(g => g.name === 'Default')).toHaveLength(1);
  });

  it('trims whitespace from new group name', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('  EV  '); });
    expect(result.current.groups.find(g => g.name === 'EV')).toBeTruthy();
  });

  it('ignores empty group name', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup(''); });
    expect(result.current.groups).toHaveLength(1);
  });

  it('persists new group to localStorage', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('CRYPTO'); });
    const stored = getStoredState();
    expect(stored.groups.find((g: { name: string }) => g.name === 'CRYPTO')).toBeTruthy();
  });

  // ── setActiveGroup ────────────────────────────────────────────────────────

  it('switches the active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('ETFs'); });
    act(() => { result.current.setActiveGroup('Default'); });
    expect(result.current.activeGroup).toBe('Default');
  });

  // ── renameGroup ───────────────────────────────────────────────────────────

  it('renames a group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.renameGroup('Default', 'Main'); });
    expect(result.current.groups.find(g => g.name === 'Main')).toBeTruthy();
    expect(result.current.groups.find(g => g.name === 'Default')).toBeFalsy();
  });

  it('updates activeGroup name when renaming the active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.renameGroup('Default', 'Primary'); });
    expect(result.current.activeGroup).toBe('Primary');
  });

  it('preserves tickers during rename', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.add('AAPL'); });
    act(() => { result.current.renameGroup('Default', 'Core'); });
    const core = result.current.groups.find(g => g.name === 'Core');
    expect(core?.tickers).toContain('AAPL');
  });

  it('is a no-op if old name equals new name', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.renameGroup('Default', 'Default'); });
    expect(result.current.groups).toHaveLength(1);
  });

  // ── deleteGroup ───────────────────────────────────────────────────────────

  it('deletes a non-active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Temp'); });
    act(() => { result.current.setActiveGroup('Default'); });
    act(() => { result.current.deleteGroup('Temp'); });
    expect(result.current.groups.find(g => g.name === 'Temp')).toBeFalsy();
  });

  it('switches to another group when deleting the active group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Extra'); });
    act(() => { result.current.setActiveGroup('Extra'); });
    act(() => { result.current.deleteGroup('Extra'); });
    expect(result.current.activeGroup).toBe('Default');
  });

  it('does not delete the last remaining group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.deleteGroup('Default'); });
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].name).toBe('Default');
  });

  // ── getGroupsForTicker ────────────────────────────────────────────────────

  it('returns group names containing the ticker', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Tech'); });
    act(() => { result.current.add('AAPL', 'Default'); });
    act(() => { result.current.add('AAPL', 'Tech'); });
    const groups = result.current.getGroupsForTicker('AAPL');
    expect(groups).toContain('Default');
    expect(groups).toContain('Tech');
  });

  it('returns empty array when ticker is in no group', () => {
    const { result } = renderHook(() => useWatchlist(null));
    expect(result.current.getGroupsForTicker('ZZZZZ')).toEqual([]);
  });

  // ── activeTickers ─────────────────────────────────────────────────────────

  it('activeTickers reflects the active group tickers', () => {
    const { result } = renderHook(() => useWatchlist(null));
    act(() => { result.current.createGroup('Bonds'); });
    act(() => { result.current.add('TLT', 'Bonds'); });
    act(() => { result.current.setActiveGroup('Default'); });
    expect(result.current.activeTickers).not.toContain('TLT');
    act(() => { result.current.setActiveGroup('Bonds'); });
    expect(result.current.activeTickers).toContain('TLT');
  });
});
