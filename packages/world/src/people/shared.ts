// What the four people-dynamics steps share: their state slots, the event scan, who belongs to which team
// in which seat, position groups and rooms, the season's starters, and the X7 pair context over the world.
import { stream } from '@gm/engine-core';
import { needs, relationships } from '@gm/people';
import type { EventTypeDef, JobRecord, PersonRecord, WorldEvent } from '@gm/schema';
import { isActive } from '../loop/lifecycle.ts';
import type { LiveWorld } from '../loop/types.ts';
import { gradeContext, positionTargets, rosteredSet, specOf, type TurnoverBinding } from '../turnover/binding.ts';
import { param as turnoverParam } from '../turnover/params.ts';

/** `LiveWorld.systemState` keys. Plain data only: the world hash and the save read them. */
export const KEY = { memory: 'people.memory', edges: 'people.edges', needs: 'people.needs', culture: 'people.culture' } as const;

/** The state of one step, created on first use. */
export function stateOf<T>(world: LiveWorld, key: string, init: () => T): T {
  let s = world.systemState.get(key) as T | undefined;
  if (s === undefined) { s = init(); world.systemState.set(key, s); }
  return s;
}

/** Log rows from id `from` up to the last row, skipping ids compaction removed. */
export function eventsFrom(world: LiveWorld, from: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let id = Math.max(1, from); id < world.log.nextId; id++) {
    const e = world.log.get(id);
    if (e) out.push(e);
  }
  return out;
}

// ---------- the season-together event (X7.1.1 rule 1 basis) ----------

/** One team's season, naming every player and staff member: the basis event of the ties it forms (X7.1.1 acceptance). */
export const SEASON_TOGETHER = 'season_together';
export const PEOPLE_EVENT_TYPES: readonly EventTypeDef[] = [
  {
    id: SEASON_TOGETHER, family: 'roster', payloadSchema: { season: 'number' }, witnessRule: 'team', lineTemplate: 'event.season_together',
    harmClass: 'none', importedAllowed: true, minTier: 3, consumers: ['people.relationships', 'people.memory'], compactable: false,
  },
];

/** Event types the four steps write: the season basis plus the X5 needs events. Pass to `createWorld`. */
export function peopleEventTypes(registeredIds: readonly string[] = []): EventTypeDef[] {
  return [...PEOPLE_EVENT_TYPES, ...needs.NEEDS_EVENT_TYPES].filter((t) => !registeredIds.includes(t.id));
}

// ---------- positions, rooms and seats ----------

/** F1 position codes to the position groups jobs use (schema `PositionGroup`). Content mapping. */
export const GROUP_OF_POSITION: Readonly<Record<string, string>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', T: 'OL', G: 'OL', C: 'OL', OT: 'OL', OG: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', OLB: 'LB', ILB: 'LB', MLB: 'LB', LB: 'LB', CB: 'DB', FS: 'DB', SS: 'DB', S: 'DB',
  K: 'specialists', P: 'specialists', LS: 'specialists',
};
const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'OL']);
const DEFENSE = new Set(['DL', 'LB', 'DB']);

export function groupOfPosition(position: string | undefined): string {
  return (position && GROUP_OF_POSITION[position]) || 'none';
}

export function sideOfGroup(group: string): 'offense' | 'defense' | 'special_teams' {
  return OFFENSE.has(group) ? 'offense' : DEFENSE.has(group) ? 'defense' : 'special_teams';
}

/** The X5.1.1 class and person kind of a staff seat, read from its position id (S1 catalogue). */
export function seatClass(positionId: string): { kind: needs.PersonKind; classId: string } {
  if (positionId === 'pos:head_coach') return { kind: 'coach', classId: 'head_coach' };
  if (positionId.endsWith('coordinator') || positionId.includes('coordinator.') || positionId === 'pos:assistant_head_coach') return { kind: 'coach', classId: 'coordinator' };
  if (positionId.startsWith('pos:position_coach') || positionId === 'pos:assistant_position_coach' || positionId === 'pos:senior_assistant'
    || positionId === 'pos:special_teams_assistant' || positionId.startsWith('pos:quality_control') || positionId === 'pos:coaching_assistant') {
    return { kind: 'coach', classId: 'position_coach' };
  }
  return { kind: 'staff', classId: 'support_staff' };
}

export type Seat =
  | { readonly kind: 'player'; readonly teamId: number }
  | { readonly kind: 'job'; readonly teamId: number; readonly job: JobRecord }
  | { readonly kind: 'off_ladder'; readonly teamId: number; readonly positionId: string }
  | { readonly kind: 'decider'; readonly teamId: number };

/**
 * Where every employed person sits, by person id: a roster, a job row, an off-ladder seat, or the team's
 * owner, athletic director or president. A person in two seats keeps the first found in that order.
 */
export function seats(world: LiveWorld): Map<number, Seat> {
  const out = new Map<number, Seat>();
  for (const [teamId, ids] of [...world.rosters].sort((a, b) => a[0] - b[0])) for (const id of ids) if (!out.has(id)) out.set(id, { kind: 'player', teamId });
  for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) if (j.holderPersonId !== null && !out.has(j.holderPersonId)) out.set(j.holderPersonId, { kind: 'job', teamId: j.teamId, job: j });
  for (const s of [...world.offLadder.values()].sort((a, b) => a.seatId - b.seatId)) {
    if (s.holderPersonId !== null && !out.has(s.holderPersonId)) out.set(s.holderPersonId, { kind: 'off_ladder', teamId: s.teamId, positionId: s.positionId });
  }
  for (const t of world.teams) {
    for (const id of [t.ownerPersonId, t.athleticDirectorPersonId, t.presidentPersonId]) if (id !== null && !out.has(id)) out.set(id, { kind: 'decider', teamId: t.id });
  }
  return out;
}

/** The person a job reports to: the holder of the nearest held seat up the chart, or null at the top. */
export function bossOf(world: LiveWorld, job: JobRecord): number | null {
  let up = job.reportsToJobId;
  for (let hops = 0; up !== null && hops < 20; hops++) {
    const j = world.jobs.get(up);
    if (!j) return null;
    if (j.holderPersonId !== null) return j.holderPersonId;
    up = j.reportsToJobId;
  }
  return null;
}

/** The position group a coaching seat teaches, or null (position coaches only: `pos:position_coach.<group>`). */
export function taughtGroup(job: JobRecord): string | null {
  const m = /^pos:position_coach\.([a-z]+)$/.exec(job.positionId);
  return m ? m[1]!.toUpperCase() : null;
}

// ---------- starters ----------

/**
 * The season's starters, by the same rule the development step uses (D7.7.1 role, M2 stand-in): on each
 * roster, the top share of each position's mix count by the team's observed grade. Truth is read only
 * through the turnover grade context.
 */
export function startersOf(world: LiveWorld, b: TurnoverBinding): Set<number> {
  const grades = gradeContext(world, rosteredSet(world));
  const starters = new Set<number>();
  for (const [teamId, ids] of [...world.rosters].sort((a, c) => a[0] - c[0])) {
    if (!isActive(world, teamId)) continue;
    const targets = positionTargets(specOf(b, world, teamId));
    const byPos = new Map<string, number[]>();
    for (const id of ids) {
      const pos = world.people.get(id)?.playing?.position;
      if (pos) { const l = byPos.get(pos); if (l) l.push(id); else byPos.set(pos, [id]); }
    }
    for (const [pos, list] of byPos) {
      const keep = Math.ceil((targets[pos] ?? 0) * turnoverParam('role.starterShareOfMix'));
      [...list].sort((x, y) => grades.grade(teamId, y) - grades.grade(teamId, x) || x - y).slice(0, keep).forEach((id) => starters.add(id));
    }
  }
  return starters;
}

// ---------- records ----------

/** Regular-season wins, losses and ties per team from the games played so far this season. */
export function recordsSoFar(world: LiveWorld): Map<number, { wins: number; losses: number; ties: number }> {
  const out = new Map<number, { wins: number; losses: number; ties: number }>();
  const line = (id: number) => { let l = out.get(id); if (!l) { l = { wins: 0, losses: 0, ties: 0 }; out.set(id, l); } return l; };
  for (const g of world.results) {
    if (g.kind !== 'regular') continue;
    const h = line(g.homeTeamId), a = line(g.awayTeamId);
    if (g.homePoints === g.awayPoints) { h.ties++; a.ties++; } else if (g.homePoints > g.awayPoints) { h.wins++; a.losses++; } else { a.wins++; h.losses++; }
  }
  return out;
}

/** Win rate with ties as half (C3 standings convention), or null with no games. */
export function winRate(l: { wins: number; losses: number; ties: number } | undefined): number | null {
  if (!l) return null;
  const n = l.wins + l.losses + l.ties;
  return n === 0 ? null : (l.wins + 0.5 * l.ties) / n;
}

// ---------- the X7 pair context ----------

const facet = (p: PersonRecord | undefined, name: string): number | null =>
  (p && p.origin === 'generated' ? p.traitBlock.facets[name] ?? null : null);

function fitPerson(p: PersonRecord | undefined, id: number): relationships.FitPerson {
  return { id, origin: p?.origin ?? 'generated', protected: p?.origin === 'imported', facets: p && p.origin === 'generated' ? p.traitBlock.facets : {} };
}

/**
 * Fit, sociability and loyalty over the world (X7.2.1, X7.1.1 rule 4, X7.2.2 rule 2). The pair term is drawn
 * once per pair from the world seed on the `pair.chemistry` stream keyed by the two ids only, so it is the
 * same pair term in every season and every step.
 */
export function pairContext(world: LiveWorld): relationships.PairContext {
  const pairDraw: relationships.PairDraw = (lo, hi) => stream(world.seed, 'pair.chemistry', [lo, hi]).uniform();
  return {
    fitOf: (a, b) => relationships.fit({ a: fitPerson(world.people.get(a), a), b: fitPerson(world.people.get(b), b), role: 'peers', pairDraw }),
    sociabilityOf: (id) => facet(world.people.get(id), 'sociability'),
    loyaltyOf: (id) => facet(world.people.get(id), 'loyalty'),
    userId: world.userPersonId,
  };
}
