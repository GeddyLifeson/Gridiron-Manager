// Worker thread entry for season runs: plays its share of season indexes and posts each outcome as it finishes.
import { parentPort, workerData } from 'node:worker_threads';
import { loadPort, runOneSeason, type SeasonRunSpec } from './seasons.ts';

const { spec, indexes } = workerData as { spec: SeasonRunSpec; indexes: number[] };
loadPort(spec.port, spec.ruleSetId)
  .then((playGame) => {
    for (const i of indexes) parentPort!.postMessage({ season: runOneSeason(spec, i, playGame) });
    parentPort!.postMessage({ done: true });
  })
  .catch((e: unknown) => parentPort!.postMessage({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) }));
