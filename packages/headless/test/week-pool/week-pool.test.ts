// G-97: the synchronous worker pool and the real game as its job. The acceptance is J13.3.2: a week
// played on any number of threads gives the same bytes as the week played one game after another.
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalBytes } from '@gm/engine-core';
import {
  createSyncPool, jobOf, loadJobRunner, realWeekPort, realWeekRef, type JobModuleRef, type SyncPool, type WeekGameJob, type WeekGameOutcome,
} from '../../src/week-pool/index.ts';
import { measureJobs } from '../../src/week-pool/measure.ts';
import type { ToyJob, ToyResult } from './toy-jobs.ts';

const TOY = new URL('./toy-jobs.ts', import.meta.url).href;
const toyRef = (tag: string): JobModuleRef => ({ module: TOY, options: { tag } });
const hex = (v: unknown): string => Buffer.from(canonicalBytes(v)).toString('hex');
const open: SyncPool<never, never>[] = [];
const keep = <J, R>(p: SyncPool<J, R>): SyncPool<J, R> => { open.push(p as unknown as SyncPool<never, never>); return p; };
afterAll(async () => { await Promise.all(open.map((p) => p.close())); });

describe('synchronous worker pool', () => {
  const pool = keep(createSyncPool<ToyJob, ToyResult>({ module: toyRef('t'), workers: 3 }));
  const jobs = (count: number, from = 0): ToyJob[] => Array.from({ length: count }, (_, i) => ({ n: from + i, spin: ((from + i) % 7) * 20_000 }));

  it('returns one result per job, in job order, from worker threads', () => {
    const out = pool.run(jobs(60));
    expect(out.map((r) => r.n)).toEqual(jobs(60).map((j) => j.n));
    expect(out.every((r) => r.square === r.n * r.n && r.tag === 't')).toBe(true);
  });
  it('is reused batch after batch and keeps batches apart', () => {
    for (let b = 0; b < 25; b++) {
      const size = 1 + ((b * 5) % 9);
      expect(pool.run(jobs(size, b * 100)).map((r) => r.n)).toEqual(jobs(size, b * 100).map((j) => j.n));
    }
    expect(pool.run([])).toEqual([]);
  });
  it('gives the same results with any number of workers, and with the calling thread taking jobs', async () => {
    const want = hex(pool.run(jobs(40)));
    const runner = await loadJobRunner<ToyJob, ToyResult>(toyRef('t'));
    expect(hex(jobs(40).map(runner))).toBe(want);
    for (const [workers, main] of [[1, false], [2, true], [0, true], [4, true]] as const) {
      const p = keep(createSyncPool<ToyJob, ToyResult>({ module: toyRef('t'), workers, mainRunner: main ? runner : null }));
      expect(hex(p.run(jobs(40))), `${workers} workers, main ${main}`).toBe(want);
    }
  });
  it('reports the failing job with the lowest index and still works afterwards', () => {
    const bad = jobs(20).map((j) => (j.n === 5 || j.n === 13 ? { ...j, fail: true } : j));
    expect(() => pool.run(bad)).toThrow(/job 5 failed: toy job 5 told to fail/);
    expect(pool.run(jobs(6)).map((r) => r.n)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('says so when the job module cannot start, and refuses further work', () => {
    const p = keep(createSyncPool<ToyJob, ToyResult>({ module: toyRef('broken'), workers: 2 }));
    expect(() => p.run(jobs(4))).toThrow(/could not start: toy module told to break/);
    expect(() => p.run(jobs(4))).toThrow(/could not start/);
  });
  it('refuses a pool that could run nothing, and work after close', async () => {
    expect(() => createSyncPool<ToyJob, ToyResult>({ module: toyRef('t'), workers: 0 })).toThrow(/nothing could run/);
    const p = createSyncPool<ToyJob, ToyResult>({ module: toyRef('t'), workers: 1 });
    expect(p.run(jobs(3))).toHaveLength(3);
    await p.close();
    expect(() => p.run(jobs(3))).toThrow(/closed/);
  });
});

describe('a week of real games on the pool (J13.3.2)', () => {
  const ref = realWeekRef({ eventsHash: true });
  // Tick-engine games cost about 3.5 s each, so the week is smaller than a real one; it still mixes levels and
  // gives every worker games out of order.
  const week: WeekGameJob[] = [...measureJobs('pro_2026', 4), ...measureJobs('college_2026', 3).map((j) => ({ ...j, gameId: j.gameId + 100 }))];

  it('is byte-identical to the week played one game after another, for 1, 2 and 3 workers, twice over', async () => {
    const runner = await loadJobRunner<WeekGameJob, WeekGameOutcome>(ref);
    const serial = week.map(runner);
    const want = hex(serial);
    expect(serial.every((g) => g.plays > 50 && g.finalStateHash.length > 0 && g.eventsHash.length > 0 && g.passPlays > 0 && g.runPlays > 0)).toBe(true);
    for (const [workers, main] of [[1, false], [2, true], [3, false]] as const) {
      const p = keep(createSyncPool<WeekGameJob, WeekGameOutcome>({ module: ref, workers, mainRunner: main ? runner : null }));
      expect(hex(p.run(week)), `${workers} workers`).toBe(want);
      expect(hex(p.run(week)), `${workers} workers, second run`).toBe(want);
      // The same games in another order give the same game results.
      const reversed = p.run([...week].reverse());
      expect(hex([...reversed].reverse())).toBe(want);
    }
  }, 600_000);
  it('maps world game requests to jobs and back, one answer per request', async () => {
    const runner = await loadJobRunner<WeekGameJob, WeekGameOutcome>(realWeekRef());
    const reqs = week.slice(0, 2).map((j) => ({ game: { gameId: j.gameId }, seedHex: j.seedHex, ruleSetId: j.ruleSetId, tier: 3 }));
    expect(reqs.map(jobOf)).toEqual(week.slice(0, 2));
    const port = realWeekPort((jobs) => jobs.map(runner));
    const out = port(reqs);
    expect(out).toHaveLength(2);
    expect(out[0]!.eventsHash).toBe('');
    expect(() => realWeekPort(() => [])(reqs)).toThrow(/2 games asked, 0 answered/);
  });
});
