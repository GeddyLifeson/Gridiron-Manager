// The emergency ("ready") list (M3.2.1) and workouts and tryouts (M3.3.1). Pro only: a level whose rules
// carry no practice squad and no free agent pool hides both (M3.7.1); the caller tests that by key.
import { P } from './params.ts';
import type { Graded, JobId } from './types.ts';

export type Availability = 'street' | 'other_practice_squad' | 'own_practice_squad';

export interface ReadyCandidate {
  readonly personId: number;
  readonly job: JobId;
  /** The club's graded fit at the job (M1.2.1), from the board. */
  readonly grade: Graded;
  readonly age: number;
  readonly lastClubId: number | null;
  readonly availability: Availability;
  /** Knows this system's terminology family (G4): same family 1, a similar one partway, none 0. */
  readonly systemKnowledge: number;
  /** Weeks unsigned, for street conditioning decay. */
  readonly weeksUnsigned: number;
  /** Other jobs he can fill (M1.2.2 versatility). */
  readonly extraJobs: number;
  /** False when he may not sign now: suspended, or a protected practice squad player inside the window. */
  readonly eligible: boolean;
  readonly lastWorkoutDay: number | null;
}

/** Street conditioning (rule 2): readiness decays a starting 2 percent per week unsigned to a floor. */
export function conditioning(c: Pick<ReadyCandidate, 'availability' | 'weeksUnsigned'>): number {
  if (c.availability !== 'street') return 1;
  return Math.max(P.readyConditioningFloor, 1 - P.readyConditioningDecayPerWeek * c.weeksUnsigned);
}

/**
 * Projected contribution in the next 4 games (rule 2): grade adjusted for system knowledge (a quarterback
 * column weights it double, edge case), conditioning and position flexibility.
 */
export function contribution(c: ReadyCandidate, quarterback: boolean): number {
  const gap = (1 - Math.min(1, Math.max(0, c.systemKnowledge))) * P.readyUnfamiliarCost * (quarterback ? P.readyQbKnowledgeWeight : 1);
  const flex = 1 + P.readyFlexBonus * Math.max(0, c.extraJobs);
  return c.grade.mean * Math.max(0, 1 - gap) * conditioning(c) * flex;
}

export interface ReadyColumn {
  readonly job: JobId;
  readonly names: readonly ReadyCandidate[];
  readonly thinMarket: boolean;
  /** Specialist column whose names lack a workout inside the window (edge case). */
  readonly staleWorkouts: boolean;
}

export interface ReadyListInput {
  readonly pool: readonly ReadyCandidate[];
  readonly jobs: readonly JobId[];
  readonly quarterbackJobs: readonly JobId[];
  readonly specialistJobs: readonly JobId[];
  readonly today: number;
}

/**
 * The department's list (rules 1 to 3), rebuilt weekly and after any move that removes a name. A name
 * who may not sign never appears (acceptance). Each column keeps a starting 3 to 5 names; one with fewer
 * than 2 real options is "thin market" on the needs board. A specialist column needs a starting 2 names
 * with a workout inside 6 weeks.
 */
export function buildReadyList(input: ReadyListInput): ReadyColumn[] {
  return [...input.jobs].sort().map((job) => {
    const qb = input.quarterbackJobs.includes(job);
    const names = input.pool.filter((c) => c.job === job && c.eligible)
      .map((c) => ({ c, v: contribution(c, qb) }))
      .sort((a, b) => b.v - a.v || a.c.personId - b.c.personId)
      .slice(0, P.readyColumnMax).map((x) => x.c);
    const specialist = input.specialistJobs.includes(job);
    const fresh = names.filter((n) => n.lastWorkoutDay !== null && input.today - n.lastWorkoutDay <= P.specialistWorkoutMaxDays).length;
    return { job, names, thinMarket: names.length < P.readyThinMarketMin, staleWorkouts: specialist && fresh < P.specialistMinNames };
  });
}

/** A signing anywhere removes the name from every club's list the same day (acceptance). */
export function removeSigned(lists: Readonly<Record<string, readonly ReadyColumn[]>>, personId: number): Record<string, ReadyColumn[]> {
  const out: Record<string, ReadyColumn[]> = {};
  for (const [club, cols] of Object.entries(lists)) {
    out[club] = cols.map((col) => {
      const names = col.names.filter((n) => n.personId !== personId);
      return { ...col, names, thinMarket: names.length < P.readyThinMarketMin };
    });
  }
  return out;
}

export type CoachMark = { readonly kind: 'strike'; readonly personId: number; readonly reason: string } | { readonly kind: 'star'; readonly personId: number };

export interface CoachOrder { readonly job: JobId; readonly order: readonly number[]; readonly marks: readonly CoachMark[] }

/**
 * The club's order for a column (rule 4): with roster say the coach's order (struck names out, starred
 * first) and the personnel man's order shown as advice; without it the department's order stands and the
 * coach's is a logged preference K7 weighs (M3.6.2). Both orders are returned when they differ.
 */
export function clubOrder(column: ReadyColumn, coach: CoachOrder | null, rosterSay: boolean): { club: number[]; department: number[]; coach: number[] | null; differ: boolean } {
  const department = column.names.map((n) => n.personId);
  if (!coach) return { club: department, department, coach: null, differ: false };
  const struck = new Set(coach.marks.filter((m) => m.kind === 'strike').map((m) => m.personId));
  const starred = coach.marks.filter((m) => m.kind === 'star').map((m) => m.personId);
  const base = [...coach.order, ...department.filter((id) => !coach.order.includes(id))].filter((id) => department.includes(id) && !struck.has(id));
  const mine = [...starred.filter((id) => base.includes(id)), ...base.filter((id) => !starred.includes(id))];
  const differ = mine.length !== department.length || mine.some((id, i) => department[i] !== id);
  return { club: rosterSay ? mine : department, department, coach: mine, differ };
}

/** Cost note for a practice squad signing (rule 5): the 53 spot and the weeks of pay owed (C5.3.3, by key). */
export function signingCost(c: Pick<ReadyCandidate, 'availability'>, poachPayWeeks: number): { rosterSpot: boolean; guaranteedWeeks: number } {
  return { rosterSpot: true, guaranteedWeeks: c.availability === 'other_practice_squad' ? poachPayWeeks : 0 };
}

// ---------- M3.3.1 workouts ----------

export type WorkoutTest = 'movement' | 'position' | 'board' | 'medical';
export type TraitGroup = 'athletic' | 'conditioning' | 'learning' | 'medical' | 'in_pads';

/** What a workout shows, by trait group, as an evidence noise sd in ISS (rule 2). In-pads play is barely seen. */
export function workoutEvidence(tests: readonly WorkoutTest[]): { group: TraitGroup; noiseSd: number }[] {
  const out: { group: TraitGroup; noiseSd: number }[] = [];
  if (tests.includes('movement')) out.push({ group: 'athletic', noiseSd: P.workoutAthleticNoiseSd });
  out.push({ group: 'conditioning', noiseSd: P.workoutConditioningNoiseSd });
  if (tests.includes('board')) out.push({ group: 'learning', noiseSd: P.workoutLearningNoiseSd });
  if (tests.includes('position')) out.push({ group: 'in_pads', noiseSd: P.workoutInPadsNoiseSd });
  return out;
}

/** The D6.1.1 update of a band by one piece of evidence of known noise (variance only; the mean comes from G-19). */
export function narrowed(g: Graded, noiseSd: number): Graded {
  const n = noiseSd * noiseSd;
  return { mean: g.mean, variance: n > 0 ? (g.variance * n) / (g.variance + n) : 0 };
}

/** Willingness to come again (rule 4): minus a starting 20 percent for each workout past the second without a contract. */
export function workoutWillingness(timesWorkedOutUnsigned: number): number {
  const extra = Math.max(0, timesWorkedOutUnsigned - P.workoutRepeatFree + 1);
  return Math.max(0, 1 - P.workoutRepeatPenalty * extra);
}

export type Attendee = { readonly kind: 'head_coach' } | { readonly kind: 'position_coach'; readonly staffId: number };

export interface WorkoutPlan {
  readonly day: number;
  readonly clubId: number;
  readonly players: readonly number[];
  readonly tests: readonly WorkoutTest[];
  readonly attendee: Attendee;
}

/**
 * Checks and costs a workout: group size against the starting 3 to 6 (a warning, not a bar), the head
 * coach's hours when he attends (rule 3, charged to E7), and the wire entries the same day (rule 6).
 */
export function runWorkout(plan: WorkoutPlan): { warnings: string[]; headCoachHours: number; wire: { dayIndex: number; clubId: number; personId: number; kind: 'worked_out_for' }[] } {
  const warnings: string[] = [];
  if (plan.players.length < P.workoutGroupMin || plan.players.length > P.workoutGroupMax) warnings.push(`group of ${plan.players.length} (starting ${P.workoutGroupMin} to ${P.workoutGroupMax})`);
  return {
    warnings,
    headCoachHours: plan.attendee.kind === 'head_coach' ? P.workoutHeadCoachHours : 0,
    wire: [...plan.players].sort((a, b) => a - b).map((personId) => ({ dayIndex: plan.day, clubId: plan.clubId, personId, kind: 'worked_out_for' as const })),
  };
}

/**
 * The workout day (rule 1, edge case): the players' day off (Tuesday in a normal week, C11.2.3) unless the
 * week is short, when it moves to the day after the game. Another day costs field and staff time.
 */
export function workoutDay(lastGameDay: number, nextGameDay: number, playersDayOff: number, normalWeekDays: number): number {
  return nextGameDay - lastGameDay < normalWeekDays ? lastGameDay + 1 : playersDayOff;
}
