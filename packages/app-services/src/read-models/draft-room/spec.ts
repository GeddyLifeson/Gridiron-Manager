// The read-model spec (P1.3.2) of the draft room. The draft event state, the club's board and needs live in
// the league draft module (G-34) and the front office AI (G-76), not yet in world tables, so the host passes
// them in through `DraftRoomSource` (as the roster moves screen does, CR-G70-2). The zod schema of
// DraftRoomView lives in @gm/schema (integrator), because app-services may not import zod itself.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildDraftRoomView, type DraftRoomInput } from './model.ts';
import type { DraftRoomView } from './types.ts';

export type DraftRoomSource = (clubId: number) => Omit<DraftRoomInput, 'clubId'> | null;

export const DRAFT_ROOM_MODEL = 'draftRoom';
/** S3 task ids for the permission badge (O7.1.1). */
export const DRAFT_ROOM_TASKS: readonly string[] = ['draft.pick', 'draft.trade', 'draft.voice'];

export function draftRoomSpec(data: Schema, source: DraftRoomSource): ReadModelSpec<{ clubId: number }, DraftRoomView | null> {
  return {
    name: DRAFT_ROOM_MODEL,
    data,
    taskIds: DRAFT_ROOM_TASKS,
    build: (_world, { clubId }) => {
      const input = source(clubId);
      return { data: input ? buildDraftRoomView({ ...input, clubId }) : null };
    },
  };
}
