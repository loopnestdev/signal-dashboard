import { useState, useEffect } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface MoatPeer {
  ticker: string;
  name: string;
  ps_ratio: number | null;
  ev_ebitda: number | null;
  gross_margin: number | null;
  yoy_growth: number | null;
}

export interface MoatScenario {
  label: 'Bear' | 'Base' | 'Bull';
  comp_ticker: string;
  comp_multiple: number;
  target_price: number;
  upside_percent: number;
  rationale: string;
}

export interface MoatData {
  ticker: string;
  score: number | null;
  thesis: string | null;
  peers: MoatPeer[];
  scenarios: MoatScenario[];
  updatedAt: string | null;
}

export function useMoatData(ticker: string | null): { data: MoatData | null; loading: boolean } {
  const [data, setData] = useState<MoatData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setData(null);

    const params = new URLSearchParams({
      select: 'ticker_symbol,score,report_json,updated_at',
      ticker_symbol: `eq.${ticker}`,
      limit: '1',
    });

    fetch(`${SUPABASE_URL}/rest/v1/research_reports?${params}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept-Profile': 'moat',
        'Content-Type': 'application/json',
      },
    })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((rows: Array<{ ticker_symbol: string; score: number; report_json: Record<string, unknown>; updated_at: string }>) => {
        if (cancelled) return;
        if (!rows?.length) { setData(null); setLoading(false); return; }
        const row = rows[0];
        const rj = (row.report_json ?? {}) as Record<string, unknown>;
        setData({
          ticker: row.ticker_symbol,
          score: row.score ?? null,
          thesis: (rj.thesis as string | undefined) ?? null,
          peers: (rj.valuation_table as MoatPeer[] | undefined) ?? [],
          scenarios: (rj.scenarios as MoatScenario[] | undefined) ?? [],
          updatedAt: row.updated_at ?? null,
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setData(null); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [ticker]);

  return { data, loading };
}
