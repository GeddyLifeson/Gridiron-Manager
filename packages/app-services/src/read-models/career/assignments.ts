// The Office assignment list (O7.2.1) below head coach, and the head coach's own list at rungs 8-9. Rows come
// from the ladder core (`ladder.assignmentRows`, G-85): the week's duties in H1 order, the screen each opens
// and the submit control only where the seat owns the duty (O7.1.1). Graded rows carry the mark and one line
// the boss wrote (O7.2.1); the grade is the boss's judgement of a work product, never a hidden value.
import { ladder } from '@gm/career';
import type { AssignmentRowView, AssignmentsView } from './types.ts';

export interface AssignmentsInput {
  readonly seat: ladder.SeatView;
  readonly week: ladder.WeekKind;
  readonly jobTitle: string;
  /** The boss's name as the coach knows it; null at rungs 8-9 (he sets his own list). */
  readonly bossName: string | null;
  /** Hours left this week after the planned work (E7). */
  readonly freeHours: number;
  /** Duty ids the boss asked for this week on top of the standing list. */
  readonly requests?: ReadonlySet<string>;
  /** Duty id to status this week, from the work-product log. */
  readonly status?: Readonly<Record<string, ladder.AssignmentStatus>>;
  /** Duty id to the boss's mark and line, for graded rows. */
  readonly grades?: Readonly<Record<string, { readonly mark: string; readonly feedback: string }>>;
}

export function buildAssignmentsView(x: AssignmentsInput): AssignmentsView {
  const rows: AssignmentRowView[] = ladder.assignmentRows({ view: x.seat, week: x.week, requests: x.requests, status: x.status }).map((r) => ({
    dutyId: r.dutyId, title: r.title, leaf: r.leaf, assignedBy: r.assignedBy,
    due: r.due ? { day: r.due.day, time: r.due.time } : null,
    hoursEst: r.hoursEst, state: r.state, status: r.status, screenId: r.screenId,
    // A control shows only when the seat holds the right (O7.1.1 acceptance 2).
    command: r.command && x.seat.rights.includes(r.command) ? r.command : null,
    grade: r.status === 'graded' ? (x.grades?.[r.dutyId] ?? null) : null,
  }));
  const top = x.seat.band === '8-9';
  return { rights: [...x.seat.rights], jobTitle: x.jobTitle, bossName: top ? null : x.bossName, freeHours: Math.max(0, x.freeHours), rows };
}
