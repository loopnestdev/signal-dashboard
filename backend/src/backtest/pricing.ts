import type { OptionType } from './types.js';

// Black-Scholes, used only when a held contract has no recorded quote that day (the fill is then flagged "modeled").
const RISK_FREE = 0.045;

// Abramowitz-Stegun 7.1.26 via erf; accurate to ~1e-7, plenty for marking positions.
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function yearsBetween(from: string, to: string): number {
  return (Date.parse(`${to}T20:00:00Z`) - Date.parse(`${from}T20:00:00Z`)) / (365 * 86_400_000);
}

// Price per share of the underlying (multiply by 100 for one contract).
export function blackScholes(type: OptionType, spot: number, strike: number, years: number, iv: number, rate = RISK_FREE): number {
  if (years <= 0 || iv <= 0) return Math.max(0, type === 'CALL' ? spot - strike : strike - spot);
  const sd = iv * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * years) / sd;
  const d2 = d1 - sd;
  return type === 'CALL'
    ? spot * normCdf(d1) - strike * Math.exp(-rate * years) * normCdf(d2)
    : strike * Math.exp(-rate * years) * normCdf(-d2) - spot * normCdf(-d1);
}

export const MODELED_HALF_SPREAD = 0.03;
