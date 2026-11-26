// Save migrations (P5.5.1): ordered, numbered steps that each move the format forward by one version.
// A migration never re-simulates past games; engine updates change only future games.
//
// Adding a format: write the step `n -> n+1` here, append it to MIGRATION_STEPS, raise
// SAVE_CORE_FORMAT_VERSION, and add a fixture save of format n+1 to test/migrations/fixtures (Q1.2.3).
// `validateSteps` refuses a registry with a gap, so a step removed on purpose fails the suite.
import { SaveHeader } from '@gm/schema';
import type { SqlDriver } from '../driver.ts';
import { SaveFile } from '../save/save-file.ts';
import type { SaveCoreDeps, SaveVersions } from '../save/types.ts';
import type { BlobCodec } from '../snapshot/codec.ts';

export interface MigrationContext<S> {
  /** The scratch copy being migrated. Never the user's file. */
  driver: SqlDriver;
  deps: SaveCoreDeps<S>;
  /** Versions of the build doing the migration. */
  versions: SaveVersions;
  appVersion?: string;
  codec?: BlobCodec;
}

export interface StepResult {
  /** Engine state hash of the world before the step (for the migration chain row). */
  stateHashBefore: string;
  /** Notes kept in the migration chain row. */
  notes: Record<string, unknown>;
}

export interface MigrationStep {
  readonly from: number;
  readonly to: number;
  readonly id: string;
  readonly title: string;
  /**
   * Null for a step that keeps every outcome. A step that must change outcomes (a fixed bug) says why
   * here; the break is recorded in the hash chain and the fixtures' expected hashes change with it (Q1.2.3).
   */
  readonly changesOutcomes: string | null;
  run<S>(ctx: MigrationContext<S>): Promise<StepResult>;
}

export class MigrationError extends Error {
  constructor(message: string, readonly step: string | null = null) { super(message); this.name = 'MigrationError'; }
}

// ------------------------------------------------------------------ format 1 -> 2

interface LegacyChainRow { n: number; prev: string; state_hash: string; log_seq: number; engine_version: string; parameter_set_version: string; head: string; note: string | null }

const LEGACY_TABLES = ['world_state', 'command_log', 'hash_chain', 'snapshots'] as const;
export const LEGACY_PREFIX = 'legacy1_';
export const META_LEGACY_FORMAT1 = 'legacy_format1';

/**
 * Format 1 was the phase 0 layout (`SaveStore`): the whole world in one JSON row, a log with no state
 * digests, snapshots as JSON. Format 2 is the save core (G-01). Format 1 logs carry no per-row state,
 * so they cannot be re-checked row by row; they are kept unchanged under `legacy1_*` (P5.4.1: the
 * command log is kept forever) and the format 2 log starts at the migrated state. The format 2 chain
 * starts with a creation row for that state, and the migration row's note names the format 1 chain
 * head, so the career's proof runs from the first chain through the second.
 */
export const STEP_1_TO_2: MigrationStep = {
  from: 1,
  to: 2,
  id: 'm0001-phase0-to-save-core',
  title: 'Phase 0 single-row world to the save core tables',
  changesOutcomes: null,
  async run<S>(ctx: MigrationContext<S>): Promise<StepResult> {
    const d = ctx.driver;
    const h = (await d.all<{ json: string }>('SELECT json FROM header WHERE id = 1'))[0];
    if (!h) throw new MigrationError('the save has no header', this.id);
    const header = SaveHeader.parse(JSON.parse(h.json));
    const w = (await d.all<{ json: string }>("SELECT json FROM world_state WHERE key = 'world'"))[0];
    if (!w) throw new MigrationError('the save has no world state', this.id);
    const world = JSON.parse(w.json) as S;
    const chain = await d.all<LegacyChainRow>('SELECT n, prev, state_hash, log_seq, engine_version, parameter_set_version, head, note FROM hash_chain ORDER BY n');
    const lastSeq = Number((await d.all<{ n: number | null }>('SELECT MAX(seq) AS n FROM command_log'))[0]?.n ?? 0);
    const commands = Number((await d.all<{ n: number }>('SELECT COUNT(*) AS n FROM command_log'))[0]?.n ?? 0);

    // The format 1 chain must hold together, or the career's proof would be lost silently.
    let head = ctx.deps.genesis;
    for (const r of chain) {
      if (r.prev !== head) throw new MigrationError(`format 1 hash chain row ${r.n} does not follow the one before`, this.id);
      head = ctx.deps.chainNext({ prev: r.prev, stateHash: r.state_hash, logSequence: r.log_seq, engineVersion: r.engine_version, parameterSetVersion: r.parameter_set_version });
      if (head !== r.head) throw new MigrationError(`format 1 hash chain row ${r.n} does not match its contents`, this.id);
    }
    if (chain.length && header.hashChainHead !== head) throw new MigrationError('the format 1 header does not name its newest chain row', this.id);
    const stateHashBefore = ctx.deps.stateHash(world);
    const last = chain.at(-1);
    if (last && last.log_seq === lastSeq && last.state_hash !== stateHashBefore) throw new MigrationError('the format 1 world does not hash to its newest chain row', this.id);

    await d.transaction([
      ...LEGACY_TABLES.map((t) => ({ sql: `ALTER TABLE ${t} RENAME TO ${LEGACY_PREFIX}${t}` })),
      { sql: 'DROP TABLE header' },
    ]);
    const { saveFormatVersion: _v, hashChainHead: _h, ...rest } = header;
    void _v; void _h;
    const save = await SaveFile.create(d, ctx.deps, {
      header: rest,
      state: world,
      versions: { engineVersion: header.engineVersion, parameterSetVersion: header.parameterSetVersion },
    }, { codec: ctx.codec, appVersion: ctx.appVersion, databaseCheck: false });
    void save;
    const legacy = { chainHead: chain.length ? head : null, chainRows: chain.length, lastSeq, commands };
    await d.transaction([{ sql: 'INSERT OR REPLACE INTO save_meta (key, value) VALUES (?, ?)', params: [META_LEGACY_FORMAT1, JSON.stringify(legacy)] }]);
    return { stateHashBefore, notes: { legacyChainHead: legacy.chainHead, legacyLastSeq: lastSeq } };
  },
};

/** Every migration step, oldest first. */
export const MIGRATION_STEPS: readonly MigrationStep[] = [STEP_1_TO_2];

/** The oldest format this build can still migrate. */
export const OLDEST_MIGRATABLE_FORMAT = 1;

/**
 * Checks that the steps run one version at a time, with no gap and no repeat, from the oldest
 * migratable format to `current`. Throws MigrationError naming the first fault.
 */
export function validateSteps(steps: readonly MigrationStep[], current: number, oldest = OLDEST_MIGRATABLE_FORMAT): void {
  let expect = oldest;
  const ids = new Set<string>();
  for (const s of steps) {
    if (s.from !== expect) throw new MigrationError(`no migration step from format ${expect} (next step starts at ${s.from})`, s.id);
    if (s.to !== s.from + 1) throw new MigrationError(`step ${s.id} moves ${s.from} to ${s.to}; a step moves one version`, s.id);
    if (ids.has(s.id)) throw new MigrationError(`step id ${s.id} is used twice`, s.id);
    ids.add(s.id);
    expect = s.to;
  }
  if (expect !== current) throw new MigrationError(`the steps end at format ${expect}, this build writes ${current}`);
}

/** The steps that take a save from `from` to `to`, in order. */
export function pathFor(steps: readonly MigrationStep[], from: number, to: number): MigrationStep[] {
  const out: MigrationStep[] = [];
  for (let v = from; v < to; v++) {
    const s = steps.find((x) => x.from === v);
    if (!s) throw new MigrationError(`no migration step from format ${v}`);
    out.push(s);
  }
  return out;
}
