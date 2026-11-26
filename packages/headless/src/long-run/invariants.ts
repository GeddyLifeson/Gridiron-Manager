// Q1.2.2 state invariants, checked at every week boundary of the long run (Q1.6.1). Each failure names
// the invariant, the command (the pass that ended at the boundary) and the state hash before it.
// Invariants whose state is not in the world yet are listed in `NOT_CHECKED` with the reason, never
// silently passed. Failures go back to the owning package (game-build-plan G-88 note).
import { protectedEventHits, type EventTypeLookup } from './protection.ts';
import type { Boundary, InvariantFailure, RosterLimits, WorldView } from './types.ts';

export const INVARIANTS = [
  'one_current_job', 'one_current_team', 'roster_limits', 'roster_points_at_person', 'game_two_teams_one_rule_set',
  'age_never_decreases', 'person_never_lost', 'dead_stays_dead', 'died_year_matches_status', 'no_dead_or_inactive_plays',
  'imported_protected_event', 'calendar_moves_forward',
] as const;
export type Invariant = (typeof INVARIANTS)[number];

/** Q1.2.2 rows the world does not hold yet, with where they are checked instead or who owes the state. */
export const NOT_CHECKED: readonly { readonly invariant: string; readonly reason: string }[] = [
  { invariant: 'depth_chart_slots', reason: 'no depth chart in the live world yet (M2, H6 own it); checked once a depth chart port is bound' },
  { invariant: 'money_conserved', reason: 'no contract payments or receipts in the live world yet (E3, E6 own them)' },
  { invariant: 'no_underived_label', reason: 'labels are never stored: PersonRecord is a strict schema and refuses a label field at write (X2, P3.2.2)' },
  { invariant: 'clock_down_distance_spot_in_range', reason: 'checked every tick inside the game by engine-game flow invariants; the world receives only the result' },
];

export interface CheckInput {
  readonly world: WorldView;
  readonly at: Boundary;
  readonly command: string;
  readonly hashBefore: string;
  readonly eventType: EventTypeLookup;
  readonly limits?: RosterLimits;
}

/**
 * Stateful checker: some invariants compare with what it saw at earlier boundaries (ages, the dead,
 * the calendar). One checker per run. Events are scanned once each, by id.
 */
export class InvariantChecker {
  private readonly birth = new Map<number, string>();
  private readonly dead = new Set<number>();
  private lastDate: { seasonYear: number; dayIndex: number } | null = null;
  private lastPasses = -1;
  private scannedThrough = 0;

  check(input: CheckInput): InvariantFailure[] {
    const { world, at, command, hashBefore } = input;
    const out: InvariantFailure[] = [];
    const fail = (invariant: Invariant, detail: string): void => { out.push({ invariant, at, command, hashBefore, detail }); };
    const teamIds = new Set(world.teams.map((t) => t.id));

    // One current job and one current team per person.
    const jobOf = new Map<number, number>();
    const teamsOf = new Map<number, Set<number>>();
    const addTeam = (pid: number, teamId: number): void => {
      const s = teamsOf.get(pid) ?? new Set<number>();
      s.add(teamId);
      teamsOf.set(pid, s);
    };
    for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) {
      if (j.holderPersonId === null) continue;
      const prev = jobOf.get(j.holderPersonId);
      if (prev !== undefined) fail('one_current_job', `person ${j.holderPersonId} holds jobs ${prev} and ${j.id}`);
      else jobOf.set(j.holderPersonId, j.id);
      addTeam(j.holderPersonId, j.teamId);
    }
    for (const [teamId, ids] of [...world.rosters].sort((a, b) => a[0] - b[0])) {
      if (!teamIds.has(teamId)) fail('roster_points_at_person', `roster of unknown team ${teamId}`);
      const seen = new Set<number>();
      for (const pid of ids) {
        if (seen.has(pid)) fail('one_current_team', `person ${pid} is on team ${teamId}'s roster twice`);
        seen.add(pid);
        if (!world.people.has(pid)) fail('roster_points_at_person', `team ${teamId} roster holds unknown person ${pid}`);
        addTeam(pid, teamId);
      }
      const max = input.limits?.maxFor(teamId, at);
      if (max !== undefined && ids.length > max) fail('roster_limits', `team ${teamId} has ${ids.length} on its roster, limit ${max}`);
    }
    for (const [pid, teams] of [...teamsOf].sort((a, b) => a[0] - b[0])) {
      if (teams.size > 1) fail('one_current_team', `person ${pid} is with teams ${[...teams].sort((a, b) => a - b).join(', ')}`);
    }

    // Every game has two different teams and one rule set.
    const comps = new Map(world.competitions.map((c) => [c.id, c]));
    for (const g of world.results) {
      const c = comps.get(g.competitionId);
      if (!c) { fail('game_two_teams_one_rule_set', `game ${g.gameId}: no competition ${g.competitionId}`); continue; }
      if (!c.ruleSetId) fail('game_two_teams_one_rule_set', `game ${g.gameId}: competition ${c.id} has no rule set`);
      if (g.homeTeamId === g.awayTeamId) fail('game_two_teams_one_rule_set', `game ${g.gameId}: team ${g.homeTeamId} plays itself`);
      for (const t of [g.homeTeamId, g.awayTeamId]) if (!teamIds.has(t)) fail('game_two_teams_one_rule_set', `game ${g.gameId}: unknown team ${t}`);
    }

    // Ages never decrease (birth dates never move); no person record is lost; the dead stay dead.
    for (const [pid, b] of this.birth) if (!world.people.has(pid)) fail('person_never_lost', `person ${pid} is gone from the world`);
    for (const p of world.people.values()) {
      const b = `${p.birthDate.seasonYear}:${p.birthDate.dayIndex}`;
      const was = this.birth.get(p.id);
      if (was === undefined) this.birth.set(p.id, b);
      else if (was !== b) fail('age_never_decreases', `person ${p.id} birth date moved from ${was} to ${b}`);
      const st = world.status.get(p.id);
      if (st === undefined) fail('died_year_matches_status', `person ${p.id} has no status`);
      if ((p.diedYear !== null) !== (st === 'deceased')) fail('died_year_matches_status', `person ${p.id}: died year ${p.diedYear}, status ${st}`);
      if (this.dead.has(p.id) && st !== 'deceased') fail('dead_stays_dead', `person ${p.id} was deceased and is now ${st}`);
      if (st === 'deceased') this.dead.add(p.id);
    }

    // No dead or inactive person plays or holds a seat.
    for (const pid of teamsOf.keys()) {
      const st = world.status.get(pid);
      if (st !== 'active') fail('no_dead_or_inactive_plays', `person ${pid} is ${st ?? 'unknown'} and still with a team`);
    }

    // No imported person holds a protected event (P3.2.2). New events only.
    const rows = world.log.rows();
    const fresh = rows.filter((e) => e.id > this.scannedThrough);
    for (const h of protectedEventHits(fresh, world.people, input.eventType)) fail('imported_protected_event', `person ${h.personId}: ${h.detail}`);
    for (const e of fresh) if (e.id > this.scannedThrough) this.scannedThrough = e.id;

    // The calendar and pass count only move forward.
    const d = world.date;
    if (this.lastDate && (d.seasonYear < this.lastDate.seasonYear || (d.seasonYear === this.lastDate.seasonYear && d.dayIndex < this.lastDate.dayIndex))) {
      fail('calendar_moves_forward', `date went back from ${this.lastDate.seasonYear}:${this.lastDate.dayIndex} to ${d.seasonYear}:${d.dayIndex}`);
    }
    if (world.passes <= this.lastPasses) fail('calendar_moves_forward', `pass count ${world.passes} did not rise from ${this.lastPasses}`);
    this.lastDate = { seasonYear: d.seasonYear, dayIndex: d.dayIndex };
    this.lastPasses = world.passes;
    return out;
  }
}
