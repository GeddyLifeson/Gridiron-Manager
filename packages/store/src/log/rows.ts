// The command log (P5.2.1): the exact history of what the user decided. Append-only. With the seeds
// and the starting world it reproduces the career, because AI actors' commands are a deterministic
// result of state and seeds and are regenerated on replay.
//
// Row: sequence number, the command (P1.3.1), the hash of its result events, the engine state hash
// when the row is a checkpoint (P5.3.2), and the store's digest of the state after it. The digest is
// on every row, so the state after any command can be checked without waiting for a checkpoint: the
// undo check (P5.2.2) and crash recovery (P5.8.1) both rest on it.
import { CommandEnvelope } from '@gm/schema';
import type { SqlDriver, SqlStatement } from '../driver.ts';

export interface InverseBody { type: string; payload: unknown }

export interface LogRow {
  seq: number;
  type: string;
  seasonYear: number;
  command: CommandEnvelope;
  eventsHash: string;
  digestAfter: string;
  /** Engine state hash after the command; only at checkpoints. */
  stateHash: string | null;
  /** A practice run, a game, a deadline, a day change: undo never crosses it (P5.2.2). */
  advancesTime: boolean;
  undoable: boolean;
  /** Sequence of the command this row takes back, when the row is an undo. */
  undoes: number | null;
  /** Sequence of the command this row issues again, when the row is a redo. */
  redoes: number | null;
  /** The command that takes this one back, worked out by the core when this one was accepted. */
  inverse: InverseBody | null;
}

export const LOG_DDL = `
CREATE TABLE IF NOT EXISTS command_log (
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  command TEXT NOT NULL,
  events_hash TEXT NOT NULL,
  digest_after TEXT NOT NULL,
  state_hash TEXT,
  flags INTEGER NOT NULL,
  undoes INTEGER,
  redoes INTEGER,
  inverse TEXT
);
CREATE TABLE IF NOT EXISTS command_log_archive (
  first_seq INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL,
  season_year INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  codec TEXT NOT NULL,
  raw_len INTEGER NOT NULL,
  blob_hash TEXT NOT NULL,
  blob BLOB NOT NULL
);
`;

export const FLAG_ADVANCES_TIME = 1;
export const FLAG_UNDOABLE = 2;

/** One stored row, column for column. Archived seasons hold arrays of these. */
export interface RawLogRow {
  seq: number; type: string; season_year: number; command: string; events_hash: string; digest_after: string;
  state_hash: string | null; flags: number; undoes: number | null; redoes: number | null; inverse: string | null;
}

export const LOG_COLS = 'seq, type, season_year, command, events_hash, digest_after, state_hash, flags, undoes, redoes, inverse';

export class LogError extends Error {
  constructor(message: string, readonly seq?: number) { super(message); this.name = 'LogError'; }
}

export function toRaw(row: LogRow): RawLogRow {
  return {
    seq: row.seq, type: row.type, season_year: row.seasonYear, command: JSON.stringify(row.command), events_hash: row.eventsHash,
    digest_after: row.digestAfter, state_hash: row.stateHash,
    flags: (row.advancesTime ? FLAG_ADVANCES_TIME : 0) | (row.undoable ? FLAG_UNDOABLE : 0),
    undoes: row.undoes, redoes: row.redoes, inverse: row.inverse ? JSON.stringify(row.inverse) : null,
  };
}

export function fromRaw(r: RawLogRow): LogRow {
  let command: CommandEnvelope;
  let inverse: InverseBody | null = null;
  try {
    command = CommandEnvelope.parse(JSON.parse(r.command));
    if (r.inverse !== null) {
      const v = JSON.parse(r.inverse) as InverseBody;
      if (typeof v?.type !== 'string') throw new Error('inverse has no type');
      inverse = { type: v.type, payload: v.payload };
    }
  } catch (e) {
    throw new LogError(`log row ${r.seq} is not readable: ${e instanceof Error ? e.message : String(e)}`, r.seq);
  }
  if (command.id !== r.seq || command.type !== r.type) throw new LogError(`log row ${r.seq} does not match the command stored in it`, r.seq);
  return {
    seq: r.seq, type: r.type, seasonYear: r.season_year, command, eventsHash: r.events_hash, digestAfter: r.digest_after, stateHash: r.state_hash,
    advancesTime: (r.flags & FLAG_ADVANCES_TIME) !== 0, undoable: (r.flags & FLAG_UNDOABLE) !== 0, undoes: r.undoes, redoes: r.redoes, inverse,
  };
}

export function logInsert(row: LogRow): SqlStatement {
  const r = toRaw(row);
  return {
    sql: `INSERT INTO command_log (${LOG_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [r.seq, r.type, r.season_year, r.command, r.events_hash, r.digest_after, r.state_hash, r.flags, r.undoes, r.redoes, r.inverse],
  };
}

export interface LogExtent {
  /** Rows in the live table plus rows in archived seasons. */
  count: number;
  /** Highest sequence number, 0 for an empty log. */
  last: number;
  /** True when the sequence numbers are exactly 1 to `last` with none missing or doubled. */
  contiguous: boolean;
}

export async function logExtent(driver: SqlDriver): Promise<LogExtent> {
  const live = (await driver.all<{ c: number; lo: number | null; hi: number | null }>('SELECT COUNT(*) AS c, MIN(seq) AS lo, MAX(seq) AS hi FROM command_log'))[0]!;
  const segs = await driver.all<{ first_seq: number; last_seq: number; row_count: number }>('SELECT first_seq, last_seq, row_count FROM command_log_archive ORDER BY first_seq');
  let next = 1;
  let contiguous = true;
  let count = 0;
  for (const s of segs) {
    if (s.first_seq !== next || s.row_count !== s.last_seq - s.first_seq + 1) contiguous = false;
    next = s.last_seq + 1;
    count += s.row_count;
  }
  if (live.c > 0) {
    if (live.lo !== next || live.c !== live.hi! - live.lo + 1) contiguous = false;
    next = live.hi! + 1;
    count += live.c;
  }
  return { count, last: Math.max(live.hi ?? 0, segs.at(-1)?.last_seq ?? 0), contiguous };
}

/** The newest row of the live log, or null when it is empty. */
export async function lastLiveRow(driver: SqlDriver): Promise<LogRow | null> {
  const rows = await driver.all<RawLogRow>(`SELECT ${LOG_COLS} FROM command_log ORDER BY seq DESC LIMIT 1`);
  return rows[0] ? fromRaw(rows[0]) : null;
}

/** Live rows after the last time-advancing command: the only rows undo may touch (P5.2.2). */
export async function readUndoWindow(driver: SqlDriver): Promise<LogRow[]> {
  const rows = await driver.all<RawLogRow>(
    `SELECT ${LOG_COLS} FROM command_log WHERE seq > (SELECT COALESCE(MAX(seq), 0) FROM command_log WHERE (flags & ${FLAG_ADVANCES_TIME}) != 0) ORDER BY seq`,
  );
  return rows.map(fromRaw);
}
