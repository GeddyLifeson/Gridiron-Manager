// The live world in the career's save file (P5.1.1, P5.3; X12.1). The schema WorldState the command log
// keeps is the save's record of commands; the world the career actually plays in is the LiveWorld the
// new game built and the career year keeps running. This writes that whole career year (the packed world
// with every system's carried state, the season session, and which of its games are already in the
// world's results) into the same .gmsave database, in table `live_world`, one row per part, in one
// transaction. Reading it back restores the career year and refuses the save when the restored world does
// not hash to the world hash written beside it.
import type { SqlDriver } from '@gm/store';
import { CareerYear, type CareerYearOptions, type CareerYearSave } from './career-year.ts';

export const LIVE_WORLD_TABLE = 'live_world';
export const LIVE_WORLD_SAVE_VERSION = 1;

const DDL = `CREATE TABLE IF NOT EXISTS ${LIVE_WORLD_TABLE} (part TEXT PRIMARY KEY, json TEXT NOT NULL);`;

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

/** Writes the career year into the save database, replacing the previous copy. */
export async function writeCareerYear(driver: SqlDriver, y: CareerYear): Promise<LiveWorldMeta> {
  await driver.exec(DDL);
  const s = y.save();
  const v = y.view();
  const meta: LiveWorldMeta = {
    version: LIVE_WORLD_SAVE_VERSION, seatTeamId: s.seatTeamId, seasonYear: v.seasonYear, worldWeek: v.worldWeek, seasons: v.seasons, worldHash: v.worldHash,
  };
  const body: Record<(typeof PARTS)[number], unknown> = { meta, world: s.world, season: s.season, injected: s.injected };
  await driver.transaction(PARTS.map((part) => ({
    sql: `INSERT INTO ${LIVE_WORLD_TABLE} (part, json) VALUES (?, ?) ON CONFLICT(part) DO UPDATE SET json = excluded.json`,
    params: [part, JSON.stringify(body[part])],
  })));
  return meta;
}

async function parts(driver: SqlDriver): Promise<Map<string, string> | null> {
  const t = await driver.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [LIVE_WORLD_TABLE]);
  if (!t.length) return null;
  const rows = await driver.all<{ part: string; json: string }>(`SELECT part, json FROM ${LIVE_WORLD_TABLE}`);
  return new Map(rows.map((r) => [r.part, r.json]));
}

/** The meta row, or null when the save holds no live world yet. */
export async function readLiveWorldMeta(driver: SqlDriver): Promise<LiveWorldMeta | null> {
  const p = await parts(driver);
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
  if (meta.version !== LIVE_WORLD_SAVE_VERSION) throw new Error(`live world save: version ${String(meta.version)} is not supported`);
  const save: CareerYearSave = {
    version: 1, seatTeamId: meta.seatTeamId,
    world: JSON.parse(p.get('world')!), season: JSON.parse(p.get('season')!), injected: JSON.parse(p.get('injected')!) as number[],
  };
  const y = CareerYear.restore(o, save);
  const hash = y.view().worldHash;
  if (hash !== meta.worldHash) throw new Error(`live world save: the restored world hashes ${hash}, the save says ${meta.worldHash}`);
  return y;
}
