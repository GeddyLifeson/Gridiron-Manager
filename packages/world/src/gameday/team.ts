// A world club as the real game sees it for one game (SimTeam): its own people, dressed and placed in the
// unit slots by lineup.ts, with their true attributes, drill results and long-term load (the engine reads the
// truth, as J6 contests must; only the slot choice is the coach's and reads observed grades).
//
// The engine player id of a person is the world person id, so a game's truth events and stat credits name
// world people directly (no mapping table to carry back from a worker).
import type { PersonRecord, SimPlayer, SimTeam, Side } from '@gm/schema';
import { ATTRIBUTE_IDS } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import { fillUnit, unitPlans, type Candidate } from './lineup.ts';

/** B2.3.1 position bands a coach hands numbers from (pro numbering since 2021; ASSUMPTION for the band order). */
export const JERSEY_BANDS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  QB: [[1, 19]], K: [[1, 19], [90, 99]], P: [[1, 19], [90, 99]], LS: [[40, 49], [60, 69]],
  RB: [[20, 49], [1, 19]], FB: [[30, 49], [20, 29]], WR: [[10, 19], [80, 89], [1, 9]], TE: [[80, 89], [40, 49]],
  T: [[60, 79], [50, 59]], G: [[60, 79], [50, 59]], C: [[50, 79]],
  DE: [[90, 99], [50, 79]], DT: [[90, 99], [50, 79]], NT: [[90, 99], [50, 79]],
  OLB: [[50, 59], [40, 49], [90, 99]], ILB: [[50, 59], [40, 49]], MLB: [[50, 59], [40, 49]],
  CB: [[20, 39], [1, 19]], SS: [[20, 49], [1, 19]], FS: [[20, 49], [1, 19]],
};

function bandsOf(position: string): readonly (readonly [number, number])[] { return JERSEY_BANDS[position] ?? [[1, 99]]; }
const inBands = (n: number, bands: readonly (readonly [number, number])[]): boolean => bands.some(([a, b]) => n >= a && n <= b);

/** Numbers for the dressed players: the last number worn when it fits the position band and is free, else the first free one in the bands. */
export function assignJerseys(people: readonly { id: number; position: string; lastJersey: number | null }[]): Map<number, number> {
  const taken = new Set<number>();
  const out = new Map<number, number>();
  const sorted = [...people].sort((a, b) => a.id - b.id);
  for (const p of sorted) {
    if (p.lastJersey !== null && inBands(p.lastJersey, bandsOf(p.position)) && !taken.has(p.lastJersey)) { taken.add(p.lastJersey); out.set(p.id, p.lastJersey); }
  }
  for (const p of sorted) {
    if (out.has(p.id)) continue;
    let n = -1;
    for (const [a, b] of bandsOf(p.position)) { for (let k = a; k <= b && n < 0; k++) if (!taken.has(k)) n = k; if (n >= 0) break; }
    if (n < 0) for (let k = 0; k <= 99 && n < 0; k++) if (!taken.has(k)) n = k;
    taken.add(n); out.set(p.id, n);
  }
  return out;
}

export interface WorldTeamOptions {
  /** The club staff's observed grade of a player (K9: never the truth). */
  readonly gradeOf: (teamId: number, personId: number) => number;
  /** True when the player cannot play this week (D11 open case, suspension). */
  readonly isOut?: (personId: number) => boolean;
}

/** A club's dressed game-day team for side `side`, or null when it has fewer playing people than one unit needs. */
export function worldTeam(world: LiveWorld, teamId: number, side: Side, o: WorldTeamOptions): SimTeam | null {
  const season = world.date.seasonYear;
  const roster = world.rosters.get(teamId) ?? [];
  const people: PersonRecord[] = [];
  for (const id of roster) {
    const p = world.people.get(id);
    if (!p?.playing || world.status.get(id) !== 'active' || o.isOut?.(id)) continue;
    people.push(p);
  }
  if (people.length < 11) return null;
  const candidates: Candidate[] = people.map((p) => ({ id: p.id, position: p.playing!.position, grade: o.gradeOf(teamId, p.id) }));
  const plans = unitPlans();
  const depth: Record<string, number[]> = {};
  // Offense and defense first: who starts there decides who is spared on the coverage units.
  const starters = new Set<number>();
  for (const [key, plan] of plans) {
    if (key !== 'offense' && key !== 'defense') continue;
    depth[key] = fillUnit(plan, candidates, starters);
  }
  for (const id of [...depth.offense!, ...depth.defense!]) starters.add(id);
  for (const [key, plan] of plans) if (depth[key] === undefined) depth[key] = fillUnit(plan, candidates, starters);
  const dressedIds = new Set<number>();
  for (const ids of Object.values(depth)) for (const id of ids) dressedIds.add(id);
  const dressed = people.filter((p) => dressedIds.has(p.id)).sort((a, b) => a.id - b.id);
  const jerseys = assignJerseys(dressed.map((p) => ({ id: p.id, position: p.playing!.position, lastJersey: p.playing!.lastJersey })));
  const players: SimPlayer[] = dressed.map((p) => simPlayerOf(p, season, jerseys.get(p.id)!));
  return { teamId: side + 1, side, players, depth, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

/** One person as the engine reads him at kickoff: fresh for the day, carrying his long-term load (D10.1.1). */
export function simPlayerOf(p: PersonRecord, seasonYear: number, jersey: number): SimPlayer {
  const pl = p.playing!;
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = pl.attributes[a] ?? 0;
  return {
    playerId: p.id, position: pl.position, jersey, heightIn: pl.heightIn, weightLb: pl.weightLb,
    // D1.1.1: age for football is age on September 1 of the season; the birth date's season year is the age's base.
    ageYears: Math.max(0, seasonYear - p.birthDate.seasonYear), attributes, tests: pl.tests,
    gameDay: {
      freshness: 1, freshnessLongTerm: pl.freshnessLongTerm, conditioning: pl.conditioning, playingHurt: [], knowledge: {},
      snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false,
    },
  };
}
