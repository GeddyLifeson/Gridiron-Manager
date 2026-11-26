// Game state machine and game flow (J11): work package WP-06. The surface is the contract's
// `GameFlow`, made by `createGameFlow`; the transition table, the rule keys, the tuning constants
// and the state invariant checker are exported beside it.
export { createGameFlow, newGame, advance, simulateGame, deadlinePassed, replayEvents } from './driver.ts';
export type { FlowApi, FlowOptions, FlowSink, FlowResume, AdvanceResult } from './driver.ts';
export { applyEvent, resolvePlay } from './apply.ts';
export { TRANSITION_TABLE, REQUEST_PHASES, UNIT_START_PHASES, FlowTransitionError, transitionRow } from './table.ts';
export type { TransitionRow } from './table.ts';
export { stateInvariantProblems, transitionProblems } from './invariants.ts';
export { situationOf, rulingContext, publicCalled, periodExpired, restPhase } from './situation.ts';
export type { FlowEnv } from './situation.ts';
export { tossOutcome, tossMenu, loserMenu, defaultSnappingCall, defaultOpposingCall, defaultLineup } from './defaults.ts';
export { RULE_KEYS, PARAMS, OPT, FLOW_VERSION, flowParam } from './params.ts';
export type { FlowParam } from './params.ts';
