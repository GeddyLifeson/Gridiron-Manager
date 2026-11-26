// headless `bundle` and `replay-bundle` (P2.3.4, P5.7.1): a save written the way the game writes one
// (apply in the core, log and save in one transaction), bundled to a file, replayed from the file.
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import { stateHash, chainNext, canonicalBytes, bytesHash, CHAIN_GENESIS } from '@gm/engine-core';
import { ENGINE_VERSION } from '@gm/engine-game';
import { applyCommand, emptyWorld, isCheckpoint } from '@gm/league';
import { CommandEnvelope, SAVE_FORMAT_VERSION, type SaveHeader } from '@gm/schema';
import { SaveStore, SqlJsDriver } from '@gm/store';
import { makeBundleFile, replayBundleFile, looksLikeBundle } from '../../src/bug-bundle.ts';

const PARAMS = 'test-params 1';

const CREATE = {
  masterSeedHex: '00000000000000bb', startSeasonYear: 2026,
  competitions: [{ name: 'Pro', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: 'pro_league_2026' }],
};

/** Writes a small career save (CreateWorld, then `days` AdvanceDay commands); returns its path and the state hash after each command. */
async function writeCareer(dir: string, days: number): Promise<{ file: string; hashes: string[] }> {
  const driver = SqlJsDriver.open(await initSqlJs());
  const header: SaveHeader = {
    saveFormatVersion: SAVE_FORMAT_VERSION, engineVersion: ENGINE_VERSION, parameterSetVersion: PARAMS, masterSeed: '00000000000000bb',
    generatorOptions: { worldSize: 'small' }, contentManifest: [], ruleSets: [],
    settings: { worldSize: 'small', retentionProfile: 'standard' }, certified: true, calendar: { seasonYear: 2026, dayIndex: 0 },
    userPersonId: null, userJob: null, summary: 'Replay test career', hashChainHead: CHAIN_GENESIS, createdWith: 'test', lastWrittenWith: 'test',
  };
  let world = emptyWorld();
  const store = await SaveStore.create(driver, header, world, []);
  await store.writeSnapshot('creation', 0, stateHash(world), world);
  const hashes = [stateHash(world)];
  let head = CHAIN_GENESIS;
  let hdr = header;
  for (let seq = 1; seq <= days + 1; seq++) {
    const type = seq === 1 ? 'CreateWorld' : 'AdvanceDay';
    const payload = seq === 1 ? CREATE : { days: seq };
    const cmd = CommandEnvelope.parse({ id: seq, type, actor: { personId: null, job: 'system' }, worldTime: world.calendar, payload, schemaVersion: 1 });
    const r = applyCommand(world, cmd);
    if (!r.ok) throw new Error(r.reason);
    const h = stateHash(r.world);
    let checkpoint;
    if (isCheckpoint(type)) {
      const next = chainNext({ prev: head, stateHash: h, logSequence: seq, engineVersion: ENGINE_VERSION, parameterSetVersion: PARAMS });
      checkpoint = { stateHash: h, head: next, prev: head, engineVersion: ENGINE_VERSION, parameterSetVersion: PARAMS };
      head = next;
    }
    hdr = { ...hdr, calendar: r.world.calendar, hashChainHead: head };
    await store.appendCommand(cmd, r.world, hdr, bytesHash(canonicalBytes(r.events)), checkpoint);
    world = r.world;
    hashes.push(h);
  }
  const file = join(dir, 'career.gmsave');
  await writeFile(file, await driver.exportBytes!());
  await driver.close();
  return { file, hashes };
}

describe('headless bug bundle replay (P2.3.4, P5.7.1)', () => {
  it('bundles a save to a file and replays it to the saved state, at the end and at an earlier command', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gm-bundle-'));
    const { file, hashes } = await writeCareer(dir, 5);
    expect(await looksLikeBundle(file)).toBe(false);

    const made = await makeBundleFile(file);
    expect(made.code).toBe(0);
    expect(made.out).toBe(join(dir, 'career.gmbug'));
    expect(made.lines.join('\n')).toMatch(/nothing is sent anywhere/);
    expect(await looksLikeBundle(made.out!)).toBe(true);
    const r = await replayBundleFile(made.out!);
    expect(r.report?.problems).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.report?.commands).toBe(6);
    expect(r.report?.replayedHash).toBe(hashes[6]);
    expect(r.report?.engine.match).toBe(true);

    const early = await makeBundleFile(file, { at: 2, out: join(dir, 'early.gmbug') });
    const r2 = await replayBundleFile(early.out!);
    expect(r2.code).toBe(0);
    expect(r2.report?.commands).toBe(2);
    expect(r2.report?.replayedHash).toBe(hashes[2]);
  });

  it('reports a defect: a bundle whose logged command was changed fails with exit code 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gm-bundle-'));
    const { file } = await writeCareer(dir, 4);
    const { out } = await makeBundleFile(file);
    const b = JSON.parse(gunzipSync(await readFile(out!)).toString('utf8')) as { log: { command: { payload: { days: number } } }[] };
    b.log[2]!.command.payload.days += 1;
    const bad = join(dir, 'bad.gmbug');
    await writeFile(bad, gzipSync(JSON.stringify(b)));
    const r = await replayBundleFile(bad);
    expect(r.code).toBe(1);
    expect(r.lines.at(-1)).toMatch(/^replay FAILED: .*not reached/);
  });

  it('says when the bundle was made with another engine version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gm-bundle-'));
    const { file } = await writeCareer(dir, 2);
    const { out } = await makeBundleFile(file);
    const r = await replayBundleFile(out!, 'some later engine');
    expect(r.code).toBe(1);
    expect(r.report?.engine).toEqual({ bundle: ENGINE_VERSION, running: 'some later engine', match: false });
    expect(r.lines[0]).toMatch(/this build: some later engine/);
  });

  it('refuses a file that is not a bundle with exit code 2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gm-bundle-'));
    const { file } = await writeCareer(dir, 1);
    const r = await replayBundleFile(file);
    expect(r.code).toBe(2);
    expect(r.lines[0]).toMatch(/not a valid bug bundle: not a gzip file/);
  });
});
