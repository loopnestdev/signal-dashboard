// Manual run: npm run collect -- <job> [YYYY-MM-DD]
// Example: npm run collect -- gex
import 'dotenv/config';
import { flushApiUsage } from '../lib/apiUsage.js';
import { toEtClock } from '../lib/marketCalendar.js';
import { runJob } from './jobs.js';
import { JOB_NAMES, type JobName } from './schedule.js';

const [job, date = toEtClock(new Date()).date] = process.argv.slice(2);

if (!JOB_NAMES.includes(job as JobName)) {
  console.error(`Usage: npm run collect -- <${JOB_NAMES.join('|')}> [YYYY-MM-DD]`);
  process.exit(1);
}

const result = await runJob(job as JobName, date);
await flushApiUsage();
process.exit(result.status === 'error' ? 1 : 0);
