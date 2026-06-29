import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'signal-dashboard-watchlists-v2';
const DEFAULT_LIST = 'Default';

export interface WatchlistGroup {
  id?: string;  // Supabase row UUID — undefined in localStorage-only mode
  name: string;
  tickers: string[];
}

interface StoredWatchlists {
  groups: WatchlistGroup[];
  activeGroup: string;
}

// Public interface is unchanged — all functions still return void from the
// caller's perspective so no component prop types need updating.
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

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadLocal(): StoredWatchlists {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredWatchlists;
  } catch { /* ignore */ }
  // Migrate legacy flat watchlist
  try {
    const legacy = localStorage.getItem('signal-dashboard-watchlist');
    if (legacy) {
      const tickers = JSON.parse(legacy) as string[];
      if (tickers.length > 0)
        return { groups: [{ name: DEFAULT_LIST, tickers }], activeGroup: DEFAULT_LIST };
    }
  } catch { /* ignore */ }
  return { groups: [{ name: DEFAULT_LIST, tickers: [] }], activeGroup: DEFAULT_LIST };
}

function persistLocal(s: StoredWatchlists): void {
  try {
    // Strip Supabase id field before persisting to localStorage
    const clean = { ...s, groups: s.groups.map(({ name, tickers }) => ({ name, tickers })) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch { /* storage unavailable */ }
}

// ── Supabase sync helpers ─────────────────────────────────────────────────────

type WatchlistRow = {
  id: string;
  name: string;
  tickers: string[];
};

function sbUpdate(id: string, patch: { name?: string; tickers?: string[] }): void {
  supabase?.from('watchlists')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .then(() => {});
}

function sbDelete(id: string): void {
  supabase?.from('watchlists').delete().eq('id', id).then(() => {});
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWatchlist(user: User | null): UseWatchlist {
  const [state, setState] = useState<StoredWatchlists>(loadLocal);

  // Stable refs — always current without stale closures in callbacks
  const userRef = useRef<User | null>(user);
  const stateRef = useRef<StoredWatchlists>(state);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Sign-in / sign-out effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !supabase) {
      setState(loadLocal());
      return;
    }

    supabase
      .from('watchlists')
      .select('id, name, tickers')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(async ({ data, error }) => {
        if (error) {
          console.warn('[useWatchlist] SELECT error:', error.message);
          return;
        }

        if (!data || data.length === 0) {
          // First sign-in: migrate localStorage groups into Supabase
          const local = loadLocal();
          const { data: migrated, error: migrateErr } = await supabase!
            .from('watchlists')
            .insert(local.groups.map(g => ({ user_id: user.id, name: g.name, tickers: g.tickers })))
            .select('id, name, tickers');
          if (migrateErr) console.warn('[useWatchlist] migration INSERT error:', migrateErr.message);
          if (migrated) setState(prev => ({ ...prev, groups: migrated as WatchlistRow[] }));
        } else {
          // Merge Supabase data with any locally-only groups (created offline / INSERT failed).
          // IMMEDIATELY update state so Device B sees Device A's groups without waiting for any INSERT.
          const supabaseGroups = data as WatchlistRow[];
          const supabaseNames = new Set(supabaseGroups.map(g => g.name));
          const localGroups = loadLocal().groups;
          const missingFromSupabase = localGroups.filter(g => !supabaseNames.has(g.name));

          const optimisticGroups: WatchlistGroup[] = [
            ...supabaseGroups,
            ...missingFromSupabase.map(g => ({ name: g.name, tickers: g.tickers })),
          ];
          // Validate activeGroup — fall back to first group if it no longer exists
          const currentActive = stateRef.current.activeGroup;
          const validActive = optimisticGroups.find(g => g.name === currentActive)?.name
            ?? optimisticGroups[0]?.name
            ?? DEFAULT_LIST;

          setState(prev => ({ ...prev, groups: optimisticGroups, activeGroup: validActive }));
          persistLocal({
            groups: optimisticGroups.map(({ name, tickers }) => ({ name, tickers })),
            activeGroup: validActive,
          });

          if (missingFromSupabase.length > 0) {
            // Back-fill locally-only groups into Supabase and patch in their UUIDs
            supabase!
              .from('watchlists')
              .insert(missingFromSupabase.map(g => ({ user_id: user.id, name: g.name, tickers: g.tickers })))
              .select('id, name, tickers')
              .then(({ data: recovered, error: insertErr }) => {
                if (insertErr) {
                  console.warn('[useWatchlist] recovery INSERT error:', insertErr.message);
                  return; // Keep optimistic state — groups stay visible without UUIDs
                }
                const recoveredRows = (recovered as WatchlistRow[] | null) ?? [];
                // Patch Supabase UUIDs into the optimistically-added local groups
                setState(prev => ({
                  ...prev,
                  groups: prev.groups.map(g => {
                    const match = recoveredRows.find(r => r.name === g.name && !g.id);
                    return match ? { ...g, id: match.id } : g;
                  }),
                }));
              });
          }
        }
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ─────────────────────────────────────────────────────────────

  const setActiveGroup = useCallback((name: string) => {
    setState(prev => {
      const next = { ...prev, activeGroup: name };
      persistLocal(next);
      return next;
    });
  }, []);

  const createGroup = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentUser = userRef.current;

    if (currentUser && supabase) {
      if (stateRef.current.groups.some(g => g.name === trimmed)) {
        setState(prev => ({ ...prev, activeGroup: trimmed }));
        return;
      }
      // Optimistic: add the group immediately (id arrives asynchronously)
      setState(prev => {
        const next: StoredWatchlists = {
          groups: [...prev.groups, { name: trimmed, tickers: [] }],
          activeGroup: trimmed,
        };
        persistLocal(next);
        return next;
      });
      supabase
        .from('watchlists')
        .insert({ user_id: currentUser.id, name: trimmed, tickers: [] })
        .select('id, name, tickers')
        .single()
        .then(({ data }) => {
          if (!data) return;
          const row = data as WatchlistRow;
          // Patch the real id into the optimistically-added group.
          // Also sync any tickers that were added while the id was still pending
          // (add() skips sbUpdate when group.id is undefined — catch up here).
          setState(prev => {
            const pending = prev.groups.find(g => g.name === trimmed && !g.id);
            if (pending && pending.tickers.length > 0) {
              sbUpdate(row.id, { tickers: pending.tickers });
            }
            return {
              ...prev,
              groups: prev.groups.map(g =>
                g.name === trimmed && !g.id ? { ...g, id: row.id } : g,
              ),
            };
          });
        });
    } else {
      setState(prev => {
        if (prev.groups.some(g => g.name === trimmed)) {
          const next = { ...prev, activeGroup: trimmed };
          persistLocal(next);
          return next;
        }
        const next: StoredWatchlists = {
          groups: [...prev.groups, { name: trimmed, tickers: [] }],
          activeGroup: trimmed,
        };
        persistLocal(next);
        return next;
      });
    }
  }, []);

  const renameGroup = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    const currentUser = userRef.current;
    const groupId = stateRef.current.groups.find(g => g.name === oldName)?.id;

    setState(prev => {
      const next: StoredWatchlists = {
        groups: prev.groups.map(g => g.name === oldName ? { ...g, name: trimmed } : g),
        activeGroup: prev.activeGroup === oldName ? trimmed : prev.activeGroup,
      };
      persistLocal(next);
      return next;
    });

    if (currentUser && supabase) {
      if (groupId) {
        sbUpdate(groupId, { name: trimmed });
      } else {
        // Group INSERT may still be in flight (no id yet) — update by user_id + old name
        supabase.from('watchlists')
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq('user_id', currentUser.id)
          .eq('name', oldName)
          .then(() => {});
      }
    }
  }, []);

  const deleteGroup = useCallback((name: string) => {
    const currentUser = userRef.current;
    const groupId = stateRef.current.groups.find(g => g.name === name)?.id;

    setState(prev => {
      if (prev.groups.length <= 1) return prev;
      const remaining = prev.groups.filter(g => g.name !== name);
      const next: StoredWatchlists = {
        groups: remaining,
        activeGroup: prev.activeGroup === name ? remaining[0].name : prev.activeGroup,
      };
      persistLocal(next);
      return next;
    });

    if (currentUser && groupId) sbDelete(groupId);
  }, []);

  const add = useCallback((ticker: string, groupName?: string) => {
    const t = ticker.toUpperCase().trim();
    const target = groupName ?? stateRef.current.activeGroup;
    const group = stateRef.current.groups.find(g => g.name === target);
    if (!group || group.tickers.includes(t)) return;
    const newTickers = [...group.tickers, t];

    setState(prev => {
      const next: StoredWatchlists = {
        ...prev,
        groups: prev.groups.map(g => g.name === target ? { ...g, tickers: newTickers } : g),
      };
      persistLocal(next);
      return next;
    });

    if (userRef.current && group.id) sbUpdate(group.id, { tickers: newTickers });
  }, []);

  const remove = useCallback((ticker: string, groupName?: string) => {
    const t = ticker.toUpperCase().trim();
    const target = groupName ?? stateRef.current.activeGroup;
    const group = stateRef.current.groups.find(g => g.name === target);
    if (!group) return;
    const newTickers = group.tickers.filter(x => x !== t);

    setState(prev => {
      const next: StoredWatchlists = {
        ...prev,
        groups: prev.groups.map(g => g.name === target ? { ...g, tickers: newTickers } : g),
      };
      persistLocal(next);
      return next;
    });

    if (userRef.current && group.id) sbUpdate(group.id, { tickers: newTickers });
  }, []);

  const isInWatchlist = useCallback((ticker: string, groupName?: string): boolean => {
    const t = ticker.toUpperCase().trim();
    const target = groupName ?? stateRef.current.activeGroup;
    return stateRef.current.groups.find(g => g.name === target)?.tickers.includes(t) ?? false;
  }, []);

  const getGroupsForTicker = useCallback((ticker: string): string[] => {
    const t = ticker.toUpperCase().trim();
    return stateRef.current.groups.filter(g => g.tickers.includes(t)).map(g => g.name);
  }, []);

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
