// The read-model spec (P1.3.2) of the office screens. The inbox comes from the world table through the
// observer filter (own-team rows reach only their owner); the day plan comes from the week schedule and
// hour budget the world side holds (G-69, E7) until those are world tables (CR-G72-2).
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildHomeView, type DayPlan } from './model.ts';
import type { HomeView } from './types.ts';

export const HOME_MODEL = 'office';
/** S3 task ids for the permission badge (O7.1.1). */
export const HOME_TASKS: readonly string[] = ['system.advance_time', 'inbox.answer'];

export type DayPlanSource = (personId: number) => DayPlan | null;

export function homeSpec(data: Schema, source: DayPlanSource): ReadModelSpec<{ personId: number }, HomeView | null> {
  return {
    name: HOME_MODEL,
    data,
    taskIds: HOME_TASKS,
    build: (world, { personId }) => {
      const plan = source(personId);
      return { data: plan ? buildHomeView(world, personId, plan) : null };
    },
  };
}
