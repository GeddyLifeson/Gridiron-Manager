// K6.4.1 staff stand in when the user simulates. A simulated game is K6.1.1 with every duty delegated
// for the skipped span (the decider's `simulate` switch); this file is the week (J14.4.2): each of the
// head coach's weekly tasks is done by the staff member who holds the matching duty, or by the next
// person in line for tasks nobody holds. A task only the head coach can do is skipped and its cost
// applies. Nothing is rolled differently because it was simulated (J14.1.2): the same work orders,
// the same draws, the same block resolver the hand-played week uses.
import { member, ownerOf } from './owners.ts';
import { P, clamp } from './params.ts';
import { DUTY, type Duty, type StaffChart } from './types.ts';

/**
 * The fields of a league week block (H1.1.1, G-69 `week.Block`) this file reads. The league barrel
 * does not export `week` yet (CR-G69-2), so the shape is stated here; a `week.Block` fits it as is,
 * and `staffBlockResolver` returns a function that fits `week.BlockResolver`.
 */
export interface WeekBlock { readonly id: string; readonly type: string; readonly contentRef: string | null }
type Block = WeekBlock;

/** The duty a block of the week belongs to (H1.1.1 block types to S3.1.1 duty families). */
export const BLOCK_DUTY: Readonly<Record<string, Duty | null>> = {
  staff_meeting: DUTY.meetings, team_meeting: DUTY.meetings, unit_meeting: DUTY.meetings, position_meeting: DUTY.install,
  walkthrough: DUTY.practiceScripting, practice: DUTY.practiceScripting, lift_conditioning: null, treatment_recovery: DUTY.medicalReport,
  film_self: DUTY.scoutingReport, game_planning: DUTY.gamePlan, media: null, travel: null, player_free: null, coach_personal: null,
  game: null, class_academic: null, study_hall: null, recruiting: DUTY.evaluations, boss_task: null, meal: null,
};

/** One thing the head coach would do this week. */
export interface WeekTask {
  readonly id: string;
  readonly duty: Duty | null;
  /** True for a task only the head coach can hold, such as a one-on-one with a player (L1). */
  readonly headCoachOnly: boolean;
}

export type TaskBasis = 'duty_holder' | 'next_in_line' | 'skipped_head_coach_only' | 'skipped_nobody';

export interface TaskPlan {
  readonly taskId: string;
  readonly duty: Duty | null;
  /** Who does it, or null when it is skipped. */
  readonly doneById: number | null;
  readonly basis: TaskBasis;
}

/** K6.4.1 rule 2 for one task. */
export function planTask(chart: StaffChart, task: WeekTask): TaskPlan {
  if (task.headCoachOnly) return { taskId: task.id, duty: task.duty, doneById: null, basis: 'skipped_head_coach_only' };
  const duty = task.duty ?? '*';
  const o = ownerOf(chart, duty, { standIn: true });
  if (o.personId === null || member(chart, o.personId) === null) return { taskId: task.id, duty: task.duty, doneById: null, basis: 'skipped_nobody' };
  return { taskId: task.id, duty: task.duty, doneById: o.personId, basis: o.basis === 'assigned' ? 'duty_holder' : 'next_in_line' };
}

/**
 * The list "advance to game day" shows before it runs (J14.4.2: the standing choices that will be made
 * for him and by whom), and the plan the advance then follows.
 */
export function planWeek(chart: StaffChart, tasks: readonly WeekTask[]): TaskPlan[] {
  return tasks.map((t) => planTask(chart, t));
}

/** A block of the user's week as a task. `headCoachOnly` names the content refs only he can hold. */
export function blockTask(b: Block, headCoachOnly: readonly string[] = []): WeekTask {
  return { id: b.id, duty: BLOCK_DUTY[b.type] ?? null, headCoachOnly: b.contentRef !== null && headCoachOnly.includes(b.contentRef) };
}

/** What a delegated block's report carries besides the block's own effect: who ran it for the head coach. */
export interface DelegatedReport { readonly blockId: string; readonly plan: TaskPlan; readonly report: unknown }

/**
 * A league week block resolver that runs the user's delegated blocks with his staff. Blocks that were
 * not delegated pass straight through, so the hand-played week and the simulated week share one path.
 * `inner` computes the block's effect for the person named (H3, H4, H5 own the effects).
 */
export function staffBlockResolver<B extends Block>(
  chart: StaffChart, inner: (block: B, info: { delegated: boolean; teamId: number; doneById: number | null }) => unknown, headCoachOnly: readonly string[] = [],
): (block: B, info: { readonly delegated: boolean; readonly teamId: number }) => unknown {
  return (block, info) => {
    if (!info.delegated) return inner(block, { ...info, doneById: chart.headCoachId });
    const plan = planTask(chart, blockTask(block, headCoachOnly));
    const report = plan.doneById === null ? null : inner(block, { ...info, doneById: plan.doneById });
    const out: DelegatedReport = { blockId: block.id, plan, report };
    return out;
  };
}

/**
 * K6.4.1 rule 3: on a long advance at a lower rung the user's own duties are done at a "going through
 * the motions" quality set by his recent demonstrated work grades (S4.3.1), never above them. Grades
 * are on whatever scale S4.3.1 uses; the result is on the same scale. Null with no graded work yet:
 * the boss then uses another staff member's fallback (K6.5.1 rule 3).
 */
export function motionsQuality(recentGrades: readonly number[]): number | null {
  const recent = recentGrades.slice(-P('motions_window'));
  if (recent.length === 0) return null;
  const mean = recent.reduce((s, g) => s + g, 0) / recent.length;
  return Math.min(mean, mean * clamp(P('motions_factor'), 0, 1));
}

/** Events that stop an advance (K6.4.1 edge case), besides the user's own stop conditions (J14.4.2). */
export const ADVANCE_STOPS = ['job_offer', 'fired', 'crisis'] as const;

/** Whether an advance stops for an event. It stops at the next lock or commit boundary, never mid-game (J14.4.2). */
export function stopsAdvance(eventKind: string, userStops: readonly string[] = []): boolean {
  return (ADVANCE_STOPS as readonly string[]).includes(eventKind) || userStops.includes(eventKind);
}
