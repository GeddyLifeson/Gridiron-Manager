// J3 formulas that are pure functions of attributes and settings. The perceive stage uses them; later
// modules (J4, J7, K1) may call them directly.
import type { PerceptionParams } from './params.ts';

const clip = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * J3.2.1 `keyDelay`. `recognitionIss` is the play recognition true value (D4.1.1 owns its effect).
 * `prep` is the opponent preparation item 0 to 1 (D9.6.1); `fatigue` is J2.4's 0 to 1;
 * `dComplexityS` and `dKnowledgeS` come from D9 and J4.5.1.
 */
export function keyDelayS(recognitionIss: number, prep: number, fatigue: number, dComplexityS: number, dKnowledgeS: number, p: PerceptionParams): number {
  const f = clip(fatigue, 0, 1);
  const d = p.keyDelayBaseS! * (p.keyDelayRecIntercept! - recognitionIss / p.keyDelayRecDivisor!) * (1 - p.keyDelayPrepCut! * prep)
    + p.keyDelayFatigueS! * f * f + dComplexityS + dKnowledgeS;
  return clip(d, p.keyDelayFloorS!, p.delayCapS!);
}

/** J3.1.2 capacity: `3 + round(0.5 * zProcessing)`, rounded half away from zero, clipped to 2 to 5. */
export function attentionCapacity(zProcessing: number, p: PerceptionParams): number {
  const raw = p.capacityPerZ! * zProcessing;
  const rounded = raw < 0 ? -Math.floor(-raw + 0.5) : Math.floor(raw + 0.5);
  return clip(p.capacityBase! + rounded, p.capacityMin!, p.capacityMax!);
}

/** J3.2.2 read threshold `T = 1.5 * (1 + 0.10 * zDisc) * (1 - g)`, clipped to 1.0 to 2.2. `aggression` is the call's tag g. */
export function readThreshold(zDiscipline: number, aggression: number, p: PerceptionParams): number {
  return clip(p.readThresholdBase! * (1 + p.readThresholdPerZDisc! * zDiscipline) * (1 - aggression), p.readThresholdMin!, p.readThresholdMax!);
}

/** J3.2.2 evidence gain and noise for a play recognition z. */
export function evidenceGain(zRec: number, p: PerceptionParams): number { return p.evidenceGainBase! + p.evidenceGainPerZ! * zRec; }
export function evidenceNoiseSd(zRec: number, p: PerceptionParams): number {
  const sd = p.evidenceNoiseBase! - p.evidenceNoisePerZ! * zRec;
  return sd < p.evidenceNoiseMin! ? p.evidenceNoiseMin! : sd;
}

/** J3.3.2 weight a defender gives his assigned key against backfield flow. */
export function keyWeight(zDiscipline: number, p: PerceptionParams): number {
  return clip(p.keyWeightBase! + p.keyWeightPerZDisc! * zDiscipline, p.keyWeightMin!, p.keyWeightMax!);
}

/** J3.2.3 chance of pre-committing on a charted tendency. `gCall` is -0.05, 0 or +0.05 by instruction. */
export function anticipationChance(zRec: number, zDiscipline: number, gCall: number, p: PerceptionParams): number {
  return clip(p.anticipationBase! + p.anticipationPerZRec! * zRec - p.anticipationPerZDisc! * zDiscipline + gCall, 0, p.anticipationMax!);
}

/** J3.3.3 time to recognise the true coverage after the rotation becomes visible. */
export function coverageRecognitionS(z: number, p: PerceptionParams): number {
  const t = p.coverageRecognitionBaseS! - p.coverageRecognitionPerZS! * z;
  return t < p.coverageRecognitionFloorS! ? p.coverageRecognitionFloorS! : t;
}

/** J3.6.1 chance that one listener gets a call. `noise` and `cohesion` are 0 to 1. */
export function callDeliveryChance(noise: number, distanceYd: number, zSender: number, zListener: number, cohesion: number, p: PerceptionParams): number {
  return clip(p.callBase! - p.callNoiseK! * noise - p.callDistK! * distanceYd + p.callSkillPerZ! * (zSender + zListener) + p.callCohesion! * cohesion, 0, 1);
}

/** J3.5.1 standard deviation of a landing-point estimate at a fraction 0 to 1 of the ball's flight. */
export function landingErrorSdYd(flightFraction: number, zBallTracking: number, p: PerceptionParams): number {
  const end = clip(p.landingShrinkFlightFrac! - p.landingShrinkPerZ! * zBallTracking, p.landingShrinkMinFrac!, 1);
  const left = 1 - flightFraction / end;
  return left > 0 ? p.landingErrorYd! * left : 0;
}
