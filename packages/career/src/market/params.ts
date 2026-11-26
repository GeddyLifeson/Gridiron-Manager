// Design constants of the job market (G-80). Every value is a starting value the bible states (basis
// "bible", leaf named; E2, E4.4 to E4.7, S6, S7 mark them Assumption or Unverified) or one this module
// chose where a leaf names a parameter without a number (basis "assumption"). None is a real-world fact:
// real-world numbers sit in facts.json with computed status, league rules are rule keys (keys.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.market';

const ROWS: readonly Row[] = [
  // E2.2.2 job value and the value window.
  ['value.rung0', 0, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung1', 5, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung2', 10, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung3', 18, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung4', 25, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung5', 35, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung6', 45, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung7', 60, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung8', 70, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.rung9', 100, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.prestigeMax', 40, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['value.window', 30, 0, 100, 'points', 'bible', 'E2.2.2'],
  ['fit.lateralBand', 5, 0, 30, 'points', 'assumption', 'E2.3.3'],
  ['fit.wellAbove', 30, 0, 100, 'points', 'assumption', 'E2.3.3'],
  // E2.3.1 cascade.
  ['cascade.weeks', 6, 1, 20, 'weeks', 'bible', 'E2.3.1'],
  // E2.3.3 applying.
  ['apply.hours', 0.5, 0, 10, 'hours', 'bible', 'E2.3.3'],
  ['apply.bossLearns.letter', 0.2, 0, 1, 'probability', 'bible', 'E2.3.3'],
  ['apply.bossLearns.agent', 0.5, 0, 1, 'probability', 'bible', 'E2.3.3'],
  ['apply.bossLearns.contact', 0.3, 0, 1, 'probability', 'bible', 'E2.3.3'],
  ['apply.declineInterviewRegard', -2, -20, 0, 'points', 'assumption', 'E2.3.3'],
  // E2.3.2 candidate score.
  ['score.noiseShareOfRange', 0.2, 0, 1, 'ratio', 'bible', 'E2.3.2'],
  ['score.internalBonus', 10, 0, 50, 'points', 'bible', 'E2.6.2'],
  ['score.interimSampleDiscount', 0.5, 0, 1, 'ratio', 'assumption', 'E2.6.3'],
  ['passedOver.relationship', -3, -20, 0, 'points', 'assumption', 'E2.6.2'],
  // S6.4.1 working interview blend.
  ['interview.practicalWeight', 0.5, 0, 1, 'ratio', 'bible', 'S6.4.1'],
  ['interview.relationshipWeight', 0.3, 0, 1, 'ratio', 'bible', 'S6.4.1'],
  ['interview.fitWeight', 0.2, 0, 1, 'ratio', 'bible', 'S6.4.1'],
  ['interview.staffBluffPenalty', 0.5, 0, 1, 'ratio', 'assumption', 'E2.4.3'],
  ['interview.boardSpeedShare', 0.2, 0, 1, 'ratio', 'assumption', 'E2.4.3'],
  ['interview.complianceTurnChance', 0.05, 0, 1, 'probability', 'assumption', 'E2.4.4'],
  ['interview.complianceTurnScore', 85, 0, 100, 'points', 'assumption', 'E2.4.4'],
  // E2.4.1 market value.
  ['mv.lowRungMax', 6, 1, 9, 'rung', 'bible', 'E2.4.1'],
  ['mv.low.path', 0.6, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.low.results', 0.2, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.low.grades', 0.2, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.high.results', 0.4, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.high.reputation', 0.35, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.high.agent', 0.15, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.high.path', 0.1, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  ['mv.creditTakenShare', 0.5, 0, 1, 'ratio', 'assumption', 'E2.4.1'],
  // E2.7.2, S7.3.1 time out.
  ['out.decayPerYear', 0.15, 0, 1, 'ratio', 'bible', 'E2.7.2'],
  ['out.collapseRestore', 0.5, 0, 1, 'ratio', 'assumption', 'E2.7.2'],
  ['out.comebackAfterYears', 2, 1, 10, 'years', 'bible', 'S7.3.1'],
  ['out.monthlyPeerLoss', 1, 0, 10, 'points', 'assumption', 'S7.3.1'],
  // E2.5.1 offers.
  ['offer.deadlineDays', 5, 1, 30, 'days', 'assumption', 'E2.5.1'],
  ['offer.backOutOwnerRegard', -15, -50, 0, 'points', 'assumption', 'E2.5.1'],
  // E2.5.3 coach trades.
  ['trade.topShare', 0.1, 0, 1, 'ratio', 'bible', 'E2.5.3'],
  ['trade.aggressiveAbove', 0.7, 0, 1, 'ratio', 'assumption', 'E2.5.3'],
  ['trade.yearsFull', 3, 1, 10, 'years', 'assumption', 'E2.5.3'],
  ['trade.steppedAwayShare', 0.6, 0, 1, 'ratio', 'assumption', 'E2.5.3'],
  ['trade.rivalPremium', 1.25, 1, 3, 'ratio', 'assumption', 'E2.5.3'],
  ['trade.minPoints', 1, 0, 10, 'pick points', 'assumption', 'E2.5.3'],
  ['trade.refusedConfidence', -5, -30, 0, 'points', 'assumption', 'E2.5.3'],
  // E4.4.1 hot seat signs.
  ['sign.weeklyChance', 0.25, 0, 1, 'probability', 'assumption', 'E4.4.1'],
  // Bible says 3% of the normal chance; that breaks its own acceptance 2 (a sign in 54% of seasons above 70
  // confidence). 0.15% meets it; conflict sent to the bible fixes thread (README).
  ['sign.offBandShare', 0.0015, 0, 1, 'ratio', 'assumption', 'E4.4.1'],
  ['sign.cooldownWeeks', 4, 1, 52, 'weeks', 'bible', 'E4.4.1'],
  ['sign.involvementAbove', 0.6, 0, 1, 'ratio', 'bible', 'E4.4.1'],
  ['sign.candidVoteSkip', 0.9, 0, 1, 'ratio', 'assumption', 'E4.4.1'],
  ['sign.ownerVisitHours', 2, 0, 20, 'hours', 'assumption', 'E4.4.1'],
  ['sign.voteTrueShare', 0.5, 0, 1, 'ratio', 'bible', 'E4.4.1'],
  // E4.6.1 conditions.
  ['cond.acceptConfidence', 5, 0, 30, 'points', 'bible', 'E4.6.1'],
  ['cond.allPassedHazard', 0.8, 0, 1, 'ratio', 'bible', 'E4.6.1'],
  ['cond.failedGoalWeight', 2, 1, 5, 'ratio', 'bible', 'E4.6.1'],
  ['cond.refuseFireBelow', 30, 0, 100, 'points', 'bible', 'E4.6.1'],
  ['cond.refuseConfidence', -6, -30, 0, 'points', 'bible', 'E4.6.1'],
  ['cond.planMax', 4, 0, 20, 'points', 'bible', 'E4.6.1'],
  ['cond.planHours', 3, 0, 20, 'hours', 'bible', 'E4.6.1'],
  ['cond.publicWeeks', 2, 0, 10, 'weeks', 'bible', 'E4.6.1'],
  ['cond.playerRegard', -2, -20, 0, 'points', 'assumption', 'E4.6.1'],
  ['cond.maxCount', 3, 1, 6, 'count', 'bible', 'E4.6.1'],
  // E4.6.2 staff sacrifice.
  ['sac.confidenceBottomThird', 4, 0, 20, 'points', 'bible', 'E4.6.2'],
  ['sac.confidenceOther', 1, 0, 20, 'points', 'bible', 'E4.6.2'],
  ['sac.loyaltyMin', 2, 0, 20, 'points', 'bible', 'E4.6.2'],
  ['sac.loyaltyMax', 8, 0, 20, 'points', 'bible', 'E4.6.2'],
  ['sac.ownerRequiredShare', 0.5, 0, 1, 'ratio', 'bible', 'E4.6.2'],
  ['sac.blameShiftPeers', -2, -20, 0, 'points', 'assumption', 'E4.6.2'],
  // E2.7.1 fired, E2.7.3 resigned.
  ['fired.peerBase', -10, -50, 0, 'points', 'assumption', 'E2.7.1'],
  ['fired.ownerBase', -15, -50, 0, 'points', 'assumption', 'E2.7.1'],
  ['fired.shortPoorShare', 0.4, 0, 1, 'ratio', 'assumption', 'E2.7.1'],
  ['fired.talentedShare', 1.5, 1, 3, 'ratio', 'assumption', 'E2.7.1'],
  ['resign.midSeasonOwner', -20, -50, 0, 'points', 'assumption', 'E2.7.3'],
  ['resign.midSeasonPlayers', -10, -50, 0, 'points', 'assumption', 'E2.7.3'],
  // E2.3.4 a moving market.
  ['move.lateralThreshold', 10, 0, 50, 'points', 'assumption', 'E2.3.4'],
  ['move.entrantSurplus', 0.08, 0, 1, 'ratio', 'bible', 'E2.3.4'],
  ['move.retireAgeStart', 60, 30, 90, 'years', 'assumption', 'E2.3.4'],
  ['move.retirePerYearOver', 0.03, 0, 1, 'probability', 'assumption', 'E2.3.4'],
  ['move.retirePerYearOut', 0.1, 0, 1, 'probability', 'assumption', 'E2.3.4'],
  ['move.retireHealthWeight', 0.1, 0, 1, 'probability', 'assumption', 'E2.3.4'],
  ['move.retireWealthWeight', 0.05, 0, 1, 'probability', 'assumption', 'E2.3.4'],
  // E2.3.5 search firms.
  ['firm.backgroundFind', 0.5, 0, 1, 'probability', 'bible', 'E2.3.5'],
  ['firm.tieListBonus', 0.3, 0, 1, 'probability', 'assumption', 'E2.3.5'],
  ['firm.baseListChance', 0.3, 0, 1, 'probability', 'assumption', 'E2.3.5'],
  ['firm.leakShare', 0.5, 0, 1, 'ratio', 'assumption', 'E2.3.5'],
  // E4.7.1 the assistant's view of his head coach's seat.
  ['assistantView.maxRung', 7, 1, 9, 'rung', 'assumption', 'E4.7.1'],
  // S7.1.1 limbo, S7.2.1 scramble.
  ['scramble.quickStepWeeks', 4, 1, 52, 'weeks', 'assumption', 'S7.2.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g80.1',
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
  if (v === undefined) throw new Error(`market: unknown parameter ${name}`);
  return v;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
