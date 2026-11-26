// G-97 (P6.1.1 row "one play, full engine"; P6.5.1). Times the tick resolver with the REAL quarterback
// plug (WP-20, J7) on the WP-23 fixture pass and run plays: the workload of the 50 ms budget test in
// test/tick-resolver/plugs.test.ts. Carrier and foul modules are still stand-ins.
// Run: npx tsx packages/engine-core/test/bench/qb-play.ts [repeats] [plays] -> one JSON line.
import { canonicalBytes } from '../../src/canonical.ts';
import { hash64Hex } from '../../src/hash.ts';
import { createTickResolver, quarterbackPlug } from '../../src/tick-resolver/index.ts';
import { CONTENT, playInput } from '../tick-resolver/support.ts';

const repeats = Number(process.argv[2] ?? 5), plays = Number(process.argv[3] ?? 60);
const resolver = createTickResolver({ content: CONTENT, plugs: [quarterbackPlug()] });
const inputs = Array.from({ length: plays }, (_, i) => playInput({ kind: i % 2 === 0 ? 'pass' : 'run', seed: 501 + i, playNumber: 1 + (i % 8) }));
for (const inp of inputs.slice(0, 6)) resolver.simulatePlay(inp); // warm-up
const msPerPlay: number[] = [];
let resultHash = '';
for (let r = 0; r < repeats; r++) {
  const parts: string[] = [];
  const t0 = performance.now();
  for (const inp of inputs) {
    const out = resolver.simulatePlay(inp);
    parts.push(hash64Hex(canonicalBytes({ truth: out.truth, deltas: out.deltas, live: out.liveDurationTenths })));
  }
  msPerPlay.push((performance.now() - t0) / inputs.length);
  const h = hash64Hex(canonicalBytes(parts));
  if (resultHash !== '' && h !== resultHash) throw new Error('qb play bench: results changed between repeats');
  resultHash = h;
}
console.log(JSON.stringify({ msPerPlay, plays, resultHash, standIns: resolver.report.standIns }));
