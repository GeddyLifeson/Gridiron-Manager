// "Names replaced" option of the bug bundle (P5.7.1, A6.3.2). Imported people carry real names;
// the option swaps them for placeholders keyed by person id. Names never enter the simulation, so a
// replay over the replaced world reaches the same state as long as hashes are taken over the same
// replaced view on both sides (see bug-bundle.ts, hash view `names_replaced`).

const PLACEHOLDER_FIRST = 'Imported';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isImportedPerson(v: Record<string, unknown>): boolean {
  return v.origin === 'imported' && isRecord(v.name);
}

/** Number of imported people anywhere in the value (world state, command payloads). */
export function countImportedPeople(value: unknown): number {
  let n = 0;
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (!isRecord(v)) return;
    if (isImportedPerson(v)) n++;
    for (const x of Object.values(v)) visit(x);
  };
  visit(value);
  return n;
}

/**
 * Returns a deep copy in which every imported person's name and external reference are replaced by
 * placeholders. Deterministic: the same input always gives the same output, on every platform.
 * Generated and user people are untouched.
 */
export function replaceImportedNames<T>(value: T): T {
  let unnamed = 0;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (!isRecord(v)) return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = visit(x);
    if (isImportedPerson(v)) {
      const tag = typeof v.id === 'number' ? String(v.id) : `u${++unnamed}`;
      out.name = { first: PLACEHOLDER_FIRST, last: `Person ${tag}` };
      if (isRecord(v.externalRef)) out.externalRef = { source: 'replaced', key: tag };
    }
    return out;
  };
  return visit(value) as T;
}
