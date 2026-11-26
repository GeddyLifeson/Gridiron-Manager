// J9.4 place kicks, J9.5 punts, J9.6 kickoffs and onside kicks. Pure functions: the caller opens the
// `ball` stream for the kick's own flight index (J13.2.1) and passes it in. Every function documents
// its fixed raw-draw count. Players' grades arrive as effective z values (J6.1.1), built by the caller
// from TRUE attributes for the live kick and from BELIEVED grades for the I4 and K5 estimate (J9.4.2
// item 6), which never draws.
import { possible, type AttackDir, type Environment, type FieldGeometry, type RandomStream } from '@gm/schema';
import { dAtan2, dCos, dExp, dLog, dSin, dSqrt, logistic } from '../dmath.ts';
import {
  airDrag, airState, flyToPlaneX, gustAimMultiplier, launchForDistanceAndHang, speedForCarry,
  windFromEnvironment, type Arrival, type Wind,
} from './flight.ts';
import { surfaceOf } from './loose.ts';
import { DEG, GRAVITY_YPS2, type BallParams } from './params.ts';

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 for erf, absolute error under 1.5e-7), built on dExp. */
export function normalCdf(x: number): number {
  const z = (x < 0 ? -x : x) / 1.4142135623730951;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * dExp(-z * z);
  return x < 0 ? (1 - erf) / 2 : (1 + erf) / 2;
}

// --- J9.4.1 operation ---------------------------------------------------------------------------------

export interface OperationInput {
  /** Long snapper's z (accuracy and speed mix) and holder's z (D3). */
  readonly zSnap: number;
  readonly zHold: number;
  readonly environment: Environment;
  /** A "mayday" unit hurried on with the clock running (J9.4.1 edge case). */
  readonly hurried: boolean;
}

export type OperationQuality = 'clean' | 'bad' | 'bobble';

export interface Operation {
  readonly timeS: number;
  readonly quality: OperationQuality;
  /** Multiplier on the kicker's angular error: 1 when clean, 1.5 to 3 otherwise. A bobble yields no kick. */
  readonly errorMult: number;
}

/** `logistic(3.5 + 0.4 z_snap + 0.4 z_hold - 0.5 wet - 0.3 cold)` plus the hurry penalty (J9.4.1). */
export function cleanOperationChance(inp: OperationInput, p: BallParams): number {
  const wet = surfaceOf(inp.environment).wet ? 1 : 0;
  const cold = inp.environment.roof === 'open' && inp.environment.tempF < p['op.coldBelowF']! ? 1 : 0;
  return possible(logistic(p['op.cleanBeta0']! + p['op.cleanSnap']! * inp.zSnap + p['op.cleanHold']! * inp.zHold
    + p['op.cleanWet']! * wet + p['op.cleanCold']! * cold + (inp.hurried ? p['op.hurryPenalty']! : 0)));
}

/** Snap-to-foot time and quality (J9.4.1). Draws: normal, uniform, uniform, uniform (10 raw). */
export function resolveOperation(rng: RandomStream, inp: OperationInput, p: BallParams): Operation {
  const nTime = rng.normal(), uClean = rng.uniform(), uBobble = rng.uniform(), uMult = rng.uniform();
  const timeS = p['op.timeS']! - p['op.timePerZS']! * inp.zSnap + p['op.timeSdS']! * nTime;
  if (uClean < cleanOperationChance(inp, p)) return { timeS, quality: 'clean', errorMult: 1 };
  if (uBobble < p['op.bobbleShare']!) return { timeS, quality: 'bobble', errorMult: 1 };
  return { timeS, quality: 'bad', errorMult: p['op.badMultMin']! + uMult * (p['op.badMultMax']! - p['op.badMultMin']!) };
}

// --- J9.4.2 kick flight and the make model ------------------------------------------------------------

export interface PlaceKickInput {
  readonly geometry: FieldGeometry;
  readonly environment: Environment;
  /** Field-frame spot of the hold: the line of scrimmage plus the hold depth content sets (J9.4.1). */
  readonly holdX: number;
  readonly holdY: number;
  /** Direction the kicking team attacks. The target goal posts stand on that end line (J1.1.1). */
  readonly attackDir: AttackDir;
  readonly zLeg: number;
  readonly zAccuracy: number;
  readonly zComposure: number;
  /** Pressure of the moment, 0 (none) to 1 (game on the line) (D4). */
  readonly pressure: number;
}

export type PlaceKickResult = 'good' | 'wide_left' | 'wide_right' | 'short';

export interface PlaceKick {
  readonly result: PlaceKickResult;
  /** The ball struck an upright or the crossbar; `result` already says whether it went through. */
  readonly hit: 'none' | 'upright' | 'crossbar';
  readonly carryYd: number;
  readonly angleErrorRad: number;
  /** Physical distance from the hold to the plane of the goal posts. */
  readonly trueDistanceYd: number;
  readonly launch: { readonly vx: number; readonly vy: number; readonly vh: number };
  /** Ball at the plane of the goal, or null when it came down short of it. */
  readonly atPlane: Arrival | null;
}

/** The labelled distance for statistics, the J15 table and the I4 panel: line of scrimmage plus 17 (J9.4.1). */
export function labelledFieldGoalDistance(losYardsToGoal: number, p: BallParams): number {
  return losYardsToGoal + p['fg.labelAddYd']!;
}

/** x of the plane of the goal posts a team attacks: the end line (J1.1.1). */
export function goalPlaneX(g: FieldGeometry, attackDir: AttackDir): number {
  return attackDir === 1 ? g.lengthYd : 0;
}

function carryMean(inp: PlaceKickInput, p: BallParams): number {
  return (p['fg.range50Yd']! + p['fg.rangePerZYd']! * inp.zLeg) * inp.environment.derived.kickDistance;
}

function angleSd(inp: PlaceKickInput, errorMult: number, p: BallParams): number {
  return p['fg.theta50Rad']! * dExp(-p['fg.accDecay']! * inp.zAccuracy) * errorMult
    * dExp(-p['fg.composureGain']! * inp.pressure * inp.zComposure)
    * gustAimMultiplier(inp.environment, p['wind.gustAimGain']!);
}

/** Flies a place kick of a given still-air carry and aim error through the real wind and air. */
function flyPlaceKick(inp: PlaceKickInput, carryYd: number, errRad: number, wind: Wind, p: BallParams) {
  const g = inp.geometry, planeX = goalPlaneX(g, inp.attackDir);
  const launch = p['fg.launchDeg']! * DEG;
  const v = speedForCarry(carryYd < 0 ? 0 : carryYd, launch, 0, g.crossbarHeightYd, p['fg.dragPerYd']!);
  const aim = dAtan2(g.centreY - inp.holdY, planeX - inp.holdX) + errRad;
  const vxy = v * dCos(launch);
  const vel = { vx: vxy * dCos(aim), vy: vxy * dSin(aim), vh: v * dSin(launch) };
  const s = airState(inp.holdX, inp.holdY, 0, vel.vx, vel.vy, vel.vh);
  return { vel, atPlane: flyToPlaneX(s, airDrag(p['fg.dragPerYd']!, inp.environment), wind, planeX) };
}

function judge(inp: PlaceKickInput, a: Arrival | null, p: BallParams): { result: PlaceKickResult; hit: PlaceKick['hit'] } {
  if (a === null) return { result: 'short', hit: 'none' };
  const g = inp.geometry, r = p['fg.postHitYd']!;
  const half = (g.uprightNorthY - g.uprightSouthY) / 2;
  // Facing +x, the kicker's left is +y; facing -x it is -y.
  const lat = (a.y - g.centreY) * inp.attackDir;
  const absLat = lat < 0 ? -lat : lat;
  const wide: PlaceKickResult = lat > 0 ? 'wide_left' : 'wide_right';
  const dh = a.h - g.crossbarHeightYd;
  if (dh < -r) return { result: 'short', hit: 'none' };
  if (absLat > half + r) return { result: wide, hit: 'none' };
  if (absLat >= half - r) return { result: absLat < half && dh >= 0 ? 'good' : wide, hit: 'upright' };
  if (dh <= r) return { result: dh >= 0 ? 'good' : 'short', hit: 'crossbar' };
  return { result: 'good', hit: 'none' };
}

/**
 * The live kick (J9.4.2): carry drawn around `range50 + 4 z_leg` (sd 3) times J12's kick distance term,
 * angular error drawn with sd `theta50 * exp(-0.12 z_acc)` times operation, composure and gust
 * multipliers, then a real flight through wind and air to the plane of the posts. Call only for a kick
 * that happens (not after a bobble). Draws: normal, normal (8 raw).
 */
export function resolvePlaceKick(rng: RandomStream, inp: PlaceKickInput, op: Operation, p: BallParams): PlaceKick {
  const nCarry = rng.normal(), nAngle = rng.normal();
  const carryYd = carryMean(inp, p) + p['fg.rangeSdYd']! * nCarry;
  const angleErrorRad = angleSd(inp, op.errorMult, p) * nAngle;
  const { vel, atPlane } = flyPlaceKick(inp, carryYd, angleErrorRad, windFromEnvironment(inp.environment), p);
  const { result, hit } = judge(inp, atPlane, p);
  const dx = goalPlaneX(inp.geometry, inp.attackDir) - inp.holdX;
  return { result, hit, carryYd, angleErrorRad, trueDistanceYd: dx < 0 ? -dx : dx, launch: vel, atPlane };
}

/**
 * The make chance shown on the I4 panel and used by K5 (J9.4.2 item 6): the same model, computed
 * analytically with no draw, from the grades the coach BELIEVES. The carry needed to clear the bar in
 * this wind and air, the drift of a perfectly aimed kick, and the angular window of the uprights give
 * `P(carry) * [P(clean) P(direction | sd) + P(bad, not bobbled) P(direction | sd * mean bad multiplier)]`.
 */
export function estimateMakeChance(inp: PlaceKickInput, op: Omit<OperationInput, 'environment'>, p: BallParams): number {
  const wind = windFromEnvironment(inp.environment);
  const g = inp.geometry;
  const atBar = (c: number): number => {
    const a = flyPlaceKick(inp, c, 0, wind, p).atPlane;
    return a === null ? -1 : a.h - g.crossbarHeightYd;
  };
  let lo = 0, hi = MAX_CARRY_YD;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (atBar(m) < 0) lo = m; else hi = m; }
  const need = (lo + hi) / 2;
  const mean = carryMean(inp, p);
  const pCarry = 1 - normalCdf((need - mean) / p['fg.rangeSdYd']!);

  const nominal = flyPlaceKick(inp, mean > need ? mean : need, 0, wind, p).atPlane;
  const half = (g.uprightNorthY - g.uprightSouthY) / 2;
  const drift = nominal === null ? 0 : (nominal.y - g.centreY) * inp.attackDir;
  const dx = goalPlaneX(g, inp.attackDir) - inp.holdX, dy = g.centreY - inp.holdY;
  const dist = dSqrt(dx * dx + dy * dy);
  const pDir = (sd: number): number => {
    const s = dist * sd;
    return normalCdf((half - drift) / s) - normalCdf((-half - drift) / s);
  };
  const pClean = cleanOperationChance({ ...op, environment: inp.environment }, p);
  const pBad = (1 - pClean) * (1 - p['op.bobbleShare']!);
  const meanBad = (p['op.badMultMin']! + p['op.badMultMax']!) / 2;
  return possible(pCarry * (pClean * pDir(angleSd(inp, 1, p)) + pBad * pDir(angleSd(inp, meanBad, p))));
}
/** Upper bound of the carry search. Structural: beyond any place kick. */
const MAX_CARRY_YD = 120;

// --- J9.4.3 blocks: the operation side of the race ------------------------------------------------------

/** Distance from the line to the block point for a field goal or a punt (J9.4.3). */
export function blockPointYd(kind: 'field_goal' | 'punt', p: BallParams): number {
  return kind === 'punt' ? p['block.puntPointYd']! : p['block.fgPointYd']!;
}

/** Punt snap-to-foot time: 0.75 s snap plus 1.30 s get-off at grade 50, each z taking 0.03 s off its part. */
export function puntOperationTimeS(zLongSnap: number, zGetOff: number, p: BallParams): number {
  return p['block.puntSnapS']! - p['block.puntPerZS']! * zLongSnap + p['block.puntGetOffS']! - p['block.puntPerZS']! * zGetOff;
}

/**
 * Time margin of the race (J9.4.3): positive when the ball is away before the rusher reaches the block
 * point. The kick block contest (stream `contest`, type `kickBlock`) turns it into a chance.
 */
export function blockTimeMarginS(operationTimeS: number, rusherArrivalS: number): number {
  return rusherArrivalS - operationTimeS;
}

// --- J9.5.1 punts --------------------------------------------------------------------------------------

export type PuntType = 'distance' | 'directional' | 'pin';

export interface PuntInput {
  readonly zLeg: number;
  readonly zHang: number;
  readonly zDirectional: number;
  readonly type: PuntType;
  /** Rush pressure inside the time margin, 0 to 1 (J9.5.1). */
  readonly pressure: number;
  /**
   * Yards from the line of scrimmage to the goal line he punts toward. When given, a punter whose normal punt would
   * carry past his landing target (`punt.pinTargetYd` from that goal line) takes distance off and kicks it higher
   * (F12 plus-50 punt): the call names no punt type yet, so the punter's own judgment stands in for it.
   */
  readonly toGoalYd?: number;
}

export interface PuntDraw {
  readonly distYd: number;
  readonly hangS: number;
  /** Lateral error, yards, positive to the punter's left. */
  readonly latYd: number;
  readonly shank: boolean;
  /** Bounce bias for J9.3.1. */
  readonly bias: number;
  readonly spiral: boolean;
}

/**
 * Distance and hang drawn together from a bivariate normal with negative correlation (J9.5.1), shifted
 * by type, plus a lateral error and a mishit (shank) chance raised by pressure.
 * Draws: normal, normal, normal, uniform, uniform, normal (20 raw).
 */
export function resolvePunt(rng: RandomStream, inp: PuntInput, p: BallParams): PuntDraw {
  const n1 = rng.normal(), n2 = rng.normal(), nLat = rng.normal(), uShank = rng.uniform(), uCut = rng.uniform(), nShank = rng.normal();
  let muD = p['punt.distMeanYd']! + p['punt.distPerZYd']! * inp.zLeg;
  let muH = p['punt.hangMeanS']! + p['punt.hangPerZS']! * inp.zHang;
  let latSd = p['punt.latSdYd']!, bias = p['punt.normalBias']!;
  if (inp.type === 'directional') {
    muD -= p['punt.directionalLossYd']!;
    latSd = p['punt.directionalLatSdYd']! * dExp(-p['punt.directionalPerZ']! * inp.zDirectional);
  } else if (inp.type === 'pin') {
    muD -= p['punt.pinLossYd']!;
    muH += p['punt.pinHangGainS']!;
    bias = p['punt.pinBias']!;
  }
  if (inp.toGoalYd !== undefined && inp.type !== 'pin') {
    const cap = inp.toGoalYd - p['punt.pinTargetYd']!;
    if (muD > cap) { muD = cap; muH += p['punt.pinHangGainS']!; bias = p['punt.pinBias']!; }
  }
  const rho = p['punt.corr']!;
  let distYd = muD + p['punt.distSdYd']! * n1;
  let hangS = muH + p['punt.hangSdS']! * (rho * n1 + dSqrt(1 - rho * rho) * n2);
  let latYd = latSd * nLat;
  const b = p['punt.shankBase']!;
  const pShank = logistic(dLog(b / (1 - b)) + p['punt.shankPressureGain']! * inp.pressure + p['punt.shankPerZ']! * inp.zLeg);
  const shank = uShank < pShank;
  if (shank) {
    distYd *= 1 - (p['punt.shankCutMin']! + uCut * (p['punt.shankCutMax']! - p['punt.shankCutMin']!));
    latYd += p['punt.shankLatSdYd']! * nShank;
    bias = 0;
  }
  if (distYd < p['punt.minDistYd']!) distYd = p['punt.minDistYd']!;
  if (hangS < p['punt.minHangS']!) hangS = p['punt.minHangS']!;
  return { distYd, hangS, latYd, shank, bias, spiral: !shank };
}

/** A kick launch: horizontal velocity in the field frame, vertical speed and the start height. */
export interface KickLaunch { readonly vx: number; readonly vy: number; readonly vh: number; readonly startH: number }

/**
 * Turns a drawn distance, hang and lateral offset into a launch from `(x, y)` toward the goal the
 * kicking team attacks. The launch is solved in still, neutral air; the flight then feels the real wind
 * and density (J9.7.1), which is how weather moves punts and kickoffs. `aimLatYd` is the called aim
 * (positive to the kicker's left) and `latYd` the error.
 */
export function kickLaunch(
  x: number, y: number, attackDir: AttackDir, distYd: number, hangS: number, aimLatYd: number, latYd: number,
  startH: number, kPerYd: number,
): KickLaunch {
  const lat = (aimLatYd + latYd) * attackDir;
  const along = distYd * attackDir;
  const path = dSqrt(distYd * distYd + lat * lat);
  const { horizontal, vertical } = launchForDistanceAndHang(path, hangS, startH, kPerYd);
  const ux = along / path, uy = lat / path;
  return { vx: horizontal * ux, vy: horizontal * uy, vh: vertical, startH };
}

export function puntLaunch(x: number, y: number, attackDir: AttackDir, d: PuntDraw, aimLatYd: number, p: BallParams): KickLaunch {
  return kickLaunch(x, y, attackDir, d.distYd, d.hangS, aimLatYd, d.latYd, p['punt.contactHeightYd']!, p['punt.dragPerYd']!);
}

// --- J9.6.1 kickoffs -----------------------------------------------------------------------------------

export type KickoffType = 'deep' | 'squib';

export interface KickoffInput {
  readonly zLeg: number;
  readonly zPlacement: number;
  readonly type: KickoffType;
  /** Called landing point: yards beyond the kick spot along the field, and lateral (kicker's left positive). */
  readonly targetAlongYd: number;
  readonly targetLatYd: number;
}

export interface KickoffDraw { readonly alongYd: number; readonly latYd: number; readonly hangS: number }

/**
 * Placement error is a 2-D normal around the target (sd 4 yd along, 3 across at grade 50, tightening
 * with the placement grade), capped by a leg capability draw (J9.6.1). Which rule result follows
 * (landing zone, end zone, short, out of bounds) is B6's, from the landing point.
 * Draws: normal, normal, normal (12 raw).
 */
export function resolveKickoff(rng: RandomStream, inp: KickoffInput, p: BallParams): KickoffDraw {
  const nAlong = rng.normal(), nAcross = rng.normal(), nCap = rng.normal();
  const tight = dExp(-p['ko.placementPerZ']! * inp.zPlacement);
  const cap = p['ko.capMeanYd']! + p['ko.capPerZYd']! * inp.zLeg + p['ko.capSdYd']! * nCap;
  let alongYd = inp.targetAlongYd + p['ko.alongSdYd']! * tight * nAlong;
  if (alongYd > cap) alongYd = cap;
  return {
    alongYd,
    latYd: inp.targetLatYd + p['ko.acrossSdYd']! * tight * nAcross,
    hangS: inp.type === 'squib' ? p['ko.squibHangS']! : p['ko.hangS']!,
  };
}

/** Launch for a kickoff draw from a tee (start height 0). Kickoffs use the punt drag row until fitted apart. */
export function kickoffLaunch(x: number, y: number, attackDir: AttackDir, d: KickoffDraw, p: BallParams): KickLaunch {
  return kickLaunch(x, y, attackDir, d.alongYd, d.hangS, 0, d.latYd, 0, p['punt.dragPerYd']!);
}

// --- J9.6.2 onside kicks -------------------------------------------------------------------------------

export type OnsideQuality = 'ideal' | 'lineDrive' | 'mishit';

export interface OnsideDraw {
  readonly quality: OnsideQuality;
  readonly launch: KickLaunch;
  /** The first ground contact rebounds high (J9.3.1 high-hop draw). */
  readonly highHop: boolean;
}

/**
 * Onside quality draw (J9.6.2): ideal hop, catchable line drive, or mishit (short or wide), by a
 * softmax over scores that rise with the kicker's onside skill. The ideal kick is driven into the turf
 * so its first bounce is a high hop arriving near the required distance; the recovery is J6.7.2's.
 * Draws: uniform, normal (6 raw).
 */
export function resolveOnside(rng: RandomStream, x: number, y: number, attackDir: AttackDir, zSkill: number, aimLatYd: number, p: BallParams): OnsideDraw {
  const u = rng.uniform(), nLat = rng.normal();
  const sIdeal = dExp(p['onside.idealBeta0']! + p['onside.skillPerZ']! * zSkill);
  const sLine = dExp(p['onside.lineDriveBeta0']! + (p['onside.skillPerZ']! / 2) * zSkill);
  const total = sIdeal + sLine + 1;
  const target = p['onside.targetYd']!;
  if (u < sIdeal / total) {
    // Hop: rebound speed up = -hopVz * rebound; airtime of the hop 2 * up / g; the mean retained forward speed carries it to the target.
    const up = -p['onside.hopVzYps']! * p['bounce.onsideHopRebound']!;
    const hop = (2 * up) / GRAVITY_YPS2;
    const meanRetain = (p['bounce.retainMin']! + p['bounce.retainMax']!) / 2;
    const horizontal = target / (hop * meanRetain);
    const lat = aimLatYd * attackDir, path = dSqrt(target * target + lat * lat);
    return { quality: 'ideal', highHop: true, launch: { vx: horizontal * (target * attackDir) / path, vy: horizontal * lat / path, vh: p['onside.hopVzYps']!, startH: 0 } };
  }
  if (u < (sIdeal + sLine) / total) {
    return { quality: 'lineDrive', highHop: false, launch: kickLaunch(x, y, attackDir, target, p['onside.lineDriveHangS']!, aimLatYd, 0, 0, p['punt.dragPerYd']!) };
  }
  return {
    quality: 'mishit', highHop: false,
    launch: kickLaunch(x, y, attackDir, target - p['onside.mishitShortYd']!, p['onside.lineDriveHangS']!, aimLatYd, p['onside.mishitLatYd']! * nLat, 0, p['punt.dragPerYd']!),
  };
}

