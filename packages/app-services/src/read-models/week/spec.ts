// The read-model specs (P1.3.2) of the week screens: schedule (H1), practice planner (H3, the
// `week.practice` route source), meetings (H4), travel (H8), documents (H9) and the media screen's press
// conference (O4.5.2). The week and its plans are world-side state the runner holds per team (G-69, G-65);
// each source answers null when nothing is known yet. The `data` schemas live in @gm/schema (CR-W9-1),
// because app-services may not import zod itself.
import { practice as pr, week as wk } from '@gm/league';
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildMeetingsView, type MeetingsInput } from './meetings.ts';
import { buildTravelView, type TravelInput } from './travel.ts';
import { buildDocumentsView, type DocumentsInput } from './documents.ts';
import { buildPressView, type PressConference } from './press.ts';
import type { DocumentsView, MeetingsView, PressView, TravelView } from './types.ts';

export const WEEK_MODELS = {
  schedule: 'week.schedule', practice: 'practice.planner', meetings: 'week.meetings', travel: 'week.travel',
  documents: 'week.documents', press: 'people.media',
} as const;

/** S3 task ids for the permission badge (O7.1.1). */
export const WEEK_TASKS: Readonly<Record<keyof typeof WEEK_MODELS, readonly string[]>> = {
  schedule: ['week.plan'],
  practice: ['practice.plan'],
  meetings: ['meeting.team', 'meeting.unit', 'meeting.staff'],
  travel: ['travel.plan'],
  documents: ['documents.manage'],
  press: ['media.session'],
};

export interface ScheduleInput { readonly week: wk.Week; readonly findings: readonly wk.Finding[]; readonly documents: readonly wk.DocumentView[] }

/** World-side reads for one team and week. */
export interface WeekSources {
  readonly schedule?: (teamId: number) => ScheduleInput | null;
  readonly practice?: (teamId: number, practiceId: string) => pr.PracticeViewInput | null;
  readonly meetings?: (teamId: number) => MeetingsInput | null;
  readonly travel?: (teamId: number) => TravelInput | null;
  readonly documents?: (teamId: number) => DocumentsInput | null;
  readonly press?: (teamId: number) => { readonly week: wk.Week; readonly live: PressConference | null; readonly rules: (key: string) => number | undefined } | null;
}

export interface WeekSchemas {
  readonly schedule: Schema; readonly practice: Schema; readonly meetings: Schema;
  readonly travel: Schema; readonly documents: Schema; readonly press: Schema;
}

type Team = { teamId: number };

export function weekSpecs(schemas: WeekSchemas, s: WeekSources): {
  schedule: ReadModelSpec<Team, wk.WeekScheduleView | null>;
  practice: ReadModelSpec<Team & { practiceId: string }, pr.PracticeView | null>;
  meetings: ReadModelSpec<Team, MeetingsView | null>;
  travel: ReadModelSpec<Team, TravelView | null>;
  documents: ReadModelSpec<Team, DocumentsView | null>;
  press: ReadModelSpec<Team, PressView | null>;
} {
  const spec = <P extends Team, D>(k: keyof typeof WEEK_MODELS, build: (p: P) => D): ReadModelSpec<P, D> => ({
    name: WEEK_MODELS[k], data: schemas[k], taskIds: WEEK_TASKS[k], build: (_world, p) => ({ data: build(p) }),
  });
  return {
    schedule: spec('schedule', ({ teamId }) => { const i = s.schedule?.(teamId); return i ? wk.scheduleView(i.week, i.findings, i.documents) : null; }),
    practice: spec('practice', ({ teamId, practiceId }: Team & { practiceId: string }) => { const i = s.practice?.(teamId, practiceId); return i ? pr.practiceView(i) : null; }),
    meetings: spec('meetings', ({ teamId }) => { const i = s.meetings?.(teamId); return i ? buildMeetingsView(i) : null; }),
    travel: spec('travel', ({ teamId }) => { const i = s.travel?.(teamId); return i ? buildTravelView(i) : null; }),
    documents: spec('documents', ({ teamId }) => { const i = s.documents?.(teamId); return i ? buildDocumentsView(i) : null; }),
    press: spec('press', ({ teamId }) => { const i = s.press?.(teamId); return i ? buildPressView(i.week, i.live, i.rules) : null; }),
  };
}
