// J7 formulas as pure functions of grades and parameters. Nothing here reads the world or draws.
// z values are (grade - 50) / 10 on the internal skill scale (J1.2.1), already reduced by the caller
// for fatigue, injury and knowledge where the leaf calls for an effective value.
import type { DeterministicMath } from '@gm/schema';
import type { QbParams } from './params.ts';

export function clip(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

export const DROP_TYPES = ['gunQuick', 'gun3', 'uc3', 'uc5', 'uc7'] as const;
export type DropType = (typeof DROP_TYPES)[number];

/** J7.1.1 depth of the launch point behind the line, yards. */
export function dropDepthYd(drop: DropType, p: QbParams): number {
  return drop === 'gunQuick' ? p['drop.gunQuick.depthYd'] : drop === 'gun3' ? p['drop.gun3.depthYd'] : drop === 'uc3' ? p['drop.uc3.depthYd']
    : drop === 'uc5' ? p['drop.uc5.depthYd'] : p['drop.uc7.depthYd'];
}

/**
 * J7.1.1 `tSet`: the table time, less 0.05 s per z of footwork, plus the play-action time (0.4 to
 * 0.7 s, chosen by the play) and the bad-snap time (0.2 to 0.6 s, from J5.6.2).
 */
export function setTimeS(drop: DropType, zFootwork: number, playActionS: number, badSnapS: number, p: QbParams): number {
  const base = drop === 'gunQuick' ? p['drop.gunQuick.setS'] : drop === 'gun3' ? p['drop.gun3.setS'] : drop === 'uc3' ? p['drop.uc3.setS']
    : drop === 'uc5' ? p['drop.uc5.setS'] : p['drop.uc7.setS'];
  return base - p['drop.footworkPerZS'] * zFootwork + playActionS + badSnapS;
}

/** J7.2.1 step 3: time on a read before the eyes move on. */
export function readTimeS(zProcessing: number, p: QbParams): number {
  const t = p['read.tReadBaseS'] - p['read.tReadPerZS'] * zProcessing;
  return t < p['read.tReadFloorS'] ? p['read.tReadFloorS'] : t;
}

/** J7.1.2: how long before the break he will start the throw. 0 for a quarterback who has to see it. */
export function anticipationEarlyS(zAnticipation: number, p: QbParams): number {
  const span = p['anticipation.zSpan'];
  return p['anticipation.maxEarlyS'] * clip((zAnticipation + span) / (span + span), 0, 1);
}

/** J7.3.1 step 3: standard deviation of his separation estimate, yards. */
export function separationSdYd(zCoverageRead: number, p: QbParams): number {
  const sd = p['judge.sepSdBaseYd'] - p['judge.sepSdPerZYd'] * zCoverageRead;
  return sd < p['judge.sepSdFloorYd'] ? p['judge.sepSdFloorYd'] : sd;
}

export type RiskInstruction = 'protect' | 'normal' | 'shots';

/** J7.3.2 `riskOffset` in expected points. `decisionRisk` is the D4.5.1 tendency, 0 to 100. */
export function riskOffsetEp(decisionRisk: number, instruction: RiskInstruction, p: QbParams): number {
  const inst = instruction === 'protect' ? -p['risk.instructionOffsetEp'] : instruction === 'shots' ? p['risk.instructionOffsetEp'] : 0;
  return p['risk.offsetPer10'] * (decisionRisk - 50) / 10 + inst;
}

/** J7.3.2 threshold. `sinceSetS` below 0 counts as 0. */
export function throwThresholdEp(baseEp: number, riskOffset: number, sinceSetS: number, pressureNear: boolean, p: QbParams): number {
  return baseEp - riskOffset - p['risk.timeDecayEpPerS'] * (sinceSetS > 0 ? sinceSetS : 0) - (pressureNear ? p['risk.pressureDropEp'] : 0);
}

/**
 * J7.3.2 hard rule: the interception estimate he will not throw into. Raised when his side trails by
 * more than one score late in the game. `oneScorePoints` comes from the rule set (touchdown plus try).
 */
export function interceptionCeiling(trailingBy: number, oneScorePoints: number, period: number, clockS: number, p: QbParams): number {
  const late = period >= p['risk.lastPeriod'] && clockS < p['risk.trailingClockS'];
  return late && trailingBy > oneScorePoints ? p['risk.intCeilingTrailing'] : p['risk.intCeiling'];
}

/** J7.3.3: chance he saw the declared unblocked rusher. */
export function hotSeenChance(zBlitzRecognition: number, expectedPreSnap: boolean, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['hot.seeBeta0'] + p['hot.seePerZ'] * zBlitzRecognition + (expectedPreSnap ? p['hot.preSnapBonus'] : 0));
}

/** J7.4.1: chance per 0.1 s tick that he feels a blindside rusher he cannot see. */
export function blindsideFeelChance(zPocket: number, p: QbParams): number {
  return clip(p['pressure.feelBase'] + p['pressure.feelPerZ'] * zPocket, p['pressure.feelMin'], p['pressure.feelMax']);
}

/** J7.4.1: chance per dropback of feeling pressure that is not there. Zero at composure 50 or above. */
export function falsePressureChance(hitsThisGame: number, composure: number, p: QbParams): number {
  const shaken = (50 - composure) / 10;
  const c = p['pressure.falsePerHit'] * hitsThisGame * (shaken > 0 ? shaken : 0);
  return c < p['pressure.falseMax'] ? c : p['pressure.falseMax'];
}

/** J7.4.2: chance per tick of keeping his eyes downfield with pressure felt. */
export function eyesDownfieldChance(zPocket: number, p: QbParams): number {
  return clip(p['pressure.eyesBase'] + p['pressure.eyesPerZ'] * zPocket, p['pressure.eyesMin'], p['pressure.eyesMax']);
}

export interface ScrambleInputs {
  readonly zScrambleTendency: number;
  /** Best lane beyond the line, 0 to 1. */
  readonly laneQuality: number;
  readonly manCoverageBacksTurned: boolean;
  readonly spyPresent: boolean;
  readonly yardsNeededShort: boolean;
  /** +1 "run when it is there", -1 "stay in the pocket", 0 otherwise. */
  readonly instruction: number;
}

/** J7.5.1 `P(run)`. */
export function scrambleChance(i: ScrambleInputs, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['scramble.s0'] + p['scramble.s1'] * i.zScrambleTendency + p['scramble.s2'] * i.laneQuality
    + (i.manCoverageBacksTurned ? p['scramble.s3'] : 0) - (i.spyPresent ? p['scramble.s4'] : 0)
    + (i.yardsNeededShort ? p['scramble.s5'] : 0) + p['scramble.s6'] * i.instruction);
}

/** J7.5.2: chance he knows the grounding rule well enough to judge a throwaway right. */
export function knowsGroundingChance(zFootballIntelligence: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['throwaway.knowBeta0'] + p['throwaway.knowPerZ'] * zFootballIntelligence);
}

/** J7.5.2: with no legal throwaway, the chance he dumps it anyway instead of taking the sack. Falls with composure. */
export function riskyDumpChance(zComposure: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['throwaway.dumpBeta0'] - p['throwaway.dumpPerZ'] * zComposure);
}

/** J7.6.1: seconds from decision to ball out. */
export function releaseTimeS(zRelease: number, p: QbParams): number {
  const t = p['throw.releaseBaseS'] - p['throw.releasePerZS'] * zRelease;
  return t < p['throw.releaseFloorS'] ? p['throw.releaseFloorS'] : t;
}

/** J7.6.1: maximum release speed, yd/s. */
export function maxBallSpeedYps(zArm: number, p: QbParams): number {
  const v = p['throw.vBallBaseYps'] + p['throw.vBallPerZYps'] * zArm;
  return v < p['throw.vBallFloorYps'] ? p['throw.vBallFloorYps'] : v;
}

export type DepthBand = 'short' | 'intermediate' | 'deep';
export function depthBand(airYd: number, p: QbParams): DepthBand {
  return airYd >= p['acc.deepFromYd'] ? 'deep' : airYd >= p['acc.midFromYd'] ? 'intermediate' : 'short';
}

/** J7.6.2: error standard deviation for the depth band from a set platform, before multipliers. Each z removes 12%. */
export function accuracySdYd(band: DepthBand, zAccuracy: number, p: QbParams): number {
  const base = band === 'deep' ? p['acc.sdDeepYd'] : band === 'intermediate' ? p['acc.sdMidYd'] : p['acc.sdShortYd'];
  const share = 1 - p['acc.perZ'] * zAccuracy;
  return base * (share < p['acc.minShare'] ? p['acc.minShare'] : share);
}

export interface Platform {
  readonly moving: boolean;
  /** Moving toward his throwing side (a right-hander rolling right). */
  readonly toThrowingSide: boolean;
  readonly hit: boolean;
  /** Interior pressure in his face. */
  readonly inFace: boolean;
  readonly wet: boolean;
  /** Thrown before he is set (a hot throw, J7.1.1 edge case). */
  readonly unset: boolean;
  /** Thrown before the break (J7.1.2). */
  readonly anticipated: boolean;
}
export const SET_PLATFORM: Platform = { moving: false, toThrowingSide: false, hit: false, inFace: false, wet: false, unset: false, anticipated: false };

/**
 * J7.6.2 multipliers on the error. Accuracy on the move scales the moving multiplier; accuracy under
 * pressure scales the hit and in-the-face multipliers: each z of the matching attribute removes 10%
 * of the multiplier's excess over 1 (never below 1, never more than doubling the excess).
 */
export function platformMultiplier(pf: Platform, zOnTheMove: number, zUnderPressure: number, gustMult: number, p: QbParams): number {
  const scale = (mult: number, z: number): number => 1 + (mult - 1) * clip(1 - p['acc.multPerZ'] * z, 0, 2);
  let m = gustMult;
  if (pf.moving) m *= scale(pf.toThrowingSide ? p['acc.movingThrowSideMult'] : p['acc.movingMult'], zOnTheMove);
  if (pf.hit) m *= scale(p['acc.hitMult'], zUnderPressure);
  if (pf.inFace) m *= scale(p['acc.faceMult'], zUnderPressure);
  if (pf.wet) m *= p['acc.wetMult'];
  if (pf.unset) m *= p['acc.unsetMult'];
  if (pf.anticipated) m *= p['anticipation.errorMult'];
  return m;
}

/** J7.7.1: chance of the right decision when the key is ambiguous. */
export function meshReadChance(zMeshRead: number, zDefenderDiscipline: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['mesh.beta0'] + p['mesh.perZ'] * zMeshRead - p['mesh.defDisciplinePerZ'] * zDefenderDiscipline);
}

/** J7.2.1 step 4: chance he reads the coverage key right. */
export function keyReadChance(zCoverageRead: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['read.keyBeta0'] + p['read.keyPerZ'] * zCoverageRead);
}

/** J7.8.2: chance he recognises the flag on a free play. */
export function freePlaySeenChance(zFootballIntelligence: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['freePlay.seeBeta0'] + p['freePlay.seePerZ'] * zFootballIntelligence);
}

/**
 * Quick flight-time estimate he uses while reading (J7.3.1 step 1): a ball that leaves at `speedYps`
 * and loses speed to drag `k` (1/yd) covers `distYd` in (e^(k d) - 1) / (k v). The throw itself is
 * solved by J9; this only has to be close.
 */
export function flightTimeEstimateS(distYd: number, speedYps: number, kPerYd: number, math: DeterministicMath): number {
  if (distYd <= 0) return 0;
  return kPerYd > 0 ? (math.exp(kPerYd * distYd) - 1) / (kPerYd * speedYps) : distYd / speedYps;
}

/** Share of throws that land inside a circle of radius `r` when the error is a round normal with deviation `sd`. */
export function insideRadiusShare(r: number, sd: number, math: DeterministicMath): number {
  if (sd <= 0) return 1;
  return 1 - math.exp(-(r * r) / (2 * sd * sd));
}

/** Mean miss distance of a round normal error, as a share of the catch radius, capped at 1 (J6.5 placement error). */
export function expectedPlacementError(r: number, sd: number): number {
  const MEAN_OVER_SD = 1.2533141373155001; // sqrt(pi / 2): the mean of a Rayleigh variable over its scale. Exact mathematics.
  const e = (sd * MEAN_OVER_SD) / r;
  return e > 1 ? 1 : e;
}

/** J7.7.1 edge case: the exchange is fumbled. Ball handling lowers it; a late decision and a wet ball raise it. */
export function meshFumbleChance(zBallHandling: number, late: boolean, wet: boolean, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['mesh.fumbleBeta0'] - p['mesh.fumblePerZ'] * zBallHandling + (late ? p['mesh.fumbleLate'] : 0) + (wet ? p['mesh.fumbleWet'] : 0));
}

/** J7.6.1 edge case: he pump-fakes at a defender sitting on the throw. Better ball handlers use it more. */
export function pumpFakeChance(zBallHandling: number, p: QbParams, math: DeterministicMath): number {
  return math.logistic(p['pump.beta0'] + p['pump.perZ'] * zBallHandling);
}
