// Direct Yahoo Finance v8 Chart API client
// No API key required; rate limits are generous for non-bot traffic

const YF_BASE = 'https://query1.finance.yahoo.com';
const YF_BASE2 = 'https://query2.finance.yahoo.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

type Range = '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y';

interface ChartResult {
  meta: {
    regularMarketPrice: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketTime: number;
    symbol: string;
  };
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: (number | null)[];
      high: (number | null)[];
      low: (number | null)[];
      close: (number | null)[];
      volume: (number | null)[];
    }>;
  };
}

async function fetchChart(symbol: string, range: Range, base = YF_BASE): Promise<ChartResult> {
  const s = encodeURIComponent(symbol);
  const url = `${base}/v8/finance/chart/${s}?interval=1d&range=${range}&includePrePost=false&events=div%2Csplits`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo [${res.status}] for ${symbol}`);
  const json = (await res.json()) as { chart: { result: ChartResult[]; error?: unknown } };
  if (json.chart.error) throw new Error(`Yahoo error for ${symbol}: ${JSON.stringify(json.chart.error)}`);
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`No chart data for ${symbol}`);
  return result;
}

async function fetchChartFallback(symbol: string, range: Range): Promise<ChartResult> {
  try {
    return await fetchChart(symbol, range, YF_BASE);
  } catch {
    return await fetchChart(symbol, range, YF_BASE2);
  }
}

export interface TickerQuote {
  symbol: string;
  price: number;
  change1d: number;
  closes: number[];
}

export async function getHistory(symbol: string, range: Range): Promise<number[]> {
  const result = await fetchChartFallback(symbol, range);
  const raw = result.indicators.quote[0]?.close ?? [];
  return raw.filter((c): c is number => typeof c === 'number' && c > 0);
}

export async function getQuote(symbol: string): Promise<TickerQuote> {
  const result = await fetchChartFallback(symbol, '5d');
  const closes = result.indicators.quote[0]?.close ?? [];
  const validCloses = closes.filter((c): c is number => typeof c === 'number' && c > 0);
  const price = result.meta.regularMarketPrice;
  const prevClose = result.meta.chartPreviousClose ?? result.meta.previousClose ?? price;
  const change1d = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  return { symbol, price, change1d, closes: validCloses };
}

export async function getHistoryAndQuote(symbol: string, range: Range): Promise<TickerQuote & { history: number[] }> {
  const result = await fetchChartFallback(symbol, range);
  const closes = result.indicators.quote[0]?.close ?? [];
  const history = closes.filter((c): c is number => typeof c === 'number' && c > 0);
  // Use regularMarketPrice (real-time) vs last historical close (yesterday's EOD)
  const price = result.meta.regularMarketPrice;
  const prevClose = history.length >= 1 ? history[history.length - 1] : price;
  const change1d = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  return { symbol, price, change1d, closes: history.slice(-5), history };
}

export interface StockProfile {
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
}

export async function getStockProfile(symbol: string): Promise<StockProfile> {
  const s = encodeURIComponent(symbol);
  try {
    const url = `${YF_BASE}/v11/finance/quoteSummary/${s}?modules=summaryProfile%2Cprice`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Yahoo quoteSummary [${res.status}]`);
    const json = await res.json() as {
      quoteSummary: {
        result?: Array<{
          summaryProfile?: { sector?: string; industry?: string } | null;
          price?: { shortName?: string; longName?: string; exchangeName?: string } | null;
        }> | null;
        error?: unknown;
      };
    };
    const r = json.quoteSummary?.result?.[0];
    return {
      name: r?.price?.longName ?? r?.price?.shortName ?? symbol,
      sector: r?.summaryProfile?.sector ?? null,
      industry: r?.summaryProfile?.industry ?? null,
      exchange: r?.price?.exchangeName ?? null,
    };
  } catch {
    return { name: symbol, sector: null, industry: null, exchange: null };
  }
}
