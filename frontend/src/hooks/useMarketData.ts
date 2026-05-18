import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMarketData, triggerRefresh } from '../lib/api';
import type { MarketResponse } from '../types/market';

const REFRESH_INTERVAL = 45_000;

export function useMarketData() {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      if (forceRefresh) await triggerRefresh();
      const result = await fetchMarketData();
      setData(result);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(), REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [lastUpdated]);

  const refresh = useCallback(() => {
    setLoading(true);
    load(true);
  }, [load]);

  return { data, loading, error, lastUpdated, secondsAgo, refresh };
}
