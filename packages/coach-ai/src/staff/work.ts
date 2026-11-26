// K6.3.1 staff work products and their quality. Most of what a head coach knows is made by his staff,
// so its quality comes from the people: each product is the K3 procedure that makes it for AI teams,
// run with this staff member's parameters. This file turns a person, his hours and his load into
// those parameters (the work order), decides whether the product is thin or late, and adds the bias
// of rule 4. Errors are never marked: the user finds them by doing the work (rule 5).
import type { Draws } from '../profile/index.ts';
import { P, byQuality, clamp, facetShare } from './params.ts';
import type { PreparationPort } from './ports.ts';
import type { Duty, StaffMember } from './types.ts';

export type HoursSetting = 'standard' | 'long' | 'all_in';

/** L4.3.5 hours per coach per week by the head coach's setting. A short week caps it (H1). */
export function weeklyHours(setting: HoursSetting, cap: number | null = null): number {
  const h = setting === 'standard' ? P('hours_standard') : setting === 'long' ? P('hours_long') : P('hours_all_in');
  return cap === null ? h : Math.min(h, cap);
}

/** L4.3.5: hours as work done. Past the threshold each added hour returns half as much. */
export function effectiveHours(hours: number): number {
  const knee = P('hours_half_return_over');
  return hours <= knee ? Math.max(0, hours) : knee + (hours - knee) * P('hours_return_past');
}

/** One duty's weekly demand on a person (S3.1.1 `hours_est`). */
export interface DutyLoad { readonly duty: Duty; readonly hoursEst: number }

export interface Workload {
  readonly hoursAvailable: number;
  readonly hoursNeeded: number;
  /** Hours his duties need beyond what he has (0 when covered). */
  readonly hoursOver: number;
  /** Share of his duties' hours he can cover, 0 to 1. */
  readonly coverage: number;
  /** Hours worked past the L4.3.5 threshold: what makes a coach tired. */
  readonly hoursPastKnee: number;
}

export function workload(hoursAvailable: number, loads: readonly DutyLoad[]): Workload {
  const hoursNeeded = loads.reduce((s, l) => s + Math.max(0, l.hoursEst), 0);
  const eff = effectiveHours(hoursAvailable);
  return {
    hoursAvailable, hoursNeeded, hoursOver: Math.max(0, hoursNeeded - eff),
    coverage: hoursNeeded <= 0 ? 1 : clamp(eff / hoursNeeded, 0, 1),
    hoursPastKnee: Math.max(0, hoursAvailable - P('hours_half_return_over')),
  };
}

/** K6.3.1 rule 2: the share of the product he delivers, by hours covered and `work_habits`. */
export function completeness(m: StaffMember, w: Workload): number {
  const habits = P('habits_completeness_floor') + (1 - P('habits_completeness_floor')) * facetShare(m.facets.workHabits);
  return clamp(w.coverage * habits, 0, 1);
}

/** Chance the product is late: never zero, never certain, rising as his duties outrun his hours. */
export function lateChance(m: StaffMember, w: Workload): number {
  const p = P('late_chance_floor') + P('late_chance_habits') * (1 - facetShare(m.facets.workHabits)) + P('late_chance_per_hour_over') * w.hoursOver;
  return clamp(p, P('late_chance_floor'), P('late_chance_cap'));
}

/** Chance one charted tag is wrong (K3.1.1 rule 3): his `evaluation`, worse when he is tired (L4.3.5). */
export function tagErrorChance(m: StaffMember, w: Workload): number {
  const base = byQuality(m.profile.behavior.evaluation, P('mislabel_max'), P('mislabel_min'));
  return clamp(base * (1 + P('tired_error_per_hour') * w.hoursPastKnee), 0, P('mislabel_cap'));
}

/**
 * The parameters a K3 procedure runs with for this person this week (K6.3.1 rule 1, K3.1.1 rules 1 to 4).
 * It is what G-74's procedures read in place of an AI team's staff values.
 */
export interface WorkOrder {
  readonly kind: string;
  readonly producerId: number;
  /** K3.1.1 rule 1: opponent games charted. */
  readonly gamesCharted: number;
  /** K3.1.1 rule 2: splits read, from 1 (down and distance only). */
  readonly splits: number;
  /** K3.1.1 rule 3: chance a charted tag is wrong. */
  readonly tagErrorChance: number;
  /** K3.1.1 rule 4: chance each existing tell is found. */
  readonly tellChance: number;
  /** Share of the full product delivered. */
  readonly completeness: number;
  /** K3.2.1 and D6.4.3: the `evaluation` z his grades are made with. */
  readonly evaluationZ: number;
}

export function workOrder(kind: string, m: StaffMember, w: Workload): WorkOrder {
  const b = m.profile.behavior;
  const done = completeness(m, w);
  const games = byQuality(b.preparation, P('games_charted_min'), P('games_charted_max')) * done;
  const splits = 1 + Math.max(0, Math.floor((b.preparation - P('split_floor_z')) / P('split_per_z')));
  return {
    kind, producerId: m.personId,
    gamesCharted: Math.max(1, Math.round(games)),
    splits: Math.max(1, Math.min(P('splits_max'), Math.round(splits * done))),
    tagErrorChance: tagErrorChance(m, w),
    tellChance: clamp(byQuality(b.evaluation, P('tell_chance_min'), P('tell_chance_max')) * done, 0, 1),
    completeness: done,
    evaluationZ: b.evaluation,
  };
}

/** A delivered work product, signed (K6.3.1: "each signed"). `body` is in the format the user would produce. */
export interface WorkProduct {
  readonly kind: string;
  readonly signedById: number;
  readonly late: boolean;
  readonly order: WorkOrder;
  readonly body: unknown;
}

/** A duty nobody holds: the product is missing (K6.3.1 edge case). */
export interface MissingProduct { readonly kind: string; readonly signedById: null; readonly missing: true }

/** Produce one work product: the K3 procedure with this person's order, and the late draw. */
export function produce(kind: string, m: StaffMember | null, w: Workload, prep: PreparationPort, draws: Draws): WorkProduct | MissingProduct {
  if (m === null || !m.available) return { kind, signedById: null, missing: true };
  const order = workOrder(kind, m, w);
  const late = draws.uniform() < lateChance(m, w);
  return { kind, signedById: m.personId, late, order, body: prep.build(kind, order, draws) };
}

/** A charted row: what a charter can see (N2.3.1 rule 2), never the true call name. */
export interface ChartedRow { readonly bucket: string; readonly observed: string }

/**
 * Apply a charter's errors to rows (K3.1.1 rule 3). A mis-tagged row looks like any other row
 * (K6.3.1 rule 3): nothing in the output marks it. Two uniforms per row, so the draw count is fixed.
 */
export function chartWithErrors(rows: readonly ChartedRow[], classes: readonly string[], chance: number, d: Draws): ChartedRow[] {
  return rows.map((r) => {
    const wrong = d.uniform() < chance;
    const pick = d.uniform();
    const others = classes.filter((c) => c !== r.observed);
    if (!wrong || others.length === 0) return r;
    return { bucket: r.bucket, observed: others[Math.min(others.length - 1, Math.floor(pick * others.length))]! };
  });
}

/**
 * K6.3.1 rule 4 (D6.4.3 evaluator bias): the lean, in z, of a staff member's grade of one of his own
 * players. `tie` is 0 to 1: how much the player is his (recruited by him, coached by him longest).
 */
export function ownPlayerBiasZ(tie: number): number {
  return P('own_player_bias_z') * clamp(tie, 0, 1);
}
