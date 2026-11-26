// Migration fixtures (Q1.2.3): "one stored save per released save version, each with a recorded state
// hash and a short command script. Each fixture is loaded, migrated to the current version, hashed, and
// compared with the expected post-migration hash. The command script then runs one further week and
// must finish without an invariant failure." Fixtures include a season-1 save, a season-15 save, a save
// with an imported people pack made from synthetic names, and a certified save.
//
// The fixtures play the conformance stand-in world (../save/conformance.ts), so any gate (Node, the
// browser build, the desktop shell) can run them with its own driver and the engine's hash functions.
// They hold no football: what they prove is that the save layout of every format reaches the current
// one with its state, its proof and its replay intact.
import { CommandEnvelope, type SaveHeader, type WorldState } from '@gm/schema';
import type { SqlDriver } from '../driver.ts';
import { SaveStore } from '../save-store.ts';
import {
  CONFORMANCE_VERSIONS, conformanceApply, conformanceDeps, conformanceHeader, conformanceWorld,
  type ConformanceHashes, type ConformanceWorld,
} from '../save/conformance.ts';
import { SaveFile } from '../save/save-file.ts';
import type { CommandInput, CommitPlan, SaveCoreDeps } from '../save/types.ts';
import type { BlobCodec } from '../snapshot/codec.ts';
import { migrateSave } from './runner.ts';

export type FixtureKind = 'season1' | 'season15' | 'people_pack' | 'certified';

export interface FixtureSpec { name: string; format: number; kind: FixtureKind }

/** Every fixture the suite keeps. A new format adds its rows here and its files to test/migrations/fixtures. */
export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  { name: 'f1-season1', format: 1, kind: 'season1' },
  { name: 'f1-certified', format: 1, kind: 'certified' },
  { name: 'f2-season1', format: 2, kind: 'season1' },
  { name: 'f2-season15', format: 2, kind: 'season15' },
  { name: 'f2-people-pack', format: 2, kind: 'people_pack' },
  { name: 'f2-certified', format: 2, kind: 'certified' },
  { name: 'f3-season1', format: 3, kind: 'season1' },
];

export interface FixtureExpect {
  /** Engine state hash of the world right after migration. */
  stateHash: string;
  /** Engine state hash after the one-week script. */
  stateHashAfterWeek: string;
  certified: boolean;
  seasonYear: number;
}

export interface FixtureEnv {
  open(bytes?: Uint8Array): Promise<SqlDriver>;
  hashes: ConformanceHashes;
  codec?: BlobCodec;
}

const DAYS_PER_SEASON = 364;
const DAYS_PER_WEEK = 7;
const WEEKS_PER_SEASON = DAYS_PER_SEASON / DAYS_PER_WEEK;
const SYSTEM = { personId: null, job: 'system' } as const;

/** Synthetic people pack (A6.3, U1): made-up names, never a real person. */
const PEOPLE_PACK = { id: 'synthetic-test-pack', version: '1', hash: '5e1f0000c0ffee00', count: 3 };

function weekCommands(w: ConformanceWorld, week: number): { type: string; payload: unknown; undoable?: boolean }[] {
  const ids = w.people.map((x) => x.id);
  const out: { type: string; payload: unknown; undoable?: boolean }[] = [];
  if (week % 3 === 0) out.push({ type: 'conf.AddPerson', payload: { name: `N${week}` } });
  out.push({ type: 'conf.SetDepth', payload: { unit: `u${week % 4}`, ids: ids.slice(0, 1 + (week % 3)) }, undoable: true });
  out.push({ type: 'conf.Note', payload: { text: `week ${week}` }, undoable: true });
  out.push({ type: 'conf.Train', payload: { id: ids[week % ids.length], load: 1 + (week % 7) / 10 } });
  out.push({ type: 'conf.AdvanceWeek', payload: {} });
  return out;
}

const weeksFor = (kind: FixtureKind) => (kind === 'season15' ? 14 * WEEKS_PER_SEASON + 4 : 6);

function headerFor(kind: FixtureKind): Omit<SaveHeader, 'saveFormatVersion' | 'hashChainHead'> {
  const h = conformanceHeader();
  return {
    ...h,
    certified: kind === 'certified',
    ...(kind === 'people_pack' ? { peoplePack: PEOPLE_PACK } : {}),
  };
}

/** Writes a fixture save of the given format. Format 1 is the phase 0 `SaveStore` layout. */
export async function writeFixture(spec: FixtureSpec, env: FixtureEnv): Promise<Uint8Array> {
  const deps = conformanceDeps(env.hashes);
  const driver = await env.open();
  if (spec.format === 1) return writeFormat1(spec, driver, deps);
  if (spec.format === 2) throw new Error('format 2 fixtures are fixed for good: this build writes format 3 and keeps the files in test/migrations/fixtures');
  if (spec.format === 3) return writeFormat2(spec, driver, deps, env.codec);
  throw new Error(`no fixture writer for format ${spec.format}`);
}

async function writeFormat1(spec: FixtureSpec, driver: SqlDriver, deps: SaveCoreDeps<ConformanceWorld>): Promise<Uint8Array> {
  let world = conformanceWorld();
  let head = deps.genesis;
  const base = headerFor(spec.kind);
  const header = (w: ConformanceWorld): SaveHeader => ({ ...base, saveFormatVersion: 1, hashChainHead: head, calendar: w.calendar, summary: `${w.people.length} people` });
  // SaveStore.create checks the phase 0 world schema; the stand-in world replaces it before any command,
  // so the file has exactly the phase 0 tables with the stand-in's state in them.
  const placeholder: WorldState = { formatVersion: 1, masterSeedHex: base.masterSeed, calendar: world.calendar, competitions: [], teams: [], people: [], nextIds: { competition: 1, team: 1, person: 1 }, userPersonId: null };
  const store = await SaveStore.create(driver, header(world), placeholder, []);
  await driver.transaction([{ sql: "UPDATE world_state SET json = ? WHERE key = 'world'", params: [JSON.stringify(world)] }]);
  await store.writeSnapshot('creation', 0, deps.stateHash(world), placeholder);
  let seq = 0;
  for (let week = 0; week < weeksFor(spec.kind); week++) {
    for (const c of weekCommands(world, week)) {
      const cmd = CommandEnvelope.parse({ id: ++seq, type: c.type, actor: SYSTEM, worldTime: world.calendar, payload: c.payload, schemaVersion: 1 });
      const r = conformanceApply(world, cmd);
      if (!r.ok) throw new Error(`fixture ${spec.name}: ${c.type} refused: ${r.reason}`);
      world = r.state;
      let checkpoint;
      if (c.type === 'conf.AdvanceWeek') {
        const stateHash = deps.stateHash(world);
        const prev = head;
        head = deps.chainNext({ prev, stateHash, logSequence: seq, ...CONFORMANCE_VERSIONS });
        checkpoint = { stateHash, head, prev, ...CONFORMANCE_VERSIONS };
      }
      await store.appendCommand(cmd, world as unknown as WorldState, header(world), deps.eventsHash(r.events), checkpoint);
    }
  }
  const bytes = await driver.exportBytes!();
  await driver.close();
  return bytes;
}

/** The save core layout: format 2 when it was written by that build, format 3 now. */
async function writeFormat2(spec: FixtureSpec, driver: SqlDriver, deps: SaveCoreDeps<ConformanceWorld>, codec?: BlobCodec): Promise<Uint8Array> {
  const save = await SaveFile.create(driver, deps, { header: headerFor(spec.kind), state: conformanceWorld(), versions: CONFORMANCE_VERSIONS }, codec ? { codec } : {});
  await playWeeks(save, 0, weeksFor(spec.kind));
  const year = save.state().calendar.seasonYear;
  for (let y = 2026; y < year - 1; y++) await save.compressLogSeason(y);
  const bytes = await driver.exportBytes!();
  await save.close();
  return bytes;
}

async function playWeeks(save: SaveFile<ConformanceWorld>, from: number, count: number): Promise<void> {
  for (let week = from; week < from + count; week++) {
    for (const c of weekCommands(save.state(), week)) {
      const input: CommandInput = { type: c.type, payload: c.payload, actor: SYSTEM, worldTime: save.state().calendar, schemaVersion: 1 };
      let plan: CommitPlan = c.undoable ? { undoable: true } : {};
      if (c.type === 'conf.AdvanceWeek') {
        const rolls = save.state().calendar.dayIndex + DAYS_PER_WEEK >= DAYS_PER_SEASON;
        plan = rolls
          ? { advancesTime: true, checkpoint: { kind: 'season', ...CONFORMANCE_VERSIONS }, snapshot: 'season' }
          : { advancesTime: true, checkpoint: { kind: 'week', ...CONFORMANCE_VERSIONS }, snapshot: 'week' };
      }
      const r = await save.issue(input, plan);
      if (!r.ok) throw new Error(`${c.type} refused: ${r.reason}`);
    }
  }
}

/** Q1.2.2-style invariants of the stand-in world. */
export function fixtureInvariants(w: ConformanceWorld): string[] {
  const problems: string[] = [];
  const ids = new Set<number>();
  for (const p of w.people) {
    if (ids.has(p.id)) problems.push(`person ${p.id} appears twice`);
    ids.add(p.id);
    if (!Number.isFinite(p.rating) || !Number.isFinite(p.form)) problems.push(`person ${p.id} has a value that is not a number`);
    if (p.id >= w.nextId) problems.push(`person ${p.id} is not below the next id`);
  }
  for (const [unit, slot] of Object.entries(w.depth)) for (const id of slot) if (!ids.has(id)) problems.push(`depth chart ${unit} points at nobody (${id})`);
  if (w.calendar.dayIndex < 0 || w.calendar.dayIndex >= DAYS_PER_SEASON) problems.push('the calendar day is out of range');
  return problems;
}

export interface FixtureResult {
  name: string;
  ok: boolean;
  problems: string[];
  migratedFrom: number;
  stateHash: string;
  stateHashAfterWeek: string;
  certified: boolean;
  seasonYear: number;
}

/**
 * Loads a fixture's bytes, migrates it to the current format, checks the state hash, plays one more
 * week and runs the invariant checks and a replay from every snapshot. Compares with `expect` when given.
 */
export async function runFixture(name: string, bytes: Uint8Array, env: FixtureEnv, expect?: FixtureExpect): Promise<FixtureResult> {
  const deps = conformanceDeps(env.hashes);
  const problems: string[] = [];
  const out: FixtureResult = { name, ok: false, problems, migratedFrom: 0, stateHash: '', stateHashAfterWeek: '', certified: false, seasonYear: 0 };
  const source = await env.open(bytes);
  const m = await migrateSave(source, { deps, versions: CONFORMANCE_VERSIONS, openScratch: (b) => env.open(b), codec: env.codec, invariants: fixtureInvariants });
  let driver: SqlDriver;
  if (m.status === 'migrated') {
    out.migratedFrom = m.from;
    driver = m.migrated;
    if (m.backup.length !== bytes.length || m.backup.some((b, i) => b !== bytes[i])) problems.push('the backup differs from the original file');
    const untouched = await source.exportBytes!();
    if (untouched.length !== bytes.length || untouched.some((b, i) => b !== bytes[i])) problems.push('the original file was changed by the migration');
    await source.close();
  } else if (m.status === 'current') {
    driver = source;
  } else {
    problems.push(`not migrated: ${m.status}${'reason' in m ? `: ${m.reason}` : ''}`);
    return out;
  }
  const save = await SaveFile.open(driver, deps, env.codec ? { codec: env.codec, paranoid: true } : { paranoid: true });
  out.stateHash = deps.stateHash(save.state());
  out.certified = save.header().certified;
  if (expect && out.stateHash !== expect.stateHash) problems.push(`state hash after migration is ${out.stateHash}, expected ${expect.stateHash}`);
  problems.push(...fixtureInvariants(save.state()));
  const weekIndex = Math.floor(save.state().calendar.dayIndex / DAYS_PER_WEEK) + 1000;
  try { await playWeeks(save, weekIndex, 1); } catch (e) { problems.push(`the one-week script failed: ${e instanceof Error ? e.message : String(e)}`); }
  problems.push(...fixtureInvariants(save.state()).map((p) => `after the week: ${p}`));
  problems.push(...(await save.verifyLive()));
  for (const s of await save.snapshots()) {
    const r = await save.verifyByReplay(s.id);
    if (!r.ok) problems.push(`replay from snapshot ${s.id} (${s.kind}): ${r.problems.join('; ')}`);
  }
  out.stateHashAfterWeek = deps.stateHash(save.state());
  out.seasonYear = save.state().calendar.seasonYear;
  if (expect) {
    if (out.stateHashAfterWeek !== expect.stateHashAfterWeek) problems.push(`state hash after the week is ${out.stateHashAfterWeek}, expected ${expect.stateHashAfterWeek}`);
    if (out.certified !== expect.certified) problems.push(`certified is ${String(out.certified)}, expected ${String(expect.certified)}`);
    if (out.seasonYear !== expect.seasonYear) problems.push(`season is ${out.seasonYear}, expected ${expect.seasonYear}`);
  }
  await save.close();
  out.ok = problems.length === 0;
  return out;
}
