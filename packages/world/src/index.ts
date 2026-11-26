// @gm/world: world generation, the history run, the week and season runner, the off-screen loop (X10, X12).
// Modules are re-exported under a namespace (modules export PARAMS). Integrator-owned.
export const PACKAGE = 'world';
export * as generation from './generation/index.ts';
export * as loop from './loop/index.ts';
export * as tiers from './tiers/index.ts';
export * as season from './season/index.ts';
export * as turnover from './turnover/index.ts';
export * as compliance from './compliance/index.ts';
export * as recruiting from './recruiting/index.ts';
export * as money from './money/index.ts';
export * as contracts from './contracts/index.ts';
