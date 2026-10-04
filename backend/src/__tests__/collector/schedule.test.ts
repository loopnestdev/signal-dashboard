import { describe, it, expect } from 'vitest';
import { dueJobs, estimatedSignaCallsPerDay, jobSlots, SLOT_GRACE_MINUTES } from '../../collector/schedule.js';
import { closeMinuteFor, etDateOf, isTradingDay, toEtClock } from '../../lib/marketCalendar.js';

const hm = (h: number, m: number) => h * 60 + m;

describe('marketCalendar', () => {
  it('converts UTC instants to ET wall-clock across DST', () => {
    expect(toEtClock(new Date('2026-10-05T13:30:00Z'))).toMatchObject({ date: '2026-10-05', minute: hm(9, 30), weekday: 1 });
    expect(toEtClock(new Date('2026-12-07T14:30:00Z'))).toMatchObject({ date: '2026-12-07', minute: hm(9, 30) });
  });

  it('rolls the date at ET midnight, not UTC midnight', () => {
    expect(etDateOf('2026-10-06T03:59:00Z')).toBe('2026-10-05');
    expect(etDateOf('2026-10-06T04:00:00Z')).toBe('2026-10-06');
  });

  it('excludes weekends and NYSE holidays', () => {
    expect(isTradingDay('2026-10-05')).toBe(true);
    expect(isTradingDay('2026-10-03')).toBe(false);
    expect(isTradingDay('2026-11-26')).toBe(false);
    expect(isTradingDay('2027-03-26')).toBe(false);
  });

  it('knows early closes', () => {
    expect(closeMinuteFor('2026-11-27')).toBe(hm(13, 0));
    expect(closeMinuteFor('2026-11-30')).toBe(hm(16, 0));
  });
});

describe('jobSlots', () => {
  it('runs dark pool every 30 minutes through the regular session', () => {
    expect(jobSlots('darkpool', '2026-10-05')).toEqual([
      hm(10, 5), hm(10, 35), hm(11, 5), hm(11, 35), hm(12, 5), hm(12, 35), hm(13, 5),
      hm(13, 35), hm(14, 5), hm(14, 35), hm(15, 5), hm(15, 35), hm(16, 5),
    ]);
  });

  it('shifts close-relative jobs and drops after-close session slots on early-close days', () => {
    expect(jobSlots('darkpool', '2026-11-27')).toEqual([hm(10, 5), hm(10, 35), hm(11, 5), hm(11, 35), hm(12, 5), hm(12, 35), hm(13, 5)]);
    expect(jobSlots('gex', '2026-11-27')).toEqual([hm(13, 20)]);
    expect(jobSlots('option-chain', '2026-11-27')).toEqual([hm(12, 45)]);
    expect(jobSlots('flow-alerts', '2026-11-27')).toEqual([hm(10, 35), hm(11, 35), hm(12, 35), hm(13, 10)]);
  });

  it('fetches signals before the open', () => {
    expect(jobSlots('signals', '2026-10-05')).toEqual([hm(9, 0)]);
  });
});

describe('dueJobs', () => {
  it('returns jobs whose slot is within the grace window and not yet run', () => {
    const due = dueJobs('2026-10-05', hm(16, 22), new Set());
    expect(due.map(d => d.job)).toEqual(['gex']);
  });

  it('includes concurrent slots from different jobs', () => {
    expect(dueJobs('2026-10-05', hm(16, 10), new Set()).map(d => d.job).sort()).toEqual(['curated-flow', 'darkpool', 'flow-alerts', 'raw-flow']);
  });

  it('skips already-run keys and expired slots', () => {
    const [gex] = dueJobs('2026-10-05', hm(16, 20), new Set());
    expect(dueJobs('2026-10-05', hm(16, 21), new Set([gex.key]))).toEqual([]);
    expect(dueJobs('2026-10-05', hm(16, 20) + SLOT_GRACE_MINUTES, new Set()).map(d => d.job)).not.toContain('gex');
  });

  it('does nothing on non-trading days', () => {
    expect(dueJobs('2026-10-04', hm(16, 20), new Set())).toEqual([]);
  });
});

describe('estimatedSignaCallsPerDay', () => {
  it('counts per-symbol jobs x slots plus market-wide jobs and scanner lookups', () => {
    // per symbol: signals 1 + darkpool 13 + flow-alerts 7 + gex 1 = 22
    // market-wide: curated-flow 4 + raw-flow 7 + signa-scan 2 = 13; scanner: 3 runs x lookups
    expect(estimatedSignaCallsPerDay(24)).toBe(24 * 22 + 13 + 30);
    expect(estimatedSignaCallsPerDay(0, 0)).toBe(13);
  });

  it('schedules the scanner after a raw-flow pull in each window', () => {
    expect(jobSlots('raw-flow', '2026-10-05')).toEqual([hm(10, 15), hm(11, 15), hm(12, 15), hm(13, 15), hm(14, 15), hm(15, 15), hm(16, 5)]);
    expect(jobSlots('scanner', '2026-10-05')).toEqual([hm(11, 45), hm(14, 45), hm(16, 30)]);
    expect(jobSlots('signa-scan', '2026-10-05')).toEqual([hm(9, 15)]);
  });
});
