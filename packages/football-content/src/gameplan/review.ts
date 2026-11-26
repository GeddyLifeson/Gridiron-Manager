// Plan size, review and approval (G6.6.1). One screen of every warning, each traced to the leaf whose rule
// raised it, plus the approval state. Trust costs of heavy editing belong to L4: this module reports the
// share of the coordinator's plan the head coach changed and L4 prices it.
import type { Playbook } from '../playbook/index.ts';
import type { LookCell } from './looks.ts';
import type { MenuEntry, PlanWarning, Sequence, Theme } from './plan.ts';
import { checkSequences, checkThemes, unansweredLooks, stageSizes } from './plan.ts';

export type Approval = { readonly state: 'draft' } | { readonly state: 'submitted'; readonly at: number }
  | { readonly state: 'approved'; readonly at: number; readonly by: string } | { readonly state: 'sent_back'; readonly at: number; readonly notes: string };

export interface PlanReviewInput {
  readonly menu: readonly MenuEntry[];
  readonly culled: number;
  readonly themes: readonly Theme[];
  readonly sequences: readonly Sequence[];
  readonly cells: readonly LookCell[];
  readonly book: Playbook;
  readonly repsNeeded: number;
  readonly repsAvailable: number;
  /** Mean projected readiness at kickoff of the plan's calls (G5 projection, staff estimate). */
  readonly projectedReadiness: number;
  /** Warnings other parts raised (install meter, dials, contingencies, protection, defense). */
  readonly extra: readonly PlanWarning[];
  /** Plays the quarterback asked to cut after seeing the plan. */
  readonly qbDislikes: readonly string[];
}

export interface PlanReview {
  readonly warnings: readonly PlanWarning[];
  readonly practiced: number;
  readonly repsNeeded: number;
  readonly repsAvailable: number;
  readonly projectedReadiness: number;
  readonly qbDislikes: readonly string[];
}

export function reviewPlan(i: PlanReviewInput): PlanReview {
  const sizes = stageSizes(i.culled, i.menu);
  const w: PlanWarning[] = [...sizes.notes, ...checkThemes(i.themes, i.menu, i.cells), ...checkSequences(i.sequences, i.menu), ...i.extra];
  for (const c of unansweredLooks(i.cells, i.menu, i.book)) w.push({ leaf: 'G6.2.1', code: 'menu.unanswered_look', subject: `${c.bucket}/${c.look}`, text: `no call answers ${c.look} in ${c.bucket}`, severity: 'warning' });
  if (i.repsNeeded > i.repsAvailable) w.push({ leaf: 'G6.6.1', code: 'review.reps', subject: 'plan', text: `${i.repsNeeded} reps needed, ${i.repsAvailable} available`, severity: 'warning' });
  for (const q of i.qbDislikes) if (i.menu.some((m) => m.call.playId === q)) w.push({ leaf: 'G6.6.1', code: 'review.qb_dislike', subject: q, text: `the quarterback does not like ${q}`, severity: 'note' });
  return { warnings: w, practiced: sizes.practiced, repsNeeded: i.repsNeeded, repsAvailable: i.repsAvailable, projectedReadiness: i.projectedReadiness, qbDislikes: i.qbDislikes };
}

/** Share of the coordinator's menu the head coach changed (entries removed plus added, over the original size). L4 prices it. */
export function editShare(original: readonly MenuEntry[], edited: readonly MenuEntry[]): number {
  const a = new Set(original.map((m) => m.id)), b = new Set(edited.map((m) => m.id));
  const changed = [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length;
  return a.size === 0 ? (b.size === 0 ? 0 : 1) : changed / a.size;
}

export function submit(a: Approval, at: number): Approval { return a.state === 'approved' ? a : { state: 'submitted', at }; }
export function approve(a: Approval, at: number, by: string): Approval { return a.state === 'submitted' || a.state === 'draft' ? { state: 'approved', at, by } : a; }
export function sendBack(a: Approval, at: number, notes: string): Approval { return a.state === 'approved' ? a : { state: 'sent_back', at, notes }; }

/** A change made after a full practice day has started is late: it gets only the install the remaining days allow (G6.6.1). */
export function isLateChange(changeDay: number, firstFullPracticeDay = 1): boolean {
  return changeDay >= firstFullPracticeDay;
}
