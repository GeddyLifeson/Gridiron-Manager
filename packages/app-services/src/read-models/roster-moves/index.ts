// @gm/app-services, roster moves read model (G-70): the weekly roster strip, the game-day active list
// with its coverage board and staff draft, and the elevations panel (H6.1, H6.2, H6.3.1, M2.1.4).
export { PARAMS, RULE_KEYS, SPECIAL_TEAMS_NAMESPACE, OUT_DESIGNATIONS } from './params.ts';
export * from './types.ts';
export { coverageRows, unitRows, unitNamed, gapLabels, jobsByPlayer, isSpecialTeamsUnit, type DepthUnit } from './coverage.ts';
export { staffDraft, type Draft, type DraftInput } from './draft.ts';
export { buildRosterMovesView, decider, minutesToKickoff, SCREEN_MOVES, type RosterMovesInput, type PlayerCard, type PowerInput } from './model.ts';
export { rosterMovesSpec, worldInputs, ROSTER_MOVES_MODEL, ROSTER_MOVES_TASKS, type RosterWeek, type RosterWeekSource } from './spec.ts';
