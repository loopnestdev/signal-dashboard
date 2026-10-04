import { OPEN_MINUTE, closeMinuteFor, isTradingDay } from '../lib/marketCalendar.js';

export type JobName =
  | 'signals'        // Signa Action Card (nightly engine) - before the open
  | 'darkpool'       // per-symbol dark pool prints - every 30 min in session
  | 'flow-alerts'    // per-symbol UW flow alerts - hourly, since active names hit the 50-alert cap
  | 'curated-flow'   // market-wide curated flow, filtered to the universe
  | 'option-chain'   // Yahoo option quotes near the close (no Signa calls)
  | 'gex'            // per-symbol GEX after the close
  | 'rollup'         // dp_daily rollup + raw print pruning (no API calls)
  | 'raw-flow'       // market-wide large prints (scanner discovery feed)
  | 'signa-scan'     // Signa 30-model scan, bullish + bearish (technical cross-check)
  | 'scanner';       // Radon discover scoring + promote/expire scanner symbols

export const JOB_NAMES: JobName[] = [
  'signals', 'signa-scan', 'raw-flow', 'darkpool', 'flow-alerts', 'curated-flow',
  'scanner', 'option-chain', 'gex', 'rollup',
];

// Signa calls per run: per-symbol jobs scale with the universe, market-wide jobs cost a fixed count,
// and the scanner spends up to SCANNER_DP_LOOKUPS dark pool calls on untracked candidates.
export const SIGNA_CALLS_PER_RUN: Record<JobName, 'per-symbol' | 'scanner' | number> = {
  signals: 'per-symbol',
  darkpool: 'per-symbol',
  'flow-alerts': 'per-symbol',
  'curated-flow': 1,
  'option-chain': 0,
  gex: 'per-symbol',
  rollup: 0,
  'raw-flow': 1,
  'signa-scan': 2,
  scanner: 'scanner',
};

const hm = (h: number, m: number) => h * 60 + m;

// Slots are ET minutes-since-midnight; close-relative slots follow early closes automatically.
export function jobSlots(job: JobName, date: string): number[] {
  const close = closeMinuteFor(date);
  const inSession = (slots: number[]) => slots.filter(s => s > OPEN_MINUTE && s <= close + 5);
  switch (job) {
    case 'signals':      return [hm(9, 0)];
    // Each pull is only the latest 50 prints (minutes of tape), so the daily buy ratio is built from snapshots;
    // 13 snapshots instead of 7 cut its sampling noise by about a quarter.
    case 'darkpool':     return inSession(Array.from({ length: 13 }, (_, i) => hm(10, 5) + i * 30));
    case 'flow-alerts':  return [...inSession([hm(10, 35), hm(11, 35), hm(12, 35), hm(13, 35), hm(14, 35), hm(15, 35)]), close + 10];
    case 'curated-flow': return [...inSession([hm(10, 30), hm(12, 30), hm(14, 30)]), close + 10];
    case 'option-chain': return [close - 15];
    case 'gex':          return [close + 20];
    case 'rollup':       return [close + 40];
    case 'signa-scan':   return [hm(9, 15)];
    // 200 prints >= $250k span ~5 hours (~40/hour, bursts of 60), so hourly deduped pulls stay under the cap.
    case 'raw-flow':     return [...inSession([hm(10, 15), hm(11, 15), hm(12, 15), hm(13, 15), hm(14, 15), hm(15, 15)]), close + 5];
    // Each scan follows a raw-flow pull and a dark pool pull, so it scores fresh data.
    case 'scanner':      return [...inSession([hm(11, 45), hm(14, 45)]), close + 30];
  }
}

// A slot stays runnable for this many minutes so a restart or a slow tick does not drop it.
export const SLOT_GRACE_MINUTES = 10;

export interface DueJob {
  job: JobName;
  slot: number;
  key: string;
}

export function dueJobs(date: string, minute: number, alreadyRan: Set<string>): DueJob[] {
  if (!isTradingDay(date)) return [];
  const due: DueJob[] = [];
  for (const job of JOB_NAMES) {
    for (const slot of jobSlots(job, date)) {
      const key = `${job}@${date}@${slot}`;
      if (minute >= slot && minute < slot + SLOT_GRACE_MINUTES && !alreadyRan.has(key)) {
        due.push({ job, slot, key });
      }
    }
  }
  return due;
}

export function estimatedSignaCallsPerDay(symbolCount: number, scannerLookups = 10, date = '2026-10-05'): number {
  return JOB_NAMES.reduce((sum, job) => {
    const per = SIGNA_CALLS_PER_RUN[job];
    const callsPerRun = per === 'per-symbol' ? symbolCount : per === 'scanner' ? scannerLookups : per;
    return sum + callsPerRun * jobSlots(job, date).length;
  }, 0);
}
