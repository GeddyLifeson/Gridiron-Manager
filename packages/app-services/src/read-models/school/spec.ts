// Read-model spec (P1.3.2) of the coaching school. The school belongs to the person looking: the build
// asks the source for the observer's own records, so another seat or the public observer gets null and no
// one can read someone else's lesson attempts. The school table is not in the save yet (CR-G94-1), so the
// host passes the records in through `SchoolSource`, as the install and playbook screens do.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildSchoolView, type SchoolInput } from './model.ts';
import type { SchoolView } from './model.ts';

export const SCHOOL_MODEL = 'school';
/** The school is the user's own study; no staff task gates it (O7: open at every rung). */
export const SCHOOL_TASKS: readonly string[] = [];

export type SchoolSource = (personId: number) => SchoolInput | null;

/** No parameters: the observer is the student. */
export type SchoolParams = Record<string, never>;

export function schoolSpec(data: Schema, source: SchoolSource): ReadModelSpec<SchoolParams, SchoolView | null> {
  return {
    name: SCHOOL_MODEL,
    data,
    taskIds: SCHOOL_TASKS,
    build: (world) => {
      const me = world.observer.personId;
      if (me === null) return { data: null };
      const input = source(me);
      if (!input || input.personId !== me) return { data: null };
      return { data: buildSchoolView(input) };
    },
  };
}
