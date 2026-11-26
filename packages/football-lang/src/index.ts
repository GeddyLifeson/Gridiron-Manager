// @gm/football-lang: the assignment rule language, legality validation, play assembly (J4, G1, B4.6.1).
// Modules are re-exported under a namespace (both export PARAMS and RULE_KEYS). Integrator-owned.
// `lang.createFootballLang(opts)` returns the contract's FootballLang.
export * as lang from './lang/index.ts';
export * as legality from './legality/index.ts';
