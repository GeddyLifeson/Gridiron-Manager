// Tuning constants of game day below head coach (S5, O7.4). Two kinds only (game build plan section 2):
// `bible` means the leaf states the number as a starting value (S5 marks them tuning knobs, Assumption);
// `assumption` means this module chose it because the leaf names the rule but gives no number. None is a
// real-world fact. Real rules (the college headset cap, helmet radio, the late-half clock reset) are rule keys
// (RULE_KEYS below) and reach this module as values the caller reads from the rule set.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const SEATS_MODULE = 'career.seats';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const ROWS: readonly Row[] = [
  // S5.1.1 seats without a headset, and headset failure
  ['comm.runnerDelayS', 8, 2, 30, 'second', 'assumption', 'S5.1.1 (hand signal and runner named, delay chosen here)'],
  ['comm.phoneDelayS', 5, 1, 30, 'second', 'assumption', 'S5.1.1 (phone or runner after a headset failure, delay chosen here)'],
  // S5.2.1 substitution and signals
  ['sub.windowS', 5, 2, 15, 'second', 'bible', 'S5.2.1 ("about five seconds")'],
  ['sub.aiErrorBase', 0.01, 0, 0.2, 'probability', 'assumption', 'S5.2.1 ("small error rate")'],
  ['sub.aiErrorTempo', 0.03, 0, 0.2, 'probability', 'assumption', 'S5.2.1 (rises with tempo)'],
  ['sub.aiErrorLateCall', 0.04, 0, 0.2, 'probability', 'assumption', 'S5.2.1 (rises with late personnel calls)'],
  ['sub.timeoutCatch', 0.5, 0, 1, 'probability', 'assumption', 'S5.2.1 (an error gives a foul or a burned timeout; split chosen here)'],
  // S5.2.2 position coach between series
  ['corr.maxPerSeries', 2, 1, 5, 'count', 'bible', 'S5.2.2 ("up to two corrections")'],
  ['corr.baseCut', 0.4, 0, 1, 'ratio', 'assumption', 'S5.2.2 rule 2 (a right correction lowers the repeat chance; size chosen here)'],
  ['corr.composureFloor', 0.4, 0, 1, 'ratio', 'assumption', 'S5.2.2 rule 2 (scaled by composure; share kept at zero composure)'],
  ['corr.styleMatch', 1, 0, 1, 'ratio', 'assumption', 'S5.2.2 rule 2 (way of giving fits the learning style)'],
  ['corr.styleMiss', 0.5, 0, 1, 'ratio', 'assumption', 'S5.2.2 rule 2 (way of giving does not fit the learning style)'],
  ['corr.crowding', 0.5, 0, 2, 'ratio', 'assumption', 'S5.2.2 rule 4 (too many at once lower the effect of each)'],
  ['corr.hesitantChance', 0.3, 0, 1, 'probability', 'assumption', 'S5.2.2 rule 3 (a wrong correction may make the player hesitant)'],
  ['corr.hesitantAdd', 0.05, 0, 0.5, 'probability', 'assumption', 'S5.2.2 rule 3 (added failure chance when hesitant)'],
  // S5.3.1 booth eyes
  ['booth.answerWindowS', 5, 2, 15, 'second', 'bible', 'S5.3.1 ("about five seconds after the play")'],
  ['booth.tempoWindowS', 3, 1, 10, 'second', 'bible', 'S5.3.1 ("under three seconds" against tempo)'],
  ['booth.aiFamilyAtZero', 0.55, 0, 1, 'probability', 'assumption', 'S5.3.1 AI use (K2 recognition at its lowest)'],
  ['booth.aiFamilyAtFull', 0.97, 0, 1, 'probability', 'assumption', 'S5.3.1 AI use (K2 recognition at its highest)'],
  ['booth.aiVariantAtZero', 0.35, 0, 1, 'probability', 'assumption', 'S5.3.1 AI use (variant right, given family right, lowest)'],
  ['booth.aiVariantAtFull', 0.9, 0, 1, 'probability', 'assumption', 'S5.3.1 AI use (variant right, given family right, highest)'],
  ['booth.aiDelayAtZeroS', 4.5, 0.5, 10, 'second', 'assumption', 'S5.3.1 AI use (answer delay at the lowest recognition)'],
  ['booth.aiDelayAtFullS', 1.5, 0.2, 10, 'second', 'assumption', 'S5.3.1 AI use (answer delay at the highest recognition)'],
  ['booth.priorReports', 4, 0, 20, 'count', 'assumption', 'S5.3.1 (running accuracy in this game; prior weight chosen here)'],
  ['booth.priorAccuracy', 0.7, 0, 1, 'ratio', 'assumption', 'S5.3.1 (running accuracy before any report is graded)'],
  ['booth.sidelineFamily', 0.6, 0, 1, 'probability', 'assumption', 'S5.3.1 (the caller\'s own sideline view is worse for coverage)'],
  ['booth.sidelineVariant', 0.4, 0, 1, 'probability', 'assumption', 'S5.3.1 (the caller\'s own sideline view, variant given family)'],
  // S5.3.2 charting
  ['flag.minSnaps', 5, 1, 20, 'snap', 'bible', 'S5.3.2 depth pass'],
  ['flag.sd', 2, 1, 4, 'sd', 'bible', 'S5.3.2 depth pass'],
  // S5.3.3 game-management advice
  ['advice.playClockMinusS', 8, 0, 20, 'second', 'bible', 'S5.3.3 depth pass'],
  ['advice.minTimerS', 6, 1, 20, 'second', 'bible', 'S5.3.3 depth pass'],
  ['advice.clockLeadS', 20, 5, 60, 'second', 'bible', 'S5.3.3 depth pass'],
  ['advice.challengeMinusS', 5, 0, 20, 'second', 'bible', 'S5.3.3 depth pass'],
  ['advice.followBase', 0.3, 0, 1, 'probability', 'bible', 'S5.3.3 depth pass'],
  ['advice.followAnalytics', 0.4, 0, 1, 'probability', 'bible', 'S5.3.3 depth pass'],
  ['advice.followUser', 0.3, 0, 1, 'probability', 'bible', 'S5.3.3 depth pass'],
  // S5.4.1 coordinator calling for someone else
  ['coord.baseInterventions', 2, 0, 10, 'count', 'bible', 'S5.4.1 depth pass'],
  ['coord.handsOnScale', 4, 0, 10, 'count', 'bible', 'S5.4.1 depth pass'],
  ['coord.trailingAdd', 1, 0, 5, 'count', 'bible', 'S5.4.1 depth pass'],
  ['coord.oneScorePoints', 8, 3, 8, 'point', 'assumption', 'S5.4.1 ("more than one score": a touchdown and a two-point try)'],
  ['coord.shareInstruction', 0.5, 0, 1, 'ratio', 'bible', 'S5.4.1 depth pass'],
  ['coord.shareVeto', 0.2, 0, 1, 'ratio', 'bible', 'S5.4.1 depth pass'],
  ['coord.shareDecision', 0.3, 0, 1, 'ratio', 'bible', 'S5.4.1 depth pass'],
  ['coord.ignoreCost', 2, 0, 20, 'trust', 'bible', 'S5.4.1 depth pass'],
  ['coord.ignoreCostFailed', 5, 0, 20, 'trust', 'bible', 'S5.4.1 depth pass'],
  ['coord.egoScaleLow', 0.5, 0, 1, 'ratio', 'assumption', 'S5.4.1 ("its cost depends on ... ego"; scale at ego 0)'],
  ['coord.egoScaleHigh', 1.5, 1, 3, 'ratio', 'assumption', 'S5.4.1 ("its cost depends on ... ego"; scale at ego 1)'],
  ['coord.takeCallingIgnored', 3, 1, 10, 'count', 'assumption', 'S5.4.1 edge case (the head coach takes play calling away; ignored instructions in one game)'],
  // S5.5.1 role log
  ['log.familyMinEvents', 10, 1, 50, 'count', 'bible', 'S5.5.1 depth pass'],
  ['log.seasonMinGames', 3, 1, 10, 'count', 'bible', 'S5.5.1 depth pass'],
  // O7.4.1 view by seat
  ['view.sidelineZoomMin', 0.5, 0.1, 1, 'ratio', 'assumption', 'O7.4.1 (sideline gets a lower zoom limit; value chosen here)'],
];

export const PARAMS: ParamFile = {
  module: SEATS_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name, value, min, max, unit, belongsTo: SEATS_MODULE, basis, leaf, constrainedBy: 'career seats tests', status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** A tuning value by name; throws on a name the table does not hold. */
export function sp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${SEATS_MODULE}: unknown parameter ${name}`);
  return v;
}

/**
 * Rule keys this module reads. The caller reads each from the rule set and passes the value in (`SeatRules`).
 * Keys marked "requested" are not in the dictionary yet (sent to the integrator as CR-G79-2).
 */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'comm.c2p_allowed', type: 'boolean', meaning: 'Coach-to-player helmet radio is allowed (without it the call goes in by signal)', ownerLeaf: 'S5.2.1', readBy: ['career/seats'] },
  { key: 'comm.headsets_max', type: 'number', meaning: 'Requested. Most staff headsets a team may use in a game (absent: no cap)', ownerLeaf: 'S5.1.1', readBy: ['career/seats'] },
  { key: 'comm.headset_failure_both_off', type: 'boolean', meaning: 'Requested. When one side\'s coach-to-coach headsets fail, both sides\' go off', ownerLeaf: 'S5.1.1', readBy: ['career/seats'] },
  { key: 'sub.late_half_twelve_clock_reset', type: 'boolean', meaning: 'Requested. After the two-minute timeout, a defense with 12 that plays the down also gives a clock reset', ownerLeaf: 'S5.2.1', readBy: ['career/seats'] },
];

/** Rule values read by key by the caller. Absent optional values mean the rule does not exist at that level. */
export interface SeatRules {
  readonly c2pAllowed: boolean;
  readonly headsetsMax?: number;
  readonly headsetFailureBothOff?: boolean;
  readonly lateHalfTwelveClockReset?: boolean;
}
