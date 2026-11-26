// Packed groups of world rows (save format 3). Real play rows are about 9 KB of JSON each and a game
// has about 160 of them (G-83 measurement, 2026-11-26), so a 30-season save stored one row per play
// would be several gigabytes. Rows of one group (one game) are much alike and compress about 19 to 1
// together, so a packed table stores one compressed blob per group.
//
// Blob payload, before compression: the UTF-16 lengths of the rows as a JSON array, a newline, then the
// rows' storage texts back to back. The texts are the exact strings plain storage would have written,
// so a round trip is lossless to the character and every hash taken over them is unchanged.
//
// As with snapshots (./codec.ts), compressed bytes may differ between platforms. Nothing depends on
// them: `hash` and `raw_len` are taken over the decoded payload and checked on every read.
import type { SqlStatement } from '../driver.ts';
import { utf8 } from './canonical-json.ts';
import { CodecError, codecById, type BlobCodec } from './codec.ts';
import type { PackedGroupRow } from './state-tables.ts';

export const PACKED_ROWS_DDL = `
CREATE TABLE IF NOT EXISTS packed_rows (
  tbl TEXT NOT NULL,
  grp TEXT NOT NULL,
  seq INTEGER NOT NULL,
  by_field TEXT NOT NULL,
  n INTEGER NOT NULL,
  codec TEXT NOT NULL,
  raw_len INTEGER NOT NULL,
  hash TEXT NOT NULL,
  blob BLOB NOT NULL,
  PRIMARY KEY (tbl, grp)
);
`;

export class PackedRowsError extends Error {
  constructor(message: string) { super(message); this.name = 'PackedRowsError'; }
}

export interface EncodedGroup { codec: string; n: number; rawLength: number; hash: string; blob: Uint8Array }

/** The uncompressed payload of a group. */
export function packPayload(jsons: readonly string[]): string {
  return JSON.stringify(jsons.map((j) => j.length)) + '\n' + jsons.join('');
}

/** Splits a payload back into its rows. Throws PackedRowsError when the payload is not well formed. */
export function unpackPayload(text: string): string[] {
  const nl = text.indexOf('\n');
  if (nl < 0) throw new PackedRowsError('packed payload has no length line');
  let lengths: unknown;
  try { lengths = JSON.parse(text.slice(0, nl)); } catch { throw new PackedRowsError('packed payload length line is not readable'); }
  if (!Array.isArray(lengths)) throw new PackedRowsError('packed payload length line is not a list');
  const out: string[] = [];
  let at = nl + 1;
  for (const n of lengths) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || at + n > text.length) throw new PackedRowsError('packed payload lengths do not fit its text');
    out.push(text.slice(at, at + n));
    at += n;
  }
  if (at !== text.length) throw new PackedRowsError('packed payload has text after its last row');
  return out;
}

export async function encodeGroup(jsons: readonly string[], codec: BlobCodec, bytesHash: (bytes: Uint8Array) => string): Promise<EncodedGroup> {
  const raw = utf8(packPayload(jsons));
  return { codec: codec.id, n: jsons.length, rawLength: raw.length, hash: bytesHash(raw), blob: await codec.encode(raw) };
}

export function packedPutStatement(table: string, group: string, seq: number, by: string, e: EncodedGroup): SqlStatement {
  return {
    sql: 'INSERT INTO packed_rows (tbl, grp, seq, by_field, n, codec, raw_len, hash, blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tbl, grp) DO UPDATE SET seq = excluded.seq, by_field = excluded.by_field, n = excluded.n, codec = excluded.codec, raw_len = excluded.raw_len, hash = excluded.hash, blob = excluded.blob',
    params: [table, group, seq, by, e.n, e.codec, e.rawLength, e.hash, e.blob],
  };
}

interface RawGroup { tbl: string; grp: string; seq: number; by_field: string; n: number; codec: string; raw_len: number; hash: string; blob: Uint8Array }

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Decodes one stored group and checks it against its stored length, hash and row count. */
export async function decodeGroup(r: RawGroup, bytesHash?: (bytes: Uint8Array) => string): Promise<PackedGroupRow> {
  const where = `packed group ${r.tbl}/${r.grp}`;
  let raw: Uint8Array;
  try { raw = await codecById(r.codec).decode(r.blob instanceof Uint8Array ? r.blob : new Uint8Array(r.blob as ArrayLike<number>)); } catch (e) {
    throw new PackedRowsError(`${where} does not decode: ${e instanceof CodecError || e instanceof Error ? e.message : String(e)}`);
  }
  if (raw.length !== r.raw_len) throw new PackedRowsError(`${where} decodes to ${raw.length} bytes, ${r.raw_len} recorded`);
  if (bytesHash && bytesHash(raw) !== r.hash) throw new PackedRowsError(`${where} does not match its stored hash`);
  let text: string;
  try { text = decoder.decode(raw); } catch { throw new PackedRowsError(`${where} is not UTF-8 text`); }
  const jsons = unpackPayload(text);
  if (jsons.length !== r.n) throw new PackedRowsError(`${where} holds ${jsons.length} rows, ${r.n} recorded`);
  return { tbl: r.tbl, grp: r.grp, seq: r.seq, by: r.by_field, jsons };
}

/** True when the save has the packed table (every format 3 save; format 2 saves do not). */
export async function hasPackedTable(all: <T>(sql: string) => Promise<T[]>): Promise<boolean> {
  return (await all<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'packed_rows'"))[0]?.n === 1;
}

/** Every packed group, decoded, by table and position. */
export async function readPackedGroups(all: <T>(sql: string) => Promise<T[]>, bytesHash?: (bytes: Uint8Array) => string): Promise<PackedGroupRow[]> {
  if (!(await hasPackedTable(all))) return [];
  const rows = await all<RawGroup>('SELECT tbl, grp, seq, by_field, n, codec, raw_len, hash, blob FROM packed_rows ORDER BY tbl, seq');
  const out: PackedGroupRow[] = [];
  for (const r of rows) out.push(await decodeGroup(r, bytesHash));
  return out;
}

type Spec = { readonly table: string; readonly groupBy: string };

/** Tables whose rows are stored packed by default: the per-game play-row tables of the world contract. */
export const DEFAULT_PACKED_TABLES: readonly Spec[] = [
  { table: 'plays', groupBy: 'gameId' },
  { table: 'drives', groupBy: 'gameId' },
  { table: 'playGrades', groupBy: 'gameId' },
  { table: 'decisionGrades', groupBy: 'gameId' },
  { table: 'gameInputs', groupBy: 'gameId' },
  { table: 'trajectories', groupBy: 'gameId' },
];

/**
 * The `compact` profile also packs the season summaries, one blob per season. They are kept forever
 * (P5.4.1) and written once, at the season archive step, so a season's blob is written once too.
 */
export const COMPACT_PACKED_TABLES: readonly Spec[] = [...DEFAULT_PACKED_TABLES, { table: 'seasonSummaries', groupBy: 'seasonYear' }];

/** Packed tables for a retention profile. */
export function packedTablesFor(profile: string): readonly Spec[] {
  return profile === 'compact' ? COMPACT_PACKED_TABLES : DEFAULT_PACKED_TABLES;
}
