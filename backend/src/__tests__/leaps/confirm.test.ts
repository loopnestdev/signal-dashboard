import { describe, it, expect } from 'vitest';
import { confirmationFor } from '../../leaps/confirm.js';

describe('confirmationFor', () => {
  const dpBuy = [{ buy_volume: 600, sell_volume: 400 }];
  it('confirms dark pool buying plus call-heavy flow', () => {
    const c = confirmationFor(dpBuy, [{ option_type: 'CALL', premium: 3e6 }, { option_type: 'PUT', premium: 1e6 }], []);
    expect(c).toMatchObject({ dpBuyShare: 0.6, dpPass: true, callRatio: 3, flowPass: true, printPass: false, confirmed: true });
  });
  it('confirms dark pool buying plus a large long-dated call print', () => {
    const raw = [
      { option_type: 'CALL', premium: 400_000, expiry: '2028-01-21', trade_date: '2026-10-20' },
      { option_type: 'CALL', premium: 900_000, expiry: '2027-01-15', trade_date: '2026-10-20' },   // < 365 days
      { option_type: 'PUT', premium: 900_000, expiry: '2028-01-21', trade_date: '2026-10-20' },
    ];
    const c = confirmationFor(dpBuy, [], raw);
    expect(c).toMatchObject({ leapsPrints: 1, leapsPrintPremium: 400_000, printPass: true, flowPass: null, confirmed: true });
  });
  it('does not confirm without dark pool buying, and marks missing data as null', () => {
    const c = confirmationFor([], [{ option_type: 'CALL', premium: 1e6 }], []);
    expect(c).toMatchObject({ dpBuyShare: null, dpPass: null, flowPass: true, confirmed: false });
    expect(confirmationFor([{ buy_volume: 400, sell_volume: 600 }], [], []).confirmed).toBe(false);
  });
});
