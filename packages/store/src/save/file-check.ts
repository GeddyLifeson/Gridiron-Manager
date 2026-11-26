// Load checks and replay (P5.8.1, P5.3.1, P5.3.2). "On load: integrity check of the header, the chain
// head against the latest snapshot, and a database consistency check."
import { SaveHeader, type CommandEnvelope } from '@gm/schema';
import type { SqlDriver } from '../driver.ts';
import { readLog } from '../log/archive.ts';
import { LogError, lastLiveRow, logExtent, readUndoWindow, type LogRow } from '../log/rows.ts';
import { readChain, verifyChainLinks, type ChainRow } from '../snapshot/chain.ts';
import { listSnapshots, type LoadedSnapshot, type SnapshotMeta } from '../snapshot/snapshots.ts';
import { StateEncodingError } from '../snapshot/canonical-json.ts';
import { StateTablesError, StateTracker, readStateRows, type PackSpec } from '../snapshot/state-tables.ts';
import { PackedRowsError } from '../snapshot/packed-rows.ts';
import { SAVE_CORE_FORMAT_VERSION, SaveVersionError, type IntegrityReport, type Problem, type SaveCoreDeps } from './types.ts';

export const SAVE_DDL = `
CREATE TABLE IF NOT EXISTS header (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  save_format_version INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS save_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_ref (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL REFERENCES content(hash)
);
`;

/** Digest of the state the career started from: what "the state before command 1" must equal. */
export const META_BASE_DIGEST = 'base_digest';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type HeaderRead =
  | { status: 'ok'; header: SaveHeader }
  /** P5.1.1 edge case: shown on the load screen as "made with a newer version" and not loaded. */
  | { status: 'newer'; saveFormatVersion: number; raw: unknown }
  | { status: 'older'; saveFormatVersion: number; raw: unknown }
  | { status: 'unreadable'; reason: string };

/** Reads only the header row (P5.1.1: the load screen fills from headers alone). Never throws for a damaged file. */
export async function readSaveHeader(driver: SqlDriver): Promise<HeaderRead> {
  let row: { save_format_version: number; json: string } | undefined;
  try {
    row = (await driver.all<{ save_format_version: number; json: string }>('SELECT save_format_version, json FROM header WHERE id = 1'))[0];
  } catch (e) {
    return { status: 'unreadable', reason: `not a save file: ${msg(e)}` };
  }
  if (!row) return { status: 'unreadable', reason: 'not a save file: no header row' };
  let raw: unknown;
  try { raw = JSON.parse(row.json); } catch { raw = null; }
  if (row.save_format_version > SAVE_CORE_FORMAT_VERSION) return { status: 'newer', saveFormatVersion: row.save_format_version, raw };
  if (row.save_format_version < SAVE_CORE_FORMAT_VERSION) return { status: 'older', saveFormatVersion: row.save_format_version, raw };
  const parsed = SaveHeader.safeParse(raw);
  if (!parsed.success) return { status: 'unreadable', reason: 'the header does not match the save format' };
  return { status: 'ok', header: parsed.data };
}

export interface CheckedFile<S> {
  report: IntegrityReport;
  header: SaveHeader | null;
  state: S | null;
  tracker: StateTracker | null;
  chain: ChainRow[];
  snapshots: SnapshotMeta[];
  window: LogRow[];
  /** Digest and sequence of the row just before the undo window. */
  windowBase: { seq: number; digest: string };
  baseDigest: string | null;
}

/**
 * Runs every load check and returns what was read. Throws SaveVersionError for another format; every
 * other fault is listed in the report, so the recovery screen can show all of them at once.
 */
export async function checkFile<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, databaseCheck = true, packing: readonly PackSpec[] = []): Promise<CheckedFile<S>> {
  const problems: Problem[] = [];
  const add = (code: string, message: string) => { problems.push({ code, message }); };
  const out: CheckedFile<S> = { report: { ok: false, problems, lastSeq: 0 }, header: null, state: null, tracker: null, chain: [], snapshots: [], window: [], windowBase: { seq: 0, digest: '' }, baseDigest: null };

  const h = await readSaveHeader(driver);
  if (h.status === 'newer' || h.status === 'older') throw new SaveVersionError(h.saveFormatVersion, SAVE_CORE_FORMAT_VERSION);
  if (h.status === 'unreadable') add('header_unreadable', h.reason);
  else out.header = h.header;

  if (databaseCheck) {
    try {
      const rows = await driver.all<Record<string, unknown>>('PRAGMA integrity_check');
      const first = rows[0] ? Object.values(rows[0])[0] : undefined;
      if (rows.length !== 1 || first !== 'ok') add('database_inconsistent', `the database file is inconsistent: ${String(first ?? 'no result')}`);
    } catch (e) {
      add('database_inconsistent', `the database consistency check did not run: ${msg(e)}`);
    }
  }

  try {
    const meta = await driver.all<{ value: string }>('SELECT value FROM save_meta WHERE key = ?', [META_BASE_DIGEST]);
    out.baseDigest = meta[0]?.value ?? null;
    if (out.baseDigest === null) add('meta_missing', 'the save does not record its starting state');
  } catch (e) {
    add('meta_missing', `the save's own records are not readable: ${msg(e)}`);
  }

  try {
    const { fields, rows, packed } = await readStateRows((sql) => driver.all(sql), deps.bytesHash);
    const loaded = StateTracker.load(deps.bytesHash, fields, rows, packed, packing);
    out.state = loaded.state as S;
    out.tracker = loaded.tracker;
  } catch (e) {
    if (!(e instanceof StateTablesError) && !(e instanceof StateEncodingError) && !(e instanceof PackedRowsError)) add('state_unreadable', `the world tables are not readable: ${msg(e)}`);
    else add('state_unreadable', e.message);
  }

  let lastRow: LogRow | null = null;
  let logReadable = true;
  try {
    const extent = await logExtent(driver);
    out.report.lastSeq = extent.last;
    if (!extent.contiguous) add('log_gap', 'the command log has missing or doubled rows');
    lastRow = await lastLiveRow(driver);
    if (extent.last > 0 && (!lastRow || lastRow.seq !== extent.last)) add('log_gap', 'the newest command is not in the live log');
    out.window = await readUndoWindow(driver);
    const baseSeq = (out.window[0]?.seq ?? extent.last + 1) - 1;
    if (baseSeq === 0) out.windowBase = { seq: 0, digest: out.baseDigest ?? '' };
    else {
      const before = await driver.all<{ digest_after: string }>('SELECT digest_after FROM command_log WHERE seq = ?', [baseSeq]);
      if (!before[0]) add('log_gap', `command ${baseSeq} is not in the live log`);
      out.windowBase = { seq: baseSeq, digest: before[0]?.digest_after ?? '' };
    }
  } catch (e) {
    logReadable = false;
    add('log_unreadable', e instanceof LogError ? e.message : `the command log is not readable: ${msg(e)}`);
  }

  if (out.tracker && logReadable && out.baseDigest !== null) {
    const expect = lastRow ? lastRow.digestAfter : out.baseDigest;
    if (out.tracker.digest() !== expect) add('state_differs_from_log', 'the world tables differ from the state the command log recorded (edited outside the game, or damaged)');
  }

  try {
    out.chain = await readChain(driver);
    const links = verifyChainLinks(deps, out.chain);
    for (const p of links.problems) add('chain_links', p);
    if (out.chain.length === 0) add('chain_broken', 'the hash chain is empty');
    if (out.header && out.header.hashChainHead !== links.head) add('chain_head', 'the header does not name the newest hash-chain row');
    const lastLink = out.chain.at(-1);
    if (lastLink && lastLink.logSeq > out.report.lastSeq) add('chain_broken', 'the hash chain runs past the end of the command log');
    if (logReadable) {
      const marks = await driver.all<{ seq: number; state_hash: string }>('SELECT seq, state_hash FROM command_log WHERE state_hash IS NOT NULL ORDER BY seq');
      const inChain = new Set(out.chain.map((c) => `${c.logSeq}:${c.stateHash}`));
      for (const m of marks) if (!inChain.has(`${m.seq}:${m.state_hash}`)) { add('chain_broken', `checkpoint at command ${m.seq} has no matching hash-chain row`); break; }
    }
    // When the save stands exactly on a checkpoint, the live state must hash to the chain's value.
    if (lastLink && out.state !== null && lastLink.logSeq === out.report.lastSeq && !problems.some((p) => p.code === 'state_differs_from_log')) {
      let live = '';
      try { live = deps.stateHash(out.state); } catch (e) { add('state_unreadable', msg(e)); }
      if (live && live !== lastLink.stateHash) add('state_differs_from_chain', 'the world tables do not hash to the newest hash-chain row');
    }
  } catch (e) {
    add('chain_broken', `the hash chain is not readable: ${msg(e)}`);
  }

  try {
    out.snapshots = await listSnapshots(driver);
    const latest = out.snapshots.at(-1);
    if (!latest) add('no_snapshot', 'the save holds no snapshot');
    else if (!out.chain.some((c) => c.logSeq === latest.logSeq && c.stateHash === latest.stateHash)) add('snapshot_not_in_chain', 'the latest snapshot has no matching hash-chain row');
    else if (latest.logSeq > out.report.lastSeq) add('snapshot_not_in_chain', 'the latest snapshot is ahead of the command log');
  } catch (e) {
    add('no_snapshot', `the snapshots are not readable: ${msg(e)}`);
  }

  out.report.ok = problems.length === 0;
  return out;
}

export interface ReplayOutcome<S> {
  state: S;
  tracker: StateTracker;
  /** Last row that replayed to its stored hashes (the snapshot's own position when none did). */
  reachedSeq: number;
  rows: number;
  /** Why the replay stopped, or null when it ran to `toSeq` or the end of the log. */
  failure: { seq: number; message: string } | null;
}

/**
 * Restores a snapshot in memory and replays the log after it (P5.3.1 acceptance: "restoring a
 * week-boundary snapshot and replaying that week's log gives the live state hash"). Every row is
 * checked against what the log stored for it: events hash, state digest, and at checkpoints the
 * engine state hash and its chain row. Stops at the first row that does not match.
 */
export async function replayFromSnapshot<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, snap: LoadedSnapshot, chain: readonly ChainRow[], toSeq = Number.MAX_SAFE_INTEGER): Promise<ReplayOutcome<S>> {
  const tracker = new StateTracker(deps.bytesHash);
  let state = snap.state as S;
  const at = snap.meta.logSeq;
  const fail = (seq: number, message: string): ReplayOutcome<S> => ({ state, tracker, reachedSeq: Math.min(reached, Math.max(at, seq - 1)), rows, failure: { seq, message } });
  let reached = at;
  let rows = 0;
  try {
    const first = tracker.plan(state, true);
    if (first.digest !== snap.meta.digest) return fail(at, `snapshot ${snap.meta.id} does not match its stored digest`);
    if (deps.stateHash(state) !== snap.meta.stateHash) return fail(at, `snapshot ${snap.meta.id} does not match its stored state hash`);
    first.commit();
  } catch (e) {
    return fail(at, `snapshot ${snap.meta.id} is not a valid state: ${msg(e)}`);
  }
  let log: LogRow[];
  let readFailure: { seq: number; message: string } | null = null;
  try {
    log = await readLog(driver, deps.bytesHash, at + 1, toSeq);
  } catch (e) {
    if (!(e instanceof LogError) || e.seq === undefined) return fail(at + 1, `the command log is not readable: ${msg(e)}`);
    readFailure = { seq: e.seq, message: e.message };
    try { log = e.seq - 1 > at ? await readLog(driver, deps.bytesHash, at + 1, e.seq - 1) : []; } catch (e2) { return fail(at + 1, `the command log is not readable: ${msg(e2)}`); }
  }
  const chainAt = new Set(chain.map((c) => `${c.logSeq}:${c.stateHash}`));
  for (const row of log) {
    if (row.seq !== reached + 1) return fail(reached + 1, `command ${reached + 1} is missing from the log`);
    let r;
    try { r = deps.apply(state, row.command as CommandEnvelope); } catch (e) { return fail(row.seq, `command ${row.seq} failed on replay: ${msg(e)}`); }
    if (!r.ok) return fail(row.seq, `logged command ${row.seq} no longer applies: ${r.reason}`);
    let plan;
    try {
      if (deps.eventsHash(r.events) !== row.eventsHash) return fail(row.seq, `events of command ${row.seq} differ on replay`);
      plan = tracker.plan(r.state, row.stateHash !== null);
      if (plan.digest !== row.digestAfter) return fail(row.seq, `state after command ${row.seq} differs on replay`);
      if (row.stateHash !== null) {
        if (deps.stateHash(r.state) !== row.stateHash) return fail(row.seq, `state hash after command ${row.seq} differs on replay`);
        if (!chainAt.has(`${row.seq}:${row.stateHash}`)) return fail(row.seq, `checkpoint at command ${row.seq} has no matching hash-chain row`);
      }
    } catch (e) {
      return fail(row.seq, `state after command ${row.seq} cannot be hashed: ${msg(e)}`);
    }
    plan.commit();
    state = r.state;
    reached = row.seq;
    rows++;
  }
  if (readFailure) return fail(readFailure.seq, readFailure.message);
  return { state, tracker, reachedSeq: reached, rows, failure: null };
}
