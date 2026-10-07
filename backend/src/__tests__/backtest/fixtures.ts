import { DEFAULT_SETTINGS, type TradingSettings } from '../../lib/settings.js';
import { tradingDaysInRange } from '../../backtest/data.js';
import type { Bar, DayData, EarningsEvent, MarketData, OptionQuote, SignalSnap } from '../../backtest/types.js';

export function emptyDay(date: string): DayData {
  return {
    date, signals: new Map(), scanner: new Map(), gex: new Map(), flow: new Map(), curated: [],
    dp: new Map(), quotes: new Map(), iv30: new Map(),
  };
}

export function quote(contract: string, strike: number, bid: number, ask: number, delta: number, over: Partial<OptionQuote> = {}): OptionQuote {
  return {
    contract, symbol: 'NVDA', type: 'CALL', strike, expiry: '2026-11-20', bid, ask, iv: 0.4, delta, openInterest: 1000, ...over,
  };
}

export function signal(symbol: string, over: Partial<SignalSnap> = {}): SignalSnap {
  return { symbol, engineDirection: 'BULLISH', engineGrade: 'B', engineScore: 70, price: 100, entry: null, stop: 95, target: null, ...over };
}

export function flatBars(symbol: string, from: string, to: string, close = 100, overrides: Record<string, Partial<Bar>> = {}): Bar[] {
  const lookback = tradingDaysInRange('2026-08-03', to).filter(d => d < from).map(date => ({ date, open: close, high: close + 1, low: close - 1, close }));
  const range = tradingDaysInRange(from, to).map(date => ({ date, open: close, high: close + 1, low: close - 1, close, ...overrides[date] }));
  return [...lookback, ...range];
}

export function fakeMarket(
  from: string,
  to: string,
  build: (d: DayData) => void,
  bars: Record<string, Bar[]> = {},
  earnings: Record<string, EarningsEvent[]> = {},
): MarketData {
  const days = tradingDaysInRange(from, to);
  const cache = new Map<string, DayData>();
  return {
    days,
    async day(date) {
      if (!cache.has(date)) { const d = emptyDay(date); build(d); cache.set(date, d); }
      return cache.get(date)!;
    },
    async bars(symbol) { return bars[symbol] ?? []; },
    earnings: symbol => earnings[symbol] ?? [],
  };
}

export function settingsWith(patch: (s: TradingSettings) => void): TradingSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return s;
}
