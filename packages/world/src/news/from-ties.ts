// X7 ties as the news routing reads them (X12.2.1 rule 2). The edges step (world/src/people) keeps every
// tie as one packed number row with a side for each direction; the routing wants warm person-to-person
// edges. A tie is one warm edge when either side is warm, at the stronger warm side's strength (NW-07).
// Sides are read as last settled: the edges step applies decay when it touches a tie (X7.2.2 rule 2), so
// a tie nobody has touched for a while reads a little stronger than it is (NW-08).
import type { RelationshipEdge } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import { AT, edgesOf } from '../people/index.ts';

/** Offsets inside a packed side (people/ties.ts `packSide`): present flag, strength, sign index. Sign 0 is warm. */
const SIDE = { present: 0, strength: 1, sign: 2 } as const;
const WARM = 0;
const NONE = -1;

function warmStrength(r: readonly number[], at: number): number {
  return r[at + SIDE.present] === 1 && r[at + SIDE.sign] === WARM ? r[at + SIDE.strength]! : NONE;
}

/** Warm person-to-person edges from the world's ties, in the ties' stored order. Team ties are left out. */
export function edgesFromTies(world: LiveWorld): RelationshipEdge[] {
  const out: RelationshipEdge[] = [];
  const at = { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex };
  for (const r of edgesOf(world).ties.values()) {
    const b = r[AT.b]!;
    if (b === NONE) continue;
    const s = Math.max(warmStrength(r, AT.ab), warmStrength(r, AT.ba));
    if (s <= 0) continue;
    // Only a, b, sign and strength are read by the routing; the dates and basis are not carried.
    out.push({ a: r[AT.a]!, b, bTeamId: null, kind: 'teammate', strength: s, sign: 'warm', since: at, lastContact: at, basisEventIds: [] } as RelationshipEdge);
  }
  return out;
}
