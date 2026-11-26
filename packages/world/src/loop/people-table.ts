// The world's people table, with cold storage for people the sim no longer reads often (history runs keep
// hundreds of thousands of retired and dead people). A cold person is kept as his record's JSON text: one
// string instead of a tree of objects, about a third of the heap. `get` and iteration parse it back, so
// every reader sees the same record, key order included (JSON keeps insertion order, and canonical
// hashing sorts keys anyway), and the world hash does not change. `set` stores a live record again.
// Records in this table are never changed in place (every update is a new record through `set`), which is
// what makes a parsed copy as good as the original. This is storage only: no rule reads coldness.
import type { PersonRecord } from '@gm/schema';

/** A record held as JSON text. */
class Cold { constructor(readonly json: string) {} }

type Slot = PersonRecord | Cold;

const thaw = (v: Slot | undefined): PersonRecord | undefined => (v instanceof Cold ? (JSON.parse(v.json) as PersonRecord) : v);

export class PeopleTable extends Map<number, PersonRecord> {
  /** Keep one person as JSON text until the next `set`. No-op for an unknown id. */
  freeze(id: number): boolean {
    const v = super.get(id) as Slot | undefined;
    if (v === undefined || v instanceof Cold) return false;
    super.set(id, new Cold(JSON.stringify(v)) as unknown as PersonRecord);
    return true;
  }

  /** True when the person is held as JSON text. */
  isFrozen(id: number): boolean { return (super.get(id) as Slot | undefined) instanceof Cold; }

  override get(id: number): PersonRecord | undefined { return thaw(super.get(id) as Slot | undefined); }

  override forEach(fn: (value: PersonRecord, key: number, map: Map<number, PersonRecord>) => void, thisArg?: unknown): void {
    for (const [k, v] of this) fn.call(thisArg, v, k, this);
  }

  override *entries(): MapIterator<[number, PersonRecord]> {
    for (const [k, v] of super.entries() as IterableIterator<[number, Slot]>) yield [k, thaw(v)!];
  }

  override *values(): MapIterator<PersonRecord> {
    for (const v of super.values() as IterableIterator<Slot>) yield thaw(v)!;
  }

  override [Symbol.iterator](): MapIterator<[number, PersonRecord]> { return this.entries(); }
}

/** A plain Map copy with every record live (for structured clone across threads and for saves). */
export function plainPeople(people: ReadonlyMap<number, PersonRecord>): Map<number, PersonRecord> {
  return new Map(people);
}
