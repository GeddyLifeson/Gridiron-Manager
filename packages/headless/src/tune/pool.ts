// Automated calibration, part 1b: the process pool.
// One child process per core, each playing one block at a time. A block's result depends only on its
// seed and overrides, never on which process played it or in what order, so a run is repeatable on any
// machine with any number of workers.
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { BlockJob, BlockResult } from './job.ts';

export type Evaluate = (jobs: readonly BlockJob[], onDone?: (index: number, result: BlockResult) => void) => Promise<BlockResult[]>;

export interface Pool {
  readonly workers: number;
  readonly run: Evaluate;
  close(): void;
}

const WORKER = fileURLToPath(new URL('./worker.ts', import.meta.url));

export function createPool(root: string, workers: number = availableParallelism()): Pool {
  const idle: ChildProcess[] = [];
  const all = new Set<ChildProcess>();
  const queue: { job: BlockJob; done: (r: BlockResult) => void }[] = [];
  let closed = false;

  const spawn = (): ChildProcess => {
    // The child inherits this process's loader flags (tsx), so it reads the same TypeScript sources.
    const c = fork(WORKER, [], { execArgv: process.execArgv, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    all.add(c);
    return c;
  };
  const pump = (): void => {
    while (queue.length > 0 && (idle.length > 0 || all.size < workers)) {
      const child = idle.pop() ?? spawn();
      const { job, done } = queue.shift()!;
      let settled = false;
      const finish = (r: BlockResult, alive: boolean): void => {
        if (settled) return;
        settled = true;
        child.removeAllListeners('message');
        child.removeAllListeners('exit');
        if (alive && !closed) idle.push(child); else all.delete(child);
        done(r);
        pump();
      };
      child.once('message', (r: BlockResult) => finish(r, true));
      child.once('exit', (code) => finish({ rows: [], fingerprint: '', ms: 0, error: `worker exited with code ${code}` }, false));
      child.send({ root, job });
    }
  };
  return {
    workers,
    run: (jobs, onDone) => Promise.all(jobs.map((job, i) => new Promise<BlockResult>((ok) => {
      queue.push({ job, done: (r) => { onDone?.(i, r); ok(r); } });
      pump();
    }))),
    close() {
      closed = true;
      for (const c of all) c.kill();
      all.clear();
    },
  };
}
