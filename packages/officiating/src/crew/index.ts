// Officials model (WP-05; bible B11.1 to B11.4). Entry point of `officiating/src/crew`.
// The integrator re-exports this from the package entry point and wires `crewModel` into the facade.
export { PARAMS, RULE_KEYS, CREW, DETECTION_FAMILIES, MARGIN_ASPECTS, baseParam, errorScaleYdParam, errorScaleSParam,
  reviewableKey, foulReplayKey, foulReplaySwitch, crewParamNames, paramTable, type DetectionFamily, type MarginAspect } from './params.ts';
export { OFFICIAL_POSITIONS, BOOTH_STREAM_INDEX, ASSIST_STREAM_INDEX, WATCH, officialSpots, viewOf, type OfficialSpot, type View } from './zones.ts';
export { FOUL_DETECTION_BY_ID, detectionClass, type DetectionClass } from './foul-families.ts';
export { trueFoulCallChance, phantomCallChance, visibilityFactor, phantomRecord, possessionChangedBefore, type FoulEvent } from './detection.ts';
export { RUNNER_DOWN_REASONS, rulingErrorChance, spotSd, decideRulings, type StreamOf } from './rulings.ts';
export { seenFrom, deadBallIndex, possessionSideBefore, attackDirOf, goalLineAttackedBy, type PlacementValues } from './seen.ts';
export { crewModel, perceive, foulIndexOfRuling, foulsAfterReview } from './perceive.ts';
export { neutralCrew, drawCrew } from './tendencies.ts';
