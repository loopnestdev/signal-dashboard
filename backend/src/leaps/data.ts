import { selectAll, selectRows } from '../lib/supabaseRest.js';
import { getDailyBarsWithSplits, type DailyBar, type Split } from '../lib/yahooClient.js';
import type { LeapsHistory, Series, StockHistory } from './backtest.js';
import { splitFactorSince } from './market.js';
import type { QuarterFacts } from './quality.js';
import { addDays, INDEX_SYMBOLS, RULES } from './rules.js';
import { LEAPS_UNIVERSE } from './universe.js';

// Loads the LEAPS backtest's inputs: daily bars from Yahoo (universe + SPY + VIX + 6-month VIX + 13-week T-bill) and SEC quarters.

export type StoredQuarter = QuarterFacts & { ticker: string };

const toSeries = (bars: DailyBar[]): Series => ({ dates: bars.map(b => b.date), closes: bars.map(b => b.close) });

// Small parallel batches keep ~120 Yahoo requests quick without looking like a burst.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// SEC filers in the LEAPS list that file 10-Q/10-K (ADRs and foreign filers are excluded by the SEC sync).
export async function eligibleFilers(): Promise<string[]> {
  const rows = await selectRows<{ ticker: string; status: string }>('sec_companies', 'select=ticker,status&status=eq.eligible&order=ticker');
  const sec = new Set(rows.map(r => r.ticker));
  return LEAPS_UNIVERSE.filter(t => sec.has(t));
}

export async function quartersFor(symbols: string[]): Promise<Map<string, StoredQuarter[]>> {
  if (!symbols.length) return new Map();
  const rows = await selectAll<StoredQuarter>(
    'sec_quarters',
    `select=ticker,period_end,revenue,operating_income,net_income,diluted_shares&ticker=in.(${symbols.map(s => `"${s}"`).join(',')})&order=ticker,period_end`,
  );
  const out = new Map<string, StoredQuarter[]>();
  for (const r of rows) out.set(r.ticker, [...(out.get(r.ticker) ?? []), r]);
  return out;
}

// Market cap at the last close: newest filed share count, scaled for any split since that quarter ended.
export function marketCapNow(quarters: Pick<QuarterFacts, 'period_end' | 'diluted_shares'>[], lastClose: number, splits: Split[]): number | null {
  const q = [...quarters].reverse().find(x => x.diluted_shares != null && Number(x.diluted_shares) > 0);
  return q ? Number(q.diluted_shares) * splitFactorSince(splits, q.period_end) * lastClose : null;
}

export async function loadLeapsHistory(from: string, to: string): Promise<{ history: LeapsHistory; missing: string[] }> {
  // 52-week highs and 1-year volatility need a year of bars before the first replay day.
  const since = addDays(from, -Math.ceil(RULES.highLookback * 1.5));
  const symbols = await eligibleFilers();
  const quarters = await quartersFor(symbols);
  const fetchBars = (s: string) => getDailyBarsWithSplits(s, { since }).catch(() => ({ bars: [] as DailyBar[], splits: [] as Split[] }));
  const [spy, vix, vix6m, irx, ...indexBars] = await Promise.all(['SPY', '^VIX', '^VIX6M', '^IRX', ...INDEX_SYMBOLS].map(fetchBars));
  const loaded = await mapLimit(symbols, 4, async s => ({ s, ...(await fetchBars(s)) }));

  const missing: string[] = [];
  const stocks: StockHistory[] = [];
  for (const { s, bars, splits } of loaded) {
    const q = quarters.get(s) ?? [];
    if (bars.length < RULES.highLookback || !q.length) { missing.push(s); continue; }
    stocks.push({ symbol: s, ...toSeries(bars), quarters: q, marketCapNow: marketCapNow(q, bars.at(-1)!.close, splits) });
  }
  const spySeries = toSeries(spy.bars);
  return {
    history: {
      days: spySeries.dates.filter(d => d >= from && d <= to),
      spy: spySeries,
      vix: new Map(vix.bars.map(b => [b.date, b.close])),
      vix6m: new Map(vix6m.bars.map(b => [b.date, b.close])),
      rate: new Map(irx.bars.map(b => [b.date, b.close / 100])),
      stocks,
      index: INDEX_SYMBOLS.map((symbol, i) => ({ symbol, ...toSeries(indexBars[i].bars), quarters: [], marketCapNow: null })),
      spyTr: { dates: spy.bars.map(b => b.date), closes: spy.bars.map(b => b.adjClose ?? b.close) },
      qqqTr: { dates: indexBars[1].bars.map(b => b.date), closes: indexBars[1].bars.map(b => b.adjClose ?? b.close) },
    },
    missing,
  };
}
