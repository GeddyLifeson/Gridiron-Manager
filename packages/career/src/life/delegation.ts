// E7.3.1 handing work off and E7.3.2 checking delegated work. A delegated task costs the coach 0 hours
// and lands on the delegate's own 168-hour week. The product itself is made by the staff AI (K6) from
// the delegate's hidden parameters; this file owns the hours, the load and the review bookkeeping.
import { param, toQ, fromQ } from './params.ts';
import { taskRow, taskCost } from './costs.ts';
import type { WorkItem } from './week.ts';

export interface Delegate {
  readonly personId: number;
  /** Rung of the delegate on the ladder (S1). */
  readonly rung: number;
  /** Person id of who he reports to. */
  readonly reportsTo: number | null;
  /** Work hours he has this week for delegated tasks after his own required blocks (from his own week). */
  readonly capacityHours: number;
}

/** E7.7.2 rule 3: a head coach may delegate to his staff; below head coach only to those who report to
 *  him. `coachIsHead` comes from the job record (positions), never from a level word. */
export function mayDelegate(coachId: number, coachIsHead: boolean, d: Delegate): boolean {
  if (d.personId === coachId) return false;
  return coachIsHead || d.reportsTo === coachId;
}

export type ProductStatus = 'complete' | 'incomplete';

export interface DelegatedTask {
  readonly item: WorkItem;
  readonly authorId: number;
  readonly status: ProductStatus;
}

export interface DelegateWeek {
  readonly personId: number;
  readonly assignedHours: number;
  readonly capacityHours: number;
  readonly tasks: readonly DelegatedTask[];
  /** Over capacity this week: feeds staff retention (L4) when sustained. */
  readonly overloaded: boolean;
}

/** Rule 3: a delegate given more than he can do rushes the lowest-priority tasks, which come back marked
 *  incomplete. Priority order as in week.ts; ties go to the earlier item. */
export function delegateWeek(d: Delegate, items: readonly WorkItem[]): DelegateWeek {
  const mine = items.filter((w) => w.delegateId === d.personId);
  const order = mine.map((w, i) => ({ w, i })).sort((a, b) => b.w.priority - a.w.priority || a.i - b.i);
  let left = toQ(d.capacityHours);
  const status = new Map<WorkItem, ProductStatus>();
  for (const { w } of order) {
    const q = toQ(w.hours);
    if (q <= left) { left -= q; status.set(w, 'complete'); } else status.set(w, 'incomplete');
  }
  const assigned = mine.reduce((s, w) => s + toQ(w.hours), 0);
  return {
    personId: d.personId,
    assignedHours: fromQ(assigned),
    capacityHours: d.capacityHours,
    tasks: mine.map((w) => ({ item: w, authorId: d.personId, status: status.get(w)! })),
    overloaded: assigned > toQ(d.capacityHours),
  };
}

export type ReviewAction = 'accept' | 'return' | 'replace';

export interface ReviewResult {
  /** Hours charged to the coach: the review row, plus the full task cost when he redoes it. */
  readonly coachHours: number;
  /** Hours added to the delegate (the redo when returned). */
  readonly delegateHours: number;
  /** An L4 event is raised for return (tone picked by the user) and replace. */
  readonly staffEvent: 'none' | 'returned' | 'replaced';
}

/** E7.3.2: open a delegated product at its review row, then accept, return or replace. The product is
 *  shown exactly as made; nothing flags its errors (rule 1). */
export function reviewProduct(taskId: string, action: ReviewAction): ReviewResult {
  const t = taskRow(taskId);
  if (!t.reviewTask) throw new Error(`life: task ${taskId} has no review row`);
  const review = taskCost(t.reviewTask, 1).hours;
  const full = taskCost(taskId, 1).hours;
  if (action === 'accept') return { coachHours: review, delegateHours: 0, staffEvent: 'none' };
  if (action === 'return') return { coachHours: review, delegateHours: full, staffEvent: 'returned' };
  return { coachHours: review + full, delegateHours: 0, staffEvent: 'replaced' };
}

/** Per-delegate season count of products and replacements (rule 3). */
export interface TrustTally { readonly products: number; readonly replaced: number }

export function tallyReview(t: TrustTally, action: ReviewAction): TrustTally {
  return { products: t.products + 1, replaced: t.replaced + (action === 'replace' ? 1 : 0) };
}

/** Rule 3: replacing more than the threshold share of his products in a season lowers the relationship
 *  and raises his chance of looking for another job (L4 applies both). */
export function distrustShown(t: TrustTally): boolean {
  return t.products > 0 && t.replaced / t.products > param('replaceShareThreshold');
}
