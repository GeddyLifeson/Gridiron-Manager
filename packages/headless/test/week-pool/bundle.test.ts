// G-97 part 3: real games played from the plain JavaScript bundles (src/week-pool/bundle.ts), in the
// calling thread and on pool workers, give the same bytes as the TypeScript sources (J13.3.2).
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalBytes } from '@gm/engine-core';
import { bundleForPool, type PoolBundle } from '../../src/week-pool/bundle.ts';
import { createSyncPool, loadJobRunner, realWeekRef, type SyncPool, type WeekGameJob, type WeekGameOutcome } from '../../src/week-pool/index.ts';
import { measureJobs } from '../../src/week-pool/measure.ts';

const hex = (v: unknown): string => Buffer.from(canonicalBytes(v)).toString('hex');
let bundle: PoolBundle | null = null;
let pool: SyncPool<WeekGameJob, WeekGameOutcome> | null = null;
afterAll(async () => { await pool?.close(); bundle?.dispose(); });

describe('pool bundles', () => {
  it('play real games to the same bytes as the sources, with every event hashed', async () => {
    const source = realWeekRef({ eventsHash: true });
    bundle = bundleForPool(source);
    const jobs = [...measureJobs('pro_2026', 3), ...measureJobs('college_2026', 3)];
    const want = hex(jobs.map(await loadJobRunner<WeekGameJob, WeekGameOutcome>(source)));
    expect(hex(jobs.map(await loadJobRunner<WeekGameJob, WeekGameOutcome>(bundle.module)))).toBe(want);
    pool = createSyncPool<WeekGameJob, WeekGameOutcome>({ module: bundle.module, workers: 2, workerPath: bundle.workerPath, execArgv: [] });
    expect(hex(pool.run(jobs))).toBe(want);
  }, 120_000);
});
