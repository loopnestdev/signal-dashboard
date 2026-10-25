import { blackScholes, normCdf } from '../backtest/pricing.js';

// Call-option math for the LEAPS book: delta, strike for a target delta, and the stock prices at which a held call
// breaks even or doubles (docs/leaps-rules.md section 8). Prices are per share; one contract = 100 shares.

export function callDelta(spot: number, strike: number, years: number, iv: number, rate: number): number {
  if (years <= 0 || iv <= 0) return spot > strike ? 1 : 0;
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * years) / (iv * Math.sqrt(years));
  return normCdf(d1);
}

// Inverse standard normal CDF (Acklam's rational approximation, relative error ~1e-9).
export function invNorm(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -invNorm(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Strike whose call delta equals `delta`: d1 = N^-1(delta) solved for K.
export function strikeForDelta(spot: number, years: number, iv: number, rate: number, delta: number): number {
  const sd = iv * Math.sqrt(years);
  return spot * Math.exp(-invNorm(delta) * sd + (rate + (iv * iv) / 2) * years);
}

// Listed-strike-like grid: the largest of the usual increments that is at most 2.5% of spot.
export function snapStrike(strike: number, spot: number): number {
  const steps = [100, 50, 25, 10, 5, 2.5, 1, 0.5];
  const step = steps.find(s => s <= spot * 0.025) ?? spot * 0.025;
  return Math.max(step, Math.round(strike / step) * step);
}

// Stock price at which the call is worth `value` per share. A call's price rises with the stock, so bisection is safe.
export function spotForValue(value: number, strike: number, years: number, iv: number, rate: number): number {
  if (years <= 0 || iv <= 0) return strike + value;
  let lo = 0;
  let hi = Math.max(strike * 4, strike + value * 4);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (blackScholes('CALL', mid, strike, years, iv, rate) < value) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface PriceLevels {
  breakEvenExpiry: number;
  breakEvenToday: number | null;
  doubleExpiry: number;
  doubleToday: number | null;
  doubleIn6m: number | null;
  sellLimit: number;          // option limit price per share for the +100% half sale
}

const cents = (n: number) => Math.round(n * 100) / 100;
const HALF_YEAR = 0.5;

// priceLevels:
//   - premium = price paid per share; commissions (round trip, per contract) only move break-even, not the +100% trigger
//   - "today" / "in 6 months" levels assume IV stays at `iv`; null when IV is unknown
export function priceLevels(p: { strike: number; premium: number; years: number; iv: number | null; rate: number; commissionPerContract: number }): PriceLevels {
  const commission = (2 * p.commissionPerContract) / 100;
  const ivOk = p.iv != null && p.iv > 0;
  const at = (value: number, years: number) => (ivOk && years > 0 ? cents(spotForValue(value, p.strike, years, p.iv!, p.rate)) : null);
  return {
    breakEvenExpiry: cents(p.strike + p.premium + commission),
    breakEvenToday: at(p.premium + commission, p.years),
    doubleExpiry: cents(p.strike + 2 * p.premium),
    doubleToday: at(2 * p.premium, p.years),
    doubleIn6m: p.years > HALF_YEAR ? at(2 * p.premium, p.years - HALF_YEAR) : null,
    sellLimit: cents(2 * p.premium),
  };
}
