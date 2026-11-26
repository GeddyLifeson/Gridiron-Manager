// Expected points (N2.2.1) and the per-play measures (N2.2.3).
export * from './types.ts';
export { fitGlm, softmaxRow, type GlmData, type GlmFit, type GlmOptions } from './glm.ts';
export { choleskySolve } from './linalg.ts';
export { compileFeatures, fitStandardiser, standardise, FeatureSpecError, type CompiledFeatures, type Standardiser, type VarTable } from './features.ts';
export {
  EP_VARS, DEFAULT_SCRIMMAGE_TERMS, DEFAULT_KICKOFF_TERMS, DEFAULT_SUPPORT_EDGES, EpModelError,
  classValues, supportIndex, supportSize, fitEpModel, loadEpModel, epProbabilities, ep, epa,
  type EpFitOptions, type EpModel, type PlayEnd,
} from './model.ts';
export * from './success.ts';
export { RULE_KEYS, PARAMS } from './params.ts';
import baseline from './baseline-nflverse.json' with { type: 'json' };
import type { EpModelFile } from './types.ts';
/**
 * Bootstrap model fitted to nflverse play-by-play (2022 and 2023 regular seasons) until the engine
 * produces its own training batches (N2.2.1 rule 1 says the shipped model is fitted to the game's own
 * football; this file stands in until Q-area batches exist). See test/nflverse/README.md.
 */
export const BASELINE_EP_MODEL = baseline as unknown as EpModelFile;
