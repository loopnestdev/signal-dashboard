import { Router } from 'express';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

const apiKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

router.get('/moat/:ticker', async (req, res) => {
  if (!SUPABASE_URL || !apiKey) {
    return res.status(503).json({ error: 'Moat integration not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });
  }

  const { ticker } = req.params;
  if (!/^[A-Za-z^.\-]{1,10}$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker symbol' });
  }

  const symbol = ticker.toUpperCase();

  try {
    const params = new URLSearchParams({
      select: 'ticker_symbol,score,report_json,updated_at',
      ticker_symbol: `eq.${symbol}`,
      limit: '1',
    });

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/research_reports?${params}`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Accept-Profile': 'moat',
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[moat] Supabase error ${resp.status}: ${text}`);
      return res.status(resp.status).json({ error: 'Supabase query failed', detail: text });
    }

    const rows = (await resp.json()) as Array<{
      ticker_symbol: string;
      score: number;
      report_json: Record<string, unknown>;
      updated_at: string;
    }>;

    if (!rows.length) {
      return res.status(404).json({ found: false, ticker: symbol });
    }

    const row = rows[0];
    const rj = row.report_json ?? {};

    return res.json({
      found: true,
      ticker: row.ticker_symbol,
      score: row.score ?? null,
      thesis: (rj.thesis as string | undefined) ?? null,
      peers: (rj.valuation_table as unknown[]) ?? [],
      scenarios: (rj.scenarios as unknown[]) ?? [],
      updatedAt: row.updated_at ?? null,
    });
  } catch (err) {
    console.error('[moat error]', err);
    return res.status(500).json({ error: 'Failed to fetch moat data', detail: String(err) });
  }
});

export default router;
