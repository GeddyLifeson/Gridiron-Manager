// Read-model spec (P1.3.2) of the game plan builder and call sheet screens. The plan, sheet, card, scouting
// board and install week are not world tables yet (request CR-G68-S2), so the host passes them in through
// `GameplanSource`, as the roster moves and playbook screens do. The builder reads nothing from the world
// that the observer filter has not passed.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildGameplanView, type GameplanInput, type GameplanUnit } from './model.ts';
import type { GameplanView } from './types.ts';

export const GAMEPLAN_MODEL = 'gameplan';
/** S3 task ids for the permission badge (O7.1.1). */
export const GAMEPLAN_TASKS: readonly string[] = ['game_plan.build', 'call_sheet.build', 'game_plan.approve'];

export type GameplanSource = (teamId: number, unit: GameplanUnit) => Omit<GameplanInput, 'teamId' | 'unit' | 'selectedSituation' | 'paper' | 'keyHints'> | null;

/** Flat parameters (the read-model key holds primitives only). */
export type GameplanParams = {
  readonly teamId: number;
  readonly unit: string;
  readonly situation?: string | null;
  readonly paper?: string | null;
  readonly keyHints?: boolean | null;
};

const UNITS: readonly GameplanUnit[] = ['offense', 'defense', 'special_teams'];
const PAPERS = ['letter', 'legal', 'tabloid'] as const;

export function gameplanSpec(data: Schema, source: GameplanSource): ReadModelSpec<GameplanParams, GameplanView | null> {
  return {
    name: GAMEPLAN_MODEL,
    data,
    taskIds: GAMEPLAN_TASKS,
    build: (_world, p) => {
      const unit = UNITS.find((u) => u === p.unit);
      if (!unit) return { data: null };
      const s = source(p.teamId, unit);
      if (!s) return { data: null };
      const paper = PAPERS.find((x) => x === p.paper) ?? 'letter';
      return { data: buildGameplanView({ ...s, teamId: p.teamId, unit, selectedSituation: p.situation || null, paper, keyHints: p.keyHints ?? true }) };
    },
  };
}
