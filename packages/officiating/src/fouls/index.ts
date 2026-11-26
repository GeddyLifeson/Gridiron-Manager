// @gm/officiating, module `fouls` (WP-04): the foul catalogue and the enforcement procedure
// (B8.1, B8.5, B6.6.1, B7.3.3, B13.5, B13.8). The package index re-exports this file (integrator).
import type { FoulRules } from '@gm/schema';
import { candidates, catalogue } from './catalogue.ts';
import { options } from './options.ts';

/** The contract's `FoulRules`. Stateless: every call reads the rule set handed in. */
export const foulRules: FoulRules = { catalogue, candidates, options };

export { RULE_KEYS, PARAMS, K as FOUL_RULE_KEY_NAMES, extKey } from './params.ts';
export { FOUL_IDS, EXT_FIELDS, ENFORCEMENT_PROFILES, type FoulIdDef, type ExtField, type EnforcementProfile } from './ids.ts';
export { catalogue, candidates, recordFromEvent, foulExists, enforcementProfile } from './catalogue.ts';
export { options, optionsFromTruth, optionsWithFacts, disqualifiedPlayers } from './options.ts';
export { factsFromTruth, factsFromOutcome, type EnforcementFacts } from './facts.ts';
export { downAfterPenalty, periodExtension, type DownAfterPenalty } from './series.ts';
