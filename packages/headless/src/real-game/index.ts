// The real phase 1 game (R1.2.2) for the headless tools: the browser-safe core lives in @gm/world season
// (real-game.ts: parameter table, placeholder rosters, inputs and dependencies with the chart caller); this
// file adds the calibration batch. Integrator-owned. Nothing here is a fake: every number comes from a rule
// set or a parameter file.
import type { GameDeps, GameInput, ParamTable, RuleSet } from '@gm/schema';
import { field } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { season } from '@gm/world';
import { runBatch, type BatchResult } from '../calibration/index.ts';

export const { ENGINE_PARAM_FILES, engineParamTable, placeholderTeam } = season;

export interface RealGame {
  readonly rules: RuleSet;
  readonly params: ParamTable;
  input(gameIndex: number, seedHex: string): GameInput;
  deps(input: GameInput): GameDeps;
  simulate(input: GameInput): ReturnType<typeof flow.simulateGame>;
  batch(games: number, seedGroups: number, masterSeedHex: string, onGame?: (i: number) => void): BatchResult;
}

export function createRealGame(ruleSetId: string, opts: { iss?: number; paramOverrides?: Readonly<Record<string, number>> } = {}): RealGame {
  const core = season.createRealGameCore(ruleSetId, opts);
  const statsModule = stats.createStatsModule({ geometry: field.fieldGeometry(core.rules), params: core.params });
  return {
    ...core,
    batch: (games, seedGroups, masterSeedHex, onGame) => runBatch({
      games, seedGroups, masterSeedHex, input: (i, s) => { onGame?.(i); return core.input(i, s); }, deps: core.deps,
      flow: { simulateGame: (inp, d) => flow.simulateGame(inp, d) }, stats: statsModule,
    }),
  };
}
