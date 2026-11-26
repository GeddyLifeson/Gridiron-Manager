// Shared test setup: sql.js databases in memory, and the engine's hash functions as the save core's deps.
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { CHAIN_GENESIS, bytesHash, chainNext, stateHash } from '@gm/engine-core';
import { SqlJsDriver } from '../../src/sqljs-driver.ts';
import type { SqlDriver } from '../../src/driver.ts';
import { conformanceDeps, type ConformanceEnv, type ConformanceHashes, type ConformanceWorld } from '../../src/save/conformance.ts';
import type { SaveCoreDeps } from '../../src/save/types.ts';

let sql: Promise<SqlJsStatic> | undefined;
export function sqlJs(): Promise<SqlJsStatic> {
  sql ??= initSqlJs();
  return sql;
}

export const HASHES: ConformanceHashes = { stateHash, bytesHash, chainNext, genesis: CHAIN_GENESIS };
export const deps = (): SaveCoreDeps<ConformanceWorld> => conformanceDeps(HASHES);

export async function memoryDb(bytes?: Uint8Array): Promise<SqlJsDriver> {
  return SqlJsDriver.open(await sqlJs(), bytes);
}

/** Closes a driver and opens its bytes again, as a restart would. */
export async function reopen(driver: SqlDriver): Promise<SqlJsDriver> {
  const bytes = await driver.exportBytes!();
  await driver.close();
  return memoryDb(bytes);
}

export const env = (): ConformanceEnv => ({ open: () => memoryDb(), reopen, hashes: HASHES });

// ---- a scripted season used by the crash and recovery tests ----
import { SaveFile } from '../../src/save/save-file.ts';
import { CONFORMANCE_VERSIONS, conformanceHeader, conformanceWorld } from '../../src/save/conformance.ts';
import type { CommandInput, CommitPlan, IssueResult, SaveOptions } from '../../src/save/types.ts';

export type World = ConformanceWorld;
export type Step =
  | { kind: 'issue'; type: string; payload: (w: World) => unknown; plan?: CommitPlan }
  | { kind: 'undo' } | { kind: 'redo' } | { kind: 'flush' };

export const V = CONFORMANCE_VERSIONS;
export const WEEK_PLAN: CommitPlan = { advancesTime: true, checkpoint: { kind: 'week', ...V }, snapshot: 'week' };
export const UNDOABLE: CommitPlan = { undoable: true };

export function input(save: SaveFile<World>, type: string, payload: unknown): CommandInput {
  return { type, payload, actor: { personId: null, job: 'system' }, worldTime: save.state().calendar, schemaVersion: 1 };
}

/** One step per entry; a step that succeeds adds exactly one log row, except `flush`. */
export function seasonScript(weeks: number): Step[] {
  const s: Step[] = [];
  for (let w = 0; w < weeks; w++) {
    if (w % 3 === 0) s.push({ kind: 'issue', type: 'conf.AddPerson', payload: () => ({ name: `N${w}` }) });
    s.push({ kind: 'issue', type: 'conf.SetDepth', payload: (x) => ({ unit: `u${w % 4}`, ids: x.people.slice(0, 1 + (w % 3)).map((p) => p.id) }), plan: UNDOABLE });
    s.push({ kind: 'issue', type: 'conf.Note', payload: () => ({ text: `week ${w}` }), plan: UNDOABLE });
    s.push({ kind: 'undo' });
    if (w % 2 === 0) s.push({ kind: 'redo' });
    s.push({ kind: 'issue', type: 'conf.Train', payload: (x) => ({ id: x.people[w % x.people.length]!.id, load: 1 + (w % 7) / 10 }) });
    // Every fourth week the snapshot is held back and written later, as an idle moment would do.
    s.push({ kind: 'issue', type: 'conf.AdvanceWeek', payload: () => ({}), plan: w % 4 === 3 ? { ...WEEK_PLAN, deferSnapshot: true } : WEEK_PLAN });
    if (w % 8 === 3) s.push({ kind: 'flush' });
  }
  return s;
}

export async function runStep(save: SaveFile<World>, step: Step): Promise<IssueResult | null> {
  if (step.kind === 'undo') return save.undo();
  if (step.kind === 'redo') return save.redo();
  if (step.kind === 'flush') { await save.flushSnapshot(); return null; }
  return save.issue(input(save, step.type, step.payload(save.state())), step.plan);
}

export async function newSave(driver: SqlDriver, options: SaveOptions = {}, world: World = conformanceWorld()): Promise<SaveFile<World>> {
  return SaveFile.create(driver, deps(), { header: conformanceHeader(), state: world, versions: V }, options);
}

export interface CleanRun { hashAt: string[]; digestAt: string[]; seqBefore: number[]; bytes: Uint8Array }

/** Plays a script with no faults and records the state hash at every log position. */
export async function cleanRun(script: readonly Step[]): Promise<CleanRun> {
  const driver = await memoryDb();
  const save = await newSave(driver);
  const hashAt = [stateHash(save.state())];
  const digestAt = [save.digest()];
  const seqBefore: number[] = [];
  for (const step of script) {
    seqBefore.push(save.lastSeq());
    const r = await runStep(save, step);
    if (r && !r.ok) throw new Error(`clean run: ${step.kind} failed: ${r.reason}`);
    if (r) { hashAt[save.lastSeq()] = stateHash(save.state()); digestAt[save.lastSeq()] = save.digest(); }
  }
  const bytes = await driver.exportBytes();
  await save.close();
  return { hashAt, digestAt, seqBefore, bytes };
}

/** Plays `script` from the step that follows log position `save.lastSeq()` to the end. */
export async function resume(save: SaveFile<World>, script: readonly Step[], clean: CleanRun): Promise<void> {
  let i = clean.seqBefore.findIndex((s) => s === save.lastSeq());
  if (i < 0) i = script.length;
  for (; i < script.length; i++) {
    const r = await runStep(save, script[i]!);
    if (r && !r.ok) throw new Error(`resume: step ${i} failed: ${r.reason}`);
  }
}
