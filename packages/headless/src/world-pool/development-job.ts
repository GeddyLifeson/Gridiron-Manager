// The world's development years (D7, D8) as a week-pool job, so the offseason development step runs on every
// core (history runs, X10.3.3). A job is a chunk of players; each player's year is G-20 `developYear` from his
// own stream, so the split into chunks and threads cannot change a block. The world applies the blocks in
// person id order (turnover/development.ts), and the parallel-equals-serial test holds the two paths equal.
import { DMATH, stream } from '@gm/engine-core';
import { development } from '@gm/league';
import type { PlayingBlock } from '@gm/schema';
import type { turnover } from '@gm/world';
import type { CreateJobRunner, JobModuleRef } from '../week-pool/job-module.ts';

/** The stream name of turnover/development.ts (`turnover.STREAM_DEVELOPMENT`). */
export const STREAM_DEVELOPMENT = 'world.development';

export const DEVELOPMENT_MODULE = new URL('./development-job.ts', import.meta.url).href;
export function developmentRef(): JobModuleRef { return { module: DEVELOPMENT_MODULE, options: null }; }

/** The world's batch port and job types, read off `TurnoverBinding` (no new export line in the world). */
export type DevelopmentBatchPort = NonNullable<turnover.TurnoverBinding['developBatch']>;
export type DevelopmentJob = Parameters<DevelopmentBatchPort>[0][number];
export type DevelopmentChunk = readonly DevelopmentJob[];

export const createJobRunner: CreateJobRunner<DevelopmentChunk, PlayingBlock[]> = () => {
  const n = development.devNumbers();
  return (chunk) => chunk.map((job) => development.developYear(
    n, DMATH, { position: job.position, ageYears: job.ageYears, playing: job.playing, facets: job.facets },
    development.defaultYearPlan(n, job.role), (k) => stream(job.seed, STREAM_DEVELOPMENT, [job.personId, job.season, k]),
  ));
};

/**
 * A `TurnoverBinding.developBatch` over a pool's `run`: the jobs in chunks of `chunk` players (fewer, larger
 * messages), the blocks back in job order.
 */
export function developmentBatchPort(run: (chunks: readonly DevelopmentChunk[]) => PlayingBlock[][], chunk = 256): DevelopmentBatchPort {
  return (jobs) => {
    const chunks: DevelopmentChunk[] = [];
    for (let i = 0; i < jobs.length; i += chunk) chunks.push(jobs.slice(i, i + chunk));
    return run(chunks).flat();
  };
}
