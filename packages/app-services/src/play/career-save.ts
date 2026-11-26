// The live world in the career's save file (P5.1.1, P5.3; X12.1). The schema WorldState the command log
// keeps is the save's record of commands; the world the career actually plays in is the LiveWorld the
// new game built and the career year keeps running. This writes that whole career year (the packed world
// with every system's carried state, the season session, and which of its games are already in the
// world's results) into the same .gmsave database, in table `live_world`, in one transaction: rows meta,
// season and injected; row `world` is a manifest of the world's fields, each stored as `world:<field>:<n>`,
// big lists and maps in chunks of LIVE_WORLD_CHUNK entries (a whole world is past the engine's string limit
// after one season). Reading it back restores the career year and refuses the save when the restored world does
// not hash to the world hash written beside it.
//
// Version 2 compresses: the meta, manifest, season and injected rows stay plain JSON in `live_world`, and every
// world chunk goes compressed into `live_world_blobs` through the store's blob codec (deflate-raw where the
// platform has it, P5.3.1). A world's JSON compresses about 8 to 1 (people) and 45 to 1 (event log), which is
// what brings a season-30 save inside the P5.4.1 compact target (MA-75). Version 1 saves still read.
import { snapshot, type SqlDriver } from '@gm/store';
import { CareerYear, type CareerYearOptions, type CareerYearSave } from './career-year.ts';

export const LIVE_WORLD_TABLE = 'live_world';
export const LIVE_WORLD_BLOB_TABLE = 'live_world_blobs';
export const LIVE_WORLD_SAVE_VERSION = 2;
const READABLE_VERSIONS: readonly number[] = [1, 2];

const DDL = `CREATE TABLE IF NOT EXISTS ${LIVE_WORLD_TABLE} (part TEXT PRIMARY KEY, json TEXT NOT NULL);`;
const BLOB_DDL = `CREATE TABLE IF NOT EXISTS ${LIVE_WORLD_BLOB_TABLE} (part TEXT PRIMARY KEY, codec TEXT NOT NULL, raw_len INTEGER NOT NULL, blob BLOB NOT NULL);`;

/** What the save says about the career year beside the packed parts: enough to list it and check it. */
export interface LiveWorldMeta {
  readonly version: number;
  readonly seatTeamId: number;
  readonly seasonYear: number;
  readonly worldWeek: number;
  readonly seasons: number;
  /** loop.worldHash of the world when it was written. */
  readonly worldHash: string;
}

const PARTS = ['meta', 'world', 'season', 'injected'] as const;
/** Desk parts (practice, the staff's eye, the user's recruiting): written always, optional on read for saves written before them. */
const DESK_PARTS = ['practice', 'scouting', 'recruiting'] as const;

/** Entries per row of a big world field. One JSON string per field overflows the engine's string limit after a season. */
export const LIVE_WORLD_CHUNK = 2000;

type FieldKind = 'whole' | 'array' | '__map' | '__set';
interface FieldEntry { readonly key: string; readonly kind: FieldKind; readonly chunks: number }

/** Splits the plain-encoded world (play/plain.ts) into rows: one per small field, chunks of entries for big ones. */
function worldRows(world: unknown): { manifest: FieldEntry[]; rows: { part: string; json: string }[] } {
  const manifest: FieldEntry[] = [];
  const rows: { part: string; json: string }[] = [];
  for (const [key, v] of Object.entries(world as Record<string, unknown>)) {
    let kind: FieldKind = 'whole';
    let items: unknown[] | null = null;
    if (Array.isArray(v)) { kind = 'array'; items = v; } else if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const ks = Object.keys(o);
      if (ks.length === 1 && (ks[0] === '__map' || ks[0] === '__set') && Array.isArray(o[ks[0]!])) { kind = ks[0] as FieldKind; items = o[ks[0]!] as unknown[]; }
    }
    if (!items) { rows.push({ part: `world:${key}:0`, json: JSON.stringify(v) }); manifest.push({ key, kind, chunks: 1 }); continue; }
    let n = 0;
    for (let i = 0; i < items.length || n === 0; i += LIVE_WORLD_CHUNK, n++) rows.push({ part: `world:${key}:${n}`, json: JSON.stringify(items.slice(i, i + LIVE_WORLD_CHUNK)) });
    manifest.push({ key, kind, chunks: n });
  }
  return { manifest, rows };
}

function worldFromRows(manifest: readonly FieldEntry[], p: Map<string, string>): unknown {
  const out: Record<string, unknown> = {};
  for (const f of manifest) {
    const chunk = (i: number): string => {
      const j = p.get(`world:${f.key}:${i}`);
      if (j === undefined) throw new Error(`live world save: world field ${f.key} chunk ${i} is missing`);
      return j;
    };
    if (f.kind === 'whole') { out[f.key] = JSON.parse(chunk(0)); continue; }
    const items: unknown[] = [];
    for (let i = 0; i < f.chunks; i++) for (const x of JSON.parse(chunk(i)) as unknown[]) items.push(x);
    out[f.key] = f.kind === 'array' ? items : { [f.kind]: items };
  }
  return out;
}

/** The world from its `world` row: a field manifest (chunked saves), or the whole plain world (the first version-1 saves). */
function worldOf(row: unknown, p: Map<string, string>): unknown {
  return Array.isArray(row) ? worldFromRows(row as FieldEntry[], p) : row;
}

/** Writes the career year into the save database, replacing the previous copy. */
export async function writeCareerYear(driver: SqlDriver, y: CareerYear, codec: snapshot.BlobCodec = snapshot.defaultCodec()): Promise<LiveWorldMeta> {
  await driver.exec(DDL);
  await driver.exec(BLOB_DDL);
  const s = y.save();
  const v = y.view();
  const meta: LiveWorldMeta = {
    version: LIVE_WORLD_SAVE_VERSION, seatTeamId: s.seatTeamId, seasonYear: v.seasonYear, worldWeek: v.worldWeek, seasons: v.seasons, worldHash: v.worldHash,
  };
  const w = worldRows(s.world);
  const desk: Record<(typeof DESK_PARTS)[number], unknown> = { practice: s.practice, scouting: s.scouting, recruiting: s.recruiting };
  const rows = [
    { part: 'meta', json: JSON.stringify(meta) }, { part: 'world', json: JSON.stringify(w.manifest) },
    { part: 'season', json: JSON.stringify(s.season) }, { part: 'injected', json: JSON.stringify(s.injected) },
    ...DESK_PARTS.map((part) => ({ part, json: JSON.stringify(desk[part]) })),
  ];
  const blobs: { part: string; rawLength: number; blob: Uint8Array }[] = [];
  for (const r of w.rows) {
    const raw = snapshot.utf8(r.json);
    blobs.push({ part: r.part, rawLength: raw.length, blob: await codec.encode(raw) });
  }
  await driver.transaction([
    { sql: `DELETE FROM ${LIVE_WORLD_TABLE}` },
    { sql: `DELETE FROM ${LIVE_WORLD_BLOB_TABLE}` },
    ...rows.map((r) => ({ sql: `INSERT INTO ${LIVE_WORLD_TABLE} (part, json) VALUES (?, ?)`, params: [r.part, r.json] })),
    ...blobs.map((b) => ({ sql: `INSERT INTO ${LIVE_WORLD_BLOB_TABLE} (part, codec, raw_len, blob) VALUES (?, ?, ?, ?)`, params: [b.part, codec.id, b.rawLength, b.blob] })),
  ]);
  return meta;
}

async function hasTable(driver: SqlDriver, name: string): Promise<boolean> {
  return (await driver.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name])).length > 0;
}

/** Every part as JSON text: plain rows as stored, compressed ones decoded and checked against their length. */
async function parts(driver: SqlDriver, withBlobs = true): Promise<Map<string, string> | null> {
  if (!(await hasTable(driver, LIVE_WORLD_TABLE))) return null;
  const rows = await driver.all<{ part: string; json: string }>(`SELECT part, json FROM ${LIVE_WORLD_TABLE}`);
  const out = new Map(rows.map((r) => [r.part, r.json]));
  if (withBlobs && (await hasTable(driver, LIVE_WORLD_BLOB_TABLE))) {
    for (const b of await driver.all<{ part: string; codec: string; raw_len: number; blob: Uint8Array }>(`SELECT part, codec, raw_len, blob FROM ${LIVE_WORLD_BLOB_TABLE}`)) {
      const raw = await snapshot.codecById(b.codec).decode(b.blob);
      if (raw.length !== Number(b.raw_len)) throw new Error(`live world save: part ${b.part} decodes to ${raw.length} bytes, the save says ${b.raw_len}`);
      out.set(b.part, snapshot.fromUtf8(raw));
    }
  }
  return out;
}

/** The meta row, or null when the save holds no live world yet. */
export async function readLiveWorldMeta(driver: SqlDriver): Promise<LiveWorldMeta | null> {
  const p = await parts(driver, false);
  const m = p?.get('meta');
  return m ? (JSON.parse(m) as LiveWorldMeta) : null;
}

/**
 * Restores the career year from the save database, or null when it holds none. Throws when a part is
 * missing, the version is unknown, or the restored world's hash differs from the one written with it.
 */
export async function readCareerYear(driver: SqlDriver, o: Omit<CareerYearOptions, 'world' | 'seatTeamId'>): Promise<CareerYear | null> {
  const p = await parts(driver);
  if (!p || !p.size) return null;
  for (const part of PARTS) if (!p.has(part)) throw new Error(`live world save: part ${part} is missing`);
  const meta = JSON.parse(p.get('meta')!) as LiveWorldMeta;
  if (!READABLE_VERSIONS.includes(meta.version)) throw new Error(`live world save: version ${String(meta.version)} is not supported`);
  const save: CareerYearSave = {
    version: 1, seatTeamId: meta.seatTeamId,
    world: worldOf(JSON.parse(p.get('world')!), p), season: JSON.parse(p.get('season')!), injected: JSON.parse(p.get('injected')!) as number[],
    ...Object.fromEntries(DESK_PARTS.filter((d) => p.has(d)).map((d) => [d, JSON.parse(p.get(d)!)])),
  };
  const y = CareerYear.restore(o, save);
  const hash = y.view().worldHash;
  if (hash !== meta.worldHash) throw new Error(`live world save: the restored world hashes ${hash}, the save says ${meta.worldHash}`);
  return y;
}
