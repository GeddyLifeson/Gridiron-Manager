// The career file (P5.1.1): one SQLite database that holds the header, the live world tables, the
// command log, snapshots, the hash chain and the content copies.
//
// One path for every state change (P1.1.3): `issue` hands a command to the core, and when the core
// accepts it, writes the log row, the changed world rows, the header, and any chain row and snapshot
// in ONE database transaction (P5.2.1). There is no save button (P5.8.1): after a crash the file holds
// either all of a command or none of it, and loading reads the tables with no replay.
//
// Write-ahead journaling and the durability of a commit belong to the platform's SQL driver (P2.3.1).
// This module's part is that it never needs two transactions to make one change.
import { CommandEnvelope, SaveHeader, commandSpec } from '@gm/schema';
import type { SqlDriver, SqlStatement } from '../driver.ts';
import { archiveSeasonStatements, readLog } from '../log/archive.ts';
import { logInsert, type LogRow } from '../log/rows.ts';
import { pushRow, undoWindow, type UndoWindow } from '../log/undo.ts';
import { chainAppend, type ChainKind, type ChainRow } from '../snapshot/chain.ts';
import { defaultCodec, type BlobCodec } from '../snapshot/codec.ts';
import { retentionFor, type SnapshotRetention } from '../snapshot/params.ts';
import { SnapshotError, listSnapshots, pruneStatements, readSnapshot, snapshotInsert, type SnapshotKind, type SnapshotMeta } from '../snapshot/snapshots.ts';
import { STATE_TABLES_DDL, StateTracker, encodeStateWrites, readStateRows, replaceStateStatements, type PackSpec } from '../snapshot/state-tables.ts';
import { packedTablesFor } from '../snapshot/packed-rows.ts';
import { CHAIN_DDL } from '../snapshot/chain.ts';
import { SNAPSHOT_DDL } from '../snapshot/snapshots.ts';
import { LOG_DDL } from '../log/rows.ts';
import { META_BASE_DIGEST, SAVE_DDL, checkFile, replayFromSnapshot } from './file-check.ts';
import {
  SAVE_CORE_FORMAT_VERSION, SaveDamagedError, SaveStateError,
  type CommandInput, type CommitPlan, type CommitPlanner, type ContentItem, type IntegrityReport, type IssueResult, type NewSave,
  type RecoveryAttempt, type RecoveryOutcome, type RecoveryRequest, type ReplayReport, type SaveCoreDeps, type SaveOptions, type SaveVersions,
} from './types.ts';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function contentStatements(items: readonly ContentItem[] = []): SqlStatement[] {
  const out: SqlStatement[] = [];
  for (const c of items) {
    out.push({ sql: 'INSERT OR IGNORE INTO content (hash, kind, body) VALUES (?, ?, ?)', params: [c.hash, c.kind, JSON.stringify(c.body)] });
    out.push({ sql: 'INSERT OR REPLACE INTO content_ref (id, hash) VALUES (?, ?)', params: [c.id, c.hash] });
  }
  return out;
}

/**
 * The next header. `certified` only ever goes from true to false (P5.1.1: "once false, never true
 * again"), and the format version and chain head are the store's to write.
 */
function nextHeader<S>(deps: SaveCoreDeps<S>, prev: SaveHeader, state: S, chainHead: string, appVersion: string | undefined): SaveHeader {
  const patch = deps.describe ? deps.describe(state, prev) : {};
  const merged: SaveHeader = { ...prev, ...patch, saveFormatVersion: SAVE_CORE_FORMAT_VERSION, hashChainHead: chainHead };
  if (appVersion !== undefined) merged.lastWrittenWith = appVersion;
  if (!prev.certified) {
    merged.certified = false;
    if (prev.certifiedBrokenReason !== undefined) merged.certifiedBrokenReason = prev.certifiedBrokenReason;
  }
  return SaveHeader.parse(merged);
}

const headerUpdate = (h: SaveHeader): SqlStatement => ({ sql: 'UPDATE header SET save_format_version = ?, json = ? WHERE id = 1', params: [h.saveFormatVersion, JSON.stringify(h)] });

interface PendingSnapshot<S> { kind: 'week' | 'season'; logSeq: number; seasonYear: number; stateHash: string; digest: string; state: S; headerJson: string }

/** The tables a save stores packed: the option, or the default for the save's retention profile. */
export const packingOf = (options: SaveOptions, profile = 'standard'): readonly PackSpec[] => options.packedTables ?? packedTablesFor(profile);

interface Link { undoes?: number; redoes?: number; expectDigest?: string }

export class SaveFile<S> {
  private readOnlyReason: string | null = null;
  private closed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private pending: PendingSnapshot<S> | null = null;
  private readonly codec: BlobCodec;

  private constructor(
    readonly driver: SqlDriver,
    private readonly deps: SaveCoreDeps<S>,
    private readonly options: SaveOptions,
    private current: S,
    private tracker: StateTracker,
    private head: SaveHeader,
    private seq: number,
    private windowRows: LogRow[],
    private windowBase: { seq: number; digest: string },
    private window: UndoWindow,
  ) {
    this.codec = options.codec ?? defaultCodec();
  }

  // ---------------------------------------------------------------- create, open

  /** Creates the tables and writes the starting world, its snapshot and the first chain row in one transaction. */
  static async create<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, init: NewSave<S>, options: SaveOptions = {}): Promise<SaveFile<S>> {
    await driver.exec(SAVE_DDL + STATE_TABLES_DDL + LOG_DDL + CHAIN_DDL + SNAPSHOT_DDL);
    if ((await driver.all('SELECT id FROM header')).length) throw new SaveStateError('this file already holds a career');
    const codec = options.codec ?? defaultCodec();
    const { statements, tracker, digest } = await replaceStateStatements(deps.bytesHash, init.state, codec, packingOf(options, init.header.settings.retentionProfile));
    const stateHash = deps.stateHash(init.state);
    const link = chainAppend(deps, { prev: deps.genesis, stateHash, logSeq: 0, kind: 'creation', ...init.versions });
    const base: SaveHeader = { ...init.header, saveFormatVersion: SAVE_CORE_FORMAT_VERSION, hashChainHead: link.head };
    const header = nextHeader(deps, SaveHeader.parse(base), init.state, link.head, options.appVersion);
    const headerJson = JSON.stringify(header);
    const snap = await snapshotInsert({ kind: 'creation', logSeq: 0, seasonYear: header.calendar.seasonYear, stateHash, digest, state: init.state, headerJson }, codec, deps.bytesHash);
    await driver.transaction([
      { sql: 'INSERT INTO header (id, save_format_version, json) VALUES (1, ?, ?)', params: [header.saveFormatVersion, headerJson] },
      { sql: 'INSERT INTO save_meta (key, value) VALUES (?, ?)', params: [META_BASE_DIGEST, digest] },
      ...statements,
      link.statement,
      snap,
      ...contentStatements(init.content),
    ]);
    await options.persist?.();
    return new SaveFile(driver, deps, options, init.state, tracker, header, 0, [], { seq: 0, digest }, undoWindow([]));
  }

  /**
   * Opens a save after the load checks of P5.8.1. Throws SaveDamagedError with the full report when a
   * check fails, and SaveVersionError for another save format.
   */
  static async open<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, options: SaveOptions = {}): Promise<SaveFile<S>> {
    const c = await checkFile(driver, deps, options.databaseCheck !== false);
    if (!c.report.ok || !c.header || c.state === null || !c.tracker) throw new SaveDamagedError(c.report);
    c.tracker.setPacking(packingOf(options, c.header.settings.retentionProfile));
    return new SaveFile(driver, deps, options, c.state, c.tracker, c.header, c.report.lastSeq, c.window, c.windowBase, undoWindow(c.window));
  }

  /** The load checks without opening: what the recovery screen shows. */
  static async inspect<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, options: SaveOptions = {}): Promise<IntegrityReport> {
    return (await checkFile(driver, deps, options.databaseCheck !== false)).report;
  }

  // ---------------------------------------------------------------- reading

  state(): S { return this.current; }
  header(): SaveHeader { return this.head; }
  /** Sequence number of the newest command. */
  lastSeq(): number { return this.seq; }
  /** The store's digest of the current state. */
  digest(): string { return this.tracker.digest(); }
  chainHead(): string { return this.head.hashChainHead; }
  /** Why the save stopped accepting commands, or null. */
  readOnly(): string | null { return this.readOnlyReason; }
  canUndo(): boolean { return this.window.undo.length > 0; }
  canRedo(): boolean { return this.window.redo.length > 0; }

  /** Log rows from archived seasons and the live table, in order (the store behind the decision log, N3). */
  log(fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER): Promise<LogRow[]> { return readLog(this.driver, this.deps.bytesHash, fromSeq, toSeq); }
  snapshots(): Promise<SnapshotMeta[]> { return listSnapshots(this.driver); }

  /** A content copy held by the save (P5.1.2: the game reads content from the save, not from installed packs). */
  async content(id: string): Promise<unknown> {
    const rows = await this.driver.all<{ body: string }>('SELECT c.body FROM content_ref r JOIN content c ON c.hash = r.hash WHERE r.id = ?', [id]);
    if (!rows[0]) throw new SaveStateError(`save holds no content ${id}`);
    return JSON.parse(rows[0].body);
  }

  async contentIds(): Promise<string[]> {
    return (await this.driver.all<{ id: string }>('SELECT id FROM content_ref ORDER BY id')).map((r) => r.id);
  }

  // ---------------------------------------------------------------- writing

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(fn, fn);
    this.tail = p.catch(() => undefined);
    return p;
  }

  private refusal(): IssueResult | null {
    if (this.closed) return { ok: false, code: 'save_closed', reason: 'the save is closed' };
    if (this.readOnlyReason) return { ok: false, code: 'save_read_only', reason: this.readOnlyReason };
    return null;
  }

  /** One transaction, then the platform's durable write. On failure nothing in memory has changed and the save goes read-only. */
  private async write(statements: SqlStatement[]): Promise<string | null> {
    try {
      await this.driver.transaction(statements);
    } catch (e) {
      this.readOnlyReason = `the save could not be written: ${msg(e)}`;
      return this.readOnlyReason;
    }
    try {
      await this.options.persist?.();
    } catch (e) {
      this.readOnlyReason = `the save could not be written to storage: ${msg(e)}. Reload the career to continue from the last saved command`;
      return this.readOnlyReason;
    }
    return null;
  }

  private retention(): SnapshotRetention {
    return this.options.retention ?? retentionFor(this.head.settings.retentionProfile);
  }

  /**
   * Issues one command (P1.1.3). A command the core rejects is not logged. A command the core accepts
   * is committed with its state change in one transaction, or not at all.
   */
  issue(input: CommandInput, planner: CommitPlanner<S> = {}): Promise<IssueResult> {
    return this.enqueue(() => this.commit(input, planner, {}));
  }

  private async commit(input: CommandInput, planner: CommitPlanner<S>, link: Link): Promise<IssueResult> {
    const refused = this.refusal();
    if (refused) return refused;
    const parsed = CommandEnvelope.safeParse({ ...input, id: this.seq + 1 });
    if (!parsed.success) return { ok: false, code: 'command_schema', reason: 'the command does not match the command contract' };
    const cmd = parsed.data;
    const before = this.current;
    const r = this.deps.apply(before, cmd);
    if (!r.ok) return { ok: false, code: r.code ?? 'rejected', reason: r.reason };
    const plan: CommitPlan = typeof planner === 'function' ? planner(r, cmd) : planner;
    if (plan.snapshot && !plan.checkpoint) throw new SaveStateError('a snapshot needs a checkpoint, so that it has a hash-chain row');
    const advancesTime = plan.advancesTime === true;

    // A held-back snapshot never crosses a time-advancing step (P5.3.1 edge case).
    if (advancesTime && this.pending) {
      const failed = await this.writePending();
      if (failed) return { ok: false, code: 'storage_write_failed', reason: failed };
    }

    // Deep pass at checkpoints: an in-place edit of state cannot survive past the week it happened in.
    const statePlan = this.tracker.plan(r.state, this.options.deep === true || plan.checkpoint !== undefined);
    if (link.expectDigest !== undefined && statePlan.digest !== link.expectDigest) {
      return { ok: false, code: 'undo_state_mismatch', reason: 'the command did not return the state that stood before; nothing was changed' };
    }
    let inverse: LogRow['inverse'] = null;
    const wantUndoable = link.undoes === undefined && !advancesTime && (plan.undoable ?? commandSpec(cmd.type)?.undoable ?? false);
    if (wantUndoable && this.deps.invert) inverse = this.deps.invert(before, cmd, r.state);

    const stateHash = plan.checkpoint ? this.deps.stateHash(r.state) : null;
    let chainHead = this.head.hashChainHead;
    const statements: SqlStatement[] = [];
    if (plan.checkpoint && stateHash !== null) {
      const c = plan.checkpoint;
      const appended = chainAppend(this.deps, { prev: chainHead, stateHash, logSeq: cmd.id, engineVersion: c.engineVersion, parameterSetVersion: c.parameterSetVersion, kind: c.kind, note: c.note ?? null });
      chainHead = appended.head;
      statements.push(appended.statement);
    }
    const row: LogRow = {
      seq: cmd.id, type: cmd.type, seasonYear: cmd.worldTime.seasonYear, command: cmd, eventsHash: this.deps.eventsHash(r.events),
      digestAfter: statePlan.digest, stateHash, advancesTime, undoable: inverse !== null,
      undoes: link.undoes ?? null, redoes: link.redoes ?? null, inverse,
    };
    const header = nextHeader(this.deps, this.head, r.state, chainHead, this.options.appVersion);
    statements.push(logInsert(row), ...(await encodeStateWrites(statePlan.writes, this.codec, this.deps.bytesHash)), headerUpdate(header), ...contentStatements(plan.content));

    let pending: PendingSnapshot<S> | null = null;
    if (plan.snapshot && stateHash !== null) {
      pending = { kind: plan.snapshot, logSeq: cmd.id, seasonYear: header.calendar.seasonYear, stateHash, digest: statePlan.digest, state: r.state, headerJson: JSON.stringify(header) };
      if (!plan.deferSnapshot) {
        statements.push(await snapshotInsert(pending, this.codec, this.deps.bytesHash), ...pruneStatements(this.retention()));
        pending = null;
      }
    }

    const failed = await this.write(statements);
    if (failed) return { ok: false, code: 'storage_write_failed', reason: failed };

    statePlan.commit();
    this.current = r.state;
    this.head = header;
    this.seq = cmd.id;
    if (pending) this.pending = pending;
    if (advancesTime) { this.windowRows = []; this.windowBase = { seq: row.seq, digest: row.digestAfter }; } else this.windowRows.push(row);
    this.window = pushRow(this.window, row);
    if (this.options.paranoid) {
      const problems = await this.verifyLive();
      if (problems.length) throw new SaveStateError(`after command ${cmd.id}: ${problems.join('; ')}`);
    }
    return { ok: true, seq: cmd.id, events: r.events, digest: statePlan.digest, stateHash, chainHead };
  }

  private digestBefore(seq: number): string | null {
    if (seq - 1 === this.windowBase.seq) return this.windowBase.digest;
    return this.windowRows.find((r) => r.seq === seq - 1)?.digestAfter ?? null;
  }

  /**
   * Takes back the newest undoable command (P5.2.2) by logging its inverse. The undo is committed only
   * if the state then equals the state before the undone command; otherwise nothing changes.
   */
  undo(): Promise<IssueResult> {
    return this.enqueue(async () => {
      const target = this.window.undo.at(-1);
      const row = target === undefined ? undefined : this.windowRows.find((r) => r.seq === target);
      const expectDigest = target === undefined ? null : this.digestBefore(target);
      if (!row || !row.inverse || expectDigest === null) return { ok: false, code: 'nothing_to_undo', reason: 'there is nothing to undo' };
      const c = row.command;
      return this.commit({ type: row.inverse.type, payload: row.inverse.payload, actor: c.actor, worldTime: c.worldTime, schemaVersion: c.schemaVersion }, { undoable: false }, { undoes: row.seq, expectDigest });
    });
  }

  /** Issues again the command that the last undo took back. Committed only if it returns the state that command first gave. */
  redo(): Promise<IssueResult> {
    return this.enqueue(async () => {
      const target = this.window.redo.at(-1);
      const row = target === undefined ? undefined : this.windowRows.find((r) => r.seq === target);
      if (!row) return { ok: false, code: 'nothing_to_redo', reason: 'there is nothing to redo' };
      const c = row.command;
      const input: CommandInput = { type: c.type, payload: c.payload, actor: c.actor, worldTime: c.worldTime, schemaVersion: c.schemaVersion };
      if (c.playClockTick !== undefined) input.playClockTick = c.playClockTick;
      return this.commit(input, { undoable: true }, { redoes: row.seq, expectDigest: row.digestAfter });
    });
  }

  private async writePending(): Promise<string | null> {
    const p = this.pending;
    if (!p) return null;
    const failed = await this.write([await snapshotInsert(p, this.codec, this.deps.bytesHash), ...pruneStatements(this.retention())]);
    if (!failed) this.pending = null;
    return failed;
  }

  /** Writes a snapshot that a commit held back (P5.3.1: "may be deferred until the user is idle"). */
  flushSnapshot(): Promise<void> {
    return this.enqueue(async () => {
      const failed = await this.writePending();
      if (failed) throw new SaveStateError(failed);
    });
  }

  /**
   * Snapshot of the state as it stands, with a chain row for it when the newest chain row is not at
   * this position. Used before a migration (P5.3.1, P5.5.1).
   */
  snapshotNow(kind: SnapshotKind, versions: SaveVersions, note?: string): Promise<void> {
    return this.enqueue(async () => {
      const refused = this.refusal();
      if (refused && !refused.ok) throw new SaveStateError(refused.reason);
      const stateHash = this.deps.stateHash(this.current);
      const statements: SqlStatement[] = [];
      let header = this.head;
      const last = (await this.driver.all<{ log_seq: number; state_hash: string }>('SELECT log_seq, state_hash FROM hash_chain ORDER BY n DESC LIMIT 1'))[0];
      if (!last || last.log_seq !== this.seq || last.state_hash !== stateHash) {
        const chainKind: ChainKind = kind === 'pre_migration' ? 'migration' : kind === 'season' ? 'season' : kind === 'week' ? 'week' : 'other';
        const appended = chainAppend(this.deps, { prev: this.head.hashChainHead, stateHash, logSeq: this.seq, kind: chainKind, note: note ?? null, ...versions });
        header = nextHeader(this.deps, this.head, this.current, appended.head, this.options.appVersion);
        statements.push(appended.statement, headerUpdate(header));
      }
      statements.push(
        await snapshotInsert({ kind, logSeq: this.seq, seasonYear: header.calendar.seasonYear, stateHash, digest: this.tracker.digest(), state: this.current, headerJson: JSON.stringify(header) }, this.codec, this.deps.bytesHash),
        ...pruneStatements(this.retention()),
      );
      const failed = await this.write(statements);
      if (failed) throw new SaveStateError(failed);
      this.head = header;
    });
  }

  /**
   * Writes a hash-chain row that marks a format change (P5.3.2 edge case): the note carries the state
   * hash before, the row carries the state hash after. For the migration runner (P5.5.1).
   */
  markMigration(fromFormat: number, toFormat: number, stateHashBefore: string, versions: SaveVersions): Promise<void> {
    return this.enqueue(async () => {
      const stateHash = this.deps.stateHash(this.current);
      const note = JSON.stringify({ fromFormat, toFormat, stateHashBefore });
      const appended = chainAppend(this.deps, { prev: this.head.hashChainHead, stateHash, logSeq: this.seq, kind: 'migration', note, ...versions });
      const header = nextHeader(this.deps, this.head, this.current, appended.head, this.options.appVersion);
      const failed = await this.write([appended.statement, headerUpdate(header)]);
      if (failed) throw new SaveStateError(failed);
      this.head = header;
    });
  }

  /** Ends certification with a reason (P8.1.1). It can never be set back. */
  breakCertification(reason: string): Promise<void> {
    return this.enqueue(async () => {
      if (!this.head.certified) return;
      const header = SaveHeader.parse({ ...this.head, certified: false, certifiedBrokenReason: reason });
      const failed = await this.write([headerUpdate(header)]);
      if (failed) throw new SaveStateError(failed);
      this.head = header;
    });
  }

  /** Compresses one finished season of the log (P5.2.1). Returns false when that season has no live rows. */
  compressLogSeason(seasonYear: number): Promise<boolean> {
    return this.enqueue(async () => {
      if (seasonYear >= this.head.calendar.seasonYear) throw new SaveStateError(`season ${seasonYear} is not finished`);
      const statements = await archiveSeasonStatements(this.driver, seasonYear, this.codec, this.deps.bytesHash);
      if (!statements) return false;
      const failed = await this.write(statements);
      if (failed) throw new SaveStateError(failed);
      return true;
    });
  }

  // ---------------------------------------------------------------- checks

  /** Reads the tables back and compares them with the state in memory. Returns the differences found. */
  async verifyLive(): Promise<string[]> {
    const problems: string[] = [];
    try {
      const { fields, rows, packed } = await readStateRows((sql) => this.driver.all(sql), this.deps.bytesHash);
      const loaded = StateTracker.load(this.deps.bytesHash, fields, rows, packed);
      if (loaded.tracker.digest() !== this.tracker.digest()) problems.push('the world tables differ from the state in memory');
      if (JSON.stringify(loaded.state) !== JSON.stringify(this.current)) problems.push('the world tables do not read back in the order the state was written');
    } catch (e) {
      problems.push(msg(e));
    }
    return problems;
  }

  /**
   * Restores a snapshot in memory, replays the log after it and compares the result with the live
   * state (P5.3.1 and P5.2.1 acceptance, P1.1.3 acceptance 2). Default: the newest snapshot.
   */
  verifyByReplay(snapshotId?: number): Promise<ReplayReport> {
    return this.enqueue(async () => {
      const problems: string[] = [];
      const all = await listSnapshots(this.driver);
      const meta = snapshotId === undefined ? all.at(-1) : all.find((s) => s.id === snapshotId);
      if (!meta) return { ok: false, problems: ['no such snapshot'], from: null, reachedSeq: 0, commands: 0, digest: '', stateHash: '' };
      const c = await checkFile(this.driver, this.deps, false);
      for (const p of c.report.problems) problems.push(p.message);
      let out;
      try {
        out = await replayFromSnapshot(this.driver, this.deps, await readSnapshot(this.driver, meta.id, this.deps.bytesHash), c.chain, this.seq);
      } catch (e) {
        return { ok: false, problems: [...problems, msg(e)], from: meta, reachedSeq: meta.logSeq, commands: 0, digest: '', stateHash: '' };
      }
      if (out.failure) problems.push(out.failure.message);
      else if (out.reachedSeq !== this.seq) problems.push(`the log ends at command ${out.reachedSeq}, the save stands at ${this.seq}`);
      const digest = out.tracker.digest();
      const stateHash = this.deps.stateHash(out.state);
      if (!out.failure && digest !== this.tracker.digest()) problems.push('live world tables differ from the replayed log');
      if (!out.failure && stateHash !== this.deps.stateHash(this.current)) problems.push('live state hash differs from the replayed log');
      return { ok: problems.length === 0, problems, from: meta, reachedSeq: out.reachedSeq, commands: out.rows, digest, stateHash };
    });
  }

  async close(): Promise<void> {
    await this.tail;
    this.closed = true;
    await this.driver.close();
  }

  // ---------------------------------------------------------------- recovery

  /**
   * Repairs a save that failed its load checks (P5.8.1): "restore the latest week-boundary snapshot
   * and replay the log after it. If that fails, the season-start snapshot." The third step, the
   * automatic backup copy, is a file the platform holds; when this returns `recovered: false` the
   * recovery screen offers it, or a truncating recovery, with the effect on certification stated.
   *
   * The repair is one transaction. A crash during it leaves the file as it was.
   */
  static async recover<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, request: RecoveryRequest, options: SaveOptions = {}): Promise<RecoveryOutcome> {
    const c = await checkFile(driver, deps, false);
    const attempts: RecoveryAttempt[] = [];
    const none: RecoveryOutcome = { recovered: false, attempts, from: null, reachedSeq: 0, lostCommands: 0, certificationBroken: false, blocked: null };
    let metas: SnapshotMeta[];
    try { metas = await listSnapshots(driver); } catch { return none; }
    const rank = (k: string) => (k === 'week' ? 0 : k === 'season' ? 1 : 2);
    const ladder = [...metas].sort((a, b) => rank(a.kind) - rank(b.kind) || b.logSeq - a.logSeq || b.id - a.id);
    const candidates = request.mode === 'exact' ? ladder : ladder.filter((m) => m.id === request.snapshotId);
    const lastSeq = c.report.lastSeq;
    // A chain whose own links are broken cannot be rebuilt from what the file holds: its old state hashes
    // are the only record of thinned seasons. That case goes to the backup copy.
    if (c.report.problems.some((p) => p.code === 'chain_links')) return { ...none, blocked: 'the hash chain itself is damaged; only a backup copy can replace it' };

    for (const meta of candidates) {
      let snap;
      try { snap = await readSnapshot(driver, meta.id, deps.bytesHash); } catch (e) {
        attempts.push({ snapshot: meta, reachedSeq: meta.logSeq, failure: e instanceof SnapshotError ? e.message : msg(e) });
        continue;
      }
      let out = await replayFromSnapshot(driver, deps, snap, c.chain);
      const complete = !out.failure && out.reachedSeq === lastSeq;
      attempts.push({ snapshot: meta, reachedSeq: out.reachedSeq, failure: out.failure ? out.failure.message : complete ? null : `the log ends at command ${out.reachedSeq} but rows up to ${lastSeq} exist` });
      if (request.mode === 'exact' && !complete) continue;
      if (request.mode === 'truncate' && out.failure && out.reachedSeq === meta.logSeq && /snapshot/.test(out.failure.message)) continue;

      let cut = out.reachedSeq;
      if (!complete) {
        // Never cut inside an archived season: fall back to the row before that season starts.
        const seg = (await driver.all<{ first_seq: number }>('SELECT first_seq FROM command_log_archive WHERE first_seq <= ? AND last_seq > ?', [cut, cut]))[0];
        if (seg) {
          cut = seg.first_seq - 1;
          if (cut < meta.logSeq) { attempts[attempts.length - 1]!.failure = 'the damage lies inside an archived season before this snapshot can help'; continue; }
          out = await replayFromSnapshot(driver, deps, snap, c.chain, cut);
          if (out.failure || out.reachedSeq !== cut) continue;
        }
      }
      const lost = Math.max(0, lastSeq - cut);
      let baseHeader: SaveHeader | null = c.header;
      if (!baseHeader) { const p = SaveHeader.safeParse(JSON.parse(snap.headerJson)); baseHeader = p.success ? p.data : null; }
      if (!baseHeader) { attempts[attempts.length - 1]!.failure = 'neither the header nor the snapshot header is readable'; continue; }

      const statements: SqlStatement[] = [];
      let chain: ChainRow[] = c.chain;
      let certificationBroken = false;
      let reason = '';
      // Rows past the recovered position go: log rows that did not replay, and chain rows and snapshots
      // that describe a state the log can no longer reach.
      const tailDropped = lost > 0 || chain.some((r) => r.logSeq > cut) || metas.some((m) => m.logSeq > cut);
      if (tailDropped) {
        statements.push(
          { sql: 'DELETE FROM command_log WHERE seq > ?', params: [cut] },
          { sql: 'DELETE FROM command_log_archive WHERE first_seq > ?', params: [cut] },
          { sql: 'DELETE FROM hash_chain WHERE log_seq > ?', params: [cut] },
          { sql: 'DELETE FROM snapshots WHERE log_seq > ?', params: [cut] },
        );
        chain = chain.filter((r) => r.logSeq <= cut);
        certificationBroken = true;
        reason = lost > 0 ? `recovery dropped ${lost} command${lost === 1 ? '' : 's'} after command ${cut}` : `the command log ended at command ${cut}, before the newest recorded checkpoint`;
      }
      let chainHead = chain.at(-1)?.head ?? deps.genesis;
      if (tailDropped) {
        const last = chain.at(-1);
        const appended = chainAppend(deps, {
          prev: chainHead, stateHash: deps.stateHash(out.state), logSeq: cut, kind: 'recovery', note: reason,
          engineVersion: last?.engineVersion ?? baseHeader.engineVersion, parameterSetVersion: last?.parameterSetVersion ?? baseHeader.parameterSetVersion,
        });
        chainHead = appended.head;
        statements.push(appended.statement);
      }
      let header = nextHeader(deps, baseHeader, out.state, chainHead, options.appVersion);
      if (certificationBroken && header.certified) header = SaveHeader.parse({ ...header, certified: false, certifiedBrokenReason: reason });
      const replaced = await replaceStateStatements(deps.bytesHash, out.state, options.codec ?? defaultCodec(), packingOf(options, baseHeader.settings.retentionProfile));
      statements.push(...replaced.statements);
      statements.push({ sql: 'INSERT INTO header (id, save_format_version, json) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET save_format_version = excluded.save_format_version, json = excluded.json', params: [header.saveFormatVersion, JSON.stringify(header)] });
      if (c.baseDigest === null && meta.logSeq === 0) statements.push({ sql: 'INSERT OR REPLACE INTO save_meta (key, value) VALUES (?, ?)', params: [META_BASE_DIGEST, meta.digest] });
      await driver.transaction(statements);
      await options.persist?.();
      return { recovered: true, attempts, from: meta, reachedSeq: cut, lostCommands: lost, certificationBroken: certificationBroken && baseHeader.certified, blocked: null };
    }
    return none;
  }
}
