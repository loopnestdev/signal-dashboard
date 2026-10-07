// Replay the stored history under rules v1.0.
// Usage: npm run backtest -- --from 2026-10-05 --to 2026-10-07 [--book A|B|C|all] [--save] [--trades]
import 'dotenv/config';
import { getSettings, RULES_VERSION } from '../lib/settings.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { loadMarketData } from './data.js';
import { runBacktest } from './engine.js';
import { summarize } from './metrics.js';
import { saveRun } from './store.js';
import type { Book } from './types.js';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const from = opt('from') ?? '2026-10-05';
const to = opt('to') ?? toEtClock(new Date()).date;
const bookArg = (opt('book') ?? 'all').toUpperCase();
const books: Book[] = bookArg === 'ALL' ? ['A', 'B', 'C'] : [bookArg as Book];

const { settings } = await getSettings();
const data = await loadMarketData(from, to);
const spy = await data.bars('SPY');
console.log(`Rules v${RULES_VERSION} | ${data.days.length} sessions ${data.days[0]} -> ${data.days.at(-1)} | start $${settings.paperStartingBalance.toLocaleString()}\n`);

for (const book of books) {
  const result = await runBacktest(data, book, settings);
  const s = summarize(result, spy);
  console.log(`== Book ${book}: ${s.trades} closed, ${s.openAtEnd} open | return ${s.returnPct}% (SPY ${s.spyReturnPct ?? '-'}%) | max DD ${s.maxDrawdownPct}% | avg R ${s.avgR ?? '-'} | PF ${s.profitFactor ?? '-'}`);
  console.log(`   unrealized $${s.unrealizedPnl} | modeled option fills ${s.modeledFillShare ?? '-'}% | modeled marks ${result.modeledMarks}`);
  const skips = Object.entries(s.skipsByReason).sort((a, b) => b[1] - a[1]);
  if (skips.length) console.log(`   skipped: ${skips.map(([r, c]) => `${r} x${c}`).join('; ')}`);
  for (const p of result.openAtEnd) console.log(`   open: ${p.symbol} ${p.kind} ${p.direction} since ${p.entryDate}, unrealized $${p.unrealizedPnl} on $${p.risk} risk`);
  if (args.includes('--trades')) {
    for (const t of result.trades) {
      console.log(`   ${t.symbol} ${t.kind} ${t.direction} ${t.entryDate}->${t.exitDate} pnl $${t.pnl} (${t.rMultiple}R) ${t.exitReason}${t.shadowPnl != null ? ` | held-through $${t.shadowPnl}` : ''}`);
    }
  }
  if (args.includes('--save')) {
    const id = await saveRun(result, s, settings);
    console.log(`   saved run ${id}`);
  }
  console.log('');
}
process.exit(0);
