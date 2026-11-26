// Prints the world-simulation metrics of one cycle (T4 acceptance rates). Run: npx tsx packages/league/test/recruiting/tools/calibrate.ts
import { runCycle } from '../sim.ts';
const t = process.hrtime.bigint();
const r = runCycle();
console.log(r.metrics, Number(process.hrtime.bigint() - t) / 1e9, 's');
