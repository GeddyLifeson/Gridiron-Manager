// A small test career built the way the game builds one (WorldService.run): apply in the core, then
// log and save in one transaction. The replay deps are the ones `headless replay` uses
// (packages/headless/src/replay-deps.ts): league applyCommand and engine-core hashes.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { stateHash, chainNext, canonicalBytes, bytesHash, CHAIN_GENESIS } from '@gm/engine-core';
import { applyCommand, emptyWorld, isCheckpoint } from '@gm/league';
import { CommandEnvelope, SAVE_FORMAT_VERSION, type SaveHeader, type WorldState } from '@gm/schema';
import { SaveStore, SqlJsDriver, type ReplayDeps } from '../../src/index.ts';

export const ENGINE = 'test-engine 1';
export const PARAMS_VERSION = 'test-params 1';

let sql: Promise<SqlJsStatic> | undefined;
export const SQL = () => (sql ??= initSqlJs());

export function headlessDeps(): ReplayDeps {
  return { apply: (w, c) => applyCommand(w, c), stateHash, eventsHash: (e) => bytesHash(canonicalBytes(e)), chainNext, genesis: CHAIN_GENESIS };
}

export interface Career {
  store: SaveStore;
  driver: SqlJsDriver;
  world: WorldState;
  /** State hash after each logged command, by sequence (0 = creation). */
  hashes: Map<number, string>;
  run(type: string, payload: unknown): Promise<void>;
  /** Writes a snapshot of the current world at the current log position. */
  snapshot(kind: string): Promise<void>;
  /** Replaces the in-memory world (stands in for a later system such as the people import). */
  setWorld(w: WorldState): Promise<void>;
  lastSeq(): number;
}

export async function newCareer(seedHex = '00000000000000aa'): Promise<Career> {
  const driver = SqlJsDriver.open(await SQL());
  const header: SaveHeader = {
    saveFormatVersion: SAVE_FORMAT_VERSION, engineVersion: ENGINE, parameterSetVersion: PARAMS_VERSION, masterSeed: seedHex,
    generatorOptions: { worldSize: 'small' }, contentManifest: [{ packId: 'ruleset:test', version: '1', hash: 'h1' }], ruleSets: [],
    settings: { worldSize: 'small', retentionProfile: 'standard' }, certified: true, calendar: { seasonYear: 2026, dayIndex: 0 },
    userPersonId: null, userJob: null, summary: 'Test career', hashChainHead: CHAIN_GENESIS, createdWith: 'test', lastWrittenWith: 'test',
  };
  const w0 = emptyWorld();
  const store = await SaveStore.create(driver, header, w0, [{ id: 'ruleset:test', kind: 'ruleset', hash: 'h1', body: { values: [1, 2, 3] } }]);
  await store.writeSnapshot('creation', 0, stateHash(w0), w0);
  let world = w0;
  let seq = 0;
  let head = CHAIN_GENESIS;
  let hdr = header;
  const hashes = new Map<number, string>([[0, stateHash(w0)]]);
  const c: Career = {
    store, driver, hashes,
    get world() { return world; },
    async run(type, payload) {
      const cmd = CommandEnvelope.parse({ id: seq + 1, type, actor: { personId: null, job: 'system' }, worldTime: world.calendar, payload, schemaVersion: 1 });
      const r = applyCommand(world, cmd);
      if (!r.ok) throw new Error(r.reason);
      const h = stateHash(r.world);
      let checkpoint;
      if (isCheckpoint(type)) {
        const next = chainNext({ prev: head, stateHash: h, logSequence: cmd.id, engineVersion: ENGINE, parameterSetVersion: PARAMS_VERSION });
        checkpoint = { stateHash: h, head: next, prev: head, engineVersion: ENGINE, parameterSetVersion: PARAMS_VERSION };
        head = next;
      }
      hdr = { ...hdr, calendar: r.world.calendar, hashChainHead: head };
      await store.appendCommand(cmd, r.world, hdr, bytesHash(canonicalBytes(r.events)), checkpoint);
      world = r.world;
      seq = cmd.id;
      hashes.set(seq, h);
    },
    async snapshot(kind) { await store.writeSnapshot(kind, seq, stateHash(world), world); },
    async setWorld(w) {
      world = w;
      hashes.set(seq, stateHash(w));
      await driver.transaction([{ sql: "UPDATE world_state SET json = ? WHERE key = 'world'", params: [JSON.stringify(w)] }]);
    },
    lastSeq: () => seq,
  };
  return c;
}

/** A career with a world, a mix of checkpoint and non-checkpoint commands, and `n` day advances. */
export async function playedCareer(n = 12): Promise<Career> {
  const c = await newCareer();
  await c.run('CreateWorld', {
    masterSeedHex: '00000000000000aa', startSeasonYear: 2026,
    competitions: [
      { name: 'College', level: 'college', ruleSetId: 'college_2026', leagueRulesId: 'college_league_2026' },
      { name: 'Pro', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: 'pro_league_2026' },
    ],
  });
  for (let i = 0; i < n; i++) {
    await c.run('AdvanceDay', { days: 1 + ((i * 37) % 90) });
    if (i % 3 === 1) await c.run('RenameCompetition', { competitionId: 1, name: `College ${i}` });
  }
  return c;
}
