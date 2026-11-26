// Read-model spec (P1.3.2) of the install board. The install plan, knowledge book estimates and week shape
// are not world tables yet (the G-64 KnowledgeRow schema is with the schema integrator), so the host passes
// them in through `InstallSource`, as the playbook screen does. The builder reads nothing from the world
// that the observer filter has not passed.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildInstallView, type InstallInput } from './model.ts';
import type { InstallView } from './types.ts';

export const INSTALL_MODEL = 'install';
/** S3 task ids for the permission badge (O7.1.1). */
export const INSTALL_TASKS: readonly string[] = ['install.edit', 'install.view'];

export type InstallSource = (teamId: number, side: InstallInput['side'], mode: InstallInput['mode']) => Omit<InstallInput, 'teamId' | 'side' | 'mode'> | null;

/** Flat parameters (the read-model key holds primitives only). */
export type InstallParams = { readonly teamId: number; readonly side: string; readonly mode?: string | null };

const SIDES: readonly InstallInput['side'][] = ['offense', 'defense', 'special_teams'];

export function installSpec(data: Schema, source: InstallSource): ReadModelSpec<InstallParams, InstallView | null> {
  return {
    name: INSTALL_MODEL,
    data,
    taskIds: INSTALL_TASKS,
    build: (_world, params) => {
      const side = SIDES.find((s) => s === params.side);
      if (!side) return { data: null };
      const mode = params.mode === 'camp' ? 'camp' : 'week';
      const s = source(params.teamId, side, mode);
      if (!s) return { data: null };
      return { data: buildInstallView({ ...s, teamId: params.teamId, side, mode }) };
    },
  };
}
