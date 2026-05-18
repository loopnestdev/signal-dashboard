// FOMC decision dates (second day of each 2-day meeting, announcement ~2pm ET)
const FOMC_DATES = [
  '2025-07-30',
  '2025-09-17',
  '2025-11-07',
  '2025-12-17',
  '2026-01-28',
  '2026-03-18',
  '2026-04-29',
  '2026-06-10',
  '2026-07-29',
  '2026-09-16',
  '2026-10-28',
  '2026-12-09',
  '2027-01-27',
];

export interface FomcEvent {
  date: string;
  hoursUntil: number;
}

export function getUpcomingFOMC(): FomcEvent | null {
  const now = new Date();
  for (const dateStr of FOMC_DATES) {
    const fomcDate = new Date(dateStr + 'T19:00:00Z'); // 2pm ET = 19:00 UTC
    const hoursUntil = (fomcDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil >= -2 && hoursUntil <= 72) {
      return { date: dateStr, hoursUntil: Math.max(0, Math.round(hoursUntil)) };
    }
  }
  return null;
}

// Derived from Fed funds rate trajectory — update as conditions change
export function getFedStance(): 'hawkish' | 'neutral' | 'dovish' {
  // As of mid-2026: Fed has been in an easing cycle since late 2024
  return 'neutral';
}
