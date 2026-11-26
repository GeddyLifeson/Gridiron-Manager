// Kick ruling: the rule keys it reads and its (empty) tuning file (plans/engine-build-plan.md, WP-03).
// Values and fact rows belong to WP-01. A key that has no meaning at one level still exists in both
// rule-set files with a value that switches the behaviour off (B13.1.2 edge case); the meaning says how.
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';

const READER = 'officiating/kick';

function num(key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef {
  return { key, type: 'number', unit, meaning, ownerLeaf, readBy: [READER] };
}
function flag(key: string, meaning: string, ownerLeaf: string): RuleKeyDef {
  return { key, type: 'boolean', meaning, ownerLeaf, readBy: [READER] };
}
function opt(key: string, options: string[], meaning: string, ownerLeaf: string): RuleKeyDef {
  return { key, type: 'option', options, meaning, ownerLeaf, readBy: [READER] };
}

/** Key names, so no string is typed twice. */
export const KEY = {
  format: 'kickoff.format',
  landingZone: 'kickoff.landing_zone_yardline',
  touchback: 'kickoff.touchback_yardline',
  touchbackLandingZone: 'kickoff.touchback_landing_zone_yardline',
  touchbackReducedKick: 'kickoff.touchback_reduced_kick_yardline',
  touchbackReduced: 'kickoff.touchback_reduced_yardline',
  shortSpot: 'kickoff.short_spot_yd_from_kick',
  shortSpotSafetyKick: 'kickoff.safety_kick_short_spot_yd_from_kick',
  outOfBounds: 'kickoff.out_of_bounds_yd_from_kick',
  outOfBoundsSafetyKick: 'kickoff.safety_kick_out_of_bounds_yd_from_kick',
  fairCatchToTouchback: 'kickoff.fair_catch_inside_25_to_25',
  onsideMinDistance: 'onside.min_distance_yd',
  onsideUntouchedDead: 'onside.untouched_dead_beyond_yd',
  onsideUntouchedPenalty: 'onside.untouched_beyond_penalty_yd',
  touchbackGeneral: 'touchback.yardline',
  firstTouchMin: 'punt.first_touch_min_yardline',
  missSpot: 'fg.miss_spot',
  missSpotMin: 'fg.miss_spot_min_yardline',
  touchdown: 'score.touchdown',
  fieldGoal: 'score.field_goal',
  safety: 'score.safety',
  tryKick: 'try.kick_points',
  tryTwo: 'try.two_point_points',
  tryDefense: 'try.defense_return_points',
  trySafety: 'try.safety_points',
  twoPointRequiredFrom: 'overtime.two_point_required_from_period',
} as const;

export const FORMAT_DYNAMIC = 'dynamic';
export const FORMAT_TRADITIONAL = 'traditional';
export const MISS_AT_KICK_SPOT = 'kick_spot_min_20';
export const MISS_AT_PREVIOUS_SPOT = 'previous_spot_min_20';

export const RULE_KEYS: RuleKeyManifest = [
  opt(KEY.format, [FORMAT_DYNAMIC, FORMAT_TRADITIONAL], 'Kickoff format. dynamic: landing zone and setup zone (B6.1.2). traditional: ten-yard free kick (B13.6.1)', 'B6.1.2'),
  num(KEY.landingZone, 'yd', 'Receiving team yard line where the landing zone begins; it runs from there to the goal line. Read only when the format is dynamic', 'B6.1.2'),
  num(KEY.touchback, 'yd', 'Receiving team yard line of a kickoff touchback when the kick did not first touch the ground or a player in the landing zone. The only kickoff touchback spot when the format is traditional', 'B6.1.4'),
  num(KEY.touchbackLandingZone, 'yd', 'Receiving team yard line of a kickoff touchback after the kick first touched the ground or a player in the landing zone. Equal to kickoff.touchback_yardline where there is no landing zone', 'B6.1.4'),
  num(KEY.touchbackReducedKick, 'yd', 'A kickoff made from this yard line of the kicking team, or beyond it, takes the reduced touchback spot', 'B6.1.4'),
  num(KEY.touchbackReduced, 'yd', 'Receiving team yard line of a touchback on a kickoff made from kickoff.touchback_reduced_kick_yardline or beyond. Equal to kickoff.touchback_yardline where the level has no such rule', 'B6.1.4'),
  num(KEY.shortSpot, 'yd', 'Kickoff short of the landing zone: receivers take the ball this many yards from the spot of the kick, or at the spot of the first touch if that is nearer the kick. Read only when the format is dynamic', 'B6.1.4'),
  num(KEY.shortSpotSafetyKick, 'yd', 'The same distance for a safety kick', 'B6.1.4'),
  num(KEY.outOfBounds, 'yd', 'Free kick out of bounds: receivers may take the ball this many yards from the spot of the kick at the inbounds line, or at the out-of-bounds spot', 'B6.1.4'),
  num(KEY.outOfBoundsSafetyKick, 'yd', 'The same distance for a safety kick', 'B6.1.4'),
  flag(KEY.fairCatchToTouchback, 'A fair catch of a kickoff behind the touchback yard line is spotted at the touchback yard line', 'B13.6.1'),
  num(KEY.onsideMinDistance, 'yd', 'Distance a ten-yard free kick (declared onside kick, or any free kick in the traditional format) must travel before the kicking team may touch it, unless a receiver touched it first', 'B6.2.1'),
  num(KEY.onsideUntouchedDead, 'yd', 'A declared onside kick untouched beyond this distance from the kick is dead and belongs to the receivers. 0 switches the rule off', 'B6.2.1'),
  num(KEY.onsideUntouchedPenalty, 'yd', 'Yards walked off from the kicking team restraining line when a declared onside kick is dead untouched beyond the setup zone', 'B6.2.1'),
  num(KEY.touchbackGeneral, 'yd', 'Yard line of a touchback that is not a kickoff touchback (scrimmage kicks, and loose balls after the kick has ended)', 'B6.3.3'),
  num(KEY.firstTouchMin, 'yd', 'A first-touch spot is never nearer the receivers goal line than this yard line', 'B6.3.3'),
  opt(KEY.missSpot, [MISS_AT_KICK_SPOT, MISS_AT_PREVIOUS_SPOT], 'Where the receivers take over after an untouched missed field goal that crossed the line: the spot of the kick or the previous spot, never inside fg.miss_spot_min_yardline', 'B6.5.2'),
  num(KEY.missSpotMin, 'yd', 'Receiving team yard line used when the missed field goal spot would be nearer the goal line', 'B6.5.2'),
  num(KEY.touchdown, 'points', 'Touchdown', 'B7.1.1'),
  num(KEY.fieldGoal, 'points', 'Field goal, and a fair catch kick that is good', 'B7.1.1'),
  num(KEY.safety, 'points', 'Safety', 'B7.1.1'),
  num(KEY.tryKick, 'points', 'Try by kick', 'B7.3.2'),
  num(KEY.tryTwo, 'points', 'Try by run or pass, including a blocked try kick run in by the kicking team', 'B7.3.2'),
  num(KEY.tryDefense, 'points', 'Try returned by the defense to the other end zone', 'B7.3.2'),
  num(KEY.trySafety, 'points', 'A play on a try that would ordinarily be a safety scores this for the opponent', 'B7.3.2'),
  num(KEY.twoPointRequiredFrom, 'index', 'From this overtime period a try by kick scores nothing. 0 means the rule does not exist', 'B13.7.1'),
];

/** The kick ruling applies rules as written and has no tuning constant. */
export const PARAMS: ParamFile = { module: 'officiating.kick', version: '1', params: [] };
