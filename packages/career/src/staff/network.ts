// The coaching graph (L4.2.3): `coach_tie[a][b]` from shared staff years only, with the seasons behind it,
// and the coaching tree as a query over job history (the contract stores no tree, P3.5.1). Seasons are
// counted by season year: two coaches share a season when both held a seat on the same team during it.
// A tie starts in the first shared season, grows each shared season (more when one reported directly to
// the other), decays each season apart, and never falls below the floor once formed.
import type { JobHistoryRow, WorldDate } from '@gm/schema';
import { CATALOGUE, type Catalogue } from '../positions/index.ts';
import { clamp, param } from './params.ts';

export interface Tie {
  readonly a: number;
  readonly b: number;
  readonly strength: number;
  /** Season years they shared a staff, with the team; the network view shows these (L4.2.3 acceptance). */
  readonly together: readonly { readonly seasonYear: number; readonly teamId: number; readonly direct: boolean }[];
}

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function seasonsOf(row: JobHistoryRow, today: WorldDate): number[] {
  const last = row.ended ? row.ended.seasonYear : today.seasonYear;
  const out: number[] = [];
  for (let y = row.started.seasonYear; y <= last; y += 1) out.push(y);
  return out;
}

/** True when the holder of `boss` is the evaluating boss of the holder of `sub` by the position chart. */
function reportsDirectly(sub: JobHistoryRow, boss: JobHistoryRow, cat: Catalogue): boolean {
  const sp = cat.jobs.find((j) => j.id === sub.catalogueId)?.positionId;
  const bp = cat.jobs.find((j) => j.id === boss.catalogueId)?.positionId;
  if (!sp || !bp || !cat.hasPosition(sp)) return false;
  return cat.position(sp).definition.reportsTo === bp;
}

/** Every tie among the people in `history`, as of `today`. Pairs with no shared staff have no tie. */
export function computeTies(history: readonly JobHistoryRow[], today: WorldDate, cat: Catalogue = CATALOGUE): ReadonlyMap<string, Tie> {
  // season -> team -> rows
  const bySeasonTeam = new Map<string, JobHistoryRow[]>();
  for (const r of history) for (const y of seasonsOf(r, today)) {
    const k = `${y}:${r.teamId}`;
    bySeasonTeam.set(k, [...(bySeasonTeam.get(k) ?? []), r]);
  }
  const shared = new Map<string, Map<number, { teamId: number; direct: boolean }>>();
  for (const [k, rows] of bySeasonTeam) {
    const [y, team] = k.split(':').map(Number) as [number, number];
    for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
      const x = rows[i]!; const z = rows[j]!;
      if (x.personId === z.personId) continue;
      const pk = key(x.personId, z.personId);
      const m = shared.get(pk) ?? new Map();
      const direct = reportsDirectly(x, z, cat) || reportsDirectly(z, x, cat) || (m.get(y)?.direct ?? false);
      m.set(y, { teamId: team, direct });
      shared.set(pk, m);
    }
  }
  const out = new Map<string, Tie>();
  for (const [pk, seasons] of shared) {
    const [a, b] = pk.split(':').map(Number) as [number, number];
    const years = [...seasons.keys()].sort((p, q) => p - q);
    let s = 0;
    for (let y = years[0]!; y <= today.seasonYear; y += 1) {
      const t = seasons.get(y);
      if (t) s = clamp(s + param('tie.growPerSeason') + (t.direct ? param('tie.directReportBonus') : 0), 0, param('tie.max'));
      else s = Math.max(param('tie.floor'), s - param('tie.decayPerSeason'));
    }
    out.set(pk, { a, b, strength: s, together: years.map((y) => ({ seasonYear: y, ...seasons.get(y)! })) });
  }
  return out;
}

/** The tie between two people, 0 when they never shared a staff. */
export function tieBetween(ties: ReadonlyMap<string, Tie>, a: number, b: number): number {
  return ties.get(key(a, b))?.strength ?? 0;
}

/** Everyone tied to `personId`, strongest first (the network view and witness lists). */
export function network(ties: ReadonlyMap<string, Tie>, personId: number): readonly Tie[] {
  return [...ties.values()].filter((t) => t.a === personId || t.b === personId).sort((x, y) => y.strength - x.strength || Math.min(x.a, x.b) - Math.min(y.a, y.b));
}

export function other(t: Tie, personId: number): number { return t.a === personId ? t.b : t.a; }

/** People tied above the witness line (L4.2.3: broken promises travel to ties above 60). */
export function witnesses(ties: ReadonlyMap<string, Tie>, personId: number): readonly number[] {
  return network(ties, personId).filter((t) => t.strength > param('tie.witnessAbove')).map((t) => other(t, personId));
}

/**
 * The coaching tree of a head coach (L4.2.3 output): everyone who held a seat on a team in a season
 * when `headCoachId` was its head coach, with those seasons. `isHeadCoachRow` tells a head coach row.
 */
export function coachingTree(history: readonly JobHistoryRow[], headCoachId: number, today: WorldDate, isHeadCoachRow: (r: JobHistoryRow) => boolean): ReadonlyMap<number, readonly number[]> {
  const ruled = new Set<string>();
  for (const r of history) if (r.personId === headCoachId && isHeadCoachRow(r)) for (const y of seasonsOf(r, today)) ruled.add(`${y}:${r.teamId}`);
  const out = new Map<number, number[]>();
  for (const r of history) {
    if (r.personId === headCoachId) continue;
    for (const y of seasonsOf(r, today)) if (ruled.has(`${y}:${r.teamId}`)) out.set(r.personId, [...new Set([...(out.get(r.personId) ?? []), y])].sort((p, q) => p - q));
  }
  return out;
}

/** L4.2.3 default candidate order: known people first (by tie), then everyone else by id. */
export function orderCandidates(candidates: readonly number[], ties: ReadonlyMap<string, Tie>, headCoachId: number): readonly number[] {
  return [...candidates].sort((x, y) => tieBetween(ties, headCoachId, y) - tieBetween(ties, headCoachId, x) || x - y);
}
