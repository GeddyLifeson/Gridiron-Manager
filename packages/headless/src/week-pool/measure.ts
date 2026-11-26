// G-97: times a week of real games played one after another and on the pool, and checks the two give the
// same bytes. Run: npx tsx packages/headless/src/week-pool/measure.ts [ruleSetId] [games] [workers]
// -> one JSON line. `workers` is the number of worker threads; the calling thread plays games too.
import { hashOf } from '../batch/run.ts';
import { loadJobRunner } from './job-module.ts';
import { createSyncPool } from './pool.ts';
import { realWeekRef, type WeekGameJob, type WeekGameOutcome } from './real-week.ts';

export interface WeekMeasure {
  readonly ruleSetId: string; readonly games: number; readonly workers: number;
  readonly serialMs: number; readonly poolMs: number; readonly speedup: number;
  /** Serial play, the first pool run and the second pool run gave the same results. */
  readonly identical: boolean;
  readonly resultsHash: string;
}

/** Jobs with seeds spread over the 64-bit space by a fixed rule. Not a world's seeds: a timing workload. */
export function measureJobs(ruleSetId: string, games: number): WeekGameJob[] {
  return Array.from({ length: games }, (_, i) => ({ gameId: i + 1, seedHex: (BigInt(i + 1) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn).toString(16).padStart(16, '0'), ruleSetId }));
}

export async function measureWeek(ruleSetId: string, games: number, workers: number): Promise<WeekMeasure> {
  const ref = realWeekRef();
  const runner = await loadJobRunner<WeekGameJob, WeekGameOutcome>(ref);
  const jobs = measureJobs(ruleSetId, games);
  jobs.slice(0, 2).map(runner); // warm-up
  let t = performance.now();
  const serial = jobs.map(runner);
  const serialMs = performance.now() - t;
  const pool = createSyncPool<WeekGameJob, WeekGameOutcome>({ module: ref, workers, mainRunner: runner });
  try {
    const first = pool.run(jobs); // includes worker start-up
    t = performance.now();
    const second = pool.run(jobs);
    const poolMs = performance.now() - t;
    const h = hashOf(serial);
    return { ruleSetId, games, workers, serialMs, poolMs, speedup: serialMs / poolMs, identical: h === hashOf(first) && h === hashOf(second), resultsHash: h };
  } finally { await pool.close(); }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  const [rules = 'pro_2026', games = '32', workers = '3'] = process.argv.slice(2);
  measureWeek(rules, Number(games), Number(workers)).then((m) => { console.log(JSON.stringify(m)); if (!m.identical) process.exitCode = 1; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
}
