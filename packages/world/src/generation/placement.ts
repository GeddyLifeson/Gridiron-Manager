// X10.4: placing people into a finished world. Imported real people arrive only after the history run,
// on the career start date, with events of `source: import`, so the history-run log stays untouched and
// no invented past is written onto them (X14.4.2). Which team each imported person goes to is G-42's
// shuffle (people `importing.placePlayers`, `placeCoaches`); this file applies those assignments.
import type { PersonRecord, WorldDate } from '@gm/schema';
import { IMPORT_PLACED, RELEASED, USER_BACKGROUND } from '../loop/events.ts';
import { historyRunScan } from '../loop/history.ts';
import type { LiveWorld } from '../loop/types.ts';

export type PlacementKind = 'boss' | 'head_coach' | 'assistant' | 'player';
/** X10.4.1 rule 1: staffs first (owners and executives, head coaches, assistants), then players. */
export const PLACEMENT_ORDER: readonly PlacementKind[] = ['boss', 'head_coach', 'assistant', 'player'];
export const FREE_AGENT_POOL = 'free_agents';
export const COACH_POOL = 'coach_pool';

export interface Placement {
  readonly person: PersonRecord;
  readonly kind: PlacementKind;
  /** Null sends the person to the free pool (a pack larger than the world's places). */
  readonly teamId: number | null;
  /** For staff: the seat (job id) he takes. For a boss: the chair. */
  readonly jobId?: number;
  readonly bossChair?: 'ownerPersonId' | 'athleticDirectorPersonId' | 'presidentPersonId';
}

export interface PlacementPorts {
  /** Roster limit of a team on the career start date (C5, T5). */
  readonly rosterLimit: (teamId: number) => number;
  /** Value of a generated player at his position on that team (D valuation), for rule 2. */
  readonly playerValue: (personId: number) => number;
  /** Position group of a player, so an imported player displaces someone at his own position. */
  readonly groupOf: (p: PersonRecord) => string;
}

export interface PlacementReport {
  readonly placed: number;
  readonly displaced: readonly number[];
  readonly toFreePools: readonly number[];
  readonly problems: readonly string[];
}

const fullName = (p: PersonRecord): string => `${p.name.first} ${p.name.last} ${p.name.suffix ?? ''}`.trim().toLowerCase();

/** D13.5.2 before placement: generated people who share a full name with an imported one. Must be empty. */
export function nameCollisions(world: LiveWorld, incoming: readonly PersonRecord[]): number[] {
  const names = new Set(incoming.map(fullName));
  return [...world.people.values()].filter((p) => p.origin === 'generated' && names.has(fullName(p))).map((p) => p.id).sort((a, b) => a - b);
}

/** X10.4.1: apply the placements on the career start date. */
export function placeImported(world: LiveWorld, placements: readonly Placement[], ports: PlacementPorts): PlacementReport {
  const problems: string[] = [];
  const displaced: number[] = [];
  const toFreePools: number[] = [];
  const date: WorldDate = world.date;
  const emit = (type: string, personId: number, teamId: number | null, payload: Record<string, string | number | null>): void => {
    const r = world.log.emit({ type, date, teamId, subjects: [{ kind: 'person', id: personId }], payload, witnesses: { kind: 'public' }, tier: 3, source: 'import' });
    if (!r.ok) throw new Error(`${type} refused for person ${personId}: ${r.reason}`);
  };
  const pool = (name: string): number[] => { const p = world.pools.get(name) ?? []; world.pools.set(name, p); return p; };
  const release = (personId: number, teamId: number, poolName: string): void => {
    displaced.push(personId);
    pool(poolName).push(personId);
    emit(RELEASED, personId, teamId, { reason: 'displaced_by_import' });
  };
  for (const c of nameCollisions(world, placements.map((p) => p.person))) problems.push(`generated person ${c} shares a full name with an imported person (D13.5.2)`);

  const ordered = [...placements].sort((a, b) => PLACEMENT_ORDER.indexOf(a.kind) - PLACEMENT_ORDER.indexOf(b.kind) || (a.teamId ?? 0) - (b.teamId ?? 0) || a.person.id - b.person.id);
  let placed = 0;
  for (const pl of ordered) {
    const p = pl.person;
    if (p.origin !== 'imported') { problems.push(`person ${p.id} is not an imported person`); continue; }
    if (world.people.has(p.id)) { problems.push(`person id ${p.id} is already in the world`); continue; }
    world.people.set(p.id, p);
    world.status.set(p.id, 'active');
    const team = pl.teamId === null ? undefined : world.teams.find((t) => t.id === pl.teamId);
    if (!team) { toFreePools.push(p.id); pool(pl.kind === 'player' ? FREE_AGENT_POOL : COACH_POOL).push(p.id); continue; }
    let out: number | null = null;
    if (pl.kind === 'player') {
      const roster = world.rosters.get(team.id) ?? [];
      // Rule 2: at the limit, the generated player with the lowest value at that position leaves.
      if (roster.length >= ports.rosterLimit(team.id)) {
        const generated = roster.filter((id) => world.people.get(id)?.origin === 'generated');
        const same = generated.filter((id) => ports.groupOf(world.people.get(id)!) === ports.groupOf(p));
        const from = same.length > 0 ? same : generated;
        if (from.length === 0) { toFreePools.push(p.id); pool(FREE_AGENT_POOL).push(p.id); continue; }
        out = [...from].sort((a, b) => ports.playerValue(a) - ports.playerValue(b) || a - b)[0]!;
        roster.splice(roster.indexOf(out), 1);
        release(out, team.id, FREE_AGENT_POOL);
      }
      roster.push(p.id);
      world.rosters.set(team.id, roster);
    } else if (pl.kind === 'boss') {
      const chair = pl.bossChair ?? 'ownerPersonId';
      out = team[chair];
      team[chair] = p.id;
      if (out !== null) release(out, team.id, COACH_POOL);
    } else {
      const job = pl.jobId === undefined ? undefined : world.jobs.get(pl.jobId);
      if (!job || job.teamId !== team.id) { problems.push(`person ${p.id}: seat ${pl.jobId} is not on team ${team.id}`); toFreePools.push(p.id); pool(COACH_POOL).push(p.id); continue; }
      out = job.holderPersonId;
      if (out !== null && world.people.get(out)?.origin === 'imported') { problems.push(`seat ${job.id} already holds an imported person`); toFreePools.push(p.id); pool(COACH_POOL).push(p.id); continue; }
      world.jobs.set(job.id, { ...job, holderPersonId: p.id, holderSince: date, vacantSince: null });
      if (out !== null) release(out, team.id, COACH_POOL);
    }
    emit(IMPORT_PLACED, p.id, team.id, { kind: pl.kind, displaced: out });
    placed++;
  }
  // Rule 3: no team over its limit at career start.
  for (const t of world.teams) {
    const n = (world.rosters.get(t.id) ?? []).length;
    if (n > ports.rosterLimit(t.id)) problems.push(`team ${t.id} has ${n} players, limit ${ports.rosterLimit(t.id)}`);
  }
  // X14.4.2 scan: no history-run event names an imported person.
  const scan = historyRunScan(world);
  if (scan.length > 0) problems.push(`${scan.length} history-run events name an imported person (first ${scan[0]})`);
  const released = world.log.ofType(RELEASED).filter((e) => e.source === 'import').length;
  if (released !== displaced.length) problems.push(`released events (${released}) do not match displaced people (${displaced.length})`);
  return { placed, displaced, toFreePools, problems };
}

// ---------- X10.4.2: placing the user ----------

export interface BackgroundFact {
  /** 'played', 'studied', 'worked'... a plain fact kind from E1. */
  readonly kind: string;
  readonly seasonYear: number;
  /** Team he was with, if the fact names one. */
  readonly teamId: number | null;
}

export interface UserPlacement {
  /** People who were on the same team in a season inside the run: ordinary X7 edges for G-24 to create. */
  readonly edges: readonly { readonly otherId: number; readonly kind: 'teammate' | 'coached'; readonly seasonYear: number; readonly teamId: number }[];
  readonly eventIds: readonly number[];
}

/**
 * Put the user into the world as one more person with a past and no standing (X10.4.2). Background years
 * inside the history run link to the generated people who were there (the loop keeps each season's
 * rosters and staffs); years before the world's first season are plain facts with no edges. No label is granted.
 * The log keeps simulation order (X2.1.1 rule 4), so each fact is logged on the start date and carries
 * its season in the payload.
 */
export function placeUser(world: LiveWorld, user: PersonRecord, background: readonly BackgroundFact[]): UserPlacement {
  if (user.origin !== 'user') throw new Error('placeUser: the record must have origin user (X10.4.2)');
  if (world.userPersonId !== null) throw new Error('placeUser: this world already has its user');
  if (world.people.has(user.id)) throw new Error(`placeUser: person id ${user.id} is taken`);
  world.people.set(user.id, user);
  world.status.set(user.id, 'active');
  world.userPersonId = user.id;
  const first = world.setup.firstSeasonYear;
  const edges: UserPlacement['edges'][number][] = [];
  const eventIds: number[] = [];
  for (const fact of [...background].sort((a, b) => a.seasonYear - b.seasonYear || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))) {
    const inWorld = fact.seasonYear >= first && fact.seasonYear < world.date.seasonYear;
    const r = world.log.emit({
      type: USER_BACKGROUND, date: world.date, teamId: fact.teamId, actors: [{ personId: user.id, role: 'subject' }],
      payload: { kind: fact.kind, season: fact.seasonYear, in_world: inWorld }, witnesses: { kind: 'public' }, tier: 1, source: 'user',
    });
    if (!r.ok) throw new Error(`user_background refused: ${r.reason}`);
    eventIds.push(r.event.id);
    if (!inWorld || fact.teamId === null) continue;
    for (const id of world.rosterSeasons.get(`${fact.seasonYear}:${fact.teamId}`) ?? []) {
      if (world.people.get(id)?.origin === 'generated') edges.push({ otherId: id, kind: 'teammate', seasonYear: fact.seasonYear, teamId: fact.teamId });
    }
    for (const s of world.staffSeasons) {
      if (s.seasonYear !== fact.seasonYear || s.teamId !== fact.teamId) continue;
      for (const id of [s.headCoachId, ...s.staffIds]) if (id !== null && world.people.get(id)?.origin === 'generated') edges.push({ otherId: id, kind: 'coached', seasonYear: s.seasonYear, teamId: s.teamId });
    }
  }
  return { edges, eventIds };
}
