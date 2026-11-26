// The development year on worker threads must give exactly the blocks of the serial world step: the same
// stream name, the same G-20 year, any chunking and any thread.
import { afterAll, describe, expect, it } from 'vitest';
import { DMATH, deriveSeed, seedFromNumber, seedToHex, stream } from '@gm/engine-core';
import { development } from '@gm/league';
import { generator } from '@gm/people';
import { turnover } from '@gm/world';
import { createSyncPool, loadJobRunner } from '../../src/week-pool/index.ts';
import { STREAM_DEVELOPMENT, createDevelopmentRunner, developmentBatchPort, developmentRef, type DevelopmentChunk, type DevelopmentJob } from '../../src/world-pool/index.ts';

const seed = seedFromNumber(1869);
const rnd: generator.GeneratorRandom = { open: (name, scope) => stream(seed, name, scope), seedHex: (name, scope) => seedToHex(deriveSeed(seed, name, scope)), math: DMATH };

function jobs(count: number): DevelopmentJob[] {
  const out: DevelopmentJob[] = [];
  for (let i = 0; i < count; i++) {
    const position = generator.MAIN_POSITIONS[i % generator.MAIN_POSITIONS.length]!;
    const r = generator.generatePlayer({
      personId: 500 + i, position, ageYears: 18 + (i % 17), seasonYear: 2030, talent: { kind: 'pro_entrant' },
      classKey: { classYear: 2030, classType: 'pool-test', slotIndex: i }, group: 'pro_player', homeRegion: 'Region', hometown: null,
    }, rnd).record;
    out.push({ personId: r.id, season: 2030, seed: { hi: seed.hi, lo: seed.lo }, position, ageYears: 19 + (i % 17), playing: r.playing!, facets: r.traitBlock.facets, role: i % 3 === 0 ? 'starter' : 'backup' });
  }
  return out;
}

const pools: { close(): Promise<void> }[] = [];
afterAll(async () => { for (const p of pools) await p.close(); });

describe('development years on the worker pool', () => {
  it('uses the world step stream name', () => {
    expect(STREAM_DEVELOPMENT).toBe(turnover.STREAM_DEVELOPMENT);
  });

  it('gives the serial developYear blocks, on threads and in any chunking', async () => {
    const js = jobs(40);
    const n = development.devNumbers();
    const serial = js.map((j) => development.developYear(
      n, DMATH, { position: j.position, ageYears: j.ageYears, playing: j.playing, facets: j.facets }, development.defaultYearPlan(n, j.role),
      (k) => stream(seedFromNumber(1869), turnover.STREAM_DEVELOPMENT, [j.personId, j.season, k]),
    ));
    const runner = createDevelopmentRunner(null);
    expect(developmentBatchPort((cs) => cs.map(runner), 7)(js)).toStrictEqual(serial);
    const ref = developmentRef();
    const pool = createSyncPool<DevelopmentChunk, ReturnType<typeof runner>>({ module: ref, workers: 2, mainRunner: await loadJobRunner(ref) });
    pools.push(pool);
    expect(developmentBatchPort((cs) => pool.run(cs), 3)(js)).toStrictEqual(serial);
  }, 120_000);
});
