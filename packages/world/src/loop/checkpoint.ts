// Checkpoint and resume for long history runs (the master data run, Marlon 2026-11-26): a reclaimed
// machine must not lose the seasons already played. Pure: `checkpointData` returns plain data (Maps and
// arrays kept as they are, so a structured-clone serializer such as node:v8 can write it byte for byte),
// and `restoreCheckpoint` writes it back into a freshly created world of the same setup.
//
// The restore is in place: every Map and array of the fresh world is cleared and refilled rather than
// replaced, because closures made at creation hold them (the event log's originOf reads the people Map,
// a lifecycle step holds the world). The event log is rebuilt from its rows with the world's own options,
// which re-runs every check and recomputes the season hashes. The gate is that a resumed run ends on the
// same deep world hash as an unbroken one.
import { history } from '@gm/league';
import type { WorldEvent } from '@gm/schema';
import { worldHash } from './order.ts';
import type { LiveWorld } from './types.ts';

export const CHECKPOINT_VERSION = 1;

/** Fields made at creation that are not data, or are rebuilt rather than copied. */
const SKIP = new Set(['log', 'logOptions']);

export interface WorldCheckpoint {
  readonly version: number;
  readonly seedHex: string;
  readonly seasonYear: number;
  /** Deep world hash at the checkpoint; checked again after restore. */
  readonly worldHash: string;
  readonly fields: Record<string, unknown>;
  readonly logRows: readonly WorldEvent[];
  /** Whatever the caller keeps beside the world (season counter, timing totals, step state outside the world). */
  readonly extra: unknown;
}

export function checkpointData(world: LiveWorld, seedHex: string, extra: unknown = null): WorldCheckpoint {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(world)) if (!SKIP.has(k)) fields[k] = v;
  return { version: CHECKPOINT_VERSION, seedHex, seasonYear: world.date.seasonYear, worldHash: worldHash(world), fields, logRows: world.log.rows(), extra };
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/** Write `src` into `dst` keeping `dst`'s own containers. Returns the value to store when `dst` cannot be kept. */
function fill(dst: unknown, src: unknown): unknown {
  if (dst instanceof Map && src instanceof Map) {
    dst.clear();
    for (const [k, v] of src) dst.set(k, v);
    return dst;
  }
  if (dst instanceof Set && src instanceof Set) {
    dst.clear();
    for (const v of src) dst.add(v);
    return dst;
  }
  if (Array.isArray(dst) && Array.isArray(src) && !Object.isFrozen(dst)) {
    dst.length = 0;
    for (const v of src) dst.push(v);
    return dst;
  }
  if (isPlain(dst) && isPlain(src) && !Object.isFrozen(dst)) {
    for (const k of Object.keys(dst)) if (!(k in src)) delete dst[k];
    for (const [k, v] of Object.entries(src)) dst[k] = fill(dst[k], v);
    return dst;
  }
  return src;
}

/**
 * Restore a checkpoint into `fresh`, a world just made by createWorld with the same setup, content and
 * options as the checkpointed one. Throws when the seed differs or the restored hash does not match.
 */
export function restoreCheckpoint(fresh: LiveWorld, cp: WorldCheckpoint, seedHex: string): LiveWorld {
  if (cp.version !== CHECKPOINT_VERSION) throw new Error(`checkpoint version ${cp.version} is not ${CHECKPOINT_VERSION}`);
  if (cp.seedHex !== seedHex) throw new Error(`checkpoint seed ${cp.seedHex} is not the run's seed ${seedHex}`);
  const w = fresh as unknown as Record<string, unknown>;
  const fieldKeys = Object.keys(cp.fields);
  for (const k of Object.keys(w)) if (!SKIP.has(k) && !fieldKeys.includes(k)) throw new Error(`checkpoint has no field ${k}`);
  for (const k of fieldKeys) w[k] = fill(w[k], cp.fields[k]);
  fresh.log = history.EventLog.fromRows(cp.logRows, fresh.logOptions);
  const h = worldHash(fresh);
  if (h !== cp.worldHash) throw new Error(`checkpoint restore gave world hash ${h}, not ${cp.worldHash}`);
  return fresh;
}
