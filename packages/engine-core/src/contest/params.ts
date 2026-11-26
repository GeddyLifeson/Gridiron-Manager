// Contest parameter file (J6.8.1) and rule-key manifest for the contest module (WP-12).
// Every number a contest uses is a row here. `basis: 'bible'` rows are the starting values J6 states;
// `basis: 'assumption'` rows are forms or weights J6 names without a number, chosen by this module and
// to be moved by calibration (J15, Q2) and the response tests (Q1.7.1, Q1.7.3, Q3). None is a football fact.
import type { ParamFile, ParamTable, RuleKeyManifest, RuleSet, TuningParam } from '@gm/schema';

/** D's internal skill scale (J6.1.1): 50 is the average pro starter, 10 is one standard deviation. */
export const ISS_MEAN = 50;
export const ISS_SD = 10;
/** J6.1.3 edge case: probabilities are clamped so nothing is ever certain or impossible. */
export const P_FLOOR = 0.0005;
export const P_CEIL = 0.9995;

type Basis = 'b' | 'a';
type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: Basis];

function group(belongsTo: string, leaf: string, constrainedBy: string, rows: readonly Row[]): TuningParam[] {
  return rows.map(([name, value, min, max, unit, basis]) => ({
    name: `contest.${name}`, value, min, max, unit, belongsTo,
    basis: basis === 'b' ? 'bible' as const : 'assumption' as const,
    leaf, constrainedBy, status: 'starting' as const,
  }));
}

const RUSH = 'J15.4.2 pressure and sack rates; Q3.2.2 protection items; Q1.7.1 pass block ladder';
const RUN = 'J15.5.1 rushing distribution; Q3.2.3 run game items; Q1.7.1 run block ladder';
const COVER = 'J15.4.1 completion by depth; Q3.2.1 pass game items; Q1.7.1 route against coverage ladder';
const CATCH = 'J15.4.1 completion, interception and drop rates by depth; Q1.7.1 catch point ladder';
const TACKLE = 'J15.5.1 rushing quantiles; J15.4.1 yards after catch; Q1.7.1 tackle ladder';
const SHORT = 'J15.3.2 short-yardage conversion; Q1.7.3 line response';
const FUMBLE = 'J15.7.2 fumble rates; J15.9.1 split-half reliability of team fumble rate';

export const PARAMS: ParamFile = {
  module: 'engine.contest',
  version: '0.1.0',
  params: [
    ...group('effective z', 'J6.1.1', 'Q1.7.3 rating-response sweeps', [
      ['common.fatigueCoef', 0.8, 0.4, 1.2, 'z', 'b'],
    ]),
    ...group('probability clamp', 'J6.1.3', 'Q1.7.1 base-rate check', [
      ['common.pFloor', P_FLOOR, 0.0001, 0.01, 'probability', 'b'],
      ['common.pCeil', P_CEIL, 0.99, 0.9999, 'probability', 'b'],
    ]),

    // J6.2.1 one-on-one pass block
    ...group('pass block engagement', 'J6.2.1', RUSH, [
      ['passBlock.kappa', 0.9, 0.3, 2.0, '1/s', 'b'],
      ['passBlock.lambda', 0.3, 0, 1.5, '1/s', 'b'],
      ['passBlock.sigma', 0.45, 0.1, 1.0, 'A/sqrt(s)', 'b'],
      // Share of the two players' effective-z difference that reaches the engagement drift. J6.1.2 as written
      // (share 1) lets a blocker 1 z worse lose 93% of rushes inside 2.5 s; ESPN's 2024 win rates put a top-ten
      // edge near 20 to 25% and a top-ten tackle near 95%, about 0.4 logit per z. 0.067 gives that slope and
      // leaves the even matchup, help and start terms where they were. Status of the real slope: 1 of 3.
      ['passBlock.skillGain', 0.067, 0.02, 1, 'share', 'a'],
      // "Interior rushers ... same form, own parameter row": the row starts equal to the edge row.
      ['passBlock.interior.kappa', 0.9, 0.3, 2.0, '1/s', 'a'],
      ['passBlock.interior.lambda', 0.3, 0, 1.5, '1/s', 'a'],
      ['passBlock.interior.sigma', 0.45, 0.1, 1.0, 'A/sqrt(s)', 'a'],
      ['passBlock.gLosing', 1.0, 0.8, 1.0, 'share of free speed', 'b'],
      // J6.2.1 states 0.35. Tuned to 0.15 against the pro sack rate (48 tick-engine games: 0.35 gave 10.0% sacks,
      // 0.15 gave 8.4%; real 6.9%), so the row is no longer the bible's number and is marked as this module's.
      ['passBlock.gEven', 0.1, 0.1, 0.7, 'share of free speed', 'a'], // tuned from 0.15 with pressure.*: pressure 51% to 38% of dropbacks (J15.4.2)
      ['passBlock.gWinning', 0, 0, 0.2, 'share of free speed', 'b'],
      ['passBlock.counterThreshold', 0.4, 0.2, 0.8, 'A', 'b'],
      ['passBlock.counterHoldS', 0.5, 0.2, 1.0, 's', 'b'],
      ['passBlock.startBeatSetPoint', -0.6, -0.9, -0.2, 'A', 'b'],
      ['passBlock.counterBeta0', 0, -2, 2, 'logit', 'a'],
      ['passBlock.counterBeta1', 0.5, 0, 1.5, 'logit/z', 'a'],
      ['passBlock.counterResidual', 0.25, 0, 1, 'share of A kept', 'a'],
      ['passBlock.getOffGain', 0.15, 0, 0.4, 'A/z', 'a'],
      ['passBlock.getOffCap', 0.5, 0.1, 0.8, 'A', 'a'],
    ]),
    // J6.2.2 stunts
    ...group('stunt exchange', 'J6.2.2', RUSH, [
      ['stunt.beta0', 1.2, 0, 2.5, 'logit', 'b'],
      ['stunt.recognition', 0.6, 0, 1.5, 'logit/z', 'b'],
      ['stunt.timing', -0.5, -1.5, 0, 'logit/z', 'b'],
      ['stunt.slide', 0.4, 0, 1.2, 'logit', 'b'],
      ['stunt.prepared', 0.3, 0, 1.0, 'logit', 'b'],
      ['stunt.lateStart', -0.4, -0.8, 0, 'A', 'b'],
      ['stunt.bustFreeMinS', 0.4, 0.1, 0.8, 's', 'b'],
      ['stunt.bustFreeMaxS', 0.8, 0.4, 1.5, 's', 'b'],
      ['stunt.penetratorBonusZ', 0.3, 0, 0.8, 'z', 'b'],
      ['stunt.lateShareOfFailed', 0.6, 0.2, 0.9, 'share', 'a'],
      ['stunt.bothTakePenetratorShare', 0.3, 0, 0.7, 'share of busts', 'a'],
    ]),
    // J6.2.3 help
    ...group('protection help', 'J6.2.3', RUSH, [
      ['help.doubleZ', 1.0, 0.4, 1.8, 'z', 'b'],
      ['help.chipZ', 0.4, 0.1, 0.9, 'z', 'b'],
      ['help.chipDurationS', 0.5, 0.2, 1.0, 's', 'b'],
      ['help.chipDelayMinS', 0.4, 0.2, 0.6, 's', 'b'],
      ['help.chipDelayMaxS', 0.6, 0.4, 1.0, 's', 'b'],
      ['help.slideLookForWorkS', 0.5, 0.2, 1.0, 's', 'b'],
    ]),
    // J6.2.4 late pickup
    ...group('blitz pickup', 'J6.2.4', RUSH, [
      ['blitz.lateEngageStart', -0.5, -0.9, -0.1, 'A', 'b'],
    ]),
    // J6.2.5 pressure and the sack draw
    ...group('pressure and sack', 'J6.2.5', RUSH, [
      ['pressure.distYd', 1.2, 1.0, 3.0, 'yd', 'b'], // tuned from 2.0: a rusher two yards off a quarterback who completes 62% was not charted pressure (real pressured completion 48.1%)
      ['pressure.timeS', 0.3, 0.3, 1.0, 's', 'b'], // tuned from 0.6 with pressure.distYd
      ['sack.beta0', 0.5, 0, 2.5, 'logit', 'b'], // tuned from 1.4: with the throwaway answer, sack rate 8.9% against real 6.9% (J15)
      ['sack.beta1', 0.5, 0.1, 1.2, 'logit/z', 'b'],
      ['sack.blindside', 0.6, 0, 1.5, 'logit', 'b'],
      ['sack.movingAway', -0.5, -1.5, 0, 'logit', 'b'],
      ['sack.secondRusher', 0.4, 0, 1.2, 'logit', 'b'],
    ]),

    // J6.3.1 one-on-one run block
    ...group('run block engagement', 'J6.3.1', RUN, [
      ['runBlock.kappa', 0.8, 0.3, 2.0, '1/s', 'b'],
      ['runBlock.lambda', 0.4, 0, 1.5, '1/s', 'b'],
      ['runBlock.sigma', 0.40, 0.1, 1.0, 'A/sqrt(s)', 'b'],
      // As passBlock.skillGain. ESPN 2024 run block and run stop win rates: top-ten players sit about 8 to 10
      // points above the team averages (71.5% and 30.5%), again about 0.4 logit per z.
      ['runBlock.skillGain', 0.07, 0.02, 1, 'share', 'a'],
      ['runBlock.displacementYps', 1.5, 0.5, 3.0, 'yd/s', 'b'],
      ['runBlock.gapControlMaxA', 0.45, 0, 0.6, 'A', 'b'], // tuned from 0.3 against J15.4.1 yards per carry after runners stopped circling back to path points
      // J6.3.1 says one-gap technique has higher sigma and two-gap lower, without sizes.
      ['runBlock.sigmaOneGapMult', 1.15, 1.0, 1.5, 'ratio', 'a'],
      ['runBlock.sigmaTwoGapMult', 0.85, 0.5, 1.0, 'ratio', 'a'],
      ['runBlock.twoGapShedDelayS', 0.2, 0, 0.5, 's', 'a'],
      // J6.1.2: g falls from 1 at A = -1 to a floor at A = +1, "shape per contest". J6.3.1 gives no shape.
      ['runBlock.gEven', 0.3, 0.1, 0.7, 'share of free speed', 'a'],
      ['runBlock.gWinning', 0, 0, 0.2, 'share of free speed', 'a'],
    ]),
    ...group('combination block', 'J6.3.2', RUN, [
      ['combo.doubleZ', 1.0, 0.4, 1.8, 'z', 'b'],
      ['combo.climbA', 0.5, 0.2, 0.8, 'A', 'b'],
    ]),
    ...group('block in space', 'J6.3.3', RUN, [
      ['space.madeStart', 0.3, 0, 0.6, 'A', 'b'],
      ['space.beta0', 0.4, -1, 2, 'logit', 'a'],
      ['space.beta1', 0.6, 0.1, 1.5, 'logit/z', 'a'],
      ['space.angle', 0.5, 0, 1.5, 'logit', 'a'],
      ['space.closing', -0.3, -1.0, 0, 'logit', 'a'],
      ['space.cut', 0.3, 0, 1.0, 'logit', 'a'],
      ['space.cutQuickWinShare', 0.35, 0, 0.8, 'share of made cut blocks', 'a'],
    ]),
    ...group('defensive line movement', 'J6.3.4', RUN, [
      ['movement.withFlowStart', -0.4, -0.8, 0, 'A', 'b'],
      ['movement.againstFlowStart', 0.3, 0, 0.6, 'A', 'b'],
    ]),

    // J6.4.1 release against press
    ...group('release against press', 'J6.4.1', COVER, [
      ['release.kappa', 1.6, 0.5, 3.0, '1/s', 'b'],
      ['release.lambda', 0, 0, 1.0, '1/s', 'b'],
      ['release.sigma', 0.60, 0.2, 1.2, 'A/sqrt(s)', 'b'],
      ['release.maxS', 1.0, 0.5, 1.5, 's', 'b'],
      ['release.cleanA', 0.5, 0.2, 0.8, 'A', 'b'],
      ['release.jamA', -0.5, -0.8, -0.2, 'A', 'b'],
      ['release.contestedDelayMinS', 0.2, 0, 0.3, 's', 'b'],
      ['release.contestedDelayMaxS', 0.3, 0.2, 0.5, 's', 'b'],
      ['release.jamDelayMaxS', 0.6, 0.3, 1.0, 's', 'b'],
      ['release.stemPushMaxYd', 1.5, 0.5, 3.0, 'yd', 'b'],
    ]),
    ...group('separation at the break', 'J6.4.2', COVER, [
      ['separation.baseS', 0.25, 0.1, 0.4, 's', 'b'],
      ['separation.perZCoverS', 0.05, 0, 0.12, 's/z', 'b'],
      ['separation.perZRouteS', 0.05, 0, 0.12, 's/z', 'b'],
      ['separation.floorS', 0.08, 0.02, 0.15, 's', 'b'],
      ['separation.leverageAwayS', 0.15, 0, 0.3, 's', 'b'],
      // "mLeverage is negative when the break goes toward the defender's leverage": no size given.
      ['separation.leverageTowardS', -0.10, -0.2, 0, 's', 'a'],
      ['separation.biteBeta0', 0, -2, 2, 'logit', 'a'],
      ['separation.biteDiscipline', -0.6, -1.5, 0, 'logit/z', 'a'],
      ['separation.biteAggressive', 0.5, 0, 1.5, 'logit/z', 'a'],
    ]),
    ...group('zone break on the throw', 'J6.4.3', COVER, [
      ['zone.baseS', 0.25, 0.1, 0.4, 's', 'b'],
      ['zone.perZS', 0.05, 0, 0.12, 's/z', 'b'],
      ['zone.floorS', 0.08, 0.02, 0.15, 's', 'b'],
      ['zone.leanMaxS', 0.10, 0, 0.2, 's', 'b'],
    ]),

    // J6.5.1 the catch point
    ...group('catch point', 'J6.5.1', CATCH, [
      ['catch.radiusYd', 1.1, 0.7, 1.6, 'yd', 'b'],
      ['catch.radiusPerZYd', 0.1, 0, 0.25, 'yd/z', 'b'],
      ['catch.uncontestedDistYd', 1.0, 0.5, 2.0, 'yd', 'b'],
      ['catch.beta0', 3.0, 1.5, 4.5, 'logit', 'b'],
      // J6.5.1 states 0.5. Fitted to the real spread of drop rates between receivers: drops per catchable ball,
      // 2018 to 2025, true-talent sd 1.77 points on 6.43%, 0.29 logit per player sd (PFR advanced receiving, one
      // charting source: 1 of 3). 104 tick games at 55 v 45: 0.5 gave 0.50 logit per z, 0.3 gives 0.27.
      ['catch.hands', 0.3, 0.1, 1.2, 'logit/z', 'a'],
      ['catch.placement', -1.2, -3.0, 0, 'logit per unit error', 'b'],
      ['catch.hit', -0.6, -2.0, 0, 'logit', 'b'],
      ['catch.wet', -0.3, -1.0, 0, 'logit', 'b'],
      // "larger for high balls": no size given.
      ['catch.highBallBonusYd', 0.3, 0, 0.8, 'yd', 'a'],
    ]),
    // J6.5.1 step 3 names the inputs of the contested softmax and its ordering, not the weights.
    ...group('contested catch softmax', 'J6.5.1', CATCH, [
      ['contested.catch0', 0.4, -1, 2, 'score', 'a'], // tuned from 0.6 against J15.4.1 completion by depth (1 of 3)
      ['contested.catchDz', 0.5, 0.1, 1.2, 'score/z', 'a'],
      ['contested.catchPlacement', -1.0, -3.0, 0, 'score per unit error', 'a'],
      ['contested.catchHit', -0.6, -2.0, 0, 'score', 'a'],
      ['contested.catchWet', -0.3, -1.0, 0, 'score', 'a'],
      ['contested.breakupInPhase', 0.4, -1, 2, 'score', 'a'],
      ['contested.breakupUndercut', 0.2, -1, 2, 'score', 'a'],
      ['contested.breakupTrail', -0.2, -3, 1, 'score', 'a'], // tuned from -0.8 against J15.4.1 completion by depth (1 of 3): a trailing defender in reach still plays the hands
      ['contested.breakupBlind', -0.6, -2, 0, 'score', 'a'],
      ['contested.breakupDz', -0.3, -1.0, 0, 'score/z', 'a'],
      ['contested.int0', -2.8, -4, 0, 'score', 'a'], // tuned from -2.2 against J15.4.1 interceptions per attempt (2 of 3)
      ['contested.intBallSkills', 0.4, 0, 1.2, 'score/z', 'a'],
      ['contested.intInPhase', 0.3, -1, 2, 'score', 'a'],
      ['contested.intUndercut', 1.2, 0, 3, 'score', 'a'],
      ['contested.intTrail', -1.5, -4, 0, 'score', 'a'],
      ['contested.intBlind', -2.0, -5, 0, 'score', 'a'],
      ['contested.intPlacement', 0.8, 0, 2.5, 'score per unit error', 'a'],
      ['contested.tipShare', 0.2, 0, 0.6, 'share of breakups', 'a'],
    ]),
    ...group('defender alone at the ball', 'J6.5.1', CATCH, [
      ['alone.int0', -1.0, -2, 2, 'logit', 'a'], // tuned from -0.4: a ball inside a running defender's reach is not a ball in his hands
      ['alone.intHands', 0.5, 0.1, 1.2, 'logit/z', 'a'],
    ]),
    ...group('feet in bounds and the ground', 'J6.5.1', CATCH, [
      ['feet.beta0', 2.0, 0, 4, 'logit', 'a'],
      ['feet.bodyControl', 0.5, 0.1, 1.2, 'logit/z', 'a'],
      ['feet.perExtraFoot', -0.9, -2.5, 0, 'logit per foot beyond one', 'a'],
      ['feet.tightness', -1.5, -4, 0, 'logit', 'a'],
      ['ground.beta0', 3.5, 2, 5, 'logit', 'a'],
      // Moved with catch.hands (same attribute, same real spread): 0.4 * 0.3 / 0.5.
      ['ground.hands', 0.24, 0, 1.2, 'logit/z', 'a'],
      ['ground.hit', -0.8, -2.5, 0, 'logit', 'a'],
    ]),

    // J6.6.1 tackle attempt
    ...group('tackle attempt', 'J6.6.1', TACKLE, [
      ['tackle.beta0', 1.7, 0.5, 3.0, 'logit', 'b'],
      // J6.6.1 states 0.5. Fitted to the real spread between players (PFR advanced tables, 2018 to 2025, one
      // charting source: 1 of 3): missed tackle rate true-talent sd 2.53 points on 8.97%, 0.31 logit per defender
      // sd; broken tackles per rush 0.35 logit per back sd (0.59 per reception). 104 tick games at 55 v 45: 0.5
      // (with move.beta1 0.6) gave 0.52 per z of tackling and 0.46 per z of the carrier; 0.35 (with 0.42) gives
      // 0.38 and 0.41. Tool: research/tuning/fit-tools/player_spread.py.
      ['tackle.beta1', 0.35, 0.1, 1.2, 'logit/z', 'a'],
      // The leaf names g_angle, g_mom, g_help, g_space, g_move and the strip trade-off without values.
      ['tackle.angle', 0.8, 0, 2.0, 'logit', 'a'],
      ['tackle.momentum', -0.6, -2.0, 0, 'logit per unit ratio', 'a'],
      ['tackle.help', 0.7, 0, 2.0, 'logit per extra tackler', 'a'],
      ['tackle.space', -0.6, -2.0, 0, 'logit', 'a'],
      ['tackle.move', -0.9, -2.5, 0, 'logit', 'a'],
      ['tackle.strip', -0.4, -1.5, 0, 'logit', 'a'],
      ['tackle.lungeAngleLoss', 0.5, 0, 1, 'angle quality', 'a'],
      ['tackle.brokenBeta0', -0.4, -2, 2, 'logit', 'a'],
      ['tackle.brokenBalance', 0.5, 0, 1.5, 'logit/z', 'a'],
      ['tackle.brokenMomentum', 0.6, 0, 2.0, 'logit per unit ratio', 'a'],
      ['tackle.brokenSpeedLossMin', 0.3, 0.1, 0.5, 'share of speed', 'b'],
      ['tackle.brokenSpeedLossMax', 0.6, 0.4, 0.9, 'share of speed', 'b'],
      ['tackle.progressMaxYd', 3.0, 1.0, 5.0, 'yd', 'b'],
      ['tackle.progressHeadOnYd', 0.5, 0, 2, 'yd', 'a'],
      ['tackle.progressSideYd', 1.0, 0, 2.5, 'yd', 'a'],
      ['tackle.progressBehindYd', 1.5, 0, 3, 'yd', 'a'],
      ['tackle.progressPerMomentumYd', 1.2, 0, 3, 'yd per unit ratio', 'a'],
      ['tackle.progressNoiseYd', 0.5, 0, 1.5, 'yd', 'a'],
    ]),
    ...group('pile and short yardage', 'J6.6.2', SHORT, [
      ['pile.baseYd', 0.5, -0.5, 1.5, 'yd', 'b'],
      ['pile.surgeYd', 1.2, 0.3, 2.5, 'yd per A', 'b'],
      ['pile.powerYd', 0.3, 0, 0.8, 'yd/z', 'b'],
      ['pile.freeDefenderYd', -0.5, -1.5, 0, 'yd per defender', 'b'],
      ['pile.minYd', -1, -2, 0, 'yd', 'b'],
      ['pile.maxYd', 3, 1, 5, 'yd', 'b'],
      ['pile.triggerDefenders', 2, 2, 4, 'count', 'b'],
      ['pile.triggerLosYd', 1.0, 0.5, 2.0, 'yd', 'b'],
      ['pile.noiseYd', 0.6, 0, 1.5, 'yd', 'a'],
      ['pile.pusherYd', 0.25, 0, 0.8, 'yd per pusher', 'a'],
    ]),

    // J6.7.1 fumbles
    ...group('fumble per hit', 'J6.7.1', FUMBLE, [
      ['fumble.beta0', -5.0, -7, -3, 'logit', 'b'],
      ['fumble.security', -0.5, -1.2, 0, 'logit/z', 'b'],
      ['fumble.hitPower', 0.4, 0, 1.2, 'logit/z', 'b'],
      // g_e, g_b, g_s, g_2, g_w, g_qb are named without values.
      ['fumble.energy', 0.5, 0, 1.5, 'logit per unit energy', 'a'],
      ['fumble.blindside', 0.8, 0, 2.0, 'logit', 'a'],
      ['fumble.strip', 0.9, 0, 2.0, 'logit', 'a'],
      ['fumble.secondHitter', 0.5, 0, 1.5, 'logit', 'a'],
      ['fumble.wet', 0.4, 0, 1.5, 'logit', 'a'],
      ['fumble.passer', 0.7, 0, 2.0, 'logit', 'a'],
    ]),
    ...group('loose ball recovery', 'J6.7.2', 'J15.7.2 offensive recovery share (band not yet measured)', [
      ['recovery.reachYd', 0.8, 0.4, 1.5, 'yd', 'b'],
      ['recovery.fall', 0.85, 0.5, 0.99, 'probability', 'b'],
      ['recovery.scoop', 0.55, 0.2, 0.9, 'probability', 'b'],
      ['recovery.contestWindowS', 0.3, 0.1, 0.6, 's', 'b'],
      ['recovery.crowd', -0.5, -1.5, 0, 'logit per extra player in reach', 'a'],
      ['recovery.scoopHands', 0.4, 0, 1.2, 'logit/z', 'a'],
      ['recovery.contestOrder', -6.0, -20, 0, 'score per second later', 'a'],
      ['recovery.contestGrade', 0.4, 0, 1.2, 'score/z', 'a'],
    ]),
  ],
};

/**
 * A parameter table over this module's own file, for tests and for callers that run a contest before
 * the integrator's merged table exists. Overrides are checked against each row's allowed range (J6.8.1).
 */
export function contestParamTable(overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const values = new Map<string, number>();
  for (const p of PARAMS.params) {
    if (p.value < p.min || p.value > p.max) throw new Error(`contest parameter ${p.name} = ${p.value} is outside ${p.min} to ${p.max}`);
    values.set(p.name, p.value);
  }
  for (const name of Object.keys(overrides)) {
    const row = PARAMS.params.find((p) => p.name === name);
    const v = overrides[name] as number;
    if (!row) throw new Error(`unknown contest parameter ${name}`);
    if (!(v >= row.min && v <= row.max)) throw new Error(`contest parameter ${name} = ${v} is outside ${row.min} to ${row.max}`);
    values.set(name, v);
  }
  return {
    version: PARAMS.version,
    has: (name) => values.has(name),
    num: (name) => {
      const v = values.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}

/** Rule values the contests read. WP-01 owns the values and their fact rows. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'foul.illegal_contact.exists', type: 'boolean', meaning: 'Whether the rule set has an illegal contact foul, which bounds the press contest by depth', ownerLeaf: 'B5.4.1', readBy: ['engine-core.contest'] },
  { key: 'foul.illegal_contact.zone_yards', type: 'number', unit: 'yd', meaning: 'Depth beyond the line within which a defender may contact an eligible receiver', ownerLeaf: 'B5.4.1', readBy: ['engine-core.contest'] },
  { key: 'catch.feet_required', type: 'number', unit: 'count', meaning: 'Feet (or other body part) that must come down in bounds for a catch', ownerLeaf: 'B5.2.1', readBy: ['engine-core.contest'] },
];

export interface ContestRules {
  /** Depth at which the press contest must end, or null when the rule set has no illegal contact foul (J6.4.1). */
  readonly contactZoneYd: number | null;
  readonly feetRequired: number;
}

export function readContestRules(rules: RuleSet): ContestRules {
  return {
    contactZoneYd: rules.bool('foul.illegal_contact.exists') ? rules.num('foul.illegal_contact.zone_yards') : null,
    feetRequired: rules.num('catch.feet_required'),
  };
}
