// Snapshots (P5.3.1): a compressed copy of all world-state tables, written at each week boundary, at
// the start of each season and before any migration. They make crash recovery and replay possible:
// restoring one and replaying the log after it gives the live state (P5.8.1).
//
// A snapshot row also carries the save header as it stood, so a file whose header row is damaged can
// still be put back together.
import type { SqlDriver, SqlStatement } from '../driver.ts';
import { fromUtf8, storageJson, utf8 } from './canonical-json.ts';
import { codecById, type BlobCodec } from './codec.ts';
import type { SnapshotRetention } from './params.ts';

export type SnapshotKind = 'creation' | 'week' | 'season' | 'pre_migration';

export interface SnapshotMeta {
  id: number; kind: string; logSeq: number; seasonYear: number;
  /** The engine's state hash at that point (P1.1.5); the same value is in a hash-chain row. */
  stateHash: string;
  /** The store's own digest of the state (see state-tables.ts). */
  digest: string;
  codec: string; rawLength: number; blobHash: string;
}

export const SNAPSHOT_DDL = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  log_seq INTEGER NOT NULL,
  season_year INTEGER NOT NULL,
  state_hash TEXT NOT NULL,
  digest TEXT NOT NULL,
  header TEXT NOT NULL,
  codec TEXT NOT NULL,
  raw_len INTEGER NOT NULL,
  blob_hash TEXT NOT NULL,
  blob BLOB NOT NULL
);
`;

export interface SnapshotInput {
  kind: SnapshotKind; logSeq: number; seasonYear: number; stateHash: string; digest: string;
  /** The state. It must already have passed the tracker, which refuses anything that is not plain data. */
  state: unknown;
  /** Header JSON as it stands at this point. */
  headerJson: string;
}

export async function snapshotInsert(input: SnapshotInput, codec: BlobCodec, bytesHash: (b: Uint8Array) => string): Promise<SqlStatement> {
  const raw = utf8(storageJson(input.state));
  const blob = await codec.encode(raw);
  return {
    sql: 'INSERT INTO snapshots (kind, log_seq, season_year, state_hash, digest, header, codec, raw_len, blob_hash, blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [input.kind, input.logSeq, input.seasonYear, input.stateHash, input.digest, input.headerJson, codec.id, raw.length, bytesHash(blob), blob],
  };
}

/** Deletes week and season snapshots beyond what the retention keeps. Run it in the transaction that adds a snapshot. */
export function pruneStatements(retention: SnapshotRetention): SqlStatement[] {
  const prune = (kind: SnapshotKind, keep: number): SqlStatement => ({
    sql: 'DELETE FROM snapshots WHERE kind = ? AND id NOT IN (SELECT id FROM snapshots WHERE kind = ? ORDER BY log_seq DESC, id DESC LIMIT ?)',
    params: [kind, kind, keep],
  });
  const out = [prune('week', retention.week)];
  if (retention.season !== null) out.push(prune('season', retention.season));
  return out;
}

interface RawMeta { id: number; kind: string; log_seq: number; season_year: number; state_hash: string; digest: string; codec: string; raw_len: number; blob_hash: string }
const META_COLS = 'id, kind, log_seq, season_year, state_hash, digest, codec, raw_len, blob_hash';
const toMeta = (r: RawMeta): SnapshotMeta => ({ id: r.id, kind: r.kind, logSeq: r.log_seq, seasonYear: r.season_year, stateHash: r.state_hash, digest: r.digest, codec: r.codec, rawLength: r.raw_len, blobHash: r.blob_hash });

/** Snapshot rows without their blobs, oldest first. */
export async function listSnapshots(driver: SqlDriver): Promise<SnapshotMeta[]> {
  return (await driver.all<RawMeta>(`SELECT ${META_COLS} FROM snapshots ORDER BY log_seq, id`)).map(toMeta);
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

export interface LoadedSnapshot { meta: SnapshotMeta; state: unknown; headerJson: string }

/** Reads and decodes one snapshot. Throws SnapshotError when the blob is damaged. The caller checks the state against the stored hashes. */
export async function readSnapshot(driver: SqlDriver, id: number, bytesHash: (b: Uint8Array) => string): Promise<LoadedSnapshot> {
  const rows = await driver.all<RawMeta & { header: string; blob: Uint8Array }>(`SELECT ${META_COLS}, header, blob FROM snapshots WHERE id = ?`, [id]);
  const r = rows[0];
  if (!r) throw new SnapshotError(`no snapshot ${id}`);
  const blob = r.blob instanceof Uint8Array ? r.blob : new Uint8Array(r.blob as ArrayLike<number>);
  if (bytesHash(blob) !== r.blob_hash) throw new SnapshotError(`snapshot ${id} is damaged (stored bytes changed)`);
  let state: unknown;
  try {
    const raw = await codecById(r.codec).decode(blob);
    if (raw.length !== r.raw_len) throw new Error('length differs');
    state = JSON.parse(fromUtf8(raw));
  } catch (e) {
    throw new SnapshotError(`snapshot ${id} does not decode: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { meta: toMeta(r), state, headerJson: r.header };
}
