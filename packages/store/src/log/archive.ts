// Old seasons' logs are compressed by season (P5.2.1). The rows are moved, unchanged, into one
// compressed blob per season. Nothing is deleted: `readLog` returns archived and live rows alike, so
// a replay or the decision history reads an old season the same way as the current one.
import type { SqlDriver, SqlStatement } from '../driver.ts';
import { fromUtf8, utf8 } from '../snapshot/canonical-json.ts';
import { codecById, type BlobCodec } from '../snapshot/codec.ts';
import { FLAG_ADVANCES_TIME, LOG_COLS, LogError, fromRaw, type LogRow, type RawLogRow } from './rows.ts';

export interface ArchiveSegment { firstSeq: number; lastSeq: number; seasonYear: number; rowCount: number; codec: string; rawLength: number }

export async function listArchives(driver: SqlDriver): Promise<ArchiveSegment[]> {
  const rows = await driver.all<{ first_seq: number; last_seq: number; season_year: number; row_count: number; codec: string; raw_len: number }>(
    'SELECT first_seq, last_seq, season_year, row_count, codec, raw_len FROM command_log_archive ORDER BY first_seq');
  return rows.map((r) => ({ firstSeq: r.first_seq, lastSeq: r.last_seq, seasonYear: r.season_year, rowCount: r.row_count, codec: r.codec, rawLength: r.raw_len }));
}

/**
 * Builds the statements that move one season's live rows into an archive blob. Returns null when the
 * season has no live rows. Refuses a season that is not strictly behind the undo window, and rows
 * that do not directly follow what is already archived, so the log never gets a gap.
 */
export async function archiveSeasonStatements(driver: SqlDriver, seasonYear: number, codec: BlobCodec, bytesHash: (b: Uint8Array) => string): Promise<SqlStatement[] | null> {
  const rows = await driver.all<RawLogRow>(`SELECT ${LOG_COLS} FROM command_log WHERE season_year = ? ORDER BY seq`, [seasonYear]);
  if (rows.length === 0) return null;
  const first = rows[0]!.seq;
  const last = rows.at(-1)!.seq;
  if (rows.length !== last - first + 1) throw new LogError(`season ${seasonYear} is not one unbroken run of log rows`);
  const bounds = (await driver.all<{ lo: number; adv: number | null }>(
    `SELECT MIN(seq) AS lo, (SELECT MAX(seq) FROM command_log WHERE (flags & ${FLAG_ADVANCES_TIME}) != 0) AS adv FROM command_log`))[0]!;
  if (bounds.lo !== first) throw new LogError(`season ${seasonYear} is not the oldest season still in the live log`);
  if (bounds.adv === null || last >= bounds.adv) throw new LogError(`season ${seasonYear} is still open: its rows reach the current undo window`);
  const raw = utf8(JSON.stringify(rows.map((r) => [r.seq, r.type, r.season_year, r.command, r.events_hash, r.digest_after, r.state_hash, r.flags, r.undoes, r.redoes, r.inverse])));
  const blob = await codec.encode(raw);
  return [
    {
      sql: 'INSERT INTO command_log_archive (first_seq, last_seq, season_year, row_count, codec, raw_len, blob_hash, blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [first, last, seasonYear, rows.length, codec.id, raw.length, bytesHash(blob), blob],
    },
    { sql: 'DELETE FROM command_log WHERE seq >= ? AND seq <= ?', params: [first, last] },
  ];
}

type Tuple = [number, string, number, string, string, string, string | null, number, number | null, number | null, string | null];

async function readSegment(driver: SqlDriver, firstSeq: number, bytesHash: (b: Uint8Array) => string): Promise<RawLogRow[]> {
  const r = (await driver.all<{ last_seq: number; row_count: number; codec: string; raw_len: number; blob_hash: string; blob: Uint8Array }>(
    'SELECT last_seq, row_count, codec, raw_len, blob_hash, blob FROM command_log_archive WHERE first_seq = ?', [firstSeq]))[0];
  if (!r) throw new LogError(`no archived log segment starts at ${firstSeq}`);
  const blob = r.blob instanceof Uint8Array ? r.blob : new Uint8Array(r.blob as ArrayLike<number>);
  if (bytesHash(blob) !== r.blob_hash) throw new LogError(`archived log rows ${firstSeq} to ${r.last_seq} are damaged (stored bytes changed)`, firstSeq);
  let tuples: Tuple[];
  try {
    const raw = await codecById(r.codec).decode(blob);
    if (raw.length !== r.raw_len) throw new Error('length differs');
    tuples = JSON.parse(fromUtf8(raw)) as Tuple[];
  } catch (e) {
    throw new LogError(`archived log rows ${firstSeq} to ${r.last_seq} do not decode: ${e instanceof Error ? e.message : String(e)}`, firstSeq);
  }
  if (!Array.isArray(tuples) || tuples.length !== r.row_count) throw new LogError(`archived log rows ${firstSeq} to ${r.last_seq} are incomplete`, firstSeq);
  return tuples.map((t, i) => {
    if (!Array.isArray(t) || t[0] !== firstSeq + i) throw new LogError(`archived log row ${firstSeq + i} is out of place`, firstSeq + i);
    return { seq: t[0], type: t[1], season_year: t[2], command: t[3], events_hash: t[4], digest_after: t[5], state_hash: t[6], flags: t[7], undoes: t[8], redoes: t[9], inverse: t[10] };
  });
}

/**
 * Log rows with sequence numbers from `fromSeq` to `toSeq` inclusive, in order, from archived seasons
 * and the live table. Throws LogError naming the first row that cannot be read.
 */
export async function readLog(driver: SqlDriver, bytesHash: (b: Uint8Array) => string, fromSeq = 1, toSeq = Number.MAX_SAFE_INTEGER): Promise<LogRow[]> {
  const out: LogRow[] = [];
  const segs = await driver.all<{ first_seq: number }>('SELECT first_seq FROM command_log_archive WHERE last_seq >= ? AND first_seq <= ? ORDER BY first_seq', [fromSeq, toSeq]);
  for (const s of segs) {
    for (const r of await readSegment(driver, s.first_seq, bytesHash)) if (r.seq >= fromSeq && r.seq <= toSeq) out.push(fromRaw(r));
  }
  const live = await driver.all<RawLogRow>(`SELECT ${LOG_COLS} FROM command_log WHERE seq >= ? AND seq <= ? ORDER BY seq`, [fromSeq, toSeq]);
  for (const r of live) out.push(fromRaw(r));
  return out;
}
