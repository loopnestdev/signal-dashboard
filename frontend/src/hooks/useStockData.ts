import { useState, useCallback } from 'react';
import { fetchStockData } from '../lib/stockApi';
import type { StockResponse } from '../types/stock';

interface StockDataState {
  data: StockResponse | null;
  loading: boolean;
  error: string | null;
  activeTicker: string | null;
}

interface UseStockData extends StockDataState {
  load: (ticker: string) => Promise<void>;
  clear: () => void;
}

export function useStockData(): UseStockData {
  const [state, setState] = useState<StockDataState>({
    data: null,
    loading: false,
    error: null,
    activeTicker: null,
  });

  const load = useCallback(async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    setState(prev => ({ ...prev, loading: true, error: null, activeTicker: t }));
    try {
      const data = await fetchStockData(t);
      setState({ data, loading: false, error: null, activeTicker: t });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const clear = useCallback(() => {
    setState({ data: null, loading: false, error: null, activeTicker: null });
  }, []);

  return { ...state, load, clear };
}
