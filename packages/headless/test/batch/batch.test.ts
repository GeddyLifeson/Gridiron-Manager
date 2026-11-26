// WP-24 batch runner tests (J14.6.1, J14.2.1, J13.3.2). FIXTURE factory only (fake-factory.ts).
import { describe, expect, it } from 'vitest';
import { gameSeedHex, runBatch } from '../../src/calibration/batch.ts';
import { loadFactory, runBatchOnWorkers, runIndexes, truthHash } from '../../src/batch/run.ts';
import { availableResolvers, resolverFor } from '../../src/batch/resolvers.ts';
import { PARAMS } from '../../src/batch/params.ts';
import type { BatchReport, BatchRunSpec } from '../../src/batch/spec.ts';
import { FAKE_FACTORY_MODULE } from './fake-factory.ts';

const SEED = '00c0ffee12345678';
const spec = (over: Partial<BatchRunSpec> = {}): BatchRunSpec => ({
  factory: { module: FAKE_FACTORY_MODULE, options: { stats: true } },
  variant: { label: 'base', resolverId: 'reference' }, masterSeedHex: SEED, games: 12, seedGroups: 3, ...over,
});
const strip = (r: BatchReport) => ({ ...r, workers: 0 });

describe('WP-24 batch runner', () => {
  it('gives the same report on 1, 3 and 5 worker threads (J13.3.2 acceptance)', async () => {
    const one = await runBatchOnWorkers(spec(), 1);
    const three = await runBatchOnWorkers(spec(), 3);
    const five = await runBatchOnWorkers(spec(), 5);
    expect(three.workers).toBe(3);
    expect(five.workers).toBe(5);
    expect(strip(three)).toEqual(strip(one));
    expect(strip(five)).toEqual(strip(one));
    expect(one.outcomes.map((o) => o.index)).toEqual([...Array(12).keys()]);
  }, 60_000);

  it('matches the single-thread calibration batch row for row (same seeds, same groups)', async () => {
    const f = await loadFactory(spec().factory);
    const variant = spec().variant;
    const ref = runBatch({
      games: 12, seedGroups: 3, masterSeedHex: SEED, input: f.input,
      deps: (inp) => f.deps(inp, variant, resolverFor('reference', f)), flow: f.flow, stats: f.stats!,
    });
    const mine = await runBatchOnWorkers(spec(), 2);
    expect(mine.groups).toEqual(ref.groups);
    expect(mine.outcomes.map((o) => o.seedHex)).toEqual(ref.seeds);
  }, 60_000);

  it('derives every game seed from the master seed and the index only', async () => {
    const f = await loadFactory(spec().factory);
    const subset = runIndexes(f, spec(), [7, 2]);
    expect(subset.map((r) => r.outcome.seedHex)).toEqual([gameSeedHex(SEED, 7), gameSeedHex(SEED, 2)]);
    const full = await runBatchOnWorkers(spec({ seedGroups: 0 }), 1);
    expect(subset[0]!.outcome).toEqual(full.outcomes[7]);
    const other = await runBatchOnWorkers(spec({ seedGroups: 0, masterSeedHex: '1111111111111111' }), 1);
    expect(other.batchHash).not.toBe(full.batchHash);
  });

  it('records build labels and keeps no calibration rows unless asked', async () => {
    const r = await runBatchOnWorkers(spec({ seedGroups: 0, games: 2 }), 1);
    expect(r.groups).toBeNull();
    expect(r.resolverVersion).toBe('reference@fake-1');
    expect(r.paramVersion).toMatch(/^fake@/);
    expect(r.ruleSetId).toBe('fixture_2026');
  });

  it('refuses seed groups when the factory has no statistics module', async () => {
    await expect(runBatchOnWorkers(spec({ factory: { module: FAKE_FACTORY_MODULE, options: {} }, games: 2 }), 1)).rejects.toThrow(/no statistics module/);
  });

  it('applies parameter overrides and rejects unknown names', async () => {
    const base = await runBatchOnWorkers(spec({ seedGroups: 0 }), 1);
    const changed = await runBatchOnWorkers(spec({ seedGroups: 0, variant: { label: 'v', resolverId: 'reference', paramOverrides: { 'fake.rushSpeed': 0.9 } } }), 1);
    expect(changed.batchHash).not.toBe(base.batchHash);
    await expect(runBatchOnWorkers(spec({ variant: { label: 'v', resolverId: 'reference', paramOverrides: { 'no.such': 1 } } }), 1)).rejects.toThrow(/unknown parameter/);
  });

  it('rejects a factory module that does not exist', async () => {
    await expect(runBatchOnWorkers(spec({ factory: { module: '/no/such/module.ts', options: {} } }), 2)).rejects.toThrow();
    await expect(runBatchOnWorkers(spec({ factory: { module: 'relative.ts', options: {} } }), 1)).rejects.toThrow(/absolute path/);
  });

  it('knows the reference resolver now and says the tick resolver is not here yet', () => {
    expect(availableResolvers()).toEqual(['reference']);
    expect(resolverFor('reference').id).toBe('reference');
    expect(() => resolverFor('tick')).toThrow(/WP-23/);
  });

  it('hashes truth without the resolver id and version', async () => {
    const tr = { resolverId: 'reference', resolverVersion: 'x', gameId: 1, playNumber: 1, originX: 0, originY: 0, attackDir: 1, liveDurationTenths: 0, endZoneImpetus: null, events: [] } as const;
    expect(truthHash({ ...tr, events: [] })).toBe(truthHash({ ...tr, resolverId: 'tick', resolverVersion: 'y', events: [] }));
  });

  it('declares an empty parameter file (no tuning constants in the batch runner)', () => {
    expect(PARAMS.module).toBe('headless.batch');
    expect(PARAMS.params).toEqual([]);
  });
});
