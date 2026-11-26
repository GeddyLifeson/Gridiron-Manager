// Replay and challenges (WP-05; bible B9, B13.9). Entry point of `officiating/src/replay`.
// The integrator re-exports this from the package entry point and wires `replayRules` into the facade.
import type { ReplayRules } from '@gm/schema';
import { boothReview, challengeable } from './challenge.ts';
import { review } from './review.ts';

export { PARAMS, RULE_KEYS, REPLAY, KEY, MODEL, THIRD_IF, REFUSED, BOOTH_ONLY, boothOnlyKey, assistKey, replayParamNames, type BoothOnly } from './params.ts';
export { evidenceQuality, isWrong, changesTheResult, reviewCanChange, assistCanChange } from './evidence.ts';
export { boothOnlySituation, boothOnlyRuling, boothMayReview, challengesLeft, challengeRefusal, challengeable, boothReview, challengeAccounting, challengeFoul, NO_TIMEOUT_FOUL } from './challenge.ts';
export { review, placementValues, type ReviewOutcome } from './review.ts';

/** The replay rules of WP-05. They keep no state between calls. */
export const replayRules: ReplayRules = { challengeable, boothReview, review };
