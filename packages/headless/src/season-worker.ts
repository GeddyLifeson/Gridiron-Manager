// Worker for the multi-worker season check (P1.1.5 acceptance 2, Q1.3.1, J13.3.2).
import { parentPort, workerData } from 'node:worker_threads';
import { seasonFixtures, seasonGame } from '@gm/engine-game';
import { goldenInputs } from './golden-inputs.ts';

const { ruleSetId, indexes } = workerData as { ruleSetId: string; indexes: number[] };
const fixtures = seasonFixtures();
const inp = goldenInputs();
const out = indexes.map((i) => seasonGame(inp, ruleSetId, fixtures[i]!));
parentPort!.postMessage(out);
