// Read-model spec (P1.3.2) of the practice desk: the week's practices and the kept practice reports (H3.1.1,
// H3.5.2). The desk is career state the host holds for the seat team (CareerYear.practice), not a world table,
// so the host passes it in through `PracticeDeskSource`, as the gameplan and playbook screens do. Other teams
// answer null. The `data` schema lives in @gm/schema (app-services may not import zod, P1.2.2).
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildPracticeDeskView, type PracticeDeskContext } from './model.ts';
import type { PracticeDeskView } from './types.ts';

export const PRACTICE_DESK_MODEL = 'practiceDesk';
/** S3 task ids for the permission badge (O7.1.1); the same task as the planner (`practice.plan`). */
export const PRACTICE_DESK_TASKS: readonly string[] = ['practice.plan'];

export type PracticeDeskSource = (teamId: number) => PracticeDeskContext | null;

/** Flat parameters (the read-model key holds primitives only). `season` picks the reports' season. */
export type PracticeDeskParams = { readonly teamId: number; readonly season?: number | null };

export function practiceDeskSpec(data: Schema, source: PracticeDeskSource): ReadModelSpec<PracticeDeskParams, PracticeDeskView | null> {
  return {
    name: PRACTICE_DESK_MODEL,
    data,
    taskIds: PRACTICE_DESK_TASKS,
    build: (_world, p) => {
      const ctx = source(p.teamId);
      return { data: ctx ? buildPracticeDeskView(p.teamId, ctx, p.season ?? null) : null };
    },
  };
}
