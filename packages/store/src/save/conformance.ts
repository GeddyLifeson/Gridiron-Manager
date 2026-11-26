// A fixed, scripted career on a small stand-in world, for the cross-platform check of Q1.3.1: "a save
// replays from its command log to the same state hash on Linux, Windows and browser". The stand-in
// holds no football. It exercises what can differ between platforms: floating-point state through a
// JSON round trip, key order, integer random steps, undo and redo, snapshots, an archived log season
// and a reopen from the file's bytes. Any gate (Node, browser build, desktop shell) can run it with
// its own SQL driver and the engine's hash functions, and compare the result with the same constants.
import type { CommandEnvelope, SaveHeader } from '@gm/schema';
import type { SqlDriver } from '../driver.ts';
import type { ChainFns } from '../snapshot/chain.ts';
import type { BlobCodec } from '../snapshot/codec.ts';
import { SaveFile } from './save-file.ts';
import type { ApplyResult, CommandInput, CommitPlan, NewSaveHeader, SaveCoreDeps } from './types.ts';

export interface ConformancePerson { id: number; name: string; rating: number; form: number; tags: Record<string, number> }
export interface ConformanceWorld {
  formatVersion: number;
  calendar: { seasonYear: number; dayIndex: number };
  rng: number;
  nextId: number;
  people: ConformancePerson[];
  depth: Record<string, number[]>;
  notes: string[];
}

export const CONFORMANCE_VERSIONS = { engineVersion: 'conformance-engine', parameterSetVersion: 'conformance-params' };
const DAYS_PER_SEASON = 364;
const DAYS_PER_WEEK = 7;

export function conformanceWorld(): ConformanceWorld {
  return {
    formatVersion: 1,
    calendar: { seasonYear: 2026, dayIndex: 0 },
    rng: 0x9e3779b9 | 0,
    nextId: 4,
    people: [1, 2, 3].map((id) => ({ id, name: `P${id}`, rating: 50 + id / 3, form: 1 / id, tags: {} })),
    depth: {},
    notes: [],
  };
}

function step(x: number): number {
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x | 0;
}

type P = Record<string, unknown>;

/** The stand-in core: a pure function of state and command that never edits its input. */
export function conformanceApply(w: ConformanceWorld, cmd: CommandEnvelope): ApplyResult<ConformanceWorld> {
  const p = (cmd.payload ?? {}) as P;
  switch (cmd.type) {
    case 'conf.AddPerson': {
      if (typeof p.name !== 'string' || p.name === '') return { ok: false, reason: 'a person needs a name', code: 'name_missing' };
      const person: ConformancePerson = { id: w.nextId, name: p.name, rating: 40 + (w.nextId % 17) / 7, form: 0.5, tags: {} };
      return { ok: true, state: { ...w, nextId: w.nextId + 1, people: [...w.people, person] }, events: [{ type: 'person_added', id: person.id }] };
    }
    case 'conf.SetDepth': {
      const unit = String(p.unit);
      const ids = p.ids as number[] | null;
      if (ids && ids.some((id) => !w.people.some((x) => x.id === id))) return { ok: false, reason: 'a depth chart slot points at nobody', code: 'unknown_person' };
      const depth: Record<string, number[]> = {};
      for (const k of Object.keys(w.depth)) if (k !== unit) depth[k] = w.depth[k]!;
      if (ids) depth[unit] = ids;
      return { ok: true, state: { ...w, depth }, events: [{ type: 'depth_set', unit }] };
    }
    case 'conf.Note':
      return { ok: true, state: { ...w, notes: [...w.notes, String(p.text)] }, events: [] };
    case 'conf.DropNote':
      if (w.notes.length === 0) return { ok: false, reason: 'there is no note to drop', code: 'no_note' };
      return { ok: true, state: { ...w, notes: w.notes.slice(0, -1) }, events: [] };
    case 'conf.Train': {
      const load = Number(p.load);
      if (!w.people.some((x) => x.id === p.id)) return { ok: false, reason: 'nobody to train', code: 'unknown_person' };
      const people = w.people.map((x) => (x.id === p.id ? { ...x, rating: Math.sqrt(x.rating * x.rating + load / 7), form: x.form * 0.9 + load / 3 } : x));
      return { ok: true, state: { ...w, people }, events: [{ type: 'trained', id: p.id, load }] };
    }
    case 'conf.AdvanceWeek': {
      let rng = w.rng;
      let nextId = w.nextId;
      const week = Math.floor(w.calendar.dayIndex / DAYS_PER_WEEK);
      const people: ConformancePerson[] = [];
      const events: unknown[] = [];
      for (const x of w.people) {
        rng = step(rng);
        const roll = (rng >>> 0) % 2001;
        if ((rng >>> 0) % 97 === 0 && w.people.length > 3) { events.push({ type: 'left', id: x.id }); continue; }
        const tags = { ...x.tags, [`w${week % 5}`]: (x.tags[`w${week % 5}`] ?? 0) + 1 };
        people.push({ ...x, rating: x.rating + (roll - 1000) / 8191, form: (x.form + roll / 2001) / 2, tags });
      }
      rng = step(rng);
      if ((rng >>> 0) % 3 === 0) { people.push({ id: nextId, name: `G${nextId}`, rating: 30 + ((rng >>> 0) % 400) / 11, form: 0.25, tags: {} }); nextId++; }
      const depth: Record<string, number[]> = {};
      for (const k of Object.keys(w.depth)) depth[k] = w.depth[k]!.filter((id) => people.some((x) => x.id === id));
      let dayIndex = w.calendar.dayIndex + DAYS_PER_WEEK;
      let seasonYear = w.calendar.seasonYear;
      if (dayIndex >= DAYS_PER_SEASON) { dayIndex = 0; seasonYear++; }
      return { ok: true, state: { ...w, calendar: { seasonYear, dayIndex }, rng, nextId, people, depth }, events };
    }
    default:
      return { ok: false, reason: `unknown command ${cmd.type}`, code: 'unknown_command' };
  }
}

export function conformanceInvert(before: ConformanceWorld, cmd: CommandEnvelope): { type: string; payload: unknown } | null {
  if (cmd.type === 'conf.SetDepth') {
    const unit = String((cmd.payload as P).unit);
    return { type: 'conf.SetDepth', payload: { unit, ids: before.depth[unit] ?? null } };
  }
  if (cmd.type === 'conf.Note') return { type: 'conf.DropNote', payload: {} };
  return null;
}

export interface ConformanceHashes extends ChainFns {
  stateHash(state: unknown): string;
  bytesHash(bytes: Uint8Array): string;
}

export function conformanceDeps(h: ConformanceHashes): SaveCoreDeps<ConformanceWorld> {
  const text = new TextEncoder();
  return {
    apply: conformanceApply,
    invert: conformanceInvert,
    describe: (w): Partial<SaveHeader> => ({ calendar: w.calendar, summary: `${w.people.length} people` }),
    stateHash: h.stateHash,
    bytesHash: h.bytesHash,
    eventsHash: (e) => h.bytesHash(text.encode(JSON.stringify(e))),
    chainNext: h.chainNext,
    genesis: h.genesis,
  };
}

export function conformanceHeader(): NewSaveHeader {
  return {
    engineVersion: CONFORMANCE_VERSIONS.engineVersion,
    parameterSetVersion: CONFORMANCE_VERSIONS.parameterSetVersion,
    masterSeed: '00000000000000c0',
    generatorOptions: {},
    contentManifest: [],
    ruleSets: [],
    settings: { worldSize: 'small', retentionProfile: 'standard' },
    certified: true,
    calendar: { seasonYear: 2026, dayIndex: 0 },
    userPersonId: null,
    userJob: null,
    summary: '',
    createdWith: 'conformance',
    lastWrittenWith: 'conformance',
  };
}

export interface ConformanceEnv {
  /** A new, empty database. */
  open(): Promise<SqlDriver>;
  /** Closes the driver and opens the same file again from storage, as a restart would. */
  reopen(driver: SqlDriver): Promise<SqlDriver>;
  hashes: ConformanceHashes;
  codec?: BlobCodec;
  /** Weeks to play. The default crosses one season boundary. */
  weeks?: number;
}

/**
 * What `runConformance` must return with the default 56 weeks and the hash functions of
 * @gm/engine-core. Recorded on Linux (Node 22) and matched in Chromium 158 on 2026-11-26; the store's
 * own test asserts it, so `npm test` checks it on every machine. A change to this module that moves
 * these values has changed how saves replay, and must say why (Q1.3.1).
 */
export const CONFORMANCE_EXPECTED = { commands: 397, digest: '2ccddeeb2d1a75d3', stateHash: '93322311d7add411', chainHead: 'd405bdcc2fdcdf53' } as const;

export interface ConformanceResult {
  commands: number;
  digest: string;
  stateHash: string;
  chainHead: string;
  /** Every retained snapshot replayed to the live state, before and after the log season was archived and after the reopen. */
  replays: number;
  problems: string[];
}

const UNDOABLE: CommitPlan = { undoable: true };
const WEEK: CommitPlan = { advancesTime: true, checkpoint: { kind: 'week', ...CONFORMANCE_VERSIONS }, snapshot: 'week' };

/** Plays the scripted career and checks it against itself. `problems` is empty when every check passed. */
export async function runConformance(env: ConformanceEnv): Promise<ConformanceResult> {
  const deps = conformanceDeps(env.hashes);
  const options = env.codec ? { codec: env.codec, paranoid: true } : { paranoid: true };
  const problems: string[] = [];
  let driver = await env.open();
  let save = await SaveFile.create(driver, deps, { header: conformanceHeader(), state: conformanceWorld(), versions: CONFORMANCE_VERSIONS }, options);
  const at = (): CommandInput['worldTime'] => save.state().calendar;
  const cmd = (type: string, payload: unknown): CommandInput => ({ type, payload, actor: { personId: null, job: 'system' }, worldTime: at(), schemaVersion: 1 });
  const must = async (label: string, r: Promise<{ ok: boolean; reason?: string }>) => { const x = await r; if (!x.ok) problems.push(`${label}: ${x.reason ?? 'failed'}`); };
  let replays = 0;
  const replayAll = async (label: string) => {
    for (const s of await save.snapshots()) {
      const r = await save.verifyByReplay(s.id);
      replays++;
      if (!r.ok) problems.push(`${label}: replay from snapshot ${s.id} (${s.kind} at ${s.logSeq}): ${r.problems.join('; ')}`);
    }
  };

  const weeks = env.weeks ?? 56;
  for (let w = 0; w < weeks; w++) {
    const ids = save.state().people.map((x) => x.id);
    if (w % 3 === 0) await must('add', save.issue(cmd('conf.AddPerson', { name: `N${w}` })));
    await must('depth', save.issue(cmd('conf.SetDepth', { unit: `u${w % 4}`, ids: ids.slice(0, 1 + (w % 3)) }), UNDOABLE));
    await must('depth', save.issue(cmd('conf.SetDepth', { unit: `u${(w + 1) % 4}`, ids: ids.slice().reverse().slice(0, 2) }), UNDOABLE));
    await must('undo', save.undo());
    if (w % 2 === 0) await must('redo', save.redo());
    await must('note', save.issue(cmd('conf.Note', { text: `week ${w}` }), UNDOABLE));
    if (w % 4 === 1) await must('undo note', save.undo());
    await must('train', save.issue(cmd('conf.Train', { id: ids[w % ids.length], load: 1 + (w % 7) / 10 })));
    const rejected = await save.issue(cmd('conf.Train', { id: -1, load: 1 }));
    if (rejected.ok) problems.push('a command the core rejects was logged');
    if (save.canUndo()) problems.push('undo is offered across a command that cannot be taken back');
    const before = save.state().calendar.seasonYear;
    const rolls = save.state().calendar.dayIndex + DAYS_PER_WEEK >= DAYS_PER_SEASON;
    await must('advance', save.issue(cmd('conf.AdvanceWeek', {}), rolls ? { ...WEEK, snapshot: 'season', checkpoint: { kind: 'season', ...CONFORMANCE_VERSIONS } } : WEEK));
    if (rolls && save.state().calendar.seasonYear !== before + 1) problems.push('the season did not roll');
    if (w === 20) {
      await replayAll('mid-season');
      driver = await env.reopen(driver);
      const again = await SaveFile.open(driver, deps, options);
      if (again.digest() !== save.digest() || deps.stateHash(again.state()) !== deps.stateHash(save.state())) problems.push('the reopened save differs from the save in memory');
      save = again;
    }
  }
  await replayAll('end');
  if (weeks * DAYS_PER_WEEK > DAYS_PER_SEASON) {
    if (!(await save.compressLogSeason(2026))) problems.push('the first season of the log was not archived');
    await replayAll('after archiving the first log season');
  }
  const final = { digest: save.digest(), stateHash: deps.stateHash(save.state()), chainHead: save.chainHead(), commands: save.lastSeq() };
  driver = await env.reopen(driver);
  const again = await SaveFile.open(driver, deps, options);
  if (again.digest() !== final.digest || deps.stateHash(again.state()) !== final.stateHash || again.chainHead() !== final.chainHead || again.lastSeq() !== final.commands) problems.push('the reopened save differs from the save in memory at the end');
  save = again;
  await replayAll('after reopen');
  await save.close();
  return { ...final, replays, problems };
}
