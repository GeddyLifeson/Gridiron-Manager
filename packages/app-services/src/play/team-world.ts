// The generated world as the seat sees it, for the team screens of the career root (handoff item 2c): the
// world's tables are laid out as the save tables the observer filter reads (P3.2), so every read model gets
// an ObservedWorld and never the world itself (G-27, K9.1.1). Only tables the live world holds today are
// laid out; a table with no live store yet (contracts, injuries, depth charts, staff views) is empty, and
// the screens show "not evaluated" or nothing for it, never a guess.
import type { loop } from '@gm/world';
import type { JobRecord } from '@gm/schema';
import { ASSUMED_DEFAULT_SEAT_POLICY, ObservedWorld, tablesOf, type Observer } from '../observer/index.ts';

type LiveWorld = loop.LiveWorld;

/** The roster list every world player sits on until the roster engine (G-15) keeps lists in the world. */
export const WORLD_ROSTER_LIST = 'active';

/**
 * The live world's tables as save rows. Rows are the world's own objects; nothing is copied or changed.
 * `people`, when given, limits the people table to those ids (a team's circle), so a screen of one team
 * does not filter every person the history made.
 */
export function liveWorldTables(w: LiveWorld, people?: ReadonlySet<number>): Record<string, readonly unknown[]> {
  const since = { seasonYear: w.date.seasonYear, dayIndex: w.date.dayIndex };
  const rosterSlots: unknown[] = [];
  for (const [teamId, ids] of [...w.rosters].sort((a, b) => a[0] - b[0])) {
    for (const personId of ids) rosterSlots.push({ teamId, personId, list: WORLD_ROSTER_LIST, jersey: null, gameDayStatus: 'not_applicable', since });
  }
  return {
    world: [{ calendar: since, userPersonId: w.userPersonId }],
    competitions: w.competitions,
    conferences: w.conferences,
    venues: w.venues,
    teams: w.teams,
    cultures: [...w.cultures.values()],
    people: people ? [...people].sort((a, b) => a - b).flatMap((id) => { const p = w.people.get(id); return p ? [p] : []; }) : [...w.people.values()],
    jobs: [...w.jobs.values()],
    rosterSlots,
  };
}

/**
 * The observer of the user in the seat: the scopes the staff policy opens for the seat team's head coach
 * seat (ASSUMED_DEFAULT_SEAT_POLICY, a named assumption until S3 supplies the policy). The season session
 * puts the user in charge of the seat team's games, so the head coach seat is the one he reads through.
 */
export function seatObserver(w: LiveWorld, teamId: number, personId: number | null): Observer {
  const team = w.teams.find((t) => t.id === teamId);
  let head: JobRecord | undefined;
  for (const j of w.jobs.values()) if (j.teamId === teamId && (!head || j.rung > head.rung || (j.rung === head.rung && j.id < head.id))) head = j;
  const scopes = head ? [...ASSUMED_DEFAULT_SEAT_POLICY.staff(head, team)].sort() : ['team'];
  return { personId, teamScopes: { [String(teamId)]: scopes } };
}

/** A team's circle: its players, the holders of its staff seats, its owner, athletic director and president. */
export function teamCircle(w: LiveWorld, teamId: number): Set<number> {
  const ids = new Set<number>(w.rosters.get(teamId) ?? []);
  for (const j of w.jobs.values()) if (j.teamId === teamId && j.holderPersonId !== null) ids.add(j.holderPersonId);
  const t = w.teams.find((x) => x.id === teamId) as { ownerPersonId?: number | null; athleticDirectorPersonId?: number | null; presidentPersonId?: number | null } | undefined;
  for (const id of [t?.ownerPersonId, t?.athleticDirectorPersonId, t?.presidentPersonId]) if (typeof id === 'number') ids.add(id);
  return ids;
}

/** The seat team's world as the user may read it, people limited to the team's circle. Build it afresh after the world moves. */
export function seatObservedWorld(w: LiveWorld, teamId: number, personId: number | null): ObservedWorld {
  return new ObservedWorld(tablesOf(liveWorldTables(w, teamCircle(w, teamId))), seatObserver(w, teamId, personId));
}

interface RuleRow { readonly key: string; readonly value: unknown; readonly factId?: string }

/**
 * Roster list limits from the league rules file the season was built from (C5.1.1, T5): pro, the 53-man
 * active/inactive list (`roster.active_inactive_limit`) and the practice squad (`roster.practice_squad_size`);
 * college, the roster limit (`league.roster_limit`). A key missing from the file leaves that list unlimited.
 */
export function rosterLimits(leagueRules: { readonly values?: readonly RuleRow[] } | undefined, level: 'pro' | 'college'): Record<string, number | null> {
  const num = (key: string): number | null => {
    const v = leagueRules?.values?.find((r) => r.key === key)?.value;
    return typeof v === 'number' ? v : null;
  };
  return level === 'pro'
    ? { [WORLD_ROSTER_LIST]: num('roster.active_inactive_limit'), practice_squad: num('roster.practice_squad_size') }
    : { [WORLD_ROSTER_LIST]: num('league.roster_limit') };
}
