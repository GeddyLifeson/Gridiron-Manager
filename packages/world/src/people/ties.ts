// Ties at rest: one flat number row per tie in the world's plain state, instead of a nested object, so a
// history of hundreds of thousands of ties stays small in the heap, the world hash and the save. The step
// decodes only the ties a pass touches (`TieCache`), lets `people.relationships` work on real `Tie`
// objects, and writes them back with `flush`. Encoding is exact: decode(encode(t)) equals t.
import { DAYS_PER_YEAR } from '@gm/league';
import { relationships } from '@gm/people';
import type { WorldDate } from '@gm/schema';

const SIGNS: readonly relationships.Sign[] = ['warm', 'neutral', 'cold'];
const KINDS = relationships.EDGE_KINDS;
const NONE = -1;

const day = (d: WorldDate): number => d.seasonYear * DAYS_PER_YEAR + d.dayIndex;
const date = (n: number): WorldDate => { const y = Math.floor(n / DAYS_PER_YEAR); return { seasonYear: y, dayIndex: n - y * DAYS_PER_YEAR }; };

/** Field positions of a packed tie. */
export const AT = { kind: 0, a: 1, b: 2, bTeam: 3, promise: 4, since: 5, contact: 6, ab: 7, ba: 12, basis: 17 } as const;

function packSide(s: relationships.Side | null): number[] {
  return s ? [1, s.strength, SIGNS.indexOf(s.sign), s.peak, day(s.decayedThrough)] : [0, 0, 0, 0, 0];
}

function unpackSide(r: readonly number[], at: number): relationships.Side | null {
  if (r[at] !== 1) return null;
  return { strength: r[at + 1]!, sign: SIGNS[r[at + 2]!]!, peak: r[at + 3]!, decayedThrough: date(r[at + 4]!) };
}

export function packTie(t: relationships.Tie): number[] {
  const out = [KINDS.indexOf(t.kind), t.a, t.b ?? NONE, t.bTeamId ?? NONE, t.promiseId ?? NONE, day(t.since), day(t.lastContact), ...packSide(t.ab), ...packSide(t.ba)];
  for (const e of t.basis) out.push(e.eventId, e.weight);
  return out;
}

export function unpackTie(r: readonly number[]): relationships.Tie {
  const basis: relationships.BasisEntry[] = [];
  for (let i = AT.basis; i + 1 < r.length; i += 2) basis.push({ eventId: r[i]!, weight: r[i + 1]! });
  return {
    kind: KINDS[r[AT.kind]!]!, a: r[AT.a]!, b: r[AT.b] === NONE ? null : r[AT.b]!, bTeamId: r[AT.bTeam] === NONE ? null : r[AT.bTeam]!,
    promiseId: r[AT.promise] === NONE ? null : r[AT.promise]!, since: date(r[AT.since]!), lastContact: date(r[AT.contact]!),
    ab: unpackSide(r, AT.ab), ba: unpackSide(r, AT.ba), basis,
  };
}

/**
 * A `Map<string, Tie>` view over packed rows, for `relationships.TieStore`. Reads decode on first use and
 * keep the object, so the store's in-place changes land on it; `flush` packs every touched tie back.
 * Iteration is not supported: the store's lookups and puts are all a pass needs.
 */
export class TieCache extends Map<string, relationships.Tie> {
  readonly #rows: Map<string, number[]>;
  readonly #touched = new Map<string, relationships.Tie>();
  constructor(rows: Map<string, number[]>) { super(); this.#rows = rows; }
  override get(k: string): relationships.Tie | undefined {
    const hit = this.#touched.get(k);
    if (hit) return hit;
    const r = this.#rows.get(k);
    if (!r) return undefined;
    const t = unpackTie(r);
    this.#touched.set(k, t);
    return t;
  }
  override has(k: string): boolean { return this.#touched.has(k) || this.#rows.has(k); }
  override set(k: string, t: relationships.Tie): this { this.#touched.set(k, t); return this; }
  override delete(k: string): boolean { const a = this.#touched.delete(k); const b = this.#rows.delete(k); return a || b; }
  override get size(): number {
    let n = this.#rows.size;
    for (const k of this.#touched.keys()) if (!this.#rows.has(k)) n++;
    return n;
  }
  override values(): MapIterator<relationships.Tie> { throw new Error('TieCache: iterate the packed rows, not the cache'); }
  /** Writes every touched tie back as a packed row. */
  flush(): number {
    for (const [k, t] of this.#touched) this.#rows.set(k, packTie(t));
    const n = this.#touched.size;
    this.#touched.clear();
    return n;
  }
}
