// Worker thread of the synchronous pool (pool.ts). Loads the job module once, then for each batch claims
// job indexes from the shared counter until none are left. Every answer goes back on this worker's own
// port, followed by a bump of the shared wake word, which is what the blocked main thread waits on.
import { workerData, type MessagePort } from 'node:worker_threads';
import { CTL_NEXT, CTL_WAKE, loadJobRunner, type FromWorker, type JobModuleRef, type JobRunner, type ToWorker } from './job-module.ts';

const { ctl: shared, port, ref } = workerData as { ctl: SharedArrayBuffer; port: MessagePort; ref: JobModuleRef };
const ctl = new Int32Array(shared);
const send = (m: FromWorker): void => { port.postMessage(m); Atomics.add(ctl, CTL_WAKE, 1); Atomics.notify(ctl, CTL_WAKE); };
const text = (e: unknown): string => (e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));

let runner: JobRunner<unknown, unknown> | null = null;
let fatal: string | null = null;
const ready = loadJobRunner<unknown, unknown>(ref).then((r) => { runner = r; }, (e: unknown) => { fatal = text(e); });

port.on('message', (m: ToWorker) => {
  void ready.then(() => {
    if (runner === null) { send({ kind: 'fatal', error: fatal ?? 'job module did not load' }); return; }
    const n = m.jobs.length;
    for (;;) {
      const index = Atomics.add(ctl, CTL_NEXT, 1);
      if (index >= n) break;
      try { send({ kind: 'result', batch: m.batch, index, ok: true, value: runner(m.jobs[index]) }); }
      catch (e) { send({ kind: 'result', batch: m.batch, index, ok: false, error: text(e) }); }
    }
    send({ kind: 'idle', batch: m.batch });
  });
});
