// Who is looking (P1.1.4 "the observer": a team, a staff, a rung; K9.1.1 "as his role allows").
// An observer is plain data, so it can be logged, compared and sent to a worker.
import type { JobRecord, RosterSlot, TeamRecord, GameRecord } from '@gm/schema';

/**
 * Parts of one team's private state a seat may read (K9.1.1 item 1). The world contract marks private
 * fields `own_team` or `observer_estimate`; the owner rules (./ownership.ts) say which part each belongs to.
 */
export const TEAM_SCOPES = ['team', 'evaluation', 'medical', 'hiring', 'governance', 'contracts', 'staff_file'] as const;
export type TeamScope = (typeof TEAM_SCOPES)[number];
/** Scope of a room-witnessed event (X2.1.2 witness rule `room`). */
export const roomScope = (roomKey: string) => `room:${roomKey}`;
export const ALL_SCOPES = '*';

export interface Observer {
  /** The person looking, or null for someone with public information only. */
  readonly personId: number | null;
  /** Team id (as a string key) to the scopes this person may read there. `*` means every scope and room. */
  readonly teamScopes: Readonly<Record<string, readonly string[]>>;
}

/** Sees the public record only (K9.1.1 item 2). */
export const PUBLIC_OBSERVER: Observer = Object.freeze({ personId: null, teamScopes: Object.freeze({}) });

export function hasScope(o: Observer, teamId: number, scope: string): boolean {
  const s = o.teamScopes[String(teamId)];
  return !!s && (s.includes(ALL_SCOPES) || s.includes(scope));
}

/** Rows of a world save by table name (WORLD_TABLES). The observer module never writes to it. */
export interface TableSource {
  rows(table: string): readonly unknown[];
}

/** What the owner rules need to know about the world beyond the row in hand. */
export interface WorldLookup {
  /** Teams where the person holds a seat or a roster slot. */
  teamsOfPerson(personId: number): readonly number[];
  /** The two team ids of a game, indexed by side, or null for an unknown game. */
  gameTeams(gameId: number): readonly [number, number] | null;
}

export const EMPTY_LOOKUP: WorldLookup = { teamsOfPerson: () => [], gameTeams: () => null };

export function lookupFrom(source: TableSource): WorldLookup {
  let byPerson: Map<number, Set<number>> | null = null;
  let games: Map<number, readonly [number, number]> | null = null;
  const people = () => {
    if (byPerson) return byPerson;
    const m = new Map<number, Set<number>>();
    const add = (p: number | null, t: number) => { if (p !== null) (m.get(p) ?? m.set(p, new Set()).get(p)!).add(t); };
    for (const j of source.rows('jobs') as JobRecord[]) add(j.holderPersonId, j.teamId);
    for (const r of source.rows('rosterSlots') as RosterSlot[]) add(r.personId, r.teamId);
    for (const t of source.rows('teams') as TeamRecord[]) { add(t.ownerPersonId, t.id); add(t.athleticDirectorPersonId, t.id); add(t.presidentPersonId, t.id); }
    return (byPerson = m);
  };
  return {
    teamsOfPerson: (id) => [...(people().get(id) ?? [])],
    gameTeams: (id) => {
      games ??= new Map((source.rows('games') as GameRecord[]).map((g) => [g.id, g.teamIds] as const));
      return games.get(id) ?? null;
    },
  };
}

/**
 * Which scopes a seat opens. The bible gives duties per seat in S3; until the S3 packages supply a
 * policy built from `JobRecord.dutyIds`, the default below is a NAMED ASSUMPTION, not a football fact:
 *  - a staff seat reads its team's football state (evaluations, medical estimates, hiring, expectations);
 *  - contract terms and staff files are read by executives and by the seats that hold final say (L5.2.1);
 *  - a player reads what the whole team is told, nothing more.
 */
export interface SeatPolicy {
  staff(job: JobRecord, team: TeamRecord | undefined): readonly string[];
  player(slot: RosterSlot): readonly string[];
  executive(team: TeamRecord): readonly string[];
}

export const ASSUMED_DEFAULT_SEAT_POLICY: SeatPolicy = {
  staff: (job, team) => {
    const base: string[] = ['team', 'evaluation', 'medical', 'hiring', 'governance', roomScope('staff')];
    const fs = team?.finalSay;
    if (fs && [fs.roster, fs.contracts, fs.draft, fs.staffHiring].includes(job.id)) base.push('contracts', 'staff_file');
    return base;
  },
  player: () => ['team', roomScope('locker_room')],
  executive: () => [ALL_SCOPES],
};

/** Builds the observer for one person from the seats, roster slots and executive posts he holds. */
export function observerFor(source: TableSource, personId: number, policy: SeatPolicy = ASSUMED_DEFAULT_SEAT_POLICY): Observer {
  const scopes = new Map<number, Set<string>>();
  const add = (teamId: number, list: readonly string[]) => {
    const s = scopes.get(teamId) ?? scopes.set(teamId, new Set()).get(teamId)!;
    for (const x of list) s.add(x);
  };
  const teams = new Map((source.rows('teams') as TeamRecord[]).map((t) => [t.id, t] as const));
  for (const j of source.rows('jobs') as JobRecord[]) if (j.holderPersonId === personId) add(j.teamId, policy.staff(j, teams.get(j.teamId)));
  for (const r of source.rows('rosterSlots') as RosterSlot[]) if (r.personId === personId) add(r.teamId, policy.player(r));
  for (const t of teams.values()) {
    if (t.ownerPersonId === personId || t.athleticDirectorPersonId === personId || t.presidentPersonId === personId) add(t.id, policy.executive(t));
  }
  const teamScopes: Record<string, readonly string[]> = {};
  for (const [id, s] of [...scopes].sort((a, b) => a[0] - b[0])) teamScopes[String(id)] = [...s].sort();
  return { personId, teamScopes };
}
