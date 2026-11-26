// A job module is a file that exports `createJobRunner(options)`. The pool names it by path so every
// worker thread can load its own copy: nothing but plain data crosses between threads.
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

export interface JobModuleRef {
  /** A `file:` URL or an absolute path of a module that exports `createJobRunner`. */
  readonly module: string;
  readonly options: Json;
}

/** One job in, one result out. Must be a pure function of the job: no clock, no shared state, no order dependence. */
export type JobRunner<J, R> = (job: J) => R;
export type CreateJobRunner<J, R> = (options: Json) => JobRunner<J, R>;

export async function loadJobRunner<J, R>(ref: JobModuleRef): Promise<JobRunner<J, R>> {
  const url = ref.module.startsWith('file:') ? ref.module : isAbsolute(ref.module) ? pathToFileURL(ref.module).href : null;
  if (!url) throw new Error(`job module ${ref.module}: give a file: URL or an absolute path`);
  const mod = (await import(url)) as { createJobRunner?: CreateJobRunner<J, R> };
  if (typeof mod.createJobRunner !== 'function') throw new Error(`job module ${ref.module} does not export createJobRunner`);
  return mod.createJobRunner(ref.options);
}

/** Layout of the shared control words (an Int32Array over a SharedArrayBuffer). */
export const CTL_NEXT = 0, CTL_WAKE = 1, CTL_WORDS = 2;

export type ToWorker = { readonly kind: 'batch'; readonly batch: number; readonly jobs: readonly unknown[] };
export type FromWorker =
  | { readonly kind: 'result'; readonly batch: number; readonly index: number; readonly ok: true; readonly value: unknown }
  | { readonly kind: 'result'; readonly batch: number; readonly index: number; readonly ok: false; readonly error: string }
  | { readonly kind: 'idle'; readonly batch: number }
  | { readonly kind: 'fatal'; readonly error: string };
