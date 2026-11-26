// The week by rung (H1.5.5), meetings by rung (H4.6.2) and documents as the user's job (H9.5.2).
// The boss builds the team's week; the user's row is derived from it as tasks with deadlines and
// hours. Nothing is gated by a skill value: depth, sleep or lateness is the user's choice.
import RT from './data/rung-tasks.json' with { type: 'json' };
import type { RandomStream } from '@gm/schema';
import { instantValue, type Instant } from '../calendar/date.ts';
import { P } from './params.ts';
import type { Rung } from './edit.ts';
import type { Week } from './types.ts';

export interface BossTask {
  readonly id: string;
  readonly family: string;
  readonly dueAt: Instant;
  readonly hoursAtFullDepth: number;
  readonly minHours: number;
  readonly leaf: string;
}

interface Family { readonly family: string; readonly share: number; readonly leaf: string }
const TASKS = RT.rungs as Readonly<Record<string, readonly Family[]>>;

/** Daily load at full depth for a rung, in hours (H1.5.5 rule 2). */
export function dailyLoadHours(rung: Rung): number {
  const ratio = rung === 'graduate_assistant' ? P('rung_overload_ga') : P('rung_overload_other');
  return P('rung_day_hours') * ratio;
}

/** One task per family per prep day, due at the end of that day (H1.5.5 rules 2 and 4). Coordinators and head coaches get none. */
export function rungTasks(rung: Rung, week: Week, dueMinute: number): BossTask[] {
  const fams = TASKS[rung];
  if (!fams) return [];
  const load = dailyLoadHours(rung);
  const out: BossTask[] = [];
  for (const d of week.days) {
    if (d.gMinus === 0) continue;
    for (const f of fams) {
      const full = load * f.share;
      out.push({ id: `${week.weekId}:task:${d.gMinus}:${f.family}`, family: f.family, dueAt: { day: d.day, minute: dueMinute }, hoursAtFullDepth: full, minHours: full * P('task_min_share'), leaf: f.leaf });
    }
  }
  return out;
}

/** Every task produces one completion record (H1.5.5 acceptance 2). Depth is hours over full depth, capped at 1. */
export function completeTask(task: BossTask, hoursSpent: number, finishedAt: Instant): { taskId: string; depth: number; belowMinimum: boolean; lateMinutes: number } {
  const depth = task.hoursAtFullDepth > 0 ? Math.min(1, Math.max(0, hoursSpent / task.hoursAtFullDepth)) : 1;
  const lateMinutes = Math.max(0, instantValue(finishedAt) - instantValue(task.dueAt));
  return { taskId: task.id, depth, belowMinimum: hoursSpent < task.minHours, lateMinutes };
}

/** Speaking up (H4.6.2 rule 2): accepted with a chance from standing and the boss's openness, both 0..1. */
export function proposalAccepted(standing: number, openness: number, stream: RandomStream): boolean {
  const both = [standing, openness].map((x) => Math.min(1, Math.max(0, x)));
  return stream.chance(both.reduce((s, x) => s + x, 0) / both.length);
}

/** Scoring a tracked proposal once after the game: a failure costs less than a success gains (rule 2). */
export function proposalOutcome(worked: boolean, gain: number): number {
  return worked ? gain : -gain * P('proposal_fail_ratio');
}
