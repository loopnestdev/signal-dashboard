import { useState, useCallback } from 'react';

const STORAGE_KEY = 'signal-dashboard-watchlists-v2';
const DEFAULT_LIST = 'Default';

export interface WatchlistGroup {
  name: string;
  tickers: string[];
}

interface StoredWatchlists {
  groups: WatchlistGroup[];
  activeGroup: string;
}

function load(): StoredWatchlists {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredWatchlists;
  } catch {
    // ignore
  }
  // Migrate legacy flat watchlist if present
  try {
    const legacy = localStorage.getItem('signal-dashboard-watchlist');
    if (legacy) {
      const tickers = JSON.parse(legacy) as string[];
      if (tickers.length > 0) {
        return { groups: [{ name: DEFAULT_LIST, tickers }], activeGroup: DEFAULT_LIST };
      }
    }
  } catch {
    // ignore
  }
  return { groups: [{ name: DEFAULT_LIST, tickers: [] }], activeGroup: DEFAULT_LIST };
}

function persist(state: StoredWatchlists): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable
  }
}

export interface UseWatchlist {
  groups: WatchlistGroup[];
  activeGroup: string;
  activeTickers: string[];
  setActiveGroup: (name: string) => void;
  createGroup: (name: string) => void;
  renameGroup: (oldName: string, newName: string) => void;
  deleteGroup: (name: string) => void;
  add: (ticker: string, groupName?: string) => void;
  remove: (ticker: string, groupName?: string) => void;
  isInWatchlist: (ticker: string, groupName?: string) => boolean;
  getGroupsForTicker: (ticker: string) => string[];
}

export function useWatchlist(): UseWatchlist {
  const [state, setState] = useState<StoredWatchlists>(load);

  const update = useCallback((next: StoredWatchlists) => {
    persist(next);
    setState(next);
  }, []);

  const setActiveGroup = useCallback((name: string) => {
    setState(prev => {
      const next = { ...prev, activeGroup: name };
      persist(next);
      return next;
    });
  }, []);

  const createGroup = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState(prev => {
      if (prev.groups.some(g => g.name === trimmed)) {
        return { ...prev, activeGroup: trimmed };
      }
      const next: StoredWatchlists = {
        groups: [...prev.groups, { name: trimmed, tickers: [] }],
        activeGroup: trimmed,
      };
      persist(next);
      return next;
    });
  }, []);

  const renameGroup = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setState(prev => {
      const next: StoredWatchlists = {
        groups: prev.groups.map(g => g.name === oldName ? { ...g, name: trimmed } : g),
        activeGroup: prev.activeGroup === oldName ? trimmed : prev.activeGroup,
      };
      persist(next);
      return next;
    });
  }, []);

  const deleteGroup = useCallback((name: string) => {
    setState(prev => {
      if (prev.groups.length <= 1) return prev; // keep at least one
      const remaining = prev.groups.filter(g => g.name !== name);
      const next: StoredWatchlists = {
        groups: remaining,
        activeGroup: prev.activeGroup === name ? remaining[0].name : prev.activeGroup,
      };
      persist(next);
      return next;
    });
  }, []);

  const add = useCallback((ticker: string, groupName?: string) => {
    const t = ticker.toUpperCase().trim();
    setState(prev => {
      const target = groupName ?? prev.activeGroup;
      const next: StoredWatchlists = {
        ...prev,
        groups: prev.groups.map(g =>
          g.name === target && !g.tickers.includes(t)
            ? { ...g, tickers: [...g.tickers, t] }
            : g,
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((ticker: string, groupName?: string) => {
    const t = ticker.toUpperCase().trim();
    setState(prev => {
      const target = groupName ?? prev.activeGroup;
      const next: StoredWatchlists = {
        ...prev,
        groups: prev.groups.map(g =>
          g.name === target
            ? { ...g, tickers: g.tickers.filter(x => x !== t) }
            : g,
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  const isInWatchlist = useCallback((ticker: string, groupName?: string): boolean => {
    const t = ticker.toUpperCase().trim();
    const target = groupName ?? state.activeGroup;
    return state.groups.find(g => g.name === target)?.tickers.includes(t) ?? false;
  }, [state]);

  const getGroupsForTicker = useCallback((ticker: string): string[] => {
    const t = ticker.toUpperCase().trim();
    return state.groups.filter(g => g.tickers.includes(t)).map(g => g.name);
  }, [state]);

  const activeTickers = state.groups.find(g => g.name === state.activeGroup)?.tickers ?? [];

  return {
    groups: state.groups,
    activeGroup: state.activeGroup,
    activeTickers,
    setActiveGroup,
    createGroup,
    renameGroup,
    deleteGroup,
    add,
    remove,
    isInWatchlist,
    getGroupsForTicker,
  };
}
