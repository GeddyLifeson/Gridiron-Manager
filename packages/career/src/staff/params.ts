// Design constants of the staff module (game build plan section 2). Every value here is a starting value
// the bible states (basis "bible", leaf named; L4 marks all of them Assumption or Unverified) or one this
// module chose where the leaf names a parameter without a number (basis "assumption"). None is a
// real-world fact: league hiring rules are rule keys (keys.ts) and assistant pay and contract terms
// have no source yet (L4.2.5, L4.1.4 open questions), so contracts carry an "unverified" flag.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.staff';

const ROWS: readonly Row[] = [
  // L4.2.3 coach ties.
  ['tie.growPerSeason', 6, 0, 30, 'points', 'bible', 'L4.2.3'],
  ['tie.directReportBonus', 3, 0, 30, 'points', 'assumption', 'L4.2.3'],
  ['tie.decayPerSeason', 2, 0, 30, 'points', 'bible', 'L4.2.3'],
  ['tie.floor', 10, 0, 50, 'points', 'bible', 'L4.2.3'],
  ['tie.max', 100, 0, 100, 'points', 'bible', 'L4.2.3'],
  ['tie.witnessAbove', 60, 0, 100, 'points', 'bible', 'L4.2.3'],
  // L4.2.2 interviews.
  ['interview.maxTopics', 4, 1, 6, 'count', 'bible', 'L4.2.2'],
  ['interview.minutesPerTopic', 45, 5, 240, 'min', 'assumption', 'L4.2.2'],
  ['interview.familiarityGain', 10, 0, 50, 'points', 'assumption', 'L4.2.2'],
  ['reference.omitNegativesTieAbove', 70, 0, 100, 'points', 'bible', 'L4.2.2'],
  ['teaching.smallSampleWeeks', 16, 1, 200, 'weeks', 'assumption', 'L4.2.2'],
  // L4.2.3, K7.6.1 offer acceptance and candidate scoring.
  ['accept.base', 0.5, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['accept.perRung', 0.15, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['accept.payWeight', 0.5, 0, 2, 'probability', 'assumption', 'K7.6.1'],
  ['accept.callingWeight', 0.15, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['accept.prospectsWeight', 0.1, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['accept.trustWeight', 0.2, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['accept.securityPerYear', 0.03, 0, 1, 'probability', 'assumption', 'K7.6.1'],
  ['score.fitWeight', 0.3, 0, 1, 'ratio', 'assumption', 'K7.6.1'],
  ['score.qualityWeight', 0.4, 0, 1, 'ratio', 'assumption', 'K7.6.1'],
  ['score.tieWeight', 0.2, 0, 1, 'ratio', 'assumption', 'K7.6.1'],
  ['score.costWeight', 0.1, 0, 1, 'ratio', 'assumption', 'K7.6.1'],
  ['score.familiarityBonus', 0.1, 0, 1, 'ratio', 'bible', 'K7.6.1'],
  ['fire.seasonsBelowStandard', 2, 1, 5, 'seasons', 'bible', 'K7.6.1'],
  // L4.2.5 assistant contracts (Assumption; rules block replaceable when research arrives).
  ['contract.minYears', 1, 1, 10, 'years', 'bible', 'L4.2.5'],
  ['contract.maxYears', 3, 1, 10, 'years', 'bible', 'L4.2.5'],
  // L4.3.1 needs and buy-in.
  ['buyIn.trust', 0.5, 0, 1, 'ratio', 'bible', 'L4.3.1'],
  ['buyIn.respect', 0.3, 0, 1, 'ratio', 'bible', 'L4.3.1'],
  ['buyIn.roleBelief', 0.2, 0, 1, 'ratio', 'bible', 'L4.3.1'],
  ['need.unmetWeeks', 6, 1, 52, 'weeks', 'bible', 'L4.3.1'],
  ['need.trustLossPerWeek', 1, 0, 10, 'points', 'bible', 'L4.3.1'],
  ['need.weightMin', 0.2, 0, 1, 'ratio', 'assumption', 'L4.3.1'],
  // L4.3.2 autonomy and rooms.
  ['autonomy.unmetGap', 30, 0, 100, 'points', 'bible', 'L4.3.2'],
  ['room.followBondAbove', 70, 0, 100, 'points', 'bible', 'L4.3.2'],
  ['room.followBuyInBelow', 40, 0, 100, 'points', 'bible', 'L4.3.2'],
  ['room.followMessageWeight', 0.5, 0, 1, 'ratio', 'bible', 'L4.3.2'],
  ['room.tunedOutBondBelow', 30, 0, 100, 'points', 'bible', 'L4.3.2'],
  ['room.tunedOutWeeks', 4, 1, 52, 'weeks', 'bible', 'L4.3.2'],
  // L4.3.3 disagreement.
  ['object.baseThreshold', 0.3, 0, 1, 'ratio', 'assumption', 'L4.3.3'],
  ['object.trustSlope', 0.15, 0, 1, 'ratio', 'assumption', 'L4.3.3'],
  ['object.respectSlope', 0.1, 0, 1, 'ratio', 'assumption', 'L4.3.3 with L1.1.1 respect (plans/head-coach-nuance.md item 5: a new head coach gets more push-back until his calls prove out); size chosen here'],
  ['object.dismissedRaise', 0.15, 0, 1, 'ratio', 'assumption', 'L4.3.3'],
  ['object.dismissedRun', 3, 1, 10, 'count', 'bible', 'L4.3.3'],
  ['object.overruleNoReasonTrust', -1, -10, 0, 'points', 'bible', 'L4.3.3'],
  ['object.provenRespect', 2, 0, 10, 'points', 'bible', 'L4.3.3'],
  ['object.silentWeeksWarning', 6, 1, 52, 'weeks', 'assumption', 'L4.3.3'],
  ['object.publicTrustBelow', 25, 0, 100, 'points', 'bible', 'L4.3.3'],
  ['object.headsetPushesPerSeries', 1, 0, 3, 'count', 'bible', 'L4.3.3'],
  // L4.3.4 developing assistants.
  ['develop.noviceGamesCalled', 8, 0, 50, 'games', 'bible', 'L4.3.4'],
  ['develop.factorMin', 0.95, 0.5, 1, 'ratio', 'bible', 'L4.3.4'],
  ['develop.factorMax', 1.05, 1, 1.5, 'ratio', 'bible', 'L4.3.4'],
  ['develop.factorSlope', 0.25, 0, 2, 'ratio', 'assumption', 'L4.3.4'],
  // L4.3.5 hours and burnout.
  ['hours.standard', 70, 20, 120, 'h', 'bible', 'L4.3.5'],
  ['hours.long', 80, 20, 120, 'h', 'bible', 'L4.3.5'],
  ['hours.allIn', 90, 20, 120, 'h', 'bible', 'L4.3.5'],
  ['hours.diminishAbove', 80, 20, 120, 'h', 'bible', 'L4.3.5'],
  ['hours.diminishFactor', 0.5, 0, 1, 'ratio', 'bible', 'L4.3.5'],
  ['hours.stressPerHourOverStandard', 1, 0, 20, 'points', 'assumption', 'L4.3.5'],
  ['hours.familyNeedStress', 5, 0, 50, 'points', 'assumption', 'L4.3.5'],
  // L4.4.1 losing assistants.
  ['leave.lateralBlockMemory', 50, 0, 100, 'points', 'bible', 'L4.4.1'],
  ['leave.roomTrustAbove', 60, 0, 100, 'points', 'bible', 'L4.4.1'],
  ['leave.roleBeliefLoss', 5, 0, 50, 'points', 'bible', 'L4.4.1'],
  ['leave.newcomerBond', 40, 0, 100, 'points', 'assumption', 'L4.4.1'],
  // L4.4.2 firing.
  ['fire.witnessMemory', 40, 0, 100, 'points', 'assumption', 'L4.4.2'],
  // L4.4.3 report up.
  ['report.trustSlope', 0.4, 0, 2, 'ratio', 'bible', 'L4.4.3'],
  ['report.min', 5, 0, 100, 'percent', 'bible', 'L4.4.3'],
  ['report.max', 95, 0, 100, 'percent', 'bible', 'L4.4.3'],
  ['report.protectRoomCut', 15, 0, 100, 'percent', 'assumption', 'L4.4.3'],
  // L4.6.1 chaplain.
  ['chapel.reliefPerVisit', 5, 0, 50, 'points', 'bible', 'L4.6.1'],
  ['chapel.countBand', 5, 1, 20, 'count', 'assumption', 'L4.6.1'],
  ['chapel.earlyWarningTrust', 60, 0, 100, 'points', 'assumption', 'L4.6.1'],
  ['chapel.pressureReaction', 3, 0, 20, 'points', 'assumption', 'L4.6.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g47.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} starting value (Assumption or Unverified in the bible)`
      : `${leaf} acceptance (module assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`staff: unknown parameter ${name}`);
  return v;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
