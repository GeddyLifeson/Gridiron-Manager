// Design constants of the agents and families module (G-49, bible L7). Every row is either a starting value
// the bible states (basis "bible", Assumption in L7) or one this module chose where the leaf names a rule
// without a number (basis "assumption", flagged in README.md). None is a real-world fact: the camp fines,
// forfeiture schedule and accrued-season rule are league-rules values read by key (keys.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.agents';

/** A seeded uniform draw in [0, 1). Career may not import engine-core, so the caller passes a stream (J13). */
export type Draw = () => number;

const ROWS: readonly Row[] = [
  // L7.1.1 player agents as people.
  ['assign.selfRepresentedShare', 0, 0, 1, 'probability', 'assumption', 'L7.1.1'],
  ['call.unmetWeeks', 3, 1, 26, 'weeks', 'bible', 'L7.1.1'],
  ['call.maxPerWeekToCoach', 1, 0, 7, 'count', 'bible', 'L7.1.1'],
  ['call.takeMinutes', 10, 0, 120, 'min', 'bible', 'L7.1.1'],
  ['call.honestTrust', 3, -20, 20, 'points', 'bible', 'L7.1.1'],
  ['call.honestPatientChance', 0.6, 0, 1, 'probability', 'bible', 'L7.1.1'],
  ['call.hopefulPatientChance', 1, 0, 1, 'probability', 'assumption', 'L7.1.1'],
  ['call.nothingPatientChance', 0.3, 0, 1, 'probability', 'assumption', 'L7.1.1'],
  ['call.roleBeliefMax', 5, 0, 20, 'points', 'bible', 'L7.1.1'],
  ['call.gmContractMemory', -3, -20, 0, 'points', 'bible', 'L7.1.1'],
  ['style.combative', 70, 0, 100, 'points', 'assumption', 'L7.1.1'],
  // L7.1.2 the coach's reputation with agents (derived, never stored).
  ['stance.clientMemoryWeight', 0.5, 0, 1, 'ratio', 'bible', 'L7.1.2'],
  ['stance.band.wary', 35, 0, 100, 'points', 'bible', 'L7.1.2'],
  ['stance.band.neutral', 50, 0, 100, 'points', 'bible', 'L7.1.2'],
  ['stance.band.favourable', 65, 0, 100, 'points', 'bible', 'L7.1.2'],
  ['fa.closeOfferShare', 0.05, 0, 0.5, 'ratio', 'bible', 'L7.1.2'],
  ['fa.stancePreference', 0.03, 0, 0.2, 'ratio', 'bible', 'L7.1.2'],
  ['fa.otherFactorsSpread', 0.5, 0, 2, 'ratio', 'assumption', 'L7.1.2'],
  ['client.paidMore', 10, -50, 50, 'points', 'bible', 'L7.1.2'],
  ['client.paidMoreHalfLifeWeeks', 156, 1, 1000, 'weeks', 'bible', 'L7.1.2'],
  ['client.cutWithoutWord', -15, -50, 0, 'points', 'bible', 'L7.1.2'],
  // L7.1.3 agencies and package deals.
  ['agency.interviewFactor', 1.5, 1, 5, 'ratio', 'bible', 'L7.1.3'],
  ['agency.hireProposedTrust', 3, -20, 20, 'points', 'bible', 'L7.1.3'],
  ['agency.declineProposedTrust', -2, -20, 20, 'points', 'bible', 'L7.1.3'],
  // L7.2.1 contract-year players.
  ['contractYear.payWeight', 1.5, 1, 3, 'ratio', 'bible', 'L7.2.1'],
  ['contractYear.securityWeight', 1.5, 1, 3, 'ratio', 'bible', 'L7.2.1'],
  ['contractYear.playingTimeWeight', 1.2, 1, 3, 'ratio', 'bible', 'L7.2.1'],
  ['contractYear.injuryHidingPoints', 10, 0, 50, 'points', 'bible', 'L7.2.1'],
  // L7.2.2 holdouts.
  ['holdout.roomPayNeed', 2, -20, 20, 'points', 'bible', 'L7.2.2'],
  ['holdout.roomCarryingSnaps', -3, -20, 20, 'points', 'bible', 'L7.2.2'],
  ['holdout.roomCarryWeeks', 3, 0, 26, 'weeks', 'bible', 'L7.2.2'],
  ['holdout.publicCriticism', -10, -50, 0, 'points', 'bible', 'L7.2.2'],
  ['holdout.publicCriticismSharedAgent', -4, -50, 0, 'points', 'bible', 'L7.2.2'],
  ['holdout.returnTalkRemoval', 0.5, 0, 1, 'ratio', 'bible', 'L7.2.2'],
  ['holdout.readinessShare', 1, 0, 1, 'ratio', 'bible', 'L7.2.2'],
  // L7.2.3 hold-ins.
  ['holdin.costShareOfPay', 0.05, 0, 1, 'ratio', 'bible', 'L7.2.3'],
  ['holdin.readinessShare', 0.5, 0, 1, 'ratio', 'bible', 'L7.2.3'],
  ['holdin.roomWeekly', -2, -20, 0, 'points', 'bible', 'L7.2.3'],
  // L7.2.4 trade requests.
  ['trade.stressBreakpoint', 75, 0, 100, 'points', 'bible', 'L7.2.4'],
  ['trade.loyaltyLow', 30, 0, 100, 'points', 'assumption', 'L7.2.4'],
  ['trade.publicTrustBelow', 30, 0, 100, 'points', 'bible', 'L7.2.4'],
  ['trade.refuseCost', -5, -50, 0, 'points', 'bible', 'L7.2.4'],
  ['trade.hopefulBrokenCost', -30, -100, 0, 'points', 'bible', 'L7.2.4'],
  ['trade.resolvedWeeks', 6, 1, 52, 'weeks', 'bible', 'L7.2.4'],
  ['trade.resolvedMemory', 5, 0, 50, 'points', 'assumption', 'L7.2.4'],
  ['trade.postDeadlineStress', 1, 0, 10, 'points', 'bible', 'L7.2.4'],
  // L7.3.1 families.
  ['family.closenessMin', 0.3, 0, 1, 'ratio', 'bible', 'L7.3.1'],
  ['family.closenessMax', 1, 0, 1, 'ratio', 'bible', 'L7.3.1'],
  ['family.adviceMax', 5, 0, 20, 'points', 'bible', 'L7.3.1'],
  ['family.surgeryCall', 8, -50, 50, 'points', 'bible', 'L7.3.1'],
  ['family.meetingGiven', 4, -50, 50, 'points', 'bible', 'L7.3.1'],
  ['family.meetingRefused', -6, -50, 50, 'points', 'bible', 'L7.3.1'],
  ['family.medicalAgainstFlag', -15, -50, 0, 'points', 'bible', 'L7.3.1'],
  ['witness.halfStrength', 0.5, 0, 1, 'ratio', 'bible', 'L7.3.1'],
  ['witness.parentRecruitingStrength', 1, 0, 1, 'ratio', 'bible', 'L7.3.1'],
  // L7.3.2 high school coaches.
  ['hs.visitFamiliarity', 4, 0, 20, 'points', 'bible', 'L7.3.2'],
  ['hs.openBandNarrowing', 0.15, 0, 1, 'ratio', 'bible', 'L7.3.2'],
  ['hs.openRecruitTrust', 5, 0, 20, 'points', 'bible', 'L7.3.2'],
  ['hs.latePull', -20, -50, 0, 'points', 'bible', 'L7.3.2'],
  ['hs.neighbourShare', 0.25, 0, 1, 'ratio', 'bible', 'L7.3.2'],
  ['hs.band.guarded', 35, 0, 100, 'points', 'assumption', 'L7.3.2'],
  ['hs.band.neutral', 50, 0, 100, 'points', 'assumption', 'L7.3.2'],
  ['hs.band.open', 65, 0, 100, 'points', 'assumption', 'L7.3.2'],
  // L7.4.1 lower rungs.
  ['lower.assistantBreakShare', 1, 0, 1, 'ratio', 'bible', 'L7.4.1'],
  ['lower.headCoachBreakShare', 0.5, 0, 1, 'ratio', 'bible', 'L7.4.1'],
  ['lower.pastAuthorityStanding', -6, -50, 0, 'points', 'bible', 'L7.4.1'],
  ['lower.aiAssistantBindShare', 0.5, 0, 1, 'ratio', 'bible', 'L7.4.1'],
  ['lower.recruiterLeavesPlayerShare', 0.5, 0, 1, 'ratio', 'bible', 'L7.4.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g49.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible)`
      : `${leaf} acceptance (module assumption, needs research)`,
    status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** A parameter by short name; throws on a typo so a missing row never reads as zero. */
export function ap(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${MODULE}: no parameter ${name}`);
  return v;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 0.5 to the power weeks / halfLife using only + - * / (no platform transcendental math, P1.1.1), so every
 * platform gets the same bits. The weekly factor is the halfLife-th root of 0.5, found by bisection.
 */
export function halfLifeFactor(weeks: number, halfLifeWeeks: number): number {
  if (weeks <= 0) return 1;
  const n = Math.max(1, Math.round(halfLifeWeeks));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (powInt(mid, n) < 0.5) lo = mid; else hi = mid;
  }
  return powInt((lo + hi) / 2, Math.floor(weeks));
}

function powInt(base: number, exp: number): number {
  let result = 1;
  let b = base;
  let e = exp;
  while (e > 0) {
    if (e & 1) result *= b;
    b *= b;
    e >>= 1;
  }
  return result;
}
