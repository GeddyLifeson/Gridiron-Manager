// K3.5.1 allocating practice. The AI staff decides how the week's reps are split; it does not resolve
// them. The split is handed to the practice module (H3, G-65) and resolved by H3.5.1 with the knowledge
// module's yield (G5.1.2, G-64) exactly as the user's is: there is no AI-only readiness function here or
// anywhere (rule 6). The budget arrives with the level's limits already applied (H1, C11, T5.4.1).
import { clamp } from './depth.ts';
import { param } from './params.ts';
import type { MenuEntry } from './plan.ts';

/** What the week allows, as the practice module computes it for any team at this level. */
export interface PracticeBudget {
  /** Team reps the week's schedule and limits allow. */
  readonly teamReps: number;
  /** Padded practices the work rules allow this week. */
  readonly paddedAllowed: number;
}

/**
 * A violation the coach already chose through K2.8.2 and the compliance module logged (L8.2.5). Only
 * with one of these may a week go past its limits (rule 3, acceptance).
 */
export interface LoggedViolation {
  readonly eventId: string;
  readonly extraTeamReps: number;
  readonly extraPadded: number;
}

export interface PracticeInput {
  /** Menus of every unit sharing the team reps, each entry in the order it joined its menu. */
  readonly menu: readonly MenuEntry[];
  /** Readiness of the starters for a call, as the staff estimates it (G5.4.1). */
  readonly readiness: (callId: string) => number;
  /** Reps the call still needs to reach the installed line at this staff's teaching (G5.1.2, from the knowledge module). */
  readonly repsToReady: (callId: string) => number;
  /** Health risk at the positions that matter, 0 to 1 (H5): more risk, more backup reps (rule 2). */
  readonly healthRisk: number;
  readonly budget: PracticeBudget;
  /** Padded practices the head coach wants by habit. */
  readonly paddedWanted: number;
  readonly violation?: LoggedViolation | null;
}

export interface AiPracticePlan {
  readonly teamReps: number;
  readonly starterReps: number;
  readonly backupReps: number;
  readonly perCall: readonly { readonly callId: string; readonly starterReps: number; readonly backupReps: number }[];
  readonly paddedPractices: number;
  /** Set only when the week goes past its limits. */
  readonly violationEventId: string | null;
}

/** Whole numbers that sum to `total`, in proportion to the weights (largest remainders, ties by index). */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0 || !weights.length) return weights.map(() => 0);
  const exact = weights.map((w) => (sum > 0 ? total * Math.max(0, w) / sum : total / weights.length));
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k]!.i]!++;
  return out;
}

export function allocatePractice(inp: PracticeInput): AiPracticePlan {
  const v = inp.violation ?? null;
  const teamReps = Math.max(0, Math.floor(inp.budget.teamReps + (v?.extraTeamReps ?? 0)));
  // Rule 2: backups get 15% to 30% of team reps, more when health risk is high.
  const share = param('practice.backupShareMin') + (param('practice.backupShareMax') - param('practice.backupShareMin')) * clamp(inp.healthRisk, 0, 1);
  const backupReps = Math.round(teamReps * share);
  const starterReps = teamReps - backupReps;

  const menu = [...inp.menu].sort((a, b) => a.order - b.order || (a.callId < b.callId ? -1 : 1));
  const reps = menu.map(() => 0);
  let left = starterReps;
  // Rule 1: new calls and calls with low readiness first, in the order they joined the plan. When the
  // plan is too big for the week the last calls added come up short (the cost of over-planning).
  const ready = param('plan.readyLine');
  menu.forEach((e, i) => {
    if (left <= 0 || !(e.source === 'new' || inp.readiness(e.callId) < ready)) return;
    const give = Math.min(left, Math.max(0, Math.ceil(inp.repsToReady(e.callId))));
    reps[i] = give;
    left -= give;
  });
  // Then the whole menu in proportion to planned usage.
  const usage = menu.map((e) => e.plannedSnaps ?? 0);
  apportion(left, usage.some((u) => u > 0) ? usage : menu.map(() => 1)).forEach((r, i) => { reps[i]! += r; });
  const backups = apportion(backupReps, reps);

  const padded = Math.max(0, Math.min(inp.paddedWanted, inp.budget.paddedAllowed + (v?.extraPadded ?? 0)));
  const over = teamReps > inp.budget.teamReps || padded > inp.budget.paddedAllowed;
  return {
    teamReps, starterReps, backupReps,
    perCall: menu.map((e, i) => ({ callId: e.callId, starterReps: reps[i]!, backupReps: backups[i]! })),
    paddedPractices: padded, violationEventId: over ? v!.eventId : null,
  };
}

/** K3.5.1 acceptance: a week is inside the level's limits unless it names a logged violation. */
export function withinLimits(plan: AiPracticePlan, budget: PracticeBudget): boolean {
  const used = plan.perCall.reduce((s, c) => s + c.starterReps + c.backupReps, 0);
  return used <= budget.teamReps && plan.teamReps <= budget.teamReps && plan.paddedPractices <= budget.paddedAllowed;
}
