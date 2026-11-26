// Crowd driver (PV-08): the crowd bed follows the engine's noise value; one reaction per play follows
// the ruling on the field. Import from here inside app-ui.
export { CrowdDriver, CROWD_BED_KEY, BED_EASE_SECONDS, type CrowdDriverOptions, type CrowdPlayReport, type PlayTiming, type ReactionReport } from './driver.ts';
export { pickReaction, reactionCandidates, REACTION_SOUND, BIG_GAIN_YARDS, type ReactionPick } from './reactions.ts';
export { CROWD_FEED_FORMAT, isRuling, type CrowdFeed, type CrowdCue, type CrowdRulingCue, type CrowdOtherCue, type CrowdRulingKind, type CrowdSide } from './types.ts';
