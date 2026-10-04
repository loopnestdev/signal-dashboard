// NYSE full-day closures - update annually alongside fomc.ts.
const NYSE_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

// 1:00 PM ET early closes.
const NYSE_EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26']);

export const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;
const EARLY_CLOSE_MINUTE = 13 * 60;

export interface EtClock {
  date: string;   // YYYY-MM-DD in America/New_York
  minute: number; // minutes since ET midnight
  weekday: number; // 0 = Sunday
}

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toEtClock(d: Date): EtClock {
  const parts = Object.fromEntries(etFormatter.formatToParts(d).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

export function isTradingDay(date: string): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !NYSE_HOLIDAYS.has(date);
}

export function closeMinuteFor(date: string): number {
  return NYSE_EARLY_CLOSES.has(date) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE;
}

// Session date for a timestamp: the ET calendar date it falls on.
export function etDateOf(iso: string | number | Date): string {
  return toEtClock(new Date(iso)).date;
}

// The n most recent trading sessions up to and including `date`, newest first.
export function recentTradingDays(date: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${date}T12:00:00Z`);
  while (out.length < n) {
    const iso = d.toISOString().slice(0, 10);
    if (isTradingDay(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
