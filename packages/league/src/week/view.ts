// The week schedule view (H1.1.1 what the user sees, H1.1.2 limits panel, H1.4.3, H9.1.1). The read
// model for screen `week.schedule` wraps this once the barrel exports the module (CR-G69-2). It is
// built only from the team's own Week, its findings and document views: no truth-class value
// (document quality, seeded errors, true readiness) is an input, so none can leak.
import { formatTime, iso } from '../calendar/date.ts';
import { minutesFor, unplanned } from './hours.ts';
import { P } from './params.ts';
import type { DocumentView } from './documents.ts';
import { BLOCK_OWNER, type Finding, type Week } from './types.ts';

export interface WeekBlockView {
  readonly id: string; readonly type: string; readonly owner: string; readonly start: string; readonly minutes: number;
  readonly attendees: readonly string[]; readonly leader: string; readonly location: string; readonly session: string | null;
  readonly unplanned: boolean; readonly done: boolean; readonly padded: boolean;
}
export interface WeekDayView { readonly date: string; readonly label: string; readonly kind: string; readonly blocks: readonly WeekBlockView[] }
export interface WeekScheduleView {
  readonly weekId: string;
  readonly shape: string;
  readonly home: boolean;
  readonly days: readonly WeekDayView[];
  readonly hard: readonly { readonly plain: string; readonly penalty: string; readonly leaf: string }[];
  readonly soft: readonly string[];
  readonly coachHours: number;
  readonly documents: readonly { readonly id: string; readonly type: string; readonly state: string; readonly late: boolean }[];
}

export function scheduleView(week: Week, findings: readonly Finding[], documents: readonly DocumentView[]): WeekScheduleView {
  const open = new Set(unplanned(week).map((b) => b.id));
  const done = new Set(week.completed);
  return {
    weekId: week.weekId, shape: week.shape, home: week.home,
    days: week.days.map((d) => ({
      date: iso(d.day),
      label: d.gMinus === 0 ? 'G' : `G-${d.gMinus}`,
      kind: d.kind,
      blocks: d.blocks.map((b) => ({
        id: b.id, type: b.type, owner: BLOCK_OWNER[b.type], start: formatTime(b.start.minute), minutes: b.minutes,
        attendees: b.attendees, leader: b.leader, location: b.location, session: b.session ?? null,
        unplanned: open.has(b.id), done: done.has(b.id), padded: b.equipment === 'pads',
      })),
    })),
    hard: findings.filter((f) => f.hardness === 'hard').map((f) => ({ plain: f.plain, penalty: f.penalty, leaf: f.leaf })),
    soft: findings.filter((f) => f.hardness === 'soft').map((f) => f.plain),
    coachHours: minutesFor(week) / P('minutes_per_hour'),
    documents: documents.map((d) => ({ id: d.id, type: d.type, state: d.state, late: d.late })),
  };
}
