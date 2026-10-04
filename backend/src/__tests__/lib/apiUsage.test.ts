import { describe, it, expect } from 'vitest';
import { pendingCalls, recordApiCall, utcDay } from '../../lib/apiUsage.js';

describe('apiUsage', () => {
  it('formats the UTC day', () => {
    expect(utcDay(new Date('2026-10-05T23:30:00-04:00'))).toBe('2026-10-06');
  });

  it('accumulates pending calls per source', () => {
    const before = pendingCalls('signa');
    recordApiCall('signa');
    recordApiCall('signa', 2);
    recordApiCall('yahoo-options');
    expect(pendingCalls('signa')).toBe(before + 3);
    expect(pendingCalls('signa', '1999-01-01')).toBe(0);
  });
});
