// G-97 (P6.1.1 row "one play, full engine, trajectory recorded"; P6.5.1). Times the tick resolver on the
// WP-23 fixture plays with the full record (trajectory and explain). FIXTURE units and stand-in modules:
// the number is the cost of the tick loop as assembled today, not of finished football content.
// Run: npx tsx packages/engine-core/test/bench/tick-play.ts [repeats] [playsPerKind] [benchRuns] -> one JSON line.
import { canonicalBytes } from '../../src/canonical.ts';
import { hash64Hex } from '../../src/hash.ts';
import { createTickResolver } from '../../src/tick-resolver/index.ts';
import { CONTENT, playInput, type Kind } from '../tick-resolver/support.ts';

const KINDS: readonly Kind[] = ['pass', 'run', 'punt', 'field_goal', 'kickoff'];

export interface TickPlayBench {
  readonly msPerPlay: number[];
  readonly plays: number;
  readonly liveTenths: number;
  readonly resultHash: string;
  readonly standIns: readonly string[];
  /** O3.1.4 test bench: wall ms for `n500` runs of one pass play on different seeds, per repeat. */
  readonly bench500Ms: number[];
  readonly bench500Hash: string;
}

export function benchTickPlay(repeats = 5, perKind = 20, n500 = 500, detail: 'full' | 'summary' = 'full'): TickPlayBench {
  const resolver = createTickResolver({ content: CONTENT });
  const inputs = KINDS.flatMap((kind) => Array.from({ length: perKind }, (_, s) => playInput({ kind, seed: s + 1, playNumber: s + 1, detail, ballX: 30 + (s % 5) * 12 })));
  for (const inp of inputs.slice(0, 10)) resolver.simulatePlay(inp); // warm-up
  const ms: number[] = [];
  let hash = '';
  let liveTenths = 0;
  for (let r = 0; r < repeats; r++) {
    const parts: string[] = [];
    let t = 0;
    const t0 = performance.now();
    for (const inp of inputs) {
      const out = resolver.simulatePlay(inp);
      parts.push(hash64Hex(canonicalBytes({ truth: out.truth, deltas: out.deltas })));
      t += out.liveDurationTenths;
    }
    ms.push((performance.now() - t0) / inputs.length);
    const h = hash64Hex(canonicalBytes(parts));
    if (hash && h !== hash) throw new Error('tick-play bench: results differ between repeats (determinism broken)');
    hash = h;
    liveTenths = t;
  }
  const bench = Array.from({ length: n500 }, (_, s) => playInput({ kind: 'pass', seed: 1000 + s, playNumber: 7, detail: 'summary', ballX: 40 }));
  const benchMs: number[] = [];
  let benchHash = '';
  for (let r = 0; r < repeats; r++) {
    const t0 = performance.now();
    const parts = bench.map((inp) => resolver.simulatePlay(inp).truth);
    benchMs.push(performance.now() - t0);
    const h = hash64Hex(canonicalBytes(parts));
    if (benchHash && h !== benchHash) throw new Error('tick-play bench: 500-run results differ between repeats (determinism broken)');
    benchHash = h;
  }
  return { msPerPlay: ms, plays: inputs.length, liveTenths, resultHash: hash, standIns: [...resolver.report.standIns], bench500Ms: benchMs, bench500Hash: benchHash };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [repeats, perKind, n500] = [2, 3, 4].map((i, k) => Number(process.argv[i] ?? [5, 20, 500][k]));
  console.log(JSON.stringify(benchTickPlay(repeats, perKind, n500)));
}
