// TEST DOUBLE job module for the pool tests: arithmetic, a little busy work so jobs overlap, and a way to fail.
import type { CreateJobRunner } from '../../src/week-pool/index.ts';

export interface ToyJob { readonly n: number; readonly spin?: number; readonly fail?: boolean }
export interface ToyResult { readonly n: number; readonly square: number; readonly tag: string; readonly mix: number }

export const createJobRunner: CreateJobRunner<ToyJob, ToyResult> = (raw) => {
  const tag = (raw as { tag?: string } | null)?.tag ?? '';
  if (tag === 'broken') throw new Error('toy module told to break');
  return (job) => {
    if (job.fail) throw new Error(`toy job ${job.n} told to fail`);
    let mix = job.n;
    for (let i = 0; i < (job.spin ?? 0); i++) mix = (Math.imul(mix, 1103515245) + 12345) | 0;
    return { n: job.n, square: job.n * job.n, tag, mix };
  };
};
