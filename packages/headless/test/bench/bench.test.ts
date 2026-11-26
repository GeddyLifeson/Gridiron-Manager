// G-97 acceptance (P6.5.1, P6.1.1): the gate fails a gated benchmark more than 10% slower than its
// baseline, a 20% delay added to play resolution fails it, and every P6.1.1 row is in the suite.
import { describe, expect, it } from 'vitest';
import type { Resolver } from '@gm/schema';
import { gate, hashChanges, makeBaseline, normalise } from '../../src/bench/compare.ts';
import { median, referenceWorkloadMs, summariseProfile } from '../../src/bench/measure.ts';
import { NOT_YET, runSuite, type BenchResult } from '../../src/bench/suite.ts';

const MACHINE = { cpu: 'test', cores: 1, memGb: 1, node: 'v0', platform: 'test' };
const row = (id: string, ms: number, gated = true, hash = 'h'): BenchResult => ({
  id, row: 'test', tier: 'change', budgetMs: 100, budgetMachine: 'one core', ms, samples: [ms], status: 'met', gated, hash, note: '',
});

describe('bench gate (P6.5.1)', () => {
  it('passes within 10% and fails beyond it, after normalising by the reference workload', () => {
    const base = makeBaseline([row('a', 100), row('b', 100)], 10, MACHINE, 't');
    // Same machine speed: a at +5% passes, b at +12% fails.
    const g = gate([row('a', 105), row('b', 112)], 10, base);
    expect(g.find((r) => r.id === 'a')!.pass).toBe(true);
    expect(g.find((r) => r.id === 'b')!.pass).toBe(false);
    // A machine twice as slow (reference 20 ms) running 200 ms is no regression.
    expect(gate([row('a', 200)], 20, base).every((r) => r.pass)).toBe(true);
  });
  it('ignores ungated rows and passes rows with no baseline', () => {
    expect(Object.keys(normalise([row('n', 5, false)], 1))).toEqual([]);
    expect(gate([row('new', 5)], 1, null)[0]!.reason).toBe('no baseline yet');
  });
  it('flags a changed result hash', () => {
    const base = makeBaseline([row('a', 1, true, 'x')], 1, MACHINE, 't');
    expect(hashChanges([row('a', 1, true, 'y')], base)).toEqual(['a: x -> y']);
    expect(hashChanges([row('a', 1, true, 'x')], base)).toEqual([]);
  });
  it('median and profile summary', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const lines = summariseProfile({ nodes: [{ id: 1, callFrame: { functionName: 'f', url: 'file:///x/packages/a/b.ts', lineNumber: 0 } }, { id: 2, callFrame: { functionName: '(idle)', url: '', lineNumber: 0 } }], samples: [1, 1, 2], timeDeltas: [5, 5, 90] });
    expect(lines).toEqual([{ selfPct: 100, fn: 'f', where: 'a/b.ts' }]);
  });
});

describe('every P6.1.1 row has a benchmark (P6.1.1 acceptance)', () => {
  it('names each row in the suite or in the not-yet list', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/bench/suite.ts', import.meta.url), 'utf8'));
    for (const r of ['One play, full engine', 'One full game', 'Pro week', 'World week', 'Test-bench batch', 'Re-simulate one stored game', '10,000 games', 'One season of the default world', '20-season advance', '30-season headless career', 'Open a career', 'Season archive step']) {
      expect(src.includes(r), r).toBe(true);
    }
    expect(NOT_YET.every((b) => b.status === 'not_measurable' && b.note.length > 0)).toBe(true);
  });
});

/** Busy-waits `share` of each play's own resolver time on top of it: a slower tick loop, as P6.5.1 asks. */
function slowed(share: number): (r: Resolver) => Resolver {
  return (r) => ({
    id: r.id, version: r.version, mayProduceSavedResults: r.mayProduceSavedResults,
    simulatePlay(input) {
      const t0 = performance.now();
      const out = r.simulatePlay(input);
      const until = performance.now() + (performance.now() - t0) * share;
      while (performance.now() < until) { /* delay */ }
      return out;
    },
  });
}

describe('a 20% delay in play resolution fails the gate (P6.5.1 acceptance)', () => {
  it('fails play.reference with the delay and passes without it', { retry: 2 }, async () => {
    const opts = { repeats: 3, workers: 1, fullLongRuns: false };
    const only = (rs: BenchResult[]) => rs.filter((r) => r.id === 'play.reference' || r.id === 'game.single');
    // runSuite's change tier includes the tick child process; measure the game part only by filtering.
    const ref = referenceWorkloadMs(3);
    const before = only(await runSuite({ ...opts, tiers: ['change'], skipTick: true }));
    const base = makeBaseline(before, ref, MACHINE, 'test');
    const same = only(await runSuite({ ...opts, tiers: ['change'], skipTick: true }));
    const slow = only(await runSuite({ ...opts, tiers: ['change'], skipTick: true, wrapResolver: slowed(0.2) }));
    expect(gate(same, ref, base).find((r) => r.id === 'play.reference')!.pass).toBe(true);
    const g = gate(slow, ref, base).find((r) => r.id === 'play.reference')!;
    expect(g.pass).toBe(false);
    // Results are untouched by timing: the delayed run has the same result hashes.
    expect(hashChanges(slow, base)).toEqual([]);
  });
});
