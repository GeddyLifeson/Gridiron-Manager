// @gm/people: person generation, the people-pack importer, attribute estimation, the shuffle (D13, U, A6, X).
// Each module is re-exported under a namespace: modules export PARAMS, and a plain `export *` drops
// clashing names without an error. Integrator-owned.
export * as pack from './pack/index.ts';
export * as scouting from './scouting/index.ts';
export * as needs from './needs/index.ts';
export * as memory from './memory/index.ts';
export * as generator from './generator/index.ts';
export * as relationships from './relationships/index.ts';
export * as culture from './culture/index.ts';
export * as pipeline from './pipeline/index.ts';
export * as cohorts from './cohorts/index.ts';
export * as importing from './import/index.ts';
