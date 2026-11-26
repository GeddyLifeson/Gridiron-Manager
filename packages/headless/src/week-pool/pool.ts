// A persistent, SYNCHRONOUS worker pool (G-97, P6.3; J13.3.2). The world loop is synchronous: a weekly
// pass calls the game port and needs the scores back before the next step. So `run` blocks the calling
// thread until every job of the batch is done, and returns the results in job order.
//
// How it blocks without losing answers: each worker has its own message port. A worker posts an answer
// and then bumps a shared wake word. The caller reads the wake word, drains every port with
// `receiveMessageOnPort` (which needs no event loop), and if the batch is not finished waits on the wake
// word with the value it read. A bump after that read ends the wait at once, so no answer is missed.
//
// Determinism: a job's result may depend on nothing but the job. Which thread ran it, and when, is not
// recorded anywhere. Results are placed by job index. Workers claim indexes from one shared counter, so
// the split of work differs from run to run on purpose, and the output may not.
import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { CTL_NEXT, CTL_WAKE, CTL_WORDS, type FromWorker, type JobModuleRef, type JobRunner, type ToWorker } from './job-module.ts';

export interface SyncPoolOptions<J, R> {
  readonly module: JobModuleRef;
  /** Worker threads to start. 0 is allowed when `mainRunner` is given: the batch then runs in this thread. */
  readonly workers: number;
  /**
   * The same job runner, loaded in the calling thread (`loadJobRunner`). When given, the calling thread
   * takes jobs too instead of sleeping, so a machine with N cores wants N - 1 workers.
   */
  readonly mainRunner?: JobRunner<J, R> | null;
  /** A batch with no answer for this long has lost a worker (crash, out of memory). Default 10 minutes. */
  readonly stallMs?: number;
  /** Extra Node flags for the workers. Default: load TypeScript through tsx, as the batch runner does. */
  readonly execArgv?: readonly string[];
}

export interface SyncPool<J, R> {
  readonly workers: number;
  /** Runs every job and returns the results in job order. Blocks. Throws the error of the lowest failing index. */
  run(jobs: readonly J[]): R[];
  /** Stops the workers. The pool cannot be used afterwards. */
  close(): Promise<void>;
}

const WORKER_PATH = fileURLToPath(new URL('./worker.ts', import.meta.url));

export function createSyncPool<J, R>(opts: SyncPoolOptions<J, R>): SyncPool<J, R> {
  const n = Math.floor(opts.workers);
  const mainRunner = opts.mainRunner ?? null;
  if (!(n >= 0)) throw new Error('sync pool: workers must be 0 or more');
  if (n === 0 && mainRunner === null) throw new Error('sync pool: no workers and no main runner, so nothing could run a job');
  const stallMs = opts.stallMs ?? 600_000;
  const shared = new SharedArrayBuffer(CTL_WORDS * Int32Array.BYTES_PER_ELEMENT);
  const ctl = new Int32Array(shared);
  const ports: MessagePort[] = [];
  const threads: Worker[] = [];
  let broken: string | null = null;
  for (let w = 0; w < n; w++) {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(WORKER_PATH, {
      workerData: { ctl: shared, port: port2, ref: opts.module }, transferList: [port2], execArgv: [...(opts.execArgv ?? ['--import', 'tsx'])],
    });
    // A blocked caller never sees these events; they matter between batches. Neither keeps the process alive.
    worker.on('error', (e) => { broken = `a worker failed: ${e instanceof Error ? e.message : String(e)}`; });
    worker.unref(); port1.unref();
    ports.push(port1); threads.push(worker);
  }
  let closed = false;
  let batch = 0;

  const run = (jobs: readonly J[]): R[] => {
    if (closed) throw new Error('sync pool: closed');
    if (broken !== null) throw new Error(`sync pool: ${broken}`);
    const total = jobs.length;
    if (total === 0) return [];
    batch++;
    const results = new Array<R>(total);
    const errors = new Map<number, string>();
    let got = 0, idle = 0;
    const take = (m: FromWorker): void => {
      if (m.kind === 'fatal') { broken = `a worker could not start: ${m.error}`; throw new Error(`sync pool: ${broken}`); }
      if (m.batch !== batch) { broken = `an answer for batch ${m.batch} arrived during batch ${batch}`; throw new Error(`sync pool: ${broken}`); }
      if (m.kind === 'idle') { idle++; return; }
      if (m.ok) results[m.index] = m.value as R; else errors.set(m.index, m.error);
      got++;
    };
    const drain = (): void => {
      for (const port of ports) for (let m = receiveMessageOnPort(port); m !== undefined; m = receiveMessageOnPort(port)) take(m.message as FromWorker);
    };

    Atomics.store(ctl, CTL_NEXT, 0);
    const order: ToWorker = { kind: 'batch', batch, jobs };
    for (const port of ports) port.postMessage(order);
    if (mainRunner !== null) {
      for (;;) {
        const index = Atomics.add(ctl, CTL_NEXT, 1);
        if (index >= total) break;
        try { results[index] = mainRunner(jobs[index]!); } catch (e) { errors.set(index, e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)); }
        got++;
      }
    }
    // Every worker must say it has left the batch before the counter is reused, or a slow one could
    // claim an index of the next batch with this batch's jobs.
    for (;;) {
      const seen = Atomics.load(ctl, CTL_WAKE);
      drain();
      if (idle === n && got === total) break;
      if (idle === n) { broken = `batch ${batch} ended with ${got} of ${total} answers`; throw new Error(`sync pool: ${broken}`); }
      if (Atomics.wait(ctl, CTL_WAKE, seen, stallMs) === 'timed-out') {
        broken = `no answer for ${stallMs} ms in batch ${batch} (${got} of ${total} done): a worker has stopped`;
        throw new Error(`sync pool: ${broken}`);
      }
    }
    if (errors.size > 0) {
      const first = Math.min(...errors.keys());
      throw new Error(`sync pool: job ${first} failed: ${errors.get(first)!}`);
    }
    return results;
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    for (const port of ports) port.close();
    await Promise.all(threads.map((t) => t.terminate()));
  };

  return { workers: n, run, close };
}
