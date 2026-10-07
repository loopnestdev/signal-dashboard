import type { TradingSettings } from '../types/market';

// Mirror of backend riskPerTrade (lib/settings.ts) for the live preview while editing; the server stays authoritative.
export function riskPerTrade(balance: number, s: TradingSettings['sizing']): number {
  if (!(balance > 0)) return 0;
  const raw = balance >= s.fixedUntilBalance
    ? balance * s.pctAboveThreshold / 100
    : Math.min(s.fixedRiskUsd, balance * s.maxPctBelow / 100);
  return Math.round(raw * 100) / 100;
}
