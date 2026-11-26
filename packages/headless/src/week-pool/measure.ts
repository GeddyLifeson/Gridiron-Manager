// G-97: times a week of real games played one after another and on the pool, and checks the two give the
// same bytes. Run: npx tsx packages/headless/src/week-pool/measure.ts [ruleSetId] [games] [workers] [--bundle]
// -> one JSON line. `workers` is the number of worker threads; the calling thread plays games too.
// --bundle plays from plain JavaScript bundles of the worker and the job module (bundle.ts), in every
// thread, and also checks that the bundle gives the same bytes as the TypeScript sources.
import { hashOf } from '../batch/run.ts';
import { loadJobRunner } from './job-module.ts';
import { bundleForPool } from './bundle.ts';
import { createSyncPool } from './pool.ts';
import { realWeekRef, type WeekGameJob, type WeekGameOutcome } from './real-week.ts';

export interface WeekMeasure {
  readonly ruleSetId: string; readonly games: number; readonly workers: number;
  readonly serialMs: number; readonly poolMs: number; readonly speedup: number;
  /** Serial play, the first pool run and the second pool run gave the same results. */
  readonly identical: boolean;
  readonly resultsHash: string;
  /** Played from bundles (bundle.ts). */
  readonly bundled: boolean;
}

/** Jobs with seeds spread over the 64-bit space by a fixed rule. Not a world's seeds: a timing workload. */
export function measureJobs(ruleSetId: string, games: number): WeekGameJob[] {
  return Array.from({ length: games }, (_, i) => ({ gameId: i + 1, seedHex: (BigInt(i + 1) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn).toString(16).padStart(16, '0'), ruleSetId }));
}

export async function measureWeek(ruleSetId: string, games: number, workers: number, opts: { readonly bundle?: boolean } = {}): Promise<WeekMeasure> {
  const source = realWeekRef();
  const bundle = opts.bundle ? await bundleForPool(source) : null;
  const ref = bundle?.module ?? source;
  const runner = await loadJobRunner<WeekGameJob, WeekGameOutcome>(ref);
  const jobs = measureJobs(ruleSetId, games);
  jobs.slice(0, 2).map(runner); // warm-up
  let t = performance.now();
  const serial = jobs.map(runner);
  const serialMs = performance.now() - t;
  // With a bundle, the TypeScript sources must give the same bytes too.
  const fromSource = bundle ? hashOf(jobs.map(await loadJobRunner<WeekGameJob, WeekGameOutcome>(source))) : null;
  const pool = createSyncPool<WeekGameJob, WeekGameOutcome>({
    module: ref, workers, mainRunner: runner, ...(bundle ? { workerPath: bundle.workerPath, execArgv: [] } : {}),
  });
  try {
    const first = pool.run(jobs); // includes worker start-up
    t = performance.now();
    const second = pool.run(jobs);
    const poolMs = performance.now() - t;
    const h = hashOf(serial);
    const identical = h === hashOf(first) && h === hashOf(second) && (fromSource === null || fromSource === h);
    return { ruleSetId, games, workers, serialMs, poolMs, speedup: serialMs / poolMs, identical, resultsHash: h, bundled: bundle !== null };
  } finally { await pool.close(); bundle?.dispose(); }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)) {
  const args = process.argv.slice(2);
  const bundle = args.includes('--bundle');
  const [rules = 'pro_2026', games = '32', workers = '3'] = args.filter((a) => a !== '--bundle');
  measureWeek(rules, Number(games), Number(workers), { bundle }).then((m) => { console.log(JSON.stringify(m)); if (!m.identical) process.exitCode = 1; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
}
