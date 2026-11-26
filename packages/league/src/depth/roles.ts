// M2.6.1 role statements and role talks: the role label each player has from his planned share and unit
// jobs, role-change events, delivery costs, and the promise a stated condition creates (L1 keeps it).
import { P } from './params.ts';
import type { DepthChart, DepthPerson } from './types.ts';

export type RoleLabel = 'starter' | 'rotation' | 'package_specialist' | 'core_special_teams' | 'developmental' | 'scout_team';

export interface RoleInput {
  readonly person: DepthPerson;
  /** Planned share of his side's snaps, the best over his jobs (M2.3.1). */
  readonly plannedShare: number;
  /** Named in a package or situational role (M2.2). */
  readonly packageOrSituational: boolean;
  /** Core special teams units he is first on (M2.4.1). */
  readonly coreUnitsFirst: number;
  readonly active: boolean;
  /** Inactive most weeks this season (scout team). */
  readonly inactiveMostWeeks: boolean;
}

/** Role label from the thresholds of rule 1, checked from the top. */
export function roleOf(r: RoleInput): RoleLabel {
  if (r.person.practiceSquad === true) return 'scout_team';
  if (r.plannedShare >= P('roles.starterShare')) return 'starter';
  if (r.plannedShare >= P('roles.rotationShare')) return 'rotation';
  if (r.packageOrSituational) return 'package_specialist';
  if (r.coreUnitsFirst >= P('roles.coreUnitsForSpecialTeamsRole')) return 'core_special_teams';
  if (r.active) return 'developmental';
  if (r.inactiveMostWeeks && r.person.service >= P('roles.developmentalMaxService')) return 'scout_team';
  return 'developmental';
}

export type Delivery = 'head_coach' | 'position_coach' | 'none';

export interface RoleChangeEvent {
  readonly personId: number;
  readonly from: RoleLabel;
  readonly to: RoleLabel;
  /** Why the event exists: a threshold crossed, a job lost, or a starter moved down at a job. */
  readonly cause: 'threshold' | 'lost_job' | 'demoted';
  /** Jobs he was first at before and is not now (`unitId/job`). */
  readonly lostFirsts: readonly string[];
  /** Must be resolved by the coach before this practice (acceptance). */
  readonly dueBefore: 'next_practice';
  readonly deliveries: readonly Delivery[];
}

const DELIVERIES: readonly Delivery[] = ['head_coach', 'position_coach', 'none'];

function firsts(chart: DepthChart): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const [unitId, jobs] of Object.entries(chart.units)) {
    for (const [job, ids] of Object.entries(jobs)) {
      const f = ids[0];
      if (f === undefined) continue;
      if (!out.has(f)) out.set(f, new Set());
      out.get(f)!.add(`${unitId}/${job}`);
    }
  }
  return out;
}

/**
 * Role-change events between two charts (rule 2): a move across a threshold, or loss of a first place at
 * any job (which covers a starter moved to second, and losing a package or core unit job).
 */
export function roleChanges(before: DepthChart, after: DepthChart, roleBefore: ReadonlyMap<number, RoleLabel>, roleAfter: ReadonlyMap<number, RoleLabel>): RoleChangeEvent[] {
  const fb = firsts(before), fa = firsts(after);
  const ids = [...new Set([...roleBefore.keys(), ...roleAfter.keys(), ...fb.keys()])].sort((a, b) => a - b);
  const out: RoleChangeEvent[] = [];
  for (const id of ids) {
    const from = roleBefore.get(id), to = roleAfter.get(id);
    const lost = [...(fb.get(id) ?? [])].filter((k) => !(fa.get(id)?.has(k) ?? false)).sort();
    const demotedAtJob = lost.some((k) => {
      const [unitId, job] = [k.slice(0, k.lastIndexOf('/')), k.slice(k.lastIndexOf('/') + 1)];
      return (after.units[unitId]?.[job] ?? []).includes(id);
    });
    if (from === undefined || to === undefined) continue;
    if (from === to && lost.length === 0) continue;
    const cause = from !== to ? 'threshold' : demotedAtJob ? 'demoted' : 'lost_job';
    out.push({ personId: id, from, to, cause, lostFirsts: lost, dueBefore: 'next_practice', deliveries: DELIVERIES });
  }
  return out;
}

export interface TalkOutcome {
  /** Head coach minutes spent (E7). */
  readonly coachMinutes: number;
  /** How the player learned it; L1 prices trust from this. */
  readonly learnedFrom: 'head_coach' | 'position_coach' | 'chart' | 'media';
}

/** Rule 3 and 5: a change published on the public chart before the talk counts as learned from the media. */
export function talkOutcome(delivery: Delivery, publishedBeforeTalk: boolean): TalkOutcome {
  if (publishedBeforeTalk) return { coachMinutes: 0, learnedFrom: 'media' };
  if (delivery === 'head_coach') return { coachMinutes: P('roles.inPersonMinutes'), learnedFrom: 'head_coach' };
  if (delivery === 'position_coach') return { coachMinutes: 0, learnedFrom: 'position_coach' };
  return { coachMinutes: 0, learnedFrom: 'chart' };
}

export interface RolePromise {
  readonly personId: number;
  /** The stated condition in the coach's words ("win the job back in practice"). */
  readonly condition: string;
  /** World day the promise is reviewed. */
  readonly reviewOn: number;
}

/** Rule 4: a stated condition creates a promise with a review date; a vague message creates none. */
export function promiseFromTalk(personId: number, condition: string | null, reviewOn: number | null): RolePromise | null {
  if (condition === null || condition.trim() === '' || reviewOn === null) return null;
  return { personId, condition, reviewOn };
}
