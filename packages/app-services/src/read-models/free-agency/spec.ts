// The read-model spec (P1.3.2) of the free agency screen. Classes, tenders, the window and offers live in
// the market module (G-35) and the club's books (G-16), not yet in world tables, so the host passes them in
// through `FreeAgencySource`. The zod schema of FreeAgencyView lives in @gm/schema (integrator).
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildFreeAgencyView, type FreeAgencyInput } from './model.ts';
import type { FreeAgencyView } from './types.ts';

export type FreeAgencySource = (clubId: number) => Omit<FreeAgencyInput, 'clubId'> | null;

export const FREE_AGENCY_MODEL = 'freeAgency';
/** S3 task ids for the permission badge (O7.1.1). */
export const FREE_AGENCY_TASKS: readonly string[] = ['contracts.offer', 'contracts.tender', 'contracts.tag', 'free_agency.call'];

export function freeAgencySpec(data: Schema, source: FreeAgencySource): ReadModelSpec<{ clubId: number }, FreeAgencyView | null> {
  return {
    name: FREE_AGENCY_MODEL,
    data,
    taskIds: FREE_AGENCY_TASKS,
    build: (_world, { clubId }) => {
      const input = source(clubId);
      return { data: input ? buildFreeAgencyView({ ...input, clubId }) : null };
    },
  };
}
