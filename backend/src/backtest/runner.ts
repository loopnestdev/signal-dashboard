import { getSettings, RULES_VERSION } from '../lib/settings.js';
import { loadMarketData } from './data.js';
import { runBacktest, type BacktestResult } from './engine.js';
import { summarize, type Summary } from './metrics.js';
import type { RunRequest } from './report.js';
import { saveRun } from './store.js';

// One replay of the requested books with the saved settings; shared by the CLI and POST /api/backtest/run.

export interface BookOutcome {
  result: BacktestResult;
  summary: Summary;
  runId: string | null;
}

export async function replay(req: RunRequest, save: boolean, onBook?: (book: string) => void): Promise<{ sessions: string[]; outcomes: BookOutcome[] }> {
  const { settings } = await getSettings();
  const data = await loadMarketData(req.from, req.to);
  const spy = await data.bars('SPY');
  const outcomes: BookOutcome[] = [];
  for (const book of req.books) {
    onBook?.(book);
    const result = await runBacktest(data, book, settings);
    const summary = summarize(result, spy);
    const runId = save ? await saveRun(result, summary, settings) : null;
    outcomes.push({ result, summary, runId });
  }
  return { sessions: data.days, outcomes };
}

// A replay over weeks of history takes minutes, longer than a request should wait, so the API runs one at a time
// in the background and the page polls this state.
export interface ReplayJob {
  state: 'running' | 'done' | 'failed';
  request: RunRequest;
  rulesVersion: string;
  startedAt: string;
  finishedAt: string | null;
  currentBook: string | null;
  runIds: string[];
  error: string | null;
  startedBy: string;
}

let job: ReplayJob | null = null;

export const currentJob = (): ReplayJob | null => job;

export function startReplayJob(req: RunRequest, startedBy: string): ReplayJob | null {
  if (job?.state === 'running') return null;
  const j: ReplayJob = {
    state: 'running', request: req, rulesVersion: RULES_VERSION, startedAt: new Date().toISOString(), finishedAt: null,
    currentBook: null, runIds: [], error: null, startedBy,
  };
  job = j;
  replay(req, true, book => { j.currentBook = book; })
    .then(({ outcomes }) => {
      j.runIds = outcomes.map(o => o.runId!).filter(Boolean);
      j.state = 'done';
    })
    .catch(err => {
      j.error = err instanceof Error ? err.message : String(err);
      j.state = 'failed';
      console.warn('[backtest] replay failed:', err);
    })
    .finally(() => {
      j.finishedAt = new Date().toISOString();
      j.currentBook = null;
    });
  return j;
}
