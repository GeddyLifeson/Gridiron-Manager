// The real phase 1 game (R1.2.2) for the headless tools: the browser-safe core lives in @gm/world season
// (real-game.ts: parameter table, placeholder rosters, inputs and dependencies with the chart caller); this
// file adds the calibration batch. Integrator-owned. Nothing here is a fake: every number comes from a rule
// set or a parameter file.
import type { GameDeps, GameInput, ParamFile, ParamTable, RuleSet } from '@gm/schema';
import { ball, carrier, contest, field, foulsInjuries, kinematics, perception, playerAi, presnap, qb, tickResolver } from '@gm/engine-core';
import { lang } from '@gm/football-lang';
import { flow, stats } from '@gm/engine-game';
import { season } from '@gm/world';
import { runBatch, type BatchResult } from '../calibration/index.ts';

export const { ENGINE_PARAM_FILES, engineParamTable, placeholderTeam } = season;

/**
 * Every parameter file the tick path reads (J1 to J10): field, kinematics, perception, pre-snap, player AI,
 * ball, contest, quarterback, tick resolver (with the kick look and its trigger read), ball carrier, fouls and
 * injuries, and the rule language. Integrator-owned: a module that adds a parameter file lists it here.
 */
export const TICK_PARAM_FILES: readonly ParamFile[] = [
  field.PARAMS, kinematics.PARAMS, perception.PARAMS, presnap.PARAMS, playerAi.PARAMS, ball.PARAMS, contest.PARAMS,
  qb.PARAMS, tickResolver.PARAMS, carrier.PARAMS, foulsInjuries.PARAMS, ...lang.PARAM_FILES,
];

/** The game modules' files and the tick path's together: what a game with the tick resolver reads. */
export const ALL_ENGINE_PARAM_FILES: readonly ParamFile[] = [...ENGINE_PARAM_FILES, ...TICK_PARAM_FILES];

/** The merged table for the tick path (one name, one row; a duplicate or unknown override throws). */
export function tickParamTable(overrides: Readonly<Record<string, number>> = {}): ParamTable {
  return engineParamTable(ALL_ENGINE_PARAM_FILES, overrides);
}

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
