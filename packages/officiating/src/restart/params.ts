// Restart rules: the rule keys they read and their (empty) tuning file (WP-03).
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';

const READER = 'officiating/restart';
const num = (key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef => ({ key, type: 'number', unit, meaning, ownerLeaf, readBy: [READER] });
const flag = (key: string, meaning: string, ownerLeaf: string): RuleKeyDef => ({ key, type: 'boolean', meaning, ownerLeaf, readBy: [READER] });
const opt = (key: string, options: string[], meaning: string, ownerLeaf: string): RuleKeyDef => ({ key, type: 'option', options, meaning, ownerLeaf, readBy: [READER] });

export const KEY = {
  format: 'kickoff.format',
  kickYardline: 'kickoff.kick_yardline',
  safetyKickYardline: 'kickoff.safety_kick_yardline',
  kickingTeamLine: 'kickoff.kicking_team_line_yardline',
  receivingLine: 'kickoff.receiving_line_yardline',
  setupZoneBack: 'kickoff.setup_zone_back_yardline',
  landingZone: 'kickoff.landing_zone_yardline',
  onsideMinDistance: 'onside.min_distance_yd',
  onsideSetupDepth: 'onside.setup_zone_depth_yd',
  tryKickSnap: 'try.kick_snap_yardline',
  tryTwoSnap: 'try.two_point_snap_yardline',
  playClock: 'clock.play_clock_s',
  playClockStoppage: 'clock.play_clock_after_stoppage_s',
  fairCatchKick: 'fg.fair_catch_kick',
  deferAllowed: 'toss.defer_allowed',
  overtimeDeferAllowed: 'overtime.toss_defer_allowed',
  overtimeFormat: 'overtime.format',
  halfDistanceDivisor: 'enforce.half_distance_divisor',
} as const;

export const FORMAT_DYNAMIC = 'dynamic';
export const FORMAT_TRADITIONAL = 'traditional';
export const OT_TIMED = 'timed_period';
export const OT_ALTERNATING = 'alternating_series_25';

export const RULE_KEYS: RuleKeyManifest = [
  opt(KEY.format, [FORMAT_DYNAMIC, FORMAT_TRADITIONAL], 'Kickoff format (see officiating/kick)', 'B6.1.2'),
  num(KEY.kickYardline, 'yd', 'Kicking team yard line of the kicker restraining line on a kickoff, before any penalty', 'B6.1.1'),
  num(KEY.safetyKickYardline, 'yd', 'Kicking team yard line of a safety kick, before any penalty', 'B6.1.1'),
  num(KEY.kickingTeamLine, 'yd', 'Receiving team yard line where the ten non-kickers line up in the dynamic format. Not read in the traditional format', 'B6.1.2'),
  num(KEY.receivingLine, 'yd', 'Receiving team yard line of its restraining line in the dynamic format. Not read in the traditional format', 'B6.1.2'),
  num(KEY.setupZoneBack, 'yd', 'Receiving team yard line of the back of the setup zone in the dynamic format. Not read in the traditional format', 'B6.1.2'),
  num(KEY.landingZone, 'yd', 'Receiving team yard line where the landing zone begins (see officiating/kick)', 'B6.1.2'),
  num(KEY.onsideMinDistance, 'yd', 'Distance from the kick to the receiving team restraining line on a ten-yard free kick (see officiating/kick)', 'B6.2.1'),
  num(KEY.onsideSetupDepth, 'yd', 'Depth of the onside kick setup zone behind the receiving team restraining line. 0 where there is no such zone', 'B6.2.1'),
  num(KEY.tryKickSnap, 'yd', 'Yards from the goal line where a try by kick is snapped', 'B7.3.1'),
  num(KEY.tryTwoSnap, 'yd', 'Yards from the goal line where a try by run or pass is snapped', 'B7.3.1'),
  num(KEY.playClock, 's', 'Play clock in the normal case; used for the try', 'B1.3.1'),
  num(KEY.playClockStoppage, 's', 'Play clock after an administrative stoppage; used for free kicks, the fair catch kick and a series that starts an overtime possession', 'B1.3.1'),
  flag(KEY.fairCatchKick, 'A fair catch kick may follow a fair catch', 'B6.4.3'),
  flag(KEY.deferAllowed, 'The winner of the opening toss may defer its choice to the second half', 'B1.1.2'),
  flag(KEY.overtimeDeferAllowed, 'The winner of the overtime toss may defer', 'B10.1.1'),
  opt(KEY.overtimeFormat, [OT_TIMED, OT_ALTERNATING], 'Overtime format (see officiating/overtime); it decides whether the toss privilege is to receive or kick, or to play offense or defense', 'B10.1.1'),
  num(KEY.halfDistanceDivisor, 'ratio', 'A distance penalty may not exceed the distance from the enforcement spot to the offender goal line divided by this. Shared with the foul module, which owns it', 'B8.5.3'),
];

/** The restart rules apply rules as written and have no tuning constant. */
export const PARAMS: ParamFile = { module: 'officiating.restart', version: '1', params: [] };
