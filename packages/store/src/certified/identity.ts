// Copies and reloads (P8.1.2): each certified career has a random identity and a monotonic session
// counter in the file, mirrored in a small local index outside the save. Loading a file whose counter
// is behind the index (an older copy restored over a newer one) breaks certification. A deterrent, not
// proof: local files can be altered. Real proof is server re-simulation (P8.2.1).
//
// P8.1.2 puts the identity and counter in the header. The header schema is strict and owned by the
// integrator, so until change request CR-G95-1 adds them, this module keeps them in a one-row table of
// the save file, `certified_identity`.
import type { SqlDriver } from '../driver.ts';

export interface CareerIdentity { readonly careerId: string; readonly session: number }

/** The local index outside the save (a small file or browser store kept by the shell). */
export interface IdentityIndex {
  get(careerId: string): Promise<number | null>;
  set(careerId: string, session: number): Promise<void>;
}

const TABLE = 'CREATE TABLE IF NOT EXISTS certified_identity (id INTEGER PRIMARY KEY CHECK (id = 1), career_id TEXT NOT NULL, session INTEGER NOT NULL)';

export async function readIdentity(driver: SqlDriver): Promise<CareerIdentity | null> {
  await driver.exec(TABLE);
  const rows = await driver.all<{ career_id: string; session: number }>('SELECT career_id, session FROM certified_identity WHERE id = 1');
  return rows[0] ? { careerId: rows[0].career_id, session: Number(rows[0].session) } : null;
}

/** Gives a new certified career its identity, session 0, and records it in the index. */
export async function startIdentity(driver: SqlDriver, index: IdentityIndex, careerId: string): Promise<CareerIdentity> {
  if (!careerId) throw new Error('a career identity is needed');
  if (await readIdentity(driver)) throw new Error('this save already has a career identity');
  await driver.transaction([{ sql: 'INSERT INTO certified_identity (id, career_id, session) VALUES (1, ?, 0)', params: [careerId] }]);
  await index.set(careerId, 0);
  return { careerId, session: 0 };
}

export type IdentityCheck =
  | { readonly ok: true; readonly identity: CareerIdentity }
  | { readonly ok: false; readonly reason: 'older_copy' | 'no_identity'; readonly identity: CareerIdentity | null; readonly indexSession: number | null };

/**
 * The load check: compares the file's counter with the index, then moves both on by one. A file behind
 * the index is an older copy. A file ahead of the index (the index was lost) is accepted and the index
 * catches up, since losing the index is not a sign of a copy.
 */
export async function checkAndAdvance(driver: SqlDriver, index: IdentityIndex): Promise<IdentityCheck> {
  const id = await readIdentity(driver);
  if (!id) return { ok: false, reason: 'no_identity', identity: null, indexSession: null };
  const known = await index.get(id.careerId);
  if (known !== null && id.session < known) return { ok: false, reason: 'older_copy', identity: id, indexSession: known };
  const next = { careerId: id.careerId, session: id.session + 1 };
  await driver.transaction([{ sql: 'UPDATE certified_identity SET session = ? WHERE id = 1', params: [next.session] }]);
  await index.set(next.careerId, next.session);
  return { ok: true, identity: next };
}

/** An index held in memory: for tests and for the headless runner. */
export class MemoryIdentityIndex implements IdentityIndex {
  private readonly m = new Map<string, number>();
  async get(careerId: string): Promise<number | null> { return this.m.get(careerId) ?? null; }
  async set(careerId: string, session: number): Promise<void> { this.m.set(careerId, session); }
}
