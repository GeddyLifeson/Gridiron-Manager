// Win probability (N2.2.2).
export * from './types.ts';
export {
  WP_VARS, DEFAULT_WP_TERMS, DEFAULT_MONOTONE_TERMS, DEFAULT_WP_SUPPORT, WpModelError,
  wpSupportIndex, wpSupportSize, wpRuleValues, fitWpModel, loadWpModel, canKneelOut, wp, wpa, optionWp,
  type WpEval, type WpFitOptions, type WpModel, type WpEnd, type OptionOutcome, type OptionValue,
} from './model.ts';
export { calibrationBands, type CalibrationBand } from './calibration.ts';
export { RULE_KEYS, PARAMS } from './params.ts';
import baseline from './baseline-nflverse.json' with { type: 'json' };
import type { WpModelFile } from './types.ts';
/** Bootstrap model fitted with BASELINE_EP_MODEL to nflverse play-by-play (2022 and 2023). See test/nflverse/README.md. */
export const BASELINE_WP_MODEL = baseline as unknown as WpModelFile;
