// The read-model spec (P1.3.2) of the recruiting board. Recruiting state lives in the world's system state
// (`systemState['recruiting']`, PR 239) with the calendar, program facts and rule sets beside it; until the
// world exposes them through the observer filter (CR-RB-2) the host passes the whole input in through
// `RecruitingBoardSource`. The builder reads only through `prospectPage`, so no truth field can reach `data`.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildRecruitingBoardView, type RecruitingBoardInput } from './model.ts';
import type { BoardList, RecruitingBoardView } from './types.ts';

export const RECRUITING_BOARD_MODEL = 'recruitingBoard';
/** S3 task ids for the permission badge (O7.1.1): the recruiting duty of the college rungs (S3.5.5). */
export const RECRUITING_BOARD_TASKS: readonly string[] = ['recruiting.evaluate', 'recruiting.contact', 'recruiting.offer'];

export type RecruitingBoardParams = {
  teamId: number;
  list?: BoardList;
  position?: string | null;
  region?: string | null;
  source?: string | null;
};
export type RecruitingBoardSource = (teamId: number) => Omit<RecruitingBoardInput, 'teamId' | 'list' | 'filter'> | null;

/** `data` is the zod schema of RecruitingBoardView with a visibility class on every field (owed in @gm/schema, CR-RB-1). */
export function recruitingBoardSpec(data: Schema, source: RecruitingBoardSource): ReadModelSpec<RecruitingBoardParams, RecruitingBoardView | null> {
  return {
    name: RECRUITING_BOARD_MODEL,
    data,
    taskIds: RECRUITING_BOARD_TASKS,
    build: (_world, p) => {
      const input = source(p.teamId);
      if (!input) return { data: null };
      return {
        data: buildRecruitingBoardView({
          ...input, teamId: p.teamId, list: p.list ?? 'board',
          filter: { position: p.position ?? null, region: p.region ?? null, source: p.source ?? null },
        }),
      };
    },
  };
}
