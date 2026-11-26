// The migration runner (P5.5.1). "The loader runs every step between the save's version and the
// current one inside a transaction, after writing a backup file beside the save."
//
// The runner works on a scratch copy made from the save's bytes. The user's file is never written:
// the backup is the original bytes, and the caller replaces the file with the migrated bytes only when
// the outcome is `migrated`. A failed migration therefore leaves the original as it was (P5.5.1 edge
// case), on every platform, whatever the platform's driver can or cannot nest. The desktop shell writes
// the backup beside the save; the browser offers it as a download before migrating (P5.5.1 edge case).
import type { SqlDriver } from '../driver.ts';
import { SaveFile } from '../save/save-file.ts';
import { SAVE_CORE_FORMAT_VERSION, SaveVersionError, type SaveCoreDeps, type SaveOptions, type SaveVersions } from '../save/types.ts';
import type { BlobCodec } from '../snapshot/codec.ts';
import { MIGRATION_STEPS, MigrationError, pathFor, validateSteps, type MigrationStep } from './steps.ts';

/** The text the load screen shows before it migrates (P5.5.1). */
export const MIGRATION_NOTICE = 'This career will be updated to the current format. A backup will be kept.';

export interface MigrateOptions<S> {
  deps: SaveCoreDeps<S>;
  /** Versions of this build; written on the migration chain row. */
  versions: SaveVersions;
  /** Opens a fresh driver over a copy of these bytes. The migration runs there. */
  openScratch(bytes: Uint8Array): Promise<SqlDriver>;
  appVersion?: string;
  codec?: BlobCodec;
  /** Default MIGRATION_STEPS; tests pass others. */
  steps?: readonly MigrationStep[];
  /** Default SAVE_CORE_FORMAT_VERSION. */
  target?: number;
  /** Invariant checks on the migrated world (Q1.2.2). Problems fail the migration. */
  invariants?(state: S): string[];
}

export type MigrationOutcome =
  | { status: 'current'; format: number }
  | { status: 'newer'; format: number }
  | { status: 'unreadable'; reason: string }
  | { status: 'migrated'; from: number; to: number; steps: string[]; backup: Uint8Array; migrated: SqlDriver; stateHash: string; chainHead: string }
  | { status: 'failed'; from: number; to: number; step: string | null; reason: string; backup: Uint8Array };

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Reads the save's format without opening it. */
export async function saveFormatOf(driver: SqlDriver): Promise<number | null> {
  try {
    const r = (await driver.all<{ v: number }>('SELECT save_format_version AS v FROM header WHERE id = 1'))[0];
    return r ? Number(r.v) : null;
  } catch {
    return null;
  }
}

/** Migrates a save to the current format on a scratch copy. Never writes to `source`. */
export async function migrateSave<S>(source: SqlDriver, opts: MigrateOptions<S>): Promise<MigrationOutcome> {
  const steps = opts.steps ?? MIGRATION_STEPS;
  const target = opts.target ?? SAVE_CORE_FORMAT_VERSION;
  validateSteps(steps, target);
  const from = await saveFormatOf(source);
  if (from === null) return { status: 'unreadable', reason: 'not a save file: no header row' };
  if (from === target) return { status: 'current', format: target };
  if (from > target) return { status: 'newer', format: from };
  if (!source.exportBytes) return { status: 'unreadable', reason: 'this platform cannot copy the save to migrate it' };

  const backup = await source.exportBytes();
  let scratch: SqlDriver | null = null;
  let current: MigrationStep | null = null;
  try {
    const path = pathFor(steps, from, target);
    scratch = await opts.openScratch(backup.slice());
    const ctx = { driver: scratch, deps: opts.deps, versions: opts.versions, appVersion: opts.appVersion, codec: opts.codec };
    let stateHashBefore: string | null = null;
    const notes: Record<string, unknown>[] = [];
    for (const step of path) {
      current = step;
      const r = await step.run(ctx);
      stateHashBefore ??= r.stateHashBefore;
      notes.push({ step: step.id, changesOutcomes: step.changesOutcomes, ...r.notes });
      const now = await saveFormatOf(scratch);
      if (now !== step.to) throw new MigrationError(`after step ${step.id} the save reads format ${String(now)}, expected ${step.to}`, step.id);
    }
    current = null;
    const saveOpts: SaveOptions = { codec: opts.codec, appVersion: opts.appVersion };
    const save = await SaveFile.open(scratch, opts.deps, saveOpts);
    await save.markMigration(from, target, stateHashBefore ?? opts.deps.stateHash(save.state()), opts.versions);
    await save.snapshotNow('pre_migration', opts.versions, JSON.stringify({ fromFormat: from, toFormat: target, steps: notes }));
    const problems = opts.invariants?.(save.state()) ?? [];
    if (problems.length) throw new MigrationError(`the migrated career fails its invariant checks: ${problems.join('; ')}`);
    // Open once more from scratch, as the next load will, so every load check runs on the result.
    const reopened = await SaveFile.open(scratch, opts.deps, saveOpts);
    return {
      status: 'migrated', from, to: target, steps: path.map((s) => s.id), backup, migrated: scratch,
      stateHash: opts.deps.stateHash(reopened.state()), chainHead: reopened.header().hashChainHead,
    };
  } catch (e) {
    if (scratch) { try { await scratch.close(); } catch { /* the scratch copy is discarded either way */ } }
    return { status: 'failed', from, to: target, step: current?.id ?? (e instanceof MigrationError ? e.step : null), reason: msg(e), backup };
  }
}

export type LoadOutcome<S> =
  | { status: 'opened'; save: SaveFile<S>; migrated: null }
  | { status: 'opened'; save: SaveFile<S>; migrated: Extract<MigrationOutcome, { status: 'migrated' }> }
  | { status: 'not_loaded'; outcome: Exclude<MigrationOutcome, { status: 'migrated' | 'current' }> };

/**
 * Opens a save, migrating it first when it is older (P5.5.1). On `migrated`, the returned save runs on
 * the migrated copy; the caller writes `migrated.backup` beside the original and then replaces the
 * original with the copy's bytes. Damage other than the format is thrown as `SaveFile.open` throws it.
 */
export async function openOrMigrate<S>(source: SqlDriver, opts: MigrateOptions<S> & { saveOptions?: SaveOptions }): Promise<LoadOutcome<S>> {
  try {
    return { status: 'opened', save: await SaveFile.open(source, opts.deps, opts.saveOptions), migrated: null };
  } catch (e) {
    if (!(e instanceof SaveVersionError) || e.newer) {
      if (e instanceof SaveVersionError) return { status: 'not_loaded', outcome: { status: 'newer', format: e.found } };
      throw e;
    }
  }
  const outcome = await migrateSave(source, opts);
  if (outcome.status !== 'migrated') {
    if (outcome.status === 'current') throw new MigrationError('the save reads as current but did not open');
    return { status: 'not_loaded', outcome };
  }
  return { status: 'opened', save: await SaveFile.open(outcome.migrated, opts.deps, opts.saveOptions), migrated: outcome };
}
