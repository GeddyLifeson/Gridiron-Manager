// Ball physics and kicking parameters (bible J9, work package WP-16).
//
// Every number the ball module uses is a row here or one of the two exact unit constants below.
// `basis: 'bible'` rows are starting values J9 states. `basis: 'assumption'` rows are numbers J9 leaves
// open (drag terms, spreads, shares); this module chose them and calibration (J15, Q2) moves them.
// None of them is a measured football fact. The measured facts J9 cites (make rates, punt gross, hang
// times, block rates) are TARGETS that constrain these rows, named in `constrainedBy`.
//
// Drag. J9.1.1 and J9.7.1 lump the ball's mass, size and drag coefficient into one fitted coefficient
// per flight type, `k` in 1/yd, with drag acceleration k * |v_air|^2 against the air-relative velocity.
// The physics form is k = rho * Cd * A / (2 m). Published wind-tunnel work (Guzman, Brownell and Kommer
// 2016, Sports Engineering 19:13-20; Watts and Moore 2003, Am. J. Phys. 71:791) gives Cd only as graphs
// this module could not read as numbers, so no row claims a sourced Cd: each k is fitted to a J9 check
// value instead, and the fit is a test (test/ball/ball.test.ts).
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams, fastParams, type ParamRow } from '../tick/param-util.ts';

/**
 * Standard gravity, 9.80665 m/s^2 exactly (3rd CGPM, 1901), divided by 0.9144 m per yard exactly
 * (international yard, 1959). Both are definitions, so the quotient is exact arithmetic, not a measured
 * value. J9.1.1 quotes 10.73 yd/s^2 from the rounded 9.81 m/s^2.
 */
export const GRAVITY_YPS2 = 9.80665 / 0.9144;
/** 1 mile = 1,760 yd and 1 hour = 3,600 s by definition. */
export const MPH_TO_YPS = 1760 / 3600;
/** Radians per degree. */
export const DEG = 3.141592653589793 / 180;

const PASS = 'J9.1.1 acceptance (landing within 0.05 yd; flight time by depth); J15.4.1 completion by depth';
const DEFL = 'J9.2.1 batted-pass rate (to be measured, R3); J15.4.1 interception rate';
const BOUNCE = 'J9.3.1 punt touchback share 7.4% (J15); loose ball dead within 12 s';
const OP = 'J9.4.1 non-clean operation share (starting target 2%)';
const FG = 'J9.4.2 acceptance 1: pro make table by distance (J15)';
const WIND = 'J9.7.1 check value: 1.5 to 2.5 yd drift on a 45 yd field goal per 10 mph crosswind';
const BLOCK = 'J9.4.3 block rates: punts 0.46%, field goals 1.95%, tries 0.72% (J15)';
const PUNT = 'J9.5.1 pro gross 47.3 yd, hang 4.40 to 4.44 s, touchbacks 7.4% (J15)';
const KO = 'J9.6.1 kickoff result shares and touchback rate for the modelled rule set (J15)';
const ONSIDE = 'J9.6.2 onside recovery 5.4% (2022 to 2024) and 9.6% (2025), small samples';
const STRUCT = 'none: structural';

const ROWS: readonly ParamRow[] = [
  // J9.1.1 pass flight
  ['pass.releaseHeightYd', 2.2, 1.8, 2.6, 'yd', 'bible', 'J9.1.1', PASS],
  ['pass.catchHeightYd', 1.6, 1.0, 2.2, 'yd', 'bible', 'J9.1.1', PASS],
  // ln(1/0.85) / 40: a 40 yd throw loses 15% of its speed to drag (J9.1.1 starting rule, Assumption).
  ['pass.dragPerYd', 0.004063, 0.001, 0.01, '1/yd', 'bible', 'J9.1.1', PASS],
  ['pass.firmBlend', 0.5, 0.2, 0.8, 'share of drive-to-touch angle', 'assumption', 'J9.1.1', PASS],
  ['pass.minLaunchDeg', -15, -30, 0, 'deg', 'assumption', 'J9.1.1', STRUCT],
  ['pass.maxLaunchDeg', 70, 50, 85, 'deg', 'assumption', 'J9.1.1', STRUCT],
  // J9.1.1 names touch the high solution; at full arm speed that is a 60-plus degree lob, far outside the
  // 2.1 to 2.6 s J9.1.1 gives for a 40 yd go ball. Touch is capped at this angle and takes speed off instead.
  ['pass.touchMaxDeg', 35, 25, 50, 'deg', 'assumption', 'J9.1.1', PASS],
  // J9.1.2 snaps and exchanges
  ['snap.shotgunSpeedYps', 15, 10, 20, 'yd/s', 'bible', 'J9.1.2', 'J9.1.2 acceptance: exchanges complete on the designed tick'],
  ['snap.handHeightYd', 1.1, 0.6, 1.6, 'yd', 'assumption', 'J9.1.2', STRUCT],
  ['exchange.handoffTicks', 2, 1, 4, 'ticks', 'bible', 'J9.1.2', 'J9.1.2 acceptance: exchanges complete on the designed tick'],
  ['exchange.handoffRangeYd', 0.8, 0.4, 1.5, 'yd', 'bible', 'J9.1.2', 'J9.1.2 acceptance: exchanges complete on the designed tick'],
  // J9.2.1 deflections
  ['bat.handsUpBeta0', -0.5, -2, 1, 'logit', 'bible', 'J9.2.1', DEFL],
  ['bat.handsUpBeta1', 0.6, 0, 1.5, 'logit/z', 'bible', 'J9.2.1', DEFL],
  ['bat.b0', 0.35, 0.05, 0.9, 'probability', 'assumption', 'J9.2.1', DEFL],
  ['bat.laneRadiusYd', 2, 1, 3, 'yd', 'bible', 'J9.2.1', DEFL],
  ['bat.windowYd', 4, 2, 6, 'yd', 'bible', 'J9.2.1', DEFL],
  ['deflect.speedMin', 0.3, 0.1, 0.5, 'share of speed', 'bible', 'J9.2.1', DEFL],
  ['deflect.speedMax', 0.7, 0.5, 0.9, 'share of speed', 'bible', 'J9.2.1', DEFL],
  ['deflect.angleMaxDeg', 60, 30, 90, 'deg', 'bible', 'J9.2.1', DEFL],
  ['deflect.upMinYps', 1, 0, 3, 'yd/s', 'assumption', 'J9.2.1', DEFL],
  ['deflect.upMaxYps', 4, 2, 8, 'yd/s', 'assumption', 'J9.2.1', DEFL],
  // J9.3.1 bounces and rolls
  ['bounce.retainMin', 0.2, 0.05, 0.4, 'share of speed', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.retainMax', 0.8, 0.6, 0.95, 'share of speed', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.sdTumbleDeg', 25, 10, 40, 'deg', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.sdSpiralDeg', 12, 5, 25, 'deg', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.shallowDeg', 30, 15, 45, 'deg', 'assumption', 'J9.3.1', BOUNCE],
  ['bounce.reboundMin', 0.1, 0, 0.3, 'share of vertical speed', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.reboundMax', 0.6, 0.4, 0.8, 'share of vertical speed', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.artificialRetainShift', 0.08, 0, 0.2, 'share of speed', 'assumption', 'J9.3.1', BOUNCE],
  ['bounce.wetReboundMult', 0.7, 0.4, 1, 'ratio', 'assumption', 'J9.3.1', BOUNCE],
  ['bounce.biasGain', 0.4, 0, 0.8, 'share of speed per unit bias', 'assumption', 'J9.3.1', BOUNCE],
  ['bounce.maxBounces', 3, 2, 5, 'count', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.rollBelowYps', 2, 1, 4, 'yd/s', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.rollDecelYps2', 3, 1, 6, 'yd/s^2', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.maxLooseS', 12, 8, 15, 's', 'bible', 'J9.3.1', BOUNCE],
  ['bounce.onsideHopRebound', 0.85, 0.6, 1, 'share of vertical speed', 'assumption', 'J9.6.2', ONSIDE],
  // J9.4.1 operation
  ['op.timeS', 1.30, 1.1, 1.5, 's', 'bible', 'J9.4.1', OP],
  ['op.timeSdS', 0.05, 0.02, 0.1, 's', 'bible', 'J9.4.1', OP],
  ['op.timePerZS', 0.03, 0, 0.06, 's/z', 'assumption', 'J9.4.1', BLOCK],
  ['op.cleanBeta0', 3.5, 2.5, 5, 'logit', 'bible', 'J9.4.1', OP],
  ['op.cleanSnap', 0.4, 0, 1, 'logit/z', 'bible', 'J9.4.1', OP],
  ['op.cleanHold', 0.4, 0, 1, 'logit/z', 'bible', 'J9.4.1', OP],
  ['op.cleanWet', -0.5, -1.5, 0, 'logit', 'bible', 'J9.4.1', OP],
  ['op.cleanCold', -0.3, -1, 0, 'logit', 'bible', 'J9.4.1', OP],
  ['op.coldBelowF', 40, 20, 50, 'deg F', 'assumption', 'J9.4.1', OP],
  ['op.badMultMin', 1.5, 1, 2, 'ratio', 'bible', 'J9.4.1', OP],
  ['op.badMultMax', 3, 2, 5, 'ratio', 'bible', 'J9.4.1', OP],
  ['op.bobbleShare', 0.15, 0.02, 0.4, 'share of non-clean', 'assumption', 'J9.4.1', OP],
  ['op.hurryPenalty', -0.8, -2, 0, 'logit', 'assumption', 'J9.4.1', OP],
  // J9.4.2 make model
  ['fg.labelAddYd', 17, 17, 17, 'yd', 'bible', 'J9.4.1', 'none: play-by-play convention of the J15 make table'],
  ['fg.range50Yd', 58, 50, 66, 'yd', 'bible', 'J9.4.2', FG],
  ['fg.rangePerZYd', 4, 2, 6, 'yd/z', 'bible', 'J9.4.2', FG],
  ['fg.rangeSdYd', 3, 1.5, 5, 'yd', 'bible', 'J9.4.2', FG],
  ['fg.theta50Rad', 0.045, 0.02, 0.08, 'rad', 'assumption', 'J9.4.2', FG],
  ['fg.accDecay', 0.12, 0.05, 0.25, '1/z', 'bible', 'J9.4.2', FG],
  ['fg.composureGain', 0.1, 0, 0.3, '1/z', 'assumption', 'J9.4.2', FG],
  ['fg.launchDeg', 35, 25, 45, 'deg', 'assumption', 'J9.4.2', WIND],
  ['fg.dragPerYd', 0.009, 0.002, 0.015, '1/yd', 'assumption', 'J9.7.1', WIND],
  ['fg.postHitYd', 0.1, 0.03, 0.2, 'yd', 'assumption', 'J9.4.2', FG],
  // J9.4.3 blocks
  ['block.fgPointYd', 7.5, 7, 8, 'yd', 'bible', 'J9.4.3', BLOCK],
  ['block.puntPointYd', 9, 8, 10, 'yd', 'bible', 'J9.4.3', BLOCK],
  ['block.puntSnapS', 0.75, 0.6, 0.9, 's', 'bible', 'J9.4.3', BLOCK],
  ['block.puntGetOffS', 1.30, 1.1, 1.5, 's', 'bible', 'J9.4.3', BLOCK],
  ['block.puntPerZS', 0.03, 0, 0.06, 's/z', 'bible', 'J9.4.3', BLOCK],
  // J9.5.1 punts
  ['punt.distMeanYd', 46, 40, 52, 'yd', 'bible', 'J9.5.1', PUNT],
  ['punt.hangMeanS', 4.4, 3.8, 5, 's', 'bible', 'J9.5.1', PUNT],
  ['punt.distSdYd', 5, 2, 8, 'yd', 'bible', 'J9.5.1', PUNT],
  ['punt.hangSdS', 0.35, 0.15, 0.6, 's', 'bible', 'J9.5.1', PUNT],
  ['punt.corr', -0.4, -0.8, 0, 'correlation', 'bible', 'J9.5.1', PUNT],
  ['punt.distPerZYd', 2, 0, 4, 'yd/z', 'bible', 'J9.5.1', PUNT],
  ['punt.hangPerZS', 0.15, 0, 0.3, 's/z', 'bible', 'J9.5.1', PUNT],
  ['punt.directionalLossYd', 3, 0, 6, 'yd', 'bible', 'J9.5.1', PUNT],
  ['punt.latSdYd', 4, 1, 8, 'yd', 'assumption', 'J9.5.1', PUNT],
  ['punt.directionalLatSdYd', 2, 0.5, 5, 'yd', 'assumption', 'J9.5.1', PUNT],
  ['punt.directionalPerZ', 0.1, 0, 0.3, '1/z', 'assumption', 'J9.5.1', PUNT],
  ['punt.pinLossYd', 11.5, 8, 15, 'yd', 'bible', 'J9.5.1', PUNT],
  ['punt.pinHangGainS', 0.2, 0, 0.5, 's', 'assumption', 'J9.5.1', PUNT],
  ['punt.normalBias', 0.3, 0, 0.8, 'bias', 'assumption', 'J9.3.1', BOUNCE],
  ['punt.pinBias', -0.6, -1, 0, 'bias', 'assumption', 'J9.3.1', BOUNCE],
  ['punt.shankBase', 0.02, 0.005, 0.05, 'probability', 'assumption', 'J9.5.1', PUNT],
  ['punt.shankPressureGain', 1.5, 0, 3, 'logit per unit pressure', 'assumption', 'J9.5.1', PUNT],
  ['punt.shankPerZ', -0.3, -0.8, 0, 'logit/z', 'assumption', 'J9.5.1', PUNT],
  ['punt.shankCutMin', 0.3, 0.2, 0.4, 'share of distance', 'bible', 'J9.5.1', PUNT],
  ['punt.shankCutMax', 0.6, 0.4, 0.8, 'share of distance', 'bible', 'J9.5.1', PUNT],
  ['punt.shankLatSdYd', 10, 5, 20, 'yd', 'assumption', 'J9.5.1', PUNT],
  ['punt.minDistYd', 5, 0, 10, 'yd', 'assumption', 'J9.5.1', STRUCT],
  ['punt.minHangS', 1.2, 0.5, 2, 's', 'assumption', 'J9.5.1', STRUCT],
  ['punt.contactHeightYd', 0.8, 0.4, 1.2, 'yd', 'assumption', 'J9.5.1', STRUCT],
  ['punt.dragPerYd', 0.0025, 0.0005, 0.008, '1/yd', 'assumption', 'J9.7.1', PUNT],
  // J9.6 kickoffs and onside kicks
  ['ko.alongSdYd', 4, 2, 7, 'yd', 'bible', 'J9.6.1', KO],
  ['ko.acrossSdYd', 3, 1.5, 6, 'yd', 'bible', 'J9.6.1', KO],
  ['ko.placementPerZ', 0.1, 0, 0.3, '1/z', 'assumption', 'J9.6.1', KO],
  ['ko.capMeanYd', 72, 60, 80, 'yd', 'assumption', 'J9.6.1', KO],
  ['ko.capPerZYd', 4, 1, 6, 'yd/z', 'assumption', 'J9.6.1', KO],
  ['ko.capSdYd', 3, 1, 6, 'yd', 'assumption', 'J9.6.1', KO],
  ['ko.hangS', 4.0, 3, 4.8, 's', 'assumption', 'J9.6.1', KO],
  ['ko.squibHangS', 1.2, 0.6, 2, 's', 'assumption', 'J9.6.1', KO],
  ['onside.idealBeta0', -0.4, -2, 1, 'logit', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.lineDriveBeta0', 0.3, -1, 1.5, 'logit', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.skillPerZ', 0.5, 0, 1.2, 'logit/z', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.targetYd', 11, 10, 14, 'yd', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.hopVzYps', -6, -12, -2, 'yd/s', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.lineDriveHangS', 0.6, 0.3, 1, 's', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.mishitShortYd', 6, 2, 9, 'yd', 'assumption', 'J9.6.2', ONSIDE],
  ['onside.mishitLatYd', 8, 3, 15, 'yd', 'assumption', 'J9.6.2', ONSIDE],
  // J9.7.1 wind and air
  ['wind.gustAimGain', 0.02, 0, 0.05, 'per mph', 'bible', 'J9.7.1', WIND],
];

export const PARAMS: ParamFile = defineParams('ball', '0.1.0', ROWS);

/** Ball parameters resolved once, by short name (the row name without the `ball.` prefix). */
export type BallParams = Readonly<Record<string, number>>;

const RESOLVED = new WeakMap<ParamTable, BallParams>();
/** Resolve once per game or play, never inside the tick. Throws on a missing row. */
export function ballParams(t: ParamTable): BallParams {
  // A parameter table never changes, so its rows are read once per table, not once per play (G-97).
  const hit = RESOLVED.get(t);
  if (hit !== undefined) return hit;
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`ball.${row[0]}`);
  const fast = fastParams(out);
  RESOLVED.set(t, fast);
  return fast;
}

/**
 * The ball module reads no rule key directly. Goal post and crossbar positions arrive through
 * `FieldGeometry` (built by the field module from the `field.*` keys), and the consequence of every kick
 * result (spots, touchbacks, recovery rights) is officiating's (B6), not physics.
 */
export const RULE_KEYS: RuleKeyManifest = [];
