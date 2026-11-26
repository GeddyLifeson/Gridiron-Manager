// X13.1.1 tier membership: who is near the user today. A pure function of the world and of what the
// user's own systems say (schedule, boards, edges, memory, the market slice), which arrive as ports
// because other modules own them. Nothing here reads or writes how anyone is simulated.
import type { WorldTier } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import { param } from './params.ts';

export type TeamReason = 'user_team' | 'scouted' | 'competition' | 'schedule' | 'watched_employee';
export type PersonReason = 'user_team' | 'tier1_edge' | 'scouted' | 'near_team' | 'user_edge' | 'user_memory' | 'board' | 'market';
/** X13.2.2 rule 4: reasons that come and go inside a few weeks, so the demotion hold applies. */
export const SHORT_REASONS: ReadonlySet<string> = new Set<TeamReason | PersonReason>(['scouted']);

export type CompetitionScope = 'competition' | 'conference';

export interface Edge { readonly otherId: number; readonly strength: number }

/** What the tier pass needs from the systems that own it (S, C2, T, X6, X7, O4, T4, M4, K7, H2). */
export interface TierInputs {
  /** The user's team or program. Null when he is out of work (X13.1.1 edge case). */
  readonly userTeamId: number | null;
  /**
   * What "his competition" means for his team (X13.1.1 rule 2, P6.4.1 "his league or conference"). The
   * caller reads it from the league rules of that competition (P1.3.3), never from the level.
   */
  readonly scope: CompetitionScope;
  /** Opponents on this season's schedule, late announcements included, and next season's (P6.4.1). */
  readonly scheduleThisSeason: readonly number[];
  readonly scheduleNextSeason: readonly number[];
  /** Opponents whose personnel H2 scouting needs now (X13.1.1 rule 1). */
  readonly scoutedTeamIds: readonly number[];
  /** Watch list, recruiting board and draft board (O4, T4, M4, and the hiring lists of E2 and L4). */
  readonly boardPersonIds: readonly number[];
  /** K7 market slice: holders of jobs the user could take or lose to in the next hiring cycle. */
  readonly marketPersonIds: readonly number[];
  /** X7 edges of a person. */
  edges(personId: number): readonly Edge[];
  /** X6: the person holds a permanent memory of the user (X13.2.2 rule 3). */
  remembersUser(personId: number): boolean;
}

/** Inputs with nothing near: a world with no user (the history run). */
export const NO_USER: TierInputs = {
  userTeamId: null, scope: 'competition', scheduleThisSeason: [], scheduleNextSeason: [], scoutedTeamIds: [], boardPersonIds: [], marketPersonIds: [],
  edges: () => [], remembersUser: () => false,
};

export interface Placement<R extends string> { readonly tier: WorldTier; readonly reason: R }

/** Everyone and everything not listed is tier 3 (X13.1.1 rule 3). */
export interface Membership {
  readonly teams: ReadonlyMap<number, Placement<TeamReason>>;
  readonly people: ReadonlyMap<number, Placement<PersonReason>>;
}

/** Players, seat holders (off-ladder seats too) and the owner, athletic director and president of a team, in id order. */
export function teamMembers(world: LiveWorld, teamId: number): number[] {
  const ids = new Set<number>(world.rosters.get(teamId) ?? []);
  for (const j of world.jobs.values()) if (j.teamId === teamId && j.holderPersonId !== null) ids.add(j.holderPersonId);
  for (const s of world.offLadder.values()) if (s.teamId === teamId && s.holderPersonId !== null) ids.add(s.holderPersonId);
  const t = world.teams.find((x) => x.id === teamId);
  for (const id of [t?.ownerPersonId, t?.athleticDirectorPersonId, t?.presidentPersonId]) if (id !== null && id !== undefined) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}

/** Person id to the team he plays or works for. */
export function teamOfPeople(world: LiveWorld): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of world.teams) for (const id of teamMembers(world, t.id)) if (!out.has(id)) out.set(id, t.id);
  return out;
}

/**
 * The teams of the user's competition: the whole competition, or his conference. A team with no
 * conference (an independent) gets the whole competition.
 */
export function competitionScope(world: LiveWorld, teamId: number, scope: CompetitionScope): number[] {
  const team = world.teams.find((t) => t.id === teamId);
  if (!team) return [];
  const comp = world.competitions.find((c) => c.id === team.competitionId);
  if (!comp) return [];
  if (scope === 'conference') {
    const conf = world.conferences.find((c) => c.competitionId === comp.id && c.kind === 'conference' && c.teamIds.includes(teamId));
    if (conf) return [...conf.teamIds].sort((a, b) => a - b);
  }
  return [...comp.teamIds].sort((a, b) => a - b);
}

function place<R extends string>(m: Map<number, Placement<R>>, id: number, tier: WorldTier, reason: R): void {
  const cur = m.get(id);
  if (!cur || tier < cur.tier) m.set(id, { tier, reason });
}

/** X13.1.1 rules 1 to 4. No person or team is in two tiers: the nearest claim wins. */
export function computeMembership(world: LiveWorld, inputs: TierInputs): Membership {
  const teams = new Map<number, Placement<TeamReason>>();
  const people = new Map<number, Placement<PersonReason>>();
  const known = new Set(world.teams.map((t) => t.id));
  const alive = (id: number): boolean => world.people.has(id) && world.status.get(id) !== 'deceased';
  const user = world.userPersonId;
  const userTeam = inputs.userTeamId !== null && known.has(inputs.userTeamId) ? inputs.userTeamId : null;
  const teamOf = teamOfPeople(world);

  // Teams. The user's team is tier 1 whatever slice of it his job owns (rule 4).
  if (userTeam !== null) {
    place(teams, userTeam, 1, 'user_team');
    for (const id of competitionScope(world, userTeam, inputs.scope)) place(teams, id, 2, 'competition');
  }
  for (const id of inputs.scoutedTeamIds) if (known.has(id)) place(teams, id, 2, 'scouted');
  for (const id of [...inputs.scheduleThisSeason, ...inputs.scheduleNextSeason]) if (known.has(id)) place(teams, id, 2, 'schedule');
  for (const pid of inputs.boardPersonIds) {
    const t = teamOf.get(pid);
    if (t !== undefined) place(teams, t, 2, 'watched_employee');
  }

  // Tier 1 people: the user's building, the people they are tied to, and the personnel H2 is scouting.
  if (userTeam !== null) {
    const members = teamMembers(world, userTeam).filter(alive);
    for (const id of members) place(people, id, 1, 'user_team');
    const line = param('edge.tier1Line');
    for (const id of members) {
      for (const e of inputs.edges(id)) if (e.strength >= line && alive(e.otherId)) place(people, e.otherId, 1, 'tier1_edge');
    }
    for (const t of inputs.scoutedTeamIds) if (known.has(t)) for (const id of teamMembers(world, t).filter(alive)) place(people, id, 1, 'scouted');
  }

  // Tier 2 people.
  for (const [t, p] of [...teams].sort((a, b) => a[0] - b[0])) {
    if (p.tier === 2) for (const id of teamMembers(world, t).filter(alive)) place(people, id, 2, 'near_team');
  }
  if (user !== null) {
    const line = param('edge.userLine');
    for (const e of inputs.edges(user)) if (e.strength >= line && alive(e.otherId)) place(people, e.otherId, 2, 'user_edge');
  }
  for (const id of inputs.boardPersonIds) if (alive(id)) place(people, id, 2, 'board');
  for (const id of inputs.marketPersonIds) if (alive(id)) place(people, id, 2, 'market');
  if (user !== null) {
    for (const id of [...world.people.keys()].sort((a, b) => a - b)) {
      if (!people.has(id) && alive(id) && id !== user && inputs.remembersUser(id)) place(people, id, 2, 'user_memory');
    }
  }
  return { teams, people };
}
