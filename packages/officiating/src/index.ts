// @gm/officiating: truth to ruling, fouls and enforcement, clock, replay (B1 to B11, J10).
// Each module is re-exported under a namespace: every module exports PARAMS and RULE_KEYS, and a
// plain `export *` drops clashing names without an error. Integrator-owned.
export * as clock from './clock/index.ts';
export * as series from './series/index.ts';
export * as scrimmage from './scrimmage/index.ts';
export * as fouls from './fouls/index.ts';
export * as crew from './crew/index.ts';
export * as replay from './replay/index.ts';
export * as kick from './kick/index.ts';
export * as restart from './restart/index.ts';
export * as overtime from './overtime/index.ts';
