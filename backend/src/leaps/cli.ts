// LEAPS backtest on modeled prices (docs/leaps-rules.md section 9), books L1-L3.
// Usage: npm run leaps -- [--from 2016-10-25] [--to YYYY-MM-DD] [--book L1|L2|L3|all] [--save] [--trades]
import 'dotenv/config';
import { getSettings } from '../lib/settings.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { lastCompleteSession } from '../backtest/report.js';
import { LEAPS_BOOKS, LEAPS_RULES_VERSION, addDays, type LeapsBook } from './rules.js';
import { parseLeapsRunRequest, replayLeaps } from './runner.js';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const lastSession = lastCompleteSession(toEtClock(new Date()));
const parsed = parseLeapsRunRequest({ from: opt('from') ?? addDays(lastSession, -3653), to: opt('to') ?? lastSession }, lastSession);
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(1);
}
const bookArg = (opt('book') ?? 'all').toUpperCase();
const books = bookArg === 'ALL' ? LEAPS_BOOKS : LEAPS_BOOKS.filter(b => b === bookArg as LeapsBook);

const { settings } = await getSettings();
const { outcomes, missing, symbols } = await replayLeaps(parsed.request, args.includes('--save'), books);
console.log(`LEAPS rules v${LEAPS_RULES_VERSION} | ${parsed.request.from} -> ${parsed.request.to} | ${symbols} symbols | start $${settings.leaps.startingBalance.toLocaleString()}`);
if (missing.length) console.log(`no history (skipped): ${missing.join(', ')}`);
console.log('');

for (const { result, summary: s, runId } of outcomes) {
  console.log(`== ${result.book}: ${s.trades} closed, ${s.openAtEnd} open | return ${s.returnPct}% (CAGR ${s.cagrPct ?? '-'}%, SPY ${s.spyReturnPct ?? '-'}%) | max DD ${s.maxDrawdownPct}%`);
  console.log(`   win rate ${s.winRate ?? '-'}% | reached +100% ${s.halfSaleRate ?? '-'}% | half P&L $${s.halfPnl} | runner P&L $${s.runnerPnl} | avg hold ${s.avgHoldDays ?? '-'} days | unrealized $${s.unrealizedPnl}`);
  console.log(`   exits: ${Object.entries(s.exitReasons).map(([r, c]) => `${r} x${c}`).join('; ') || '-'}`);
  for (const e of s.episodes) console.log(`   episode ${e.id}..${e.end} (SPY -${e.maxSpyOffHighPct}%): ${e.trades} trades, $${e.pnl}`);
  const skips = Object.entries(s.skips).sort((a, b) => b[1] - a[1]);
  if (skips.length) console.log(`   skipped: ${skips.map(([r, c]) => `${r} x${c}`).join('; ')}`);
  if (args.includes('--trades')) {
    for (const t of result.trades) {
      console.log(`   ${t.symbol} ${t.strike}C ${t.expiry} ${t.entryDate}->${t.exitDate} cost $${t.cost} pnl $${t.pnl}${t.halfDate ? ` (half ${t.halfDate})` : ''} ${t.exitReason}`);
    }
  }
  if (runId) console.log(`   saved run ${runId}`);
  console.log('');
}
process.exit(0);
