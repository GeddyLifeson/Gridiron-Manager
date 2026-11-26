// Game management read model (G-61: I5, I6.3, I7, I11, O2.1.2, O2.1.3, O2.4, O2.5.3). One model per frame
// so a dead-ball record updates the bar, clock, controls and sideline together (O2.5.1: one frame).
//
// Wiring is injected, for the same contract reasons as G-71:
//   - CR-G61-1 (as CR-G27-4): app-services may not import zod, so the data schema is passed in. Its
//     definition sits in test/read-models/game-management/schema.ts until it moves to @gm/schema.
//   - CR-G61-2: the live game, legality answers, pending decisions, staff estimates, messages and injury
//     reports come through `GameManagementSources` until the live game sits in the observed world. Each
//     source is the coach's side only: legality from officiating (clock.timeoutAllowed, replay.challengeRefusal,
//     replay.challengeable), messages from the staff AI (K6) and the tiredness delay from career life
//     gameDayEffects (G-53).
// The model builds only for a team the observer has a scope on (K9.1.1).
import type { ObservedWorld, Params, ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildDecisionBar } from './decision-bar.ts';
import { buildClock, buildControls } from './clock.ts';
import { buildInjuries, buildSideline } from './sideline.ts';
import type { GameManagementInputs, GameManagementView } from './types.ts';

export * from './types.ts';
export { PARAMS } from './params.ts';
export { RULE_ORDER, sortByRule, secondsLeft, onExpiry, chartLine, guarded, buildDecisionBar } from './decision-bar.ts';
export { inPanelWindow, kneelBurn, buildClock, buildControls } from './clock.ts';
export { arrivalS, clip, buildSideline, buildInjuries } from './sideline.ts';

/** The whole view from one set of inputs. Pure. */
export function buildGameManagementView(inputs: GameManagementInputs): GameManagementView {
  return {
    gameId: inputs.live.gameId,
    seat: inputs.coach.seat,
    bar: buildDecisionBar(inputs),
    ...buildControls(inputs),
    clock: buildClock(inputs.live),
    sideline: buildSideline(inputs.live, inputs.messages, inputs.coach),
    injuries: buildInjuries(inputs.live, inputs.injuries, inputs.coach),
  };
}

export interface GameManagementSources {
  /** Everything the screen reads for the team's live game, or null when it has none in progress. */
  inputs(world: ObservedWorld, teamId: number): GameManagementInputs | null;
}

export const GAME_MANAGEMENT_MODEL = 'gameManagement';

/** S3 task ids whose permission the panel shows (O7.1.1). Named here until G-55 publishes the duty list. */
export const GAME_MANAGEMENT_TASK_IDS = ['gameday.timeouts', 'gameday.challenges', 'gameday.fourth_down'] as const;

function num(p: Params, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`game management read model: parameter ${k} must be a number`);
  return v;
}

export function gameManagementReadModels(schema: Schema, sources: GameManagementSources): ReadModelSpec[] {
  return [{
    name: GAME_MANAGEMENT_MODEL,
    data: schema,
    taskIds: GAME_MANAGEMENT_TASK_IDS,
    build(world, p) {
      const teamId = num(p, 'teamId');
      const s = world.observer.teamScopes[String(teamId)];
      if (s === undefined || s.length === 0) return { data: { teamId, live: false } };
      const inputs = sources.inputs(world, teamId);
      if (!inputs) return { data: { teamId, live: false } };
      return { data: { teamId, live: true, view: buildGameManagementView(inputs) } };
    },
  }];
}
