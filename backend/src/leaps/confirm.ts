import { daysBetween, RULES } from './rules.js';

// Signa confirmation (docs/leaps-rules.md section 3). Recorded with each entry, never blocks one.
// Uses only what the collector already stored: dark pool and flow alerts exist for tracked symbols only.

export interface Confirmation {
  dpBuyShare: number | null;
  dpPass: boolean | null;          // null = no data
  callRatio: number | null;
  flowPass: boolean | null;
  leapsPrints: number;
  leapsPrintPremium: number;
  printPass: boolean;
  confirmed: boolean;
}

export function confirmationFor(
  dp: { buy_volume: number | string; sell_volume: number | string }[],
  flow: { option_type: string; premium: number | string }[],
  raw: { option_type: string; premium: number | string; expiry: string; trade_date: string }[],
): Confirmation {
  const buy = dp.reduce((s, r) => s + Number(r.buy_volume), 0);
  const sell = dp.reduce((s, r) => s + Number(r.sell_volume), 0);
  const dpBuyShare = buy + sell > 0 ? buy / (buy + sell) : null;
  const calls = flow.filter(f => f.option_type === 'CALL').reduce((s, f) => s + Number(f.premium), 0);
  const puts = flow.filter(f => f.option_type === 'PUT').reduce((s, f) => s + Number(f.premium), 0);
  const callRatio = calls + puts > 0 ? (puts > 0 ? calls / puts : Infinity) : null;
  const prints = raw.filter(r => r.option_type === 'CALL' && Number(r.premium) >= RULES.leapsPrintPremium && daysBetween(r.trade_date, r.expiry) >= RULES.leapsPrintDays);
  const dpPass = dpBuyShare == null ? null : dpBuyShare >= RULES.dpBuyShare;
  const flowPass = callRatio == null ? null : callRatio >= RULES.flowCallRatio;
  const printPass = prints.length > 0;
  return {
    dpBuyShare: dpBuyShare == null ? null : Math.round(dpBuyShare * 1000) / 1000,
    dpPass,
    callRatio: callRatio == null || !Number.isFinite(callRatio) ? callRatio : Math.round(callRatio * 100) / 100,
    flowPass,
    leapsPrints: prints.length,
    leapsPrintPremium: prints.reduce((s, r) => s + Number(r.premium), 0),
    printPass,
    // Dark pool accumulation plus either call-heavy flow or a large long-dated call print.
    confirmed: dpPass === true && (flowPass === true || printPass),
  };
}
