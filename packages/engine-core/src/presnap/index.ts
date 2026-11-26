// Pre-snap phase (J5): draws in the fixed order, the planner that schedules both lanes against the
// play clock, the J5 formulas, and the tick stages that run the phase over negative ticks.
// The integrator re-exports this file from the package barrel under a namespace.
export { PARAMS, RULE_KEYS, PRESNAP_FOUL_IDS, presnapParams, type PresnapParams, type PresnapFoulId } from './params.ts';
export * from './draws.ts';
export * from './formulas.ts';
export * from './plan.ts';
export * from './stages.ts';
