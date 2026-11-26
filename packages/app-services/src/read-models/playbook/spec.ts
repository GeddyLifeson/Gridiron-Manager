// Read-model spec (P1.3.2) of the playbook library. The team's book, word list, template and usage are not
// world tables yet (request CR-G67-S2), so the host passes them in through `PlaybookSource`, as the roster
// moves screen does for league-office state. The builder reads nothing from the world that the observer
// filter has not passed.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildPlaybookView, type PlaybookInput } from './model.ts';
import type { PlaybookFilter, PlaybookView } from './types.ts';

export const PLAYBOOK_MODEL = 'playbook';
/** S3 task ids for the permission badge (O7.1.1). */
export const PLAYBOOK_TASKS: readonly string[] = ['playbook.edit', 'playbook.view'];

export type PlaybookSource = (teamId: number, side: PlaybookInput['side']) => Omit<PlaybookInput, 'teamId' | 'side' | 'filter'> | null;

/** Flat parameters (the read-model key holds primitives only): team, side and the filter fields. */
export type PlaybookParams = { readonly teamId: number; readonly side: string } & { readonly [K in keyof PlaybookFilter]?: PlaybookFilter[K] | null };

const SIDES: readonly PlaybookInput['side'][] = ['offense', 'defense', 'special_teams'];

export function filterOf(p: PlaybookParams): PlaybookFilter {
  const f: Record<string, unknown> = {};
  for (const k of ['text', 'formation', 'concept', 'personnel', 'role', 'situation', 'status', 'readinessAtLeast', 'includeRetired', 'folder'] as const) {
    const v = p[k];
    if (v !== undefined && v !== null && v !== '') f[k] = v;
  }
  return f as PlaybookFilter;
}

export function playbookSpec(data: Schema, source: PlaybookSource): ReadModelSpec<PlaybookParams, PlaybookView | null> {
  return {
    name: PLAYBOOK_MODEL,
    data,
    taskIds: PLAYBOOK_TASKS,
    build: (_world, params) => {
      const side = SIDES.find((s) => s === params.side);
      if (!side) return { data: null };
      const s = source(params.teamId, side);
      if (!s) return { data: null };
      return { data: buildPlaybookView({ ...s, teamId: params.teamId, side, filter: filterOf(params) }) };
    },
  };
}
