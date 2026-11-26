// Worker thread entry for batch runs (J14.2.1). Builds the factory named in the spec and runs its share.
import { parentPort, workerData } from 'node:worker_threads';
import { loadFactory, runIndexes } from './run.ts';
import type { BatchRunSpec } from './spec.ts';

const { spec, indexes } = workerData as { spec: BatchRunSpec; indexes: number[] };
loadFactory(spec.factory)
  .then((f) => parentPort!.postMessage({ ok: true, runs: runIndexes(f, spec, indexes) }))
  .catch((e: unknown) => parentPort!.postMessage({ ok: false, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) }));
