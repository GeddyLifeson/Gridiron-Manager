// Tuning constants of player relationships and morale effects (L1, D12.5, D12.6). Two kinds only (game build
// plan section 2): `bible` means the leaf states the number as a starting value; `assumption` means this
// module chose it because the leaf names the rule but gives no number. L1 says "No measured source exists for
// any relationship effect size" and D12.5 marks its sizes "Assumption (design tuning)": none of these is a
// real-world football fact, so no fact row applies. The one real-world rule this module reads (whether a
// level has player contracts) comes in as a rule key (RULE_KEYS).
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const PLAYERS_MODULE = 'career.players';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const ROWS: readonly Row[] = [
  // L1.1.1 relationship record
  ['record.scaleMax', 100, 100, 100, 'index', 'bible', 'L1.1.1'],
  ['record.start.trust', 50, 0, 100, 'index', 'bible', 'L1.1.1'],
  ['record.start.respect', 40, 0, 100, 'index', 'bible', 'L1.1.1'],
  ['record.start.respectFromReputationMax', 30, 0, 50, 'index', 'bible', 'L1.1.1'],
  ['record.start.familiarity', 0, 0, 0, 'index', 'bible', 'L1.1.1'],
  ['record.start.roleBelief', 60, 0, 100, 'index', 'bible', 'L1.1.1'],
  ['record.familiarity.perSharedWeek', 1, 0, 5, 'index/week', 'bible', 'L1.1.1'],
  ['record.familiarity.perTalkMin', 3, 0, 10, 'index', 'bible', 'L1.1.1'],
  ['record.familiarity.perTalkMax', 6, 0, 10, 'index', 'bible', 'L1.1.1'],
  ['record.familiarity.decayPerSeasonApart', 10, 0, 50, 'index/season', 'bible', 'L1.1.1'],
  ['record.personality.min', 0.5, 0.5, 0.5, 'ratio', 'bible', 'L1.1.1'],
  ['record.personality.max', 1.5, 1.5, 1.5, 'ratio', 'bible', 'L1.1.1'],
  ['record.shield.factor', 0.3, 0, 1, 'ratio', 'bible', 'L1.1.1'],
  // L1.1.1 display read: blurred by familiarity, never a number
  ['read.bands', 5, 5, 5, 'count', 'bible', 'L1.1.1'],
  ['read.cannotTellBelow', 30, 0, 100, 'index', 'bible', 'L1.1.1'],
  ['read.noiseBandsAtFifty', 1, 0, 2, 'band', 'bible', 'L1.1.1'],
  ['read.rangeCannotTellBelow', 15, 0, 30, 'index', 'assumption', 'L1.1.1 (under 30 is "a range of bands or cannot tell yet"; split point chosen here)'],
  // L1.1.2 memory ledger
  ['ledger.cap', 40, 40, 40, 'count', 'bible', 'L1.1.2'],
  ['ledger.halfLife.routine', 4, 1, 52, 'week', 'bible', 'L1.1.2'],
  ['ledger.halfLife.playingTime', 12, 1, 104, 'week', 'bible', 'L1.1.2'],
  ['ledger.halfLife.promise', 52, 1, 260, 'week', 'bible', 'L1.1.2'],
  ['ledger.halfLife.personal', 104, 1, 520, 'week', 'bible', 'L1.1.2'],
  ['ledger.halfLife.cutDay', 260, 1, 1040, 'week', 'bible', 'L1.1.2'],
  ['ledger.witness.share', 0.5, 0, 1, 'ratio', 'bible', 'L1.1.2'],
  ['ledger.witness.tieMin', 60, 0, 100, 'index', 'bible', 'L1.1.2'],
  ['ledger.cardRecent', 5, 1, 10, 'count', 'bible', 'L1.1.1'],
  // L1.1.5 touchstones (the permanent layer itself is X6; this is the L1 threshold that marks one)
  ['ledger.touchstone.min', 60, 60, 60, 'index', 'bible', 'L1.1.5'],
  ['ledger.touchstone.floorShare', 0.25, 0.25, 0.25, 'ratio', 'bible', 'L1.1.5'],
  // L1.1.3 knowing the player
  ['know.reveal.correction', 20, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.reveal.motivation', 35, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.reveal.influences', 50, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.reveal.injuryHonesty', 60, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.reveal.offFieldRisk', 70, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.noise.atZero', 30, 5, 50, 'index', 'assumption', 'L1.1.3 (noise "shrinks with familiarity"; width at 0 chosen here)'],
  ['know.noise.atFull', 4, 0, 4.99, 'index', 'assumption', 'L1.1.3 (acceptance: under 5 at familiarity 100)'],
  ['know.recruitedStartMin', 25, 0, 100, 'index', 'bible', 'L1.1.3'],
  ['know.recruitedStartMax', 40, 0, 100, 'index', 'bible', 'L1.1.3'],
  // L1.2.1 conversation system
  ['talk.trustWeight', 0.2, 0, 1, 'ratio', 'bible', 'L1.2.1'],
  ['talk.reasonTrue', 8, 0, 20, 'score', 'bible', 'L1.2.1'],
  ['talk.reasonFalse', -12, -30, 0, 'score', 'bible', 'L1.2.1'],
  ['talk.timing', 5, 0, 20, 'score', 'bible', 'L1.2.1'],
  ['talk.goodAbove', 15, 0, 50, 'score', 'bible', 'L1.2.1'],
  ['talk.badBelow', -15, -50, 0, 'score', 'bible', 'L1.2.1'],
  ['talk.minutesMin', 15, 0, 60, 'minute', 'bible', 'L1.2.1'],
  ['talk.minutesMax', 30, 0, 60, 'minute', 'bible', 'L1.2.1'],
  ['talk.delegatedMajorMemory', -6, -20, 0, 'strength', 'bible', 'L1.2.1'],
  ['talk.phoneShare', 0.7, 0, 1, 'ratio', 'bible', 'L1.2.1'],
  ['talk.declineTrustBelow', 15, 0, 50, 'index', 'bible', 'L1.2.1'],
  ['talk.fitSpan', 10, 0, 30, 'score', 'assumption', 'L1.2.1 (fit term named, size not given)'],
  ['talk.memoryScale', 1, 0.1, 3, 'ratio', 'assumption', 'L1.2.1 (score bands map to memory strength; score passed through at this scale, clamped to the band)'],
  // L1.2.2 role talk
  ['role.equal', 5, 0, 20, 'index', 'bible', 'L1.2.2'],
  ['role.oneBelow', -5, -20, 0, 'index', 'bible', 'L1.2.2'],
  ['role.twoBelow', -15, -40, 0, 'index', 'bible', 'L1.2.2'],
  ['role.flagGapSteps', 2, 1, 5, 'step', 'bible', 'L1.2.2'],
  ['role.starterCheckSnapShare', 0.3, 0, 1, 'ratio', 'bible', 'L1.2.2'],
  ['role.starterCheckGames', 2, 1, 5, 'game', 'bible', 'L1.2.2'],
  // L1.2.3 playing time
  ['pt.pathHonoured', 20, 0, 40, 'strength', 'bible', 'L1.2.3'],
  ['pt.toldBefore', 5, 0, 20, 'strength', 'bible', 'L1.1.2'],
  ['pt.foundOutDepthChart', -10, -30, 0, 'strength', 'bible', 'L1.1.2'],
  ['pt.foundOutSidelineScale', 1.5, 1, 3, 'ratio', 'assumption', 'L1.2.3 ("a larger found out on the sideline strength"; multiple chosen here)'],
  // L1.2.4 correction and praise
  ['praise.windowWeeks', 4, 1, 12, 'week', 'bible', 'L1.2.4'],
  ['praise.repeatShare', 0.5, 0, 1, 'ratio', 'bible', 'L1.2.4'],
  ['praise.neglectRespectPerWeek', 1, 0, 5, 'index/week', 'bible', 'L1.2.4'],
  ['praise.suggestMin', 3, 0, 6, 'count', 'bible', 'L1.2.4'],
  ['praise.suggestMax', 6, 1, 6, 'count', 'bible', 'L1.2.4'],
  ['praise.neglectCoachabilityMin', 60, 0, 100, 'index', 'assumption', 'L1.2.4 ("high-coachability players want coaching"; cut-off chosen here)'],
  // L1.2.5 personal matters
  ['personal.kindness', 25, 0, 50, 'strength', 'bible', 'L1.2.5'],
  ['personal.unansweredStop', 2, 1, 5, 'count', 'bible', 'L1.2.5'],
  // L1.3.1 promises
  ['promise.kept', 15, 0, 40, 'strength', 'bible', 'L1.3.1'],
  ['promise.broken', -30, -60, 0, 'strength', 'bible', 'L1.3.1'],
  ['promise.witnessShare', 0.5, 0, 1, 'ratio', 'bible', 'L1.3.1'],
  ['promise.roomWarnOver', 5, 1, 20, 'count', 'bible', 'L1.3.1'],
  ['promise.competePractices', 2, 1, 5, 'count', 'bible', 'L1.3.1'],
  ['promise.positionShare', 0.5, 0, 1, 'ratio', 'bible', 'L1.3.1'],
  ['promise.leftRecruited', -5, -20, 0, 'strength', 'assumption', 'L1.3.1 edge case ("a small negative memory for players he recruited"; size chosen here)'],
  ['promise.leftRecruitedTransferScale', 2, 1, 4, 'ratio', 'assumption', 'L1.3.1 edge case ("larger in college"; multiple chosen here, read by rule key not level)'],
  // L1.3.2 honesty
  ['word.start', 60, 0, 100, 'index', 'bible', 'L1.3.2'],
  ['word.caughtFalsehood', -6, -20, 0, 'index', 'bible', 'L1.3.2'],
  ['word.kept', 1, 0, 5, 'index', 'bible', 'L1.3.2'],
  ['word.broken', -3, -10, 0, 'index', 'bible', 'L1.3.2'],
  ['word.publicContradicted', -4, -10, 0, 'index', 'bible', 'L1.3.2'],
  ['word.publicWindowDays', 14, 1, 30, 'day', 'bible', 'L1.3.2'],
  ['word.multBase', 0.5, 0.5, 0.5, 'ratio', 'bible', 'L1.3.2'],
  ['word.liedFoundOut', -40, -60, 0, 'strength', 'bible', 'L1.1.2'],
  // L1.4.1 the quarterback
  ['qb.perMeeting', 2, 0, 10, 'index', 'bible', 'L1.4.1'],
  ['qb.perGame', 1, 0, 10, 'index', 'bible', 'L1.4.1'],
  ['qb.changeDrop', 10, 0, 50, 'index', 'bible', 'L1.4.1'],
  ['qb.askedReadiness', 3, 0, 10, 'index', 'bible', 'L1.4.1'],
  ['qb.ignoredWeeks', 3, 1, 10, 'week', 'bible', 'L1.4.1'],
  ['qb.ignoredMemory', -10, -30, 0, 'strength', 'bible', 'L1.4.1'],
  // L1.4.2 injured players
  ['injury.trustWeight', 0.3, 0, 1, 'ratio', 'bible', 'L1.4.2'],
  ['injury.teammatePressured', -15, -30, 0, 'index', 'bible', 'L1.4.2'],
  ['injury.pressuredWindowWeeks', 8, 1, 26, 'week', 'bible', 'L1.4.2'],
  ['injury.contractYear', -10, -30, 0, 'index', 'bible', 'L1.4.2'],
  ['injury.pressureSelf', -20, -40, 0, 'strength', 'bible', 'L1.4.2'],
  ['injury.pressureWitness', -8, -20, 0, 'strength', 'bible', 'L1.4.2'],
  ['injury.askedInPerson', 6, 0, 20, 'strength', 'bible', 'L1.1.2'],
  ['injury.ignoredOnReserve', -10, -30, 0, 'strength', 'bible', 'L1.4.2'],
  // L1.4.3 release
  ['release.headCoachInPerson', 10, 0, 30, 'strength', 'bible', 'L1.4.3'],
  ['release.staffInPerson', 0, -10, 10, 'strength', 'bible', 'L1.4.3'],
  ['release.staffNoWord', -15, -30, 0, 'strength', 'bible', 'L1.4.3'],
  ['release.mediaFirst', -30, -60, 0, 'strength', 'bible', 'L1.4.3'],
  ['release.veteranSeasons', 4, 1, 10, 'season', 'bible', 'L1.4.3'],
  ['release.veteranWeight', 1.5, 1, 3, 'ratio', 'bible', 'L1.4.3'],
  // L1.4.4 incentives
  ['incentive.finalWeeks', 3, 1, 6, 'week', 'bible', 'L1.4.4'],
  ['incentive.reachRate', 1.5, 1, 3, 'ratio', 'bible', 'L1.4.4'],
  ['incentive.reachedHelped', 12, 0, 30, 'strength', 'bible', 'L1.4.4'],
  ['incentive.missedBenched', -15, -30, 0, 'strength', 'bible', 'L1.4.4'],
  ['incentive.helpGames', 2, 1, 4, 'game', 'bible', 'L1.4.4'],
  // L1.5.1 the college player (contribution only; T6 owns the full formula)
  ['transfer.roleBeliefMid', 60, 0, 100, 'index', 'bible', 'L1.5.1'],
  ['transfer.roleBeliefWeight', 0.4, 0, 1, 'ratio', 'bible', 'L1.5.1'],
  ['transfer.trustMid', 50, 0, 100, 'index', 'bible', 'L1.5.1'],
  ['transfer.trustWeight', 0.3, 0, 1, 'ratio', 'bible', 'L1.5.1'],
  ['transfer.perBrokenPromise', 20, 0, 50, 'index', 'bible', 'L1.5.1'],
  ['transfer.brokenWindowWeeks', 52, 1, 104, 'week', 'bible', 'L1.5.1'],
  ['youth.years', 2, 1, 3, 'year', 'bible', 'L1.5.1'],
  ['youth.scale', 1.2, 1, 2, 'ratio', 'bible', 'L1.5.1'],
  // L1.6.1 bounded effects
  ['buyIn.trust', 0.5, 0.5, 0.5, 'ratio', 'bible', 'L1.6.1'],
  ['buyIn.respect', 0.3, 0.3, 0.3, 'ratio', 'bible', 'L1.6.1'],
  ['buyIn.roleBelief', 0.2, 0.2, 0.2, 'ratio', 'bible', 'L1.6.1'],
  ['effect.attention.at0', 0.9, 0.9, 1, 'ratio', 'bible', 'L1.6.1'],
  ['effect.attention.at100', 1.05, 1, 1.05, 'ratio', 'bible', 'L1.6.1'],
  ['effect.effort.at0', 0.92, 0.92, 1, 'ratio', 'bible', 'L1.6.1'],
  ['effect.effort.at100', 1.04, 1, 1.04, 'ratio', 'bible', 'L1.6.1'],
  ['effect.report.at0', -15, -15, 0, 'index', 'bible', 'L1.6.1'],
  ['effect.report.at100', 10, 0, 10, 'index', 'bible', 'L1.6.1'],
  ['effect.reducedRole.at0', 1.5, 1, 1.5, 'ratio', 'bible', 'L1.6.1'],
  ['effect.reducedRole.at100', 0.6, 0.6, 1, 'ratio', 'bible', 'L1.6.1'],
  ['effect.earlyWord.at0', 0.5, 0.5, 1, 'ratio', 'bible', 'L1.6.1'],
  ['effect.earlyWord.at100', 1.5, 1, 1.5, 'ratio', 'bible', 'L1.6.1'],
  ['effect.leak.at0', 1.5, 1, 1.5, 'ratio', 'bible', 'L1.6.1'],
  ['effect.leak.at100', 0.7, 0.7, 1, 'ratio', 'bible', 'L1.6.1'],
  // D12.5.1 effects on football
  ['morale.dev.lowBelow', -40, -100, 0, 'index', 'bible', 'D12.5.1'],
  ['morale.dev.low', 0.9, 0.9, 1, 'ratio', 'bible', 'D12.5.1'],
  ['morale.dev.highAbove', 40, 0, 100, 'index', 'bible', 'D12.5.1'],
  ['morale.dev.high', 1.03, 1, 1.03, 'ratio', 'bible', 'D12.5.1'],
  ['morale.effort.below', -60, -100, 0, 'index', 'bible', 'D12.5.1'],
  ['morale.effort.drop', 0.05, 0, 0.05, 'ratio', 'bible', 'D12.5.1'],
  ['morale.confidence.games', 3, 1, 10, 'game', 'bible', 'D12.5.1'],
  ['morale.confidence.penalty', 0.02, 0, 0.02, 'ratio', 'bible', 'D12.5.1'],
  // D12.5.2 threshold ladder
  ['ladder.meeting.below', -30, -100, 0, 'index', 'bible', 'D12.5.2'],
  ['ladder.meeting.weeks', 3, 1, 10, 'week', 'bible', 'D12.5.2'],
  ['ladder.private.below', -50, -100, 0, 'index', 'bible', 'D12.5.2'],
  ['ladder.private.weeks', 4, 1, 10, 'week', 'bible', 'D12.5.2'],
  ['ladder.public.below', -65, -100, 0, 'index', 'bible', 'D12.5.2'],
  ['ladder.public.weeks', 4, 1, 10, 'week', 'bible', 'D12.5.2'],
  ['ladder.exit.below', -75, -100, 0, 'index', 'bible', 'D12.5.2'],
  // D12.6.1 real people
  ['real.egoFixed', 50, 50, 50, 'index', 'bible', 'D12.6.1'],
];

export const PARAMS: ParamFile = {
  module: PLAYERS_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name, value, min, max, unit, belongsTo: PLAYERS_MODULE, basis, leaf, constrainedBy: 'career players tests', status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** A tuning value by name; throws on a name the table does not hold. */
export function pp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${PLAYERS_MODULE}: unknown parameter ${name}`);
  return v;
}

/** Rule keys this module reads. G-10 owns the values; until a value exists the caller passes the switch. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'league_rules.player_contracts', type: 'boolean', meaning: 'Players hold individual contracts with incentive terms (switches L1.4.4 on)', ownerLeaf: 'L1.4.4', readBy: ['career/players'] },
];
