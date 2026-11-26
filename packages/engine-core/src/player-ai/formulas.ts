// K1 formulas as pure functions of numbers. No world, no view, no stream: the stage and the tests
// call the same code. `m` is the engine's deterministic math; clips use plain comparisons.
import { possible } from '@gm/schema';
import type { PlayerAiParams } from './params.ts';
import type { PlayerMind, StandingInstruction } from './mind.ts';

export function clip(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
const MID = 50, ISS_SD = 10;
export function issZ(iss: number): number { return (iss - MID) / ISS_SD; }
/** X1 facet (0 to 100, 50 in the middle) to the z the K1 formulas use. */
export function facetZ(facet: number, p: PlayerAiParams): number { return (facet - MID) / p.facetZDivisor; }

// ---- K1.2.1 effort ----

/** Mean effort for the snap, before the fatigue term that applies away from the ball. */
export function effortMean(mind: PlayerMind, margin: number, secondHalf: boolean, p: PlayerAiParams): number {
  const half = p.effortZSpan / 2;
  let compZ = facetZ(mind.competitiveness, p);
  if (mind.effortNeed) compZ += p.effortNeedBoostZ;
  const z = clip(issZ(mind.motor) + p.effortWorkHabitsWeight * facetZ(mind.workHabits, p) + (mind.effortNeed ? p.effortWorkHabitsWeight * p.effortNeedBoostZ : 0), -half, half);
  let mean = 1 - p.effortMaxLoss * (half - z) / p.effortZSpan;
  const absMargin = margin < 0 ? -margin : margin;
  if (secondHalf && absMargin > p.effortBlowoutMargin && compZ < p.effortLowCompetitivenessZ) mean -= p.effortBlowoutDrop;
  if (mind.stressEffortDrop) mean -= p.effortStressDrop;
  return clip(mean, p.effortMin, 1);
}
/** Spread of the snap's effort around its mean: a high-motor player is at 1.00 almost always. */
export function effortSd(mean: number, p: PlayerAiParams): number { return p.effortSdBase + p.effortSdPerLoss * (1 - mean); }
/** The level drawn for the snap. `eps` is one standard normal. */
export function effortLevel(mean: number, eps: number, p: PlayerAiParams): number { return clip(mean + effortSd(mean, p) * eps, p.effortMin, 1); }
/** Effort actually used this tick (rules 2 and 4): floored at the point of attack, lowered by fatigue away from it. */
export function effortNow(level: number, atPoint: boolean, fatigue: number, p: PlayerAiParams): number {
  if (atPoint) return level > p.effortPoaFloor ? level : p.effortPoaFloor;
  return clip(level - p.effortFatigueAway * fatigue * fatigue, p.effortMin, 1);
}

// ---- J4.5.2 mental error draw ----

export function experienceFactor(highLeverageSnaps: number, p: PlayerAiParams): number {
  const done = clip(highLeverageSnaps / p.experienceSnaps, 0, 1);
  return 1 - (1 - p.experienceFloor) * done;
}
/** D4.3.1 composure multiplier. */
export function composureMult(pressure: number, composure: number, highLeverageSnaps: number, p: PlayerAiParams): number {
  return 1 + pressure * (MID - composure) / p.composureDivisor * experienceFactor(highLeverageSnaps, p);
}
/** D12.3.2 buy-in factor on discipline errors: linear around the middle, capped. */
export function buyInFactor(buyIn: number, p: PlayerAiParams): number { return clip(1 - (buyIn - p.buyInMid) * p.buyInSlope, p.buyInMin, p.buyInMax); }

export interface ErrorInputs {
  /** D9 knowledge of the concept, 0 to 100. */
  knowledge: number; difficulty: number; changedAtLine: boolean; noiseFactor: number;
  assignmentDiscipline: number; temptation: number; buyIn: number;
  complexity: number; fatigue: number; footballIntelligence: number; composure: number; pressure: number; highLeverageSnaps: number;
}
/** Writes [pK, pD] into `out` (J4.5.2). Their sum is capped by scaling both. */
export function errorChances(i: ErrorInputs, p: PlayerAiParams, out: Float64Array): void {
  const miss = 1 - i.knowledge / (2 * MID);
  let pK = p.knowledgeE * miss * miss * i.difficulty * (i.changedAtLine ? p.changedAtLine : 1) * i.noiseFactor;
  let base = p.disciplineBase * (p.disciplineIntercept - i.assignmentDiscipline / p.disciplineDivisor);
  if (base < p.disciplineFloor) base = p.disciplineFloor;
  let pD = base * i.temptation * buyInFactor(i.buyIn, p);
  const both = (1 + p.complexityK * i.complexity) * (1 + i.fatigue * i.fatigue)
    * clip(1 - p.iqK * issZ(i.footballIntelligence), p.iqMin, p.iqMax)
    * composureMult(i.pressure, i.composure, i.highLeverageSnaps, p);
  pK *= both; pD *= both;
  const sum = pK + pD;
  if (sum > p.errorCap) { pK *= p.errorCap / sum; pD *= p.errorCap / sum; }
  out[0] = pK; out[1] = pD;
}

// ---- K1.7.4 self weight, K1.3.1 threshold ----

export function selfWeight(mind: PlayerMind, p: PlayerAiParams): number {
  if (mind.neutralBlock) return p.selfBase;
  const w = p.selfBase + p.selfEgo * facetZ(mind.ego, p) - p.selfTeam * facetZ(mind.teamOrientation, p)
    + p.selfNeed * mind.needSelf + p.selfBuyIn * (p.selfBuyInMid - mind.buyIn) / p.selfBuyInSpan + mind.selfWeightShift;
  return clip(w, 0, p.selfMax);
}

/**
 * K1.3.1 rule 2 threshold: falls with risk tolerance, rises with technique discipline, inside the
 * leaf's range; instructions and the deep-safety margin are added on top of the clipped value.
 * `forTeam` applies the smaller no-freelancing rise of K1.7.5's edge case.
 */
export function gambleThreshold(mind: PlayerMind, assignmentDiscipline: number, instruction: StandingInstruction | undefined, forTeam: boolean, lastLine: boolean, p: PlayerAiParams): number {
  const mid = (p.thresholdMin + p.thresholdMax) / 2;
  let t = clip(mid - p.thresholdPerRiskZ * facetZ(mind.riskTolerance, p) + p.thresholdPerDisciplineZ * issZ(assignmentDiscipline), p.thresholdMin, p.thresholdMax);
  if (instruction?.stayOnTop) t += p.thresholdInstruction;
  if (instruction?.noFreelancing) t += p.thresholdInstruction * (forTeam ? p.thresholdTeamFrac : 1);
  if (forTeam) t += mind.thresholdShift;
  if (lastLine) t += p.deepSafetyMargin;
  return t;
}

/** K1.3.1 rule 2 confidence: his anticipated chance that the read is right. It can be wrong (J3.3). */
export function confidence(readConfidence: number, recognition: number, learnedZ: number, tell: number, eyes: boolean, p: PlayerAiParams): number {
  return clip(p.confBase + p.confPerRead * readConfidence + p.confPerRecZ * issZ(recognition) + p.confPerLearnZ * learnedZ
    + p.confTell * tell + (eyes ? p.confEyes : 0), p.confMin, p.confMax);
}

/** Confidence when the cue is the thing itself in front of him (a carrier in reach, a free rusher, an open man), not a read of what is coming. */
export function confidenceSeen(recognition: number, p: PlayerAiParams): number { return clip(p.confSeen + p.confPerRecZ * issZ(recognition), p.confMin, p.confMax); }

/** K1.7.5 gate. */
export function passesGate(knowledge: number, footballIntelligence: number, seasonsInSystem: number, p: PlayerAiParams): boolean {
  return knowledge >= p.gateKnowledge && issZ(footballIntelligence) >= p.gateIqZ && seasonsInSystem >= p.gateSeasons;
}

/** K1.7.5 rule 3: his estimate of what the adjustment costs teammates who count on him. `eps` is one standard normal. */
export function coordinationCostEst(uncovered: number, footballIntelligence: number, eps: number, p: PlayerAiParams): number {
  const sd = p.estimateSd * clip(1 - p.estimateSdPerIqZ * issZ(footballIntelligence), 0, 2);
  const est = p.coordCost * uncovered * (1 - p.coordBias) * (1 + sd * eps);
  return est > 0 ? est : 0;
}

// ---- K1.3.3 deliberate fouls ----

export function foulThreshold(mind: PlayerMind, instruction: StandingInstruction | undefined, p: PlayerAiParams): number {
  const mid = (p.foulThresholdMin + p.foulThresholdMax) / 2;
  const t = clip(mid + p.foulThresholdPerDisciplineZ * facetZ(mind.discipline, p) - p.foulThresholdPerCompetitivenessZ * facetZ(mind.competitiveness, p),
    p.foulThresholdMin, p.foulThresholdMax);
  return t + p.foulInstructionShift * (instruction?.deliberateFouls ?? 0);
}

/**
 * What an interference foul here would cost, in his rough expected points. `spotYd` is how far past
 * the previous spot the foul is; `toGoalYd` how far the previous spot is from the goal line. The
 * enforcement values are read from the rule set by the caller, never typed here.
 */
export function interferenceCostEst(spotYd: number, toGoalYd: number, spotFoul: boolean, yards: number, maxYards: number, autoFirstDown: boolean, p: PlayerAiParams): number {
  let gain = spotFoul ? spotYd : yards;
  if (maxYards > 0 && gain > maxYards) gain = maxYards;
  const room = toGoalYd - p.foulGoalLineYd;
  if (gain > room) gain = room > 0 ? room : 0;
  return gain * p.foulEpPerYd + (autoFirstDown ? p.foulFirstDownEp : 0);
}

// ---- K1.7.2 accidents ----

export function accidentChance(techZ: number, fatigue: number, rerouted: boolean, traffic: number, composure: number, p: PlayerAiParams): number {
  const z = clip(techZ, -p.accidentTechClip, p.accidentTechClip);
  const c = p.accidentBase * (p.accidentTechIntercept - z / p.accidentTechDivisor) * (1 + fatigue * fatigue)
    * (1 + (rerouted ? p.accidentReroute : 0)) * (1 + p.accidentTraffic * traffic) * composure;
  return possible(c > p.accidentCap ? p.accidentCap : c < 0 ? 0 : c);
}

// ---- K1.7.3 situational lapses ----

/** Chance he does the wrong (ordinary) thing in a situation (rule 2). */
export function situationMissChance(kSit: number, yearsAtLevel: number, footballIntelligence: number, reminder: boolean, composure: number, p: PlayerAiParams): number {
  const young = p.sitYearsFull - yearsAtLevel;
  let right = p.sitBase - p.sitKnowledge * (1 - kSit) - p.sitYears * (young > 0 ? young : 0) + p.sitIq * issZ(footballIntelligence);
  right = clip(right, p.sitMin, p.sitMax);
  if (reminder) right += p.sitReminder;
  return clip((1 - right) * composure, 0, 1);
}

// ---- K1.5.1 communication ----

export function commQuality(communication: number, recognition: number, noise: number, tempo: number, p: PlayerAiParams): number {
  return clip(p.commBase + p.commPerZ * issZ(communication) + p.commRecognitionPerZ * issZ(recognition) - p.commNoise * noise - p.commTempo * tempo, 0, 1);
}
/** Addition to the J3.6.1 call delivery chance from the communicator's quality (rule 1). */
export function deliveryBonus(quality: number, p: PlayerAiParams): number { return p.commDeliveryK * (quality - p.commBase); }
/** Chance he fixes one unsure teammate before the snap (rule 2). */
export function correctionChance(quality: number, playClockLeftS: number, p: PlayerAiParams): number {
  return p.commCorrectMax * quality * clip(playClockLeftS / p.commCorrectClockS, 0, 1);
}
/** Chance a teammate hears and follows a confidently made call (rule 3). */
export function heardChance(quality: number, noise: number, p: PlayerAiParams): number {
  return clip(p.commHeardBase + deliveryBonus(quality, p) - p.commNoise * noise, 0, 1);
}

// ---- K1.3.2 ----

export function scrambleRuleChance(knowledge: number, p: PlayerAiParams): number { return p.scrambleUnknown + (p.scrambleKnown - p.scrambleUnknown) * clip(knowledge, 0, 1); }
/** K1.3.2 rule 3: bounded shift of the J8 patience parameter from the coach's instruction. Reader: J8. */
export function patienceShift(instruction: StandingInstruction | undefined, p: PlayerAiParams): number { return p.patienceShiftMax * (instruction?.carrierPatience ?? 0); }
