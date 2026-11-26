// Types of the save core (P5.1, P5.2, P5.3, P5.8).
import type { Calendar, CommandEnvelope, SaveHeader } from '@gm/schema';
import type { BlobCodec } from '../snapshot/codec.ts';
import type { ChainFns, ChainKind } from '../snapshot/chain.ts';
import type { SnapshotMeta } from '../snapshot/snapshots.ts';
import type { SnapshotRetention } from '../snapshot/params.ts';

/**
 * Save format written by this module. Format 1 was the phase 0 layout (one JSON row for the world).
 * The header schema's SAVE_FORMAT_VERSION in @gm/schema is the integrator's to move.
 */
export const SAVE_CORE_FORMAT_VERSION = 2;

export interface ApplyAccepted<S> { ok: true; state: S; events: readonly unknown[] }
export interface ApplyRejected { ok: false; reason: string; code?: string }
export type ApplyResult<S> = ApplyAccepted<S> | ApplyRejected;

/**
 * What the save core needs from the core packages. The store holds no football logic and may import
 * only `schema` (P1.2.1), so the application layer hands these in.
 */
export interface SaveCoreDeps<S> extends ChainFns {
  /**
   * Validates and applies one command (P1.1.3). It must be a pure function of its arguments and must
   * not edit `state` in place: the same state and command give the same result on every platform,
   * including everything AI actors then do (P5.2.1).
   */
  apply(state: S, cmd: CommandEnvelope): ApplyResult<S>;
  /**
   * The command that takes `cmd` back (P5.2.2), given the state before and after it. Null when the
   * command cannot be taken back. Without this function nothing is undoable.
   */
  invert?(before: S, cmd: CommandEnvelope, after: S): { type: string; payload: unknown } | null;
  /** Load-screen fields that follow from the state (calendar, job, summary). Merged into the header at every commit. */
  describe?(state: S, header: SaveHeader): Partial<SaveHeader>;
  /** The engine's state hash (P1.1.5). */
  stateHash(state: unknown): string;
  /** The engine's hash of raw bytes; used for row digests and stored blobs. */
  bytesHash(bytes: Uint8Array): string;
  /** Hash of a command's result events. */
  eventsHash(events: readonly unknown[]): string;
}

export interface SaveVersions { engineVersion: string; parameterSetVersion: string }

export interface SaveOptions {
  /** Compression for snapshots and archived log seasons. Default: the platform's deflate, or none. */
  codec?: BlobCodec;
  /** Re-read every row at every command instead of trusting object identity. Slow; for test builds. */
  deep?: boolean;
  /** After every commit, read the tables back and compare them with the state in memory. For test builds. */
  paranoid?: boolean;
  /**
   * Called after every committed transaction. A platform whose driver keeps the database in memory
   * writes the file here. If it throws (disk full), the command is reported as rejected and the save
   * goes read-only (P5.8.1 edge case).
   */
  persist?: () => Promise<void>;
  /** Written to `lastWrittenWith`. */
  appVersion?: string;
  /** Overrides the retention that follows from the header's retention profile. */
  retention?: SnapshotRetention;
  /** `PRAGMA integrity_check` on load (P5.8.1 "database consistency check"). Default true. */
  databaseCheck?: boolean;
}

export type NewSaveHeader = Omit<SaveHeader, 'saveFormatVersion' | 'hashChainHead'>;

export interface ContentItem { id: string; kind: string; hash: string; body: unknown }

export interface NewSave<S> {
  header: NewSaveHeader;
  state: S;
  versions: SaveVersions;
  /** Content copies the career starts with (P5.1.2). */
  content?: readonly ContentItem[];
}

export interface CommandInput {
  type: string;
  actor: CommandEnvelope['actor'];
  worldTime: Calendar;
  payload: unknown;
  schemaVersion: number;
  playClockTick?: number;
}

export interface Checkpoint extends SaveVersions { kind: ChainKind; note?: string }

/** How one accepted command is committed. */
export interface CommitPlan {
  /** A practice run, a game, a deadline, a day change. Undo never crosses it (P5.2.2). Default false. */
  advancesTime?: boolean;
  /** Default: the `undoable` flag of the command registry (P1.3.1). */
  undoable?: boolean;
  /** Writes the engine state hash on the log row and a hash-chain row (P5.3.2): week boundaries and the user's games. */
  checkpoint?: Checkpoint;
  /** Also writes a snapshot (P5.3.1). Needs a checkpoint, so every snapshot has a chain row. */
  snapshot?: 'week' | 'season';
  /** Holds the snapshot back until `flushSnapshot()` or the next time-advancing command, whichever comes first. */
  deferSnapshot?: boolean;
  /** Content adopted by this command (`AdoptContent`, P5.1.2), stored in the same transaction. */
  content?: readonly ContentItem[];
}

export type CommitPlanner<S> = CommitPlan | ((accepted: ApplyAccepted<S>, cmd: CommandEnvelope) => CommitPlan);

export type IssueResult =
  | { ok: true; seq: number; events: readonly unknown[]; digest: string; stateHash: string | null; chainHead: string }
  | { ok: false; reason: string; code: string };

export interface Problem { code: string; message: string }

export interface IntegrityReport {
  ok: boolean;
  problems: Problem[];
  /** Highest log sequence number found. */
  lastSeq: number;
}

/** The save failed its load checks (P5.8.1). The recovery screen reads the report and calls `SaveFile.recover`. */
export class SaveDamagedError extends Error {
  constructor(readonly report: IntegrityReport) {
    super(`save failed its integrity check: ${report.problems.map((p) => p.message).join('; ')}`);
    this.name = 'SaveDamagedError';
  }
}

/** Not this format: made by a newer build (P5.1.1 edge case), or by an older one and in need of migration (P5.5.1). */
export class SaveVersionError extends Error {
  constructor(readonly found: number, readonly supported: number) {
    super(found > supported
      ? `made with a newer version (save format ${found}, this build reads ${supported})`
      : `save format ${found} must be migrated to ${supported} before it loads`);
    this.name = 'SaveVersionError';
  }
  get newer(): boolean { return this.found > this.supported; }
}

export class SaveStateError extends Error {
  constructor(message: string) { super(message); this.name = 'SaveStateError'; }
}

export interface ReplayReport {
  ok: boolean;
  problems: string[];
  /** The snapshot the replay started from. */
  from: SnapshotMeta | null;
  /** Last log row that replayed to its stored hashes. */
  reachedSeq: number;
  commands: number;
  /** Digest of the replayed state. */
  digest: string;
  /** Engine state hash of the replayed state. */
  stateHash: string;
}

export interface RecoveryAttempt {
  snapshot: SnapshotMeta;
  /** Last log row that replayed to its stored hashes from this snapshot. */
  reachedSeq: number;
  /** Why the replay stopped short, or null when it reached the end of the log. */
  failure: string | null;
}

export type RecoveryRequest =
  /** P5.8.1 ladder: newest week snapshot, then season-start snapshots, each replayed to the end of the log. Loses nothing or does nothing. */
  | { mode: 'exact' }
  /** Restores one snapshot and keeps the log only as far as it replays. Loses the commands after that point and breaks certification. */
  | { mode: 'truncate'; snapshotId: number };

export interface RecoveryOutcome {
  recovered: boolean;
  attempts: RecoveryAttempt[];
  /** The snapshot used, when recovered. */
  from: SnapshotMeta | null;
  /** Log position of the recovered save. */
  reachedSeq: number;
  /** Commands dropped from the end of the log (0 for an exact recovery). */
  lostCommands: number;
  certificationBroken: boolean;
  /** Why no recovery inside the file is possible, when that is known before any attempt. */
  blocked: string | null;
}
