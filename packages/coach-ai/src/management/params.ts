// Rule keys and tuning constants of coach AI game management (K5). Every number K5 uses is either a rule
// key read from the rule set (K5.8.1: no rule value in code) or a row here. Rows marked `bible` quote a K5
// leaf's "starting" value; rows marked `assumption` are named in DECISIONS.md. None is a sourced football
// fact: the league rates they must reproduce are the J15 rows, checked by the batch run (owed, DECISIONS.md).
// The shapes mirror @gm/schema `TuningParam` and `RuleKeyDef` structurally: coach-ai may not import schema (P1.2.1).

export interface ParamRow {
  name: string; value: number; min: number; max: number; unit: string; belongsTo: string;
  basis: 'bible' | 'assumption'; leaf: string; constrainedBy: string; status: 'starting';
}
export interface RuleKeyRow { key: string; type: 'number'; unit: string; meaning: string; ownerLeaf: string; readBy: string[] }

const MODULE = 'coachAi.management';
const READ_BY = [MODULE];
const key = (k: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyRow => ({ key: k, type: 'number', unit, meaning, ownerLeaf, readBy: READ_BY });

export const RULE_KEYS: RuleKeyRow[] = [
  key('series.downs', 'count', 'Last down of a series: the fourth-down decision and the kneel count (K5.2.1, K5.4.3).', 'B3'),
  key('series.yards_to_gain', 'yd', 'Distance of a new series (K5.2.1 option search).', 'B3'),
  key('field.goal_to_goal_yd', 'yd', 'Field length (K5.2.1, K5.4.2).', 'B2'),
  key('score.touchdown', 'points', 'Touchdown value: how many scores a margin is (K5.2.1 rule 4, K5.4.1).', 'B7'),
  key('score.field_goal', 'points', 'Field goal value (K5.4.2 last play).', 'B7'),
  key('try.kick_points', 'points', 'Kicked try value (K5.3.1).', 'B7'),
  key('try.two_point_points', 'points', 'Two-point try value (K5.3.1, size of one score).', 'B7'),
  key('fg.miss_spot_min_yardline', 'yd', 'Missed field goal spot floor (K5.2.1 option search).', 'B6'),
  key('kickoff.touchback_yardline', 'yd', 'Touchback spot: where the kickoff state after a score is placed (K5.3.1 option search).', 'B6'),
  key('clock.play_clock_s', 's', 'Play clock: time one snap can burn (K5.4.1, K5.4.3).', 'B1'),
  key('clock.two_minute_timeout', 'count', 'Whether an automatic late-half stop exists: one more clock stop for the kneel count (K5.4.3). 0 or 1.', 'B1'),
  key('timeout.per_half', 'count', 'Timeouts per half (K5.5.1).', 'B1'),
  key('foul.delay_of_game.yards', 'yd', 'Delay foul distance: the price compared with a timeout (K5.5.1 reason 1).', 'B8'),
  key('challenge.count', 'count', 'Coach challenges per game (K5.5.2).', 'B9'),
  key('challenge.requires_timeout', 'count', 'A lost challenge costs a timeout (K5.5.2). 0 or 1.', 'B9'),
  key('challenge.needs_available_timeout', 'count', 'A challenge needs a timeout in hand (K5.5.2 edge case). 0 or 1.', 'B9'),
  key('overtime.two_point_required_from_period', 'index', 'Overtime period from which a two-point try is required (K5.3.1); 0 when never.', 'B10'),
];

const rows: ParamRow[] = [];
function row(basis: ParamRow['basis'], name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => row('bible', n, v, lo, hi, u, leaf, c);
const assume = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => row('assumption', n, v, lo, hi, u, leaf, c);

// A3 ruling 22: every legal option keeps a chance. `prob.floor` starting 0.0001 per event.
bible('prob.floor', 0.0001, 0.000001, 0.01, 'ratio', 'A3.1', 'A3 ruling 22: no hard zeros');
// K5.1.1 rule 7.
bible('think.minS', 2, 0, 20, 's', 'K5.1.1', 'J11.6.1 request deadline');
bible('think.maxS', 6, 0, 30, 's', 'K5.1.1', 'J11.6.1 request deadline');
bible('think.closeBandPts', 1, 0, 10, 'wp_points', 'K5.1.1', 'K5.1.1 rule 7');
assume('think.closeExtraS', 4, 0, 20, 's', 'K5.1.1', 'K5.1.1 rule 7 says "longer" without a number');
// K5.2.1.
bible('fourth.fgRangeMin', 0.35, 0.05, 0.9, 'ratio', 'K5.2.1', 'J15.3.2 fourth-down mix');
bible('fourth.offsetPerYardPts', 0.5, 0, 3, 'wp_points', 'K5.2.1', 'J15.3.2 go rate by distance');
bible('fourth.lateS', 300, 0, 1800, 's', 'K5.2.1', 'K5.2.1 rule 4');
bible('fourth.lateOffsetFactor', 0.5, 0, 1, 'ratio', 'K5.2.1', 'K5.2.1 rule 4');
bible('fourth.desperateS', 120, 0, 900, 's', 'K5.2.1', 'K5.2.1 rule 4');
bible('fourth.preDecidePts', 2, 0, 20, 'wp_points', 'K5.2.1', 'K5.2.1 rule 5, I2.3.7');
bible('fourth.shortYd', 2, 1, 5, 'yd', 'K5.2.1', 'K4 short-yardage box hint');
// K5.4.1.
bible('clock.burnStartS', 600, 0, 3600, 's', 'K5.4.1', 'K5.4.1 rule 2: two-score lead with 10 minutes left');
bible('clock.burnLeadScores', 2, 1, 4, 'count', 'K5.4.1', 'K5.4.1 rule 2');
assume('clock.burnShiftPerZS', 180, 0, 900, 's', 'K5.4.1', 'leadProtection shifts the start; size unsourced');
assume('clock.saveStartS', 300, 0, 3600, 's', 'K5.4.1', 'deficit of one score; grows by deficit; unsourced');
assume('clock.saveShiftPerZS', 120, 0, 900, 's', 'K5.4.1', 'deficitUrgency shifts the start; size unsourced');
bible('clock.burnSnapMinS', 1, 0, 10, 's', 'K5.4.1', 'K5.4.1 rule 4');
bible('clock.burnSnapMaxS', 3, 0, 15, 's', 'K5.4.1', 'K5.4.1 rule 4');
bible('clock.allowScoreMinZ', 1, -3, 3, 'z', 'K5.4.1', 'K5.4.1 rule 6');
// K5.4.2.
assume('half.attackBasePts', 0.3, -5, 5, 'wp_points', 'K5.4.2', 'K5.4.2 acceptance (95% attack at 1:30, 90% sit at 0:20)');
assume('half.attackPerZPts', 0.25, 0, 3, 'wp_points', 'K5.4.2', 'endOfHalfAggression effect; unsourced');
assume('half.hurryPlayS', 12, 3, 40, 's', 'K5.4.2', 'clock used by one hurry-up play in bounds; unsourced');
assume('half.stoppedPlayS', 6, 2, 20, 's', 'K5.4.2', 'clock used by a play that ends with the clock stopped; unsourced');
assume('half.yardsPerPlay', 9, 1, 30, 'yd', 'K5.4.2', 'yards a hurry-up play gains in the arithmetic; unsourced');
bible('half.spikeMinS', 3, 0, 10, 's', 'K5.4.2', 'K5.4.2: spike possible with at least 3 s');
assume('half.windowS', 120, 10, 600, 's', 'K5.4.2', 'time before a half ends in which the end-of-half plan applies; unsourced');
assume('half.lastPlayS', 8, 1, 30, 's', 'K5.4.2', 'time under which only one play is left; unsourced');
assume('half.hailMaryMaxYd', 65, 20, 80, 'yd', 'K5.4.2', 'longest heave considered; unsourced');
// K5.4.3.
bible('kneel.marginPerSnapS', 2, 0, 10, 's', 'K5.4.3', 'K5.4.3: safety margin');
bible('spike.savingS', 8, 0, 30, 's', 'K5.4.3', 'K5.4.3: spike when a real play costs this much more');
assume('spike.calledPlayMinZ', 0.5, -3, 3, 'z', 'K5.4.3', '"high clockManagement" is not given a number');
// K5.5.1.
bible('timeout.delayPlayClockS', 2, 0, 10, 's', 'K5.5.1', 'K5.5.1 reason 1');
bible('timeout.restChance', 0.05, 0, 1, 'ratio', 'K5.5.1', 'K5.5.1 reason 5; J15 timeouts per game 7.7');
// K5.5.2.
assume('challenge.optionValuePts', 0.4, 0, 5, 'wp_points', 'K5.5.2', 'value of keeping a challenge; unsourced');
assume('challenge.eagernessPerZ', 0.5, 0, 2, 'ratio', 'K5.5.2', 'challengeEagerness is a z-score; multiplier is exp(k z)');
// K5.6.1.
bible('error.zSlope', 0.6, 0, 3, 'ratio', 'K5.6.1', 'K5.6.1 rule 2');
bible('error.capFactor', 3, 1, 10, 'ratio', 'K5.6.1', 'K5.6.1 rule 2');
bible('error.advisorCut', 0.4, 0, 1, 'ratio', 'K5.6.1', 'K5.6.1 rule 4');
bible('error.lowValueReversal', 0.25, 0, 1, 'ratio', 'K5.6.1', 'low_value_challenge trigger');
bible('error.lowValuePts', 0.5, 0, 10, 'wp_points', 'K5.6.1', 'low_value_challenge trigger');
bible('error.lateTimeoutMinS', 5, 0, 40, 's', 'K5.6.1', 'late_two_minute_timeout');
bible('error.lateTimeoutMaxS', 15, 0, 40, 's', 'K5.6.1', 'late_two_minute_timeout');
bible('error.earlySnapMinS', 8, 0, 40, 's', 'K5.6.1', 'early_snap_with_lead');
bible('error.earlySnapMaxS', 15, 0, 40, 's', 'K5.6.1', 'early_snap_with_lead');
bible('error.puntReturnSaveS', 30, 0, 120, 's', 'K5.6.1', 'no_timeout_before_punt_return trigger');
// K5.7.
bible('penalty.epOnlyMaxZ', -1, -3, 3, 'z', 'K5.7.1', 'K5.7.1');
bible('toss.deferEdgePts', 0.5, 0, 10, 'wp_points', 'K5.7.2', 'K5.7.2');
bible('toss.windMph', 12, 0, 60, 'mph', 'K5.7.2', 'K5.7.2');
bible('rest.wpBase', 0.99, 0.9, 1, 'ratio', 'K5.7.3', 'K5.7.3');
bible('rest.wpMin', 0.97, 0.9, 1, 'ratio', 'K5.7.3', 'K5.7.3');
bible('rest.wpMax', 0.997, 0.9, 1, 'ratio', 'K5.7.3', 'K5.7.3');
assume('rest.perZ', 0.008, 0, 0.05, 'ratio', 'K5.7.3', 'starterRestBias moves the threshold inside the K5.7.3 range');
bible('rest.returnLow', 0.05, 0, 0.5, 'ratio', 'K5.7.3', 'K5.7.3 edge case');
bible('rest.returnHigh', 0.95, 0.5, 1, 'ratio', 'K5.7.3', 'K5.7.3 edge case');
assume('rest.seasonBase', 0.5, 0, 1, 'ratio', 'K5.7.3', 'chance to rest in a game that cannot change seeding at bias 0; unsourced');
assume('rest.seasonPerZ', 0.2, 0, 1, 'ratio', 'K5.7.3', 'bias effect on that chance; unsourced');

export const PARAMS = { module: MODULE, version: 'g59.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `${MODULE}.${name}`);
  if (!r) throw new Error(`unknown parameter ${MODULE}.${name}`);
  return r.value;
}

/** K5.6.1 rule 1: the error list is content. Base chance per trigger at clockManagement z = 0 (each an Assumption in the bible). */
export const ERROR_LIST = {
  timeout_for_delay: 0.30,
  late_two_minute_timeout: 0.15,
  low_value_challenge: 0.04,
  early_snap_with_lead: 0.10,
  timeout_wasted_first_quarter: 0.06,
  kneel_miscount: 0.02,
  no_timeout_before_punt_return: 0.10,
} as const;
export type ErrorId = keyof typeof ERROR_LIST;
export const ERROR_IDS = Object.keys(ERROR_LIST).sort() as ErrorId[];
