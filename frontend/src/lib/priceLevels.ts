/**
 * Validates whether stop/target price levels make directional sense.
 * Extracted from SignaCard.tsx for testability.
 */

export interface PriceLevelValidity {
  isLong: boolean;
  entryRef: number;
  stopValid: boolean;
  targetValid: boolean;
  rrValid: boolean;
}

/**
 * Returns which price levels are directionally valid for the given signal.
 *
 * For LONG:  stop must be below entry, target must be above entry.
 * For SHORT: stop must be above entry, target must be below entry.
 * Invalid levels (inverted or zero) are flagged as invalid — the UI shows '—'.
 */
export function validatePriceLevels(
  direction: string,
  entry: number,
  stop: number,
  target: number,
  rr: number,
  currentPrice: number,
): PriceLevelValidity {
  const isLong = ['BULLISH', 'LONG', 'BUY'].includes(direction.toUpperCase());
  const entryRef = entry > 0 ? entry : currentPrice;
  const stopValid = stop > 0 && (isLong ? stop < entryRef : stop > entryRef);
  const targetValid = target > 0 && (isLong ? target > entryRef : target < entryRef);
  const rrValid = stopValid && targetValid && rr > 0;
  return { isLong, entryRef, stopValid, targetValid, rrValid };
}
