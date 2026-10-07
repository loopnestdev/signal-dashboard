import { etDateOf, isTradingDay } from '../lib/marketCalendar.js';
import { selectAll } from '../lib/supabaseRest.js';
import { getDailyBars } from '../lib/yahooClient.js';
import type { Bar, DayData, EarningsEvent, MarketData, OptionQuote } from './types.js';

// MarketData backed by the collector tables (Supabase) + daily bars from Yahoo. Loads one session at a time.

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function tradingDaysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (isTradingDay(iso)) out.push(iso);
  }
  return out;
}

export async function loadMarketData(from: string, to: string): Promise<MarketData> {
  const days = tradingDaysInRange(from, to);

  const earningsRows = await selectAll<{ symbol: string; report_date: string; report_time: EarningsEvent['time'] }>(
    'earnings_calendar', 'select=symbol,report_date,report_time&order=symbol,report_date');
  const earnings = new Map<string, EarningsEvent[]>();
  for (const r of earningsRows) {
    earnings.set(r.symbol, [...(earnings.get(r.symbol) ?? []), { date: r.report_date, time: r.report_time }]);
  }

  const dpRows = await selectAll<{ symbol: string; trade_date: string; buy_volume: number; sell_volume: number; num_prints: number }>(
    'dp_daily', `select=symbol,trade_date,buy_volume,sell_volume,num_prints&trade_date=gte.${from}&trade_date=lte.${to}&order=trade_date,symbol`);

  const barCache = new Map<string, Promise<Bar[]>>();

  return {
    days,
    earnings: symbol => earnings.get(symbol) ?? [],
    bars: symbol => {
      if (!barCache.has(symbol)) barCache.set(symbol, getDailyBars(symbol, '6mo').catch(() => []));
      return barCache.get(symbol)!;
    },
    async day(date: string): Promise<DayData> {
      const eq = `trade_date=eq.${date}`;
      const [signals, scanner, gex, flow, curated, quotes, iv] = await Promise.all([
        selectAll<Record<string, unknown>>('signal_snapshots', `select=symbol,engine_direction,engine_grade,engine_score,price,entry,stop,target,captured_at&${eq}&order=symbol`),
        selectAll<Record<string, unknown>>('scanner_candidates', `select=symbol,score,confluence,options_bias,dp_direction,dp_sustained_days,passed_filters&${eq}&order=symbol`),
        selectAll<Record<string, unknown>>('gex_daily', `select=symbol,spot,gamma_flip,call_wall,put_wall&${eq}&order=symbol`),
        selectAll<{ symbol: string; option_type: string; premium: number }>('flow_alerts', `select=symbol,option_type,premium&${eq}&order=id`),
        selectAll<{ symbol: string; direction: string | null; conviction_score: number | null }>('curated_flow', `select=symbol,direction,conviction_score&${eq}&order=id`),
        selectAll<Record<string, unknown>>('option_quotes', `select=contract_symbol,symbol,option_type,strike,expiry,bid,ask,iv,delta,open_interest&${eq}&order=contract_symbol`),
        selectAll<{ symbol: string; iv30: number | null }>('iv_daily', `select=symbol,iv30&${eq}&order=symbol`),
      ]);

      const flowTotals = new Map<string, { callPremium: number; putPremium: number }>();
      for (const f of flow) {
        const t = flowTotals.get(f.symbol) ?? { callPremium: 0, putPremium: 0 };
        if (f.option_type === 'CALL') t.callPremium += Number(f.premium); else t.putPremium += Number(f.premium);
        flowTotals.set(f.symbol, t);
      }

      const quoteMap = new Map<string, OptionQuote[]>();
      for (const q of quotes) {
        const sym = String(q.symbol);
        quoteMap.set(sym, [...(quoteMap.get(sym) ?? []), {
          contract: String(q.contract_symbol), symbol: sym, type: q.option_type as 'CALL' | 'PUT',
          strike: Number(q.strike), expiry: String(q.expiry), bid: n(q.bid), ask: n(q.ask), iv: n(q.iv),
          delta: n(q.delta), openInterest: n(q.open_interest),
        }]);
      }

      return {
        date,
        // A snapshot captured before its session (manual test runs) is not that session's data
        signals: new Map(signals.filter(s => etDateOf(String(s.captured_at)) === date).map(s => [String(s.symbol), {
          symbol: String(s.symbol), engineDirection: (s.engine_direction as string) ?? null, engineGrade: (s.engine_grade as string) ?? null,
          engineScore: n(s.engine_score), price: n(s.price), entry: n(s.entry), stop: n(s.stop), target: n(s.target),
        }])),
        scanner: new Map(scanner.map(c => [String(c.symbol), {
          symbol: String(c.symbol), score: Number(c.score), confluence: Boolean(c.confluence),
          optionsBias: c.options_bias as 'BULLISH' | 'BEARISH' | 'MIXED', dpDirection: String(c.dp_direction),
          dpSustainedDays: Number(c.dp_sustained_days), passedFilters: Boolean(c.passed_filters),
        }])),
        gex: new Map(gex.map(g => [String(g.symbol), {
          symbol: String(g.symbol), spot: n(g.spot), gammaFlip: n(g.gamma_flip), callWall: n(g.call_wall), putWall: n(g.put_wall),
        }])),
        flow: flowTotals,
        curated: curated.map(c => ({ symbol: c.symbol, direction: c.direction, conviction: n(c.conviction_score) })),
        dp: new Map(dpRows.filter(r => r.trade_date === date).map(r => [r.symbol, { buy: Number(r.buy_volume), sell: Number(r.sell_volume), prints: Number(r.num_prints) }])),
        quotes: quoteMap,
        iv30: new Map(iv.filter(r => r.iv30 != null).map(r => [r.symbol, Number(r.iv30)])),
      };
    },
  };
}
