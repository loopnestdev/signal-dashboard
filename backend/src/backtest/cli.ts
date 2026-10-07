// Replay the stored history under the current trading rules (RULES_VERSION).
// Usage: npm run backtest -- --from 2026-10-05 --to 2026-10-07 [--book A|B|C|all] [--save] [--trades]
import 'dotenv/config';
import { getSettings, RULES_VERSION } from '../lib/settings.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { parseRunRequest } from './report.js';
import { replay } from './runner.js';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const today = toEtClock(new Date()).date;
const bookArg = (opt('book') ?? 'all').toUpperCase();
const parsed = parseRunRequest({ from: opt('from') ?? '2026-10-05', to: opt('to') ?? today, books: bookArg === 'ALL' ? undefined : [bookArg] }, today);
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(1);
}

const { settings } = await getSettings();
const { sessions, outcomes } = await replay(parsed.request, args.includes('--save'));
console.log(`Rules v${RULES_VERSION} | ${sessions.length} sessions ${sessions[0]} -> ${sessions.at(-1)} | start $${settings.paperStartingBalance.toLocaleString()}\n`);

for (const { result, summary: s, runId } of outcomes) {
  console.log(`== Book ${result.book}: ${s.trades} closed, ${s.openAtEnd} open | return ${s.returnPct}% (SPY ${s.spyReturnPct ?? '-'}%) | max DD ${s.maxDrawdownPct}% | avg R ${s.avgR ?? '-'} | PF ${s.profitFactor ?? '-'}`);
  console.log(`   unrealized $${s.unrealizedPnl} | modeled option fills ${s.modeledFillShare ?? '-'}% | modeled marks ${result.modeledMarks}`);
  const skips = Object.entries(s.skipsByReason).sort((a, b) => b[1] - a[1]);
  if (skips.length) console.log(`   skipped: ${skips.map(([r, c]) => `${r} x${c}`).join('; ')}`);
  for (const p of result.openAtEnd) console.log(`   open: ${p.symbol} ${p.kind} ${p.direction} since ${p.entryDate}, unrealized $${p.unrealizedPnl} on $${p.risk} risk`);
  if (args.includes('--trades')) {
    for (const t of result.trades) {
      console.log(`   ${t.symbol} ${t.kind} ${t.direction} ${t.entryDate}->${t.exitDate} pnl $${t.pnl} (${t.rMultiple}R) ${t.exitReason}${t.shadowPnl != null ? ` | held-through $${t.shadowPnl}` : ''}`);
    }
  }
  if (runId) console.log(`   saved run ${runId}`);
  console.log('');
}
process.exit(0);
