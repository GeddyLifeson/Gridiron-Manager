import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURE_SPECS, runFixture, type FixtureExpect } from '../../src/migrations/fixtures.ts';
import { MIGRATION_NOTICE, migrateSave, openOrMigrate } from '../../src/migrations/runner.ts';
import { LEGACY_PREFIX, MIGRATION_STEPS, META_LEGACY_FORMAT1, MigrationError, STEP_1_TO_2, STEP_2_TO_3, validateSteps, type MigrationStep } from '../../src/migrations/steps.ts';
import { SAVE_CORE_FORMAT_VERSION } from '../../src/save/types.ts';
import { readChain } from '../../src/snapshot/chain.ts';
import { HASHES, V, deps, memoryDb } from '../save/helpers.ts';

const dir = join(import.meta.dirname, 'fixtures');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, FixtureExpect & { format: number; kind: string }>;
const bytesOf = (name: string) => new Uint8Array(readFileSync(join(dir, `${name}.gmsave`)));
const env = { open: (b?: Uint8Array) => memoryDb(b), hashes: HASHES };
const opts = () => ({ deps: deps(), versions: V, openScratch: (b: Uint8Array) => memoryDb(b) });

describe('migration fixtures (Q1.2.3, P5.5.1)', () => {
  for (const spec of FIXTURE_SPECS) {
    it(`${spec.name} migrates to format ${SAVE_CORE_FORMAT_VERSION}, hashes as recorded and plays one more week`, async () => {
      const r = await runFixture(spec.name, bytesOf(spec.name), env, manifest[spec.name]);
      expect(r.problems).toEqual([]);
      if (spec.format < SAVE_CORE_FORMAT_VERSION) expect(r.migratedFrom).toBe(spec.format);
    }, 60_000);
  }

  it('keeps a fixture for every format from 1 to the current one, and the four kinds Q1.2.3 names', () => {
    for (let f = 1; f <= SAVE_CORE_FORMAT_VERSION; f++) expect(FIXTURE_SPECS.some((s) => s.format === f), `format ${f}`).toBe(true);
    expect(new Set(FIXTURE_SPECS.map((s) => s.kind))).toEqual(new Set(['season1', 'season15', 'people_pack', 'certified']));
    for (const s of FIXTURE_SPECS) expect(manifest[s.name]?.format, s.name).toBe(s.format);
  });

  it('a format 1 save and a format 2 save of the same career reach the same state', () => {
    expect(manifest['f1-season1']!.stateHash).toBe(manifest['f2-season1']!.stateHash);
    expect(manifest['f1-season1']!.stateHashAfterWeek).toBe(manifest['f2-season1']!.stateHashAfterWeek);
  });
});

describe('the step registry', () => {
  it('runs one version at a time to the current format', () => {
    expect(() => validateSteps(MIGRATION_STEPS, SAVE_CORE_FORMAT_VERSION)).not.toThrow();
  });
  it('fails when a step is removed on purpose (Q1.2.3 acceptance)', async () => {
    for (let i = 0; i < MIGRATION_STEPS.length; i++) {
      const fewer = MIGRATION_STEPS.filter((_, j) => j !== i);
      expect(() => validateSteps(fewer, SAVE_CORE_FORMAT_VERSION)).toThrow(MigrationError);
    }
    await expect(migrateSave(await memoryDb(bytesOf('f1-season1')), { ...opts(), steps: [] })).rejects.toThrow(MigrationError);
  });
  it('refuses a step that skips a version or a doubled id', () => {
    const skip: MigrationStep = { ...STEP_1_TO_2, to: 3 };
    expect(() => validateSteps([skip], 3)).toThrow(/one version/);
    const two: MigrationStep = { ...STEP_1_TO_2, from: 2, to: 3 };
    expect(() => validateSteps([STEP_1_TO_2, two], 3)).toThrow(/twice/);
  });
});

describe('the runner (P5.5.1)', () => {
  it('shows the notice text of P5.5.1', () => {
    expect(MIGRATION_NOTICE).toBe('This career will be updated to the current format. A backup will be kept.');
  });

  it('keeps the format 1 log and chain, and links the new chain to the old head', async () => {
    const original = bytesOf('f1-season1');
    const src = await memoryDb(original);
    const legacyRows = (await src.all<{ n: number }>('SELECT COUNT(*) AS n FROM command_log'))[0]!.n;
    const legacyHead = (await src.all<{ head: string }>('SELECT head FROM hash_chain ORDER BY n DESC LIMIT 1'))[0]!.head;
    const m = await migrateSave(src, opts());
    expect(m.status).toBe('migrated');
    if (m.status !== 'migrated') return;
    const d = m.migrated;
    expect((await d.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${LEGACY_PREFIX}command_log`))[0]!.n).toBe(legacyRows);
    const meta = JSON.parse((await d.all<{ value: string }>('SELECT value FROM save_meta WHERE key = ?', [META_LEGACY_FORMAT1]))[0]!.value) as { chainHead: string; commands: number };
    expect(meta).toMatchObject({ chainHead: legacyHead, commands: legacyRows });
    const chain = await readChain(d);
    expect(chain.map((c) => c.kind)).toEqual(['creation', 'migration']);
    expect(JSON.parse(chain[1]!.note!)).toMatchObject({ fromFormat: 1, toFormat: SAVE_CORE_FORMAT_VERSION });
    const snaps = await d.all<{ kind: string }>('SELECT kind FROM snapshots ORDER BY id');
    expect(snaps.map((s) => s.kind)).toContain('pre_migration');
    expect(m.backup).toEqual(original);
  });

  it('leaves the original untouched and reports when a step fails midway', async () => {
    const original = bytesOf('f1-season1');
    const src = await memoryDb(original);
    const broken: MigrationStep = {
      ...STEP_1_TO_2,
      async run(ctx) {
        await ctx.driver.exec('ALTER TABLE world_state RENAME TO half_done');
        throw new Error('disk full');
      },
    };
    const m = await migrateSave(src, { ...opts(), steps: [broken, STEP_2_TO_3] });
    expect(m).toMatchObject({ status: 'failed', from: 1, step: STEP_1_TO_2.id });
    expect(await src.exportBytes()).toEqual(original);
    expect((await src.all<{ n: number }>("SELECT COUNT(*) AS n FROM world_state WHERE key = 'world'"))[0]!.n).toBe(1);
  });

  it('refuses a format 1 save whose chain was edited', async () => {
    const src = await memoryDb(bytesOf('f1-season1'));
    await src.exec("UPDATE hash_chain SET state_hash = '0000000000000000' WHERE n = 2");
    const m = await migrateSave(src, opts());
    expect(m.status).toBe('failed');
    if (m.status === 'failed') expect(m.reason).toMatch(/chain row 2/);
  });

  it('fails the migration when the migrated world breaks an invariant', async () => {
    const m = await migrateSave(await memoryDb(bytesOf('f1-season1')), { ...opts(), invariants: () => ['a person has two jobs'] });
    expect(m.status).toBe('failed');
  });

  it('leaves a current save alone and does not load a newer one', async () => {
    expect((await migrateSave(await memoryDb(bytesOf('f3-season1')), opts())).status).toBe('current');
    const newer = await memoryDb(bytesOf('f3-season1'));
    await newer.exec(`UPDATE header SET save_format_version = ${SAVE_CORE_FORMAT_VERSION + 1}`);
    expect(await migrateSave(newer, opts())).toEqual({ status: 'newer', format: SAVE_CORE_FORMAT_VERSION + 1 });
    const loaded = await openOrMigrate(newer, opts());
    expect(loaded.status).toBe('not_loaded');
  });

  it('opens an older save through openOrMigrate and a current one directly', async () => {
    const a = await openOrMigrate(await memoryDb(bytesOf('f1-certified')), opts());
    expect(a.status).toBe('opened');
    if (a.status === 'opened') {
      expect(a.migrated?.from).toBe(1);
      expect(a.save.header().certified).toBe(true);
      expect(a.save.header().saveFormatVersion).toBe(SAVE_CORE_FORMAT_VERSION);
    }
    const b = await openOrMigrate(await memoryDb(bytesOf('f2-season15')), opts());
    expect(b.status === 'opened' && b.migrated?.from).toBe(2);
    const c = await openOrMigrate(await memoryDb(bytesOf('f3-season1')), opts());
    expect(c.status === 'opened' && c.migrated === null).toBe(true);
  });
});
