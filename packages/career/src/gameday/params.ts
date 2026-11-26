// Tuning constants of the game-day frame: before kickoff (I1), halftime (I8.2, with the I8.1.2 menu and I8.1.4
// uptake it reuses, and the I8.3.1 record), and after the game (I10). Two kinds only (game build plan section 2):
// `bible` means the leaf states the number as a starting value; `assumption` means this module chose it
// because the leaf names the rule but gives no number. Every number here is a design value: the leaves mark
// them "starting value" or "Assumption (design tuning)". Real-world football rules (the active limit, the
// report deadline, the captains limit, the halftime length, the nine-play review cap) are rule keys
// (RULE_KEYS below) and reach this module as values the caller reads from the rule set.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const GAMEDAY_MODULE = 'career.gameday';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const ROWS: readonly Row[] = [
  // I1.1.1 pregame clock and task list
  ['pregame.windowMin', 180, 120, 240, 'minute', 'bible', 'I1.1.1'],
  ['pregame.attentionBudgetMin', 100, 30, 180, 'minute', 'bible', 'I1.1.1'],
  ['pregame.arrivalMin', 150, 120, 180, 'minute', 'bible', 'I1.1.1'],
  ['pregame.ballsToRefereeMin', 135, 120, 150, 'minute', 'bible', 'I1.1.1'],
  ['pregame.workoutsFromMin', 120, 95, 150, 'minute', 'bible', 'I1.1.1'],
  ['pregame.workoutsUntilMin', 95, 90, 120, 'minute', 'bible', 'I1.1.1'],
  ['pregame.specialistsOutMin', 75, 60, 100, 'minute', 'bible', 'I1.1.1'],
  ['pregame.kickingLinesAfterMin', 60, 45, 75, 'minute', 'bible', 'I1.1.1'],
  ['pregame.warmupFromMin', 60, 45, 75, 'minute', 'bible', 'I1.1.1'],
  ['pregame.opponentReportMin', 45, 25, 60, 'minute', 'bible', 'I1.3.3'],
  ['pregame.lockerRoomMin', 25, 20, 30, 'minute', 'bible', 'I1.1.1'],
  ['pregame.sheetEditsCloseMin', 20, 15, 25, 'minute', 'bible', 'I1.4.1'],
  ['pregame.talkMin', 20, 15, 25, 'minute', 'bible', 'I1.6.1'],
  ['pregame.anthemMin', 5, 3, 10, 'minute', 'bible', 'I1.1.1'],
  // I1.1.1 task costs (minutes of the attention budget)
  ['cost.workout', 10, 1, 30, 'minute', 'bible', 'I1.2.1'],
  ['cost.inactivesByHand', 10, 1, 30, 'minute', 'bible', 'I1.2.2'],
  ['cost.inactivesReview', 2, 0, 10, 'minute', 'bible', 'I1.2.2'],
  ['cost.depthCard', 5, 0, 15, 'minute', 'bible', 'I1.2.5'],
  ['cost.kickingLines', 3, 0, 10, 'minute', 'bible', 'I1.3.2'],
  ['cost.sheetEdit', 1, 0, 5, 'minute', 'bible', 'I1.4.1'],
  ['cost.sheetVariant', 5, 0, 15, 'minute', 'bible', 'I1.4.1'],
  ['cost.wristbandReprint', 5, 0, 15, 'minute', 'bible', 'I1.4.1'],
  ['cost.decisionBookEdit', 8, 0, 20, 'minute', 'bible', 'I1.4.2'],
  ['cost.decisionBookAccept', 2, 0, 10, 'minute', 'bible', 'I1.4.2'],
  ['cost.standingInstructions', 3, 0, 10, 'minute', 'bible', 'I1.4.3'],
  ['cost.crewAlert', 2, 0, 10, 'minute', 'bible', 'I1.4.4'],
  ['cost.challengeDesignee', 1, 0, 5, 'minute', 'bible', 'I1.4.5'],
  ['cost.talk', 3, 0, 10, 'minute', 'bible', 'I1.6.1'],
  ['cost.captains', 1, 0, 5, 'minute', 'assumption', 'I1.5.1 (task named, no cost given)'],
  ['cost.toss', 1, 0, 5, 'minute', 'assumption', 'I1.5.2 (task named, no cost given)'],
  ['cost.radio', 1, 0, 5, 'minute', 'assumption', 'I1.2.4 (task named, no cost given)'],
  ['cost.emergencyQb', 1, 0, 5, 'minute', 'assumption', 'I1.2.3 (task named, no cost given)'],
  ['cost.conditions', 2, 0, 10, 'minute', 'assumption', 'I1.3.1 (report read, no cost given)'],
  ['cost.opponentWatch', 2, 0, 10, 'minute', 'assumption', 'I1.3.3 (watch named, no cost given)'],
  // I1.1.2 carry-over
  ['carry.bottomRankedPlayZ', 0.1, 0, 0.5, 'z', 'bible', 'I1.1.2'],
  // I1.2.1 workout
  ['workout.noiseAtZero', 0.3, 0, 1, 'readiness', 'assumption', 'I1.2.1 (noise shrinks with staff quality; width at the worst staff chosen here)'],
  ['workout.noiseAtFull', 0.03, 0, 0.3, 'readiness', 'assumption', 'I1.2.1 (width at the best staff chosen here)'],
  ['workout.fullFrom', 0.85, 0.5, 1, 'readiness', 'assumption', 'I1.2.1 (three verdicts named, cut points chosen here)'],
  ['workout.limitedFrom', 0.5, 0, 0.85, 'readiness', 'assumption', 'I1.2.1 (three verdicts named, cut points chosen here)'],
  ['workout.snapCeilingPerReadiness', 80, 0, 100, 'snap', 'assumption', 'I1.2.1 (limited sets a snap ceiling; scale chosen here)'],
  ['workout.aggravationChance', 0.02, 0, 0.2, 'probability', 'assumption', 'I1.2.1 ("a small aggravation risk")'],
  // I1.2.2 thin-spot minimums
  ['thin.quarterbacks', 2, 1, 3, 'count', 'bible', 'I1.2.2'],
  ['thin.offensiveLinemen', 7, 5, 9, 'count', 'bible', 'I1.2.2'],
  ['thin.otherGroup', 3, 1, 5, 'count', 'bible', 'I1.2.2'],
  ['thin.specialistBackups', 1, 0, 2, 'count', 'bible', 'I1.2.2'],
  // I1.3.1 forecast error
  ['forecast.windSeAt1h', 3, 0, 10, 'mph', 'bible', 'I1.3.1'],
  ['forecast.windSeAt3h', 6, 0, 15, 'mph', 'bible', 'I1.3.1'],
  // I1.3.2 kicking lines
  ['kick.comfortableMake', 0.75, 0.5, 0.95, 'probability', 'bible', 'I1.3.2'],
  ['kick.maximumMake', 0.4, 0.1, 0.6, 'probability', 'bible', 'I1.3.2'],
  ['kick.snapAndHoldYd', 7, 7, 8, 'yard', 'bible', 'I1.3.2 (7 or 8 for the snap; end zone depth is the rule key field.end_zone_depth_ft)'],
  ['kick.reportErrorAtZero', 4, 0, 10, 'yard', 'assumption', 'I1.3.2 ("can be off by several yards"; spread at the worst coordinator chosen here)'],
  ['kick.reportErrorAtFull', 0.4, 0, 1, 'yard', 'assumption', 'I1.3.2 (acceptance: within 1 yard with a perfect coordinator)'],
  ['kick.directionWindMph', 10, 0, 30, 'mph', 'bible', 'I1.3.2'],
  // I1.3.3 opponent warm-up watch
  ['watch.noticeAtZero', 0.3, 0, 1, 'probability', 'bible', 'I1.3.3'],
  ['watch.noticeAtFull', 0.7, 0, 1, 'probability', 'bible', 'I1.3.3'],
  ['watch.falseNote', 0.05, 0, 0.5, 'probability', 'bible', 'I1.3.3'],
  // I1.4.2 decision book
  ['book.closePp', 1, 0, 5, 'percentage point', 'bible', 'I1.4.2'],
  ['book.varianceShiftPp', 1, 0, 5, 'percentage point', 'assumption', 'I1.4.2 (the slider shifts close cells toward go; full-slider shift chosen here)'],
  // I1.4.3 standing instructions
  ['instructions.max', 12, 1, 20, 'count', 'bible', 'I1.4.3'],
  ['instructions.free', 8, 1, 20, 'count', 'bible', 'I1.4.3'],
  ['instructions.missPerExtra', 0.02, 0, 0.2, 'probability', 'bible', 'I1.4.3'],
  // I1.4.4 crew alert
  ['crew.alertFactor', 0.5, 0, 1, 'ratio', 'bible', 'I1.4.4'],
  // I1.5.1 captains (L1 strengths)
  ['captain.namedStrength', 4, 0, 20, 'strength', 'assumption', 'I1.5.1 ("a small morale gain")'],
  ['captain.specialStrength', 8, 0, 20, 'strength', 'assumption', 'I1.5.1 (larger facing a former team or returning from injury)'],
  ['captain.passedOverStrength', -3, -20, 0, 'strength', 'assumption', 'I1.5.1 ("costs that player a little trust")'],
  // I1.5.2 toss
  ['toss.adviceWindMph', 15, 0, 40, 'mph', 'bible', 'I1.5.2'],
  ['toss.calmWindMph', 10, 0, 30, 'mph', 'bible', 'I1.5.2'],
  // I1.6.1 pregame talk
  ['pretalk.boundZ', 0.1, 0, 0.3, 'z', 'bible', 'I1.6.1'],
  ['pretalk.decayGameMin', 15, 1, 60, 'minute', 'bible', 'I1.6.1 (to zero by the end of the first quarter)'],
  ['pretalk.repeatFactor', 0.7, 0, 1, 'ratio', 'assumption', 'I1.6.1 (repeating a theme reduces it; I10.2.1 factor reused)'],
  ['pretalk.keyReadinessZ', 0.02, 0, 0.1, 'z', 'assumption', 'I1.6.1 ("slightly")'],
  ['pretalk.contradictTrust', -2, -10, 0, 'strength', 'assumption', 'I1.6.1 (keys that contradict the week lower trust)'],
  // I8.2.1 halftime clock
  ['half.walkOffMin', 1.5, 0, 5, 'minute', 'bible', 'I8.2.1'],
  ['half.returnMin', 2.5, 0, 5, 'minute', 'bible', 'I8.2.1'],
  ['half.personalMin', 2, 0, 5, 'minute', 'bible', 'I8.2.1'],
  // I8.2.2 phases
  ['half.staffPhaseMin', 3, 0, 10, 'minute', 'bible', 'I8.2.2'],
  ['half.structuralPerUnit', 3, 1, 5, 'count', 'bible', 'I8.2.2'],
  ['half.newCallsPerUnit', 1, 0, 3, 'count', 'bible', 'I8.2.2'],
  ['half.sendBackMin', 1, 0, 3, 'minute', 'bible', 'I8.2.2'],
  ['half.teamTalkMin', 1, 0, 3, 'minute', 'bible', 'I8.2.2'],
  ['half.openersMin', 1, 0, 3, 'minute', 'bible', 'I8.2.3'],
  ['half.openersFewest', 3, 1, 6, 'count', 'bible', 'I8.2.3'],
  ['half.openersMost', 6, 3, 20, 'count', 'bible', 'I8.2.3'],
  ['half.quickItemMin', 25 / 60, 20 / 60, 30 / 60, 'minute', 'bible', 'I8.2.4 (20 to 30 s; middle taken)'],
  // I8.1.2 menu (minutes), reused at halftime
  ['menu.technique', 0.5, 0, 3, 'minute', 'bible', 'I8.1.2'],
  ['menu.protection', 1, 0, 3, 'minute', 'bible', 'I8.1.2'],
  ['menu.matchup', 1, 0, 3, 'minute', 'bible', 'I8.1.2'],
  ['menu.coverage', 1.5, 0, 3, 'minute', 'bible', 'I8.1.2'],
  ['menu.sheetMark', 20 / 60, 0, 1, 'minute', 'bible', 'I8.1.2'],
  ['menu.alert', 0.5, 0, 3, 'minute', 'bible', 'I8.1.2'],
  ['menu.newCall', 2, 0, 5, 'minute', 'bible', 'I8.1.2'],
  ['menu.structuralPerSeries', 2, 1, 5, 'count', 'bible', 'I8.1.2'],
  // I8.1.4 uptake (D9 knowledge scale, z)
  ['uptake.repoint', -0.5, -2, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.teacherSpan', 0.3, 0, 1, 'z', 'bible', 'I8.1.4'],
  ['uptake.userFit', 0.2, 0, 1, 'z', 'bible', 'I8.1.4'],
  ['uptake.userMisfit', -0.1, -1, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.trueCause', 0.1, 0, 1, 'z', 'bible', 'I8.1.4'],
  ['uptake.pictures', 0.2, 0, 1, 'z', 'bible', 'I8.1.4'],
  ['uptake.extraStructural', -0.25, -1, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.cutAfter', -0.1, -1, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.perSeries', 0.1, 0, 1, 'z', 'bible', 'I8.1.4'],
  ['uptake.crowdNoise', -0.1, -1, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.solidWithin', -0.2, -1, 0, 'z', 'bible', 'I8.1.4'],
  ['uptake.shakyWithin', -0.6, -2, 0, 'z', 'bible', 'I8.1.4'],
  // I8.3.1 adjustment record
  ['adjust.executedCut', 0.8, 0, 1, 'ratio', 'bible', 'I8.3.1'],
  ['adjust.minPlaysForRates', 5, 1, 20, 'play', 'bible', 'I8.3.1'],
  // I10.1.1 handshake
  ['shake.warmTie', 0.02, 0, 0.1, 'tie', 'bible', 'I10.1.1'],
  ['shake.coldTie', -0.03, -0.1, 0, 'tie', 'bible', 'I10.1.1'],
  ['shake.noticeProvoked', 0.2, 0, 1, 'probability', 'bible', 'I10.1.1'],
  ['shake.noticeCalm', 0.03, 0, 1, 'probability', 'bible', 'I10.1.1'],
  ['shake.noticeBothCold', 0.35, 0, 1, 'probability', 'bible', 'I10.1.1'],
  ['shake.noticeSkipped', 0.6, 0, 1, 'probability', 'bible', 'I10.1.1'],
  ['shake.runUpLead', 21, 7, 35, 'point', 'bible', 'I10.1.1'],
  ['shake.runUpLastMin', 5, 1, 15, 'minute', 'bible', 'I10.1.1'],
  // I10.2.1 postgame talk
  ['posttalk.capZ', 0.1, 0, 0.3, 'z', 'bible', 'I10.2.1'],
  ['posttalk.fitGood', 1, 0, 1, 'ratio', 'bible', 'I10.2.1'],
  ['posttalk.fitNeutral', 0.5, 0, 1, 'ratio', 'bible', 'I10.2.1'],
  ['posttalk.fitPoor', -0.5, -1, 0, 'ratio', 'bible', 'I10.2.1'],
  ['posttalk.repeatFactor', 0.7, 0, 1, 'ratio', 'bible', 'I10.2.1'],
  ['posttalk.calloutTie', -0.05, -0.2, 0, 'tie', 'bible', 'I10.2.1'],
  ['posttalk.calloutVeteranTie', -0.1, -0.3, 0, 'tie', 'bible', 'I10.2.1'],
  ['posttalk.calloutVeteranSeasons', 6, 1, 15, 'season', 'bible', 'I10.2.1'],
  ['posttalk.calloutEffortZ', 0.05, 0, 0.2, 'z', 'bible', 'I10.2.1'],
  ['posttalk.captainWordWin', 0.3, 0, 1, 'probability', 'bible', 'I10.2.1'],
  ['posttalk.captainWordLoss', 0.15, 0, 1, 'probability', 'bible', 'I10.2.1'],
  ['posttalk.composerSec', 60, 10, 300, 'second', 'bible', 'I10.2.1'],
  ['situation.blowoutMargin', 17, 7, 35, 'point', 'assumption', 'I10.2.1 (what the players saw; blowout cut chosen here)'],
  ['situation.closeMargin', 8, 1, 14, 'point', 'assumption', 'I10.2.1 (a close loss; one-score cut chosen here)'],
  ['posttalk.poorFitCredibility', -0.02, -0.2, 0, 'ratio', 'assumption', 'I10.2.1 (a poor fit "lowers credibility"; size chosen here)'],
  // I10.2.2 game balls
  ['ball.max', 3, 0, 5, 'count', 'bible', 'I10.2.2'],
  ['ball.lowProfileGain', 0.06, 0, 0.2, 'satisfaction', 'bible', 'I10.2.2'],
  ['ball.starGain', 0.02, 0, 0.2, 'satisfaction', 'bible', 'I10.2.2'],
  ['ball.repeatWeeks', 4, 1, 10, 'week', 'bible', 'I10.2.2'],
  ['ball.repeatFactor', 0.6, 0, 1, 'ratio', 'bible', 'I10.2.2'],
  ['ball.passedOverLoss', -0.01, -0.1, 0, 'satisfaction', 'bible', 'I10.2.2'],
  ['ball.passedOverWins', 2, 1, 5, 'game', 'bible', 'I10.2.2'],
  ['ball.passedOverTopN', 2, 1, 5, 'rank', 'bible', 'I10.2.2'],
  ['ball.assistantLoyalty', 0.02, 0, 0.1, 'tie', 'bible', 'I10.2.2'],
  ['ball.fromPlayersChance', 0.25, 0, 1, 'probability', 'bible', 'I10.2.2'],
  // I10.3.1 injury update
  ['injury.readWeak', 0.6, 0, 1, 'probability', 'bible', 'I10.3.1'],
  ['injury.readTypical', 0.7, 0, 1, 'probability', 'bible', 'I10.3.1'],
  ['injury.readStrong', 0.8, 0, 1, 'probability', 'bible', 'I10.3.1'],
  ['injury.listWithinMin', 10, 1, 30, 'minute', 'bible', 'I10.3.1'],
  // I10.4.1 news conference
  ['media.questionsFewest', 4, 1, 10, 'count', 'bible', 'I10.4.1'],
  ['media.questionsMost', 8, 4, 15, 'count', 'bible', 'I10.4.1'],
  ['media.disagreedAfterLossWeight', 3, 1, 10, 'ratio', 'assumption', 'I10.4.1 ("very likely to be asked about after a loss")'],
  ['media.declineSoursAfter', 2, 0, 8, 'count', 'assumption', 'I10.4.1 ("declining too often sours the media model")'],
  // I10.5.2 the day after
  ['dayafter.normalEfficiency', 1, 0, 1, 'ratio', 'bible', 'I10.5.2'],
  ['dayafter.shortEfficiency', 0.8, 0, 1, 'ratio', 'bible', 'I10.5.2'],
  ['dayafter.offEfficiency', 0.5, 0, 1, 'ratio', 'bible', 'I10.5.2'],
  ['dayafter.shortRecoveryDays', 0.5, 0, 1, 'day', 'bible', 'I10.5.2'],
  ['dayafter.offRecoveryDays', 1, 0, 2, 'day', 'bible', 'I10.5.2'],
  ['dayafter.offMoraleZ', 0.03, 0, 0.1, 'z', 'bible', 'I10.5.2'],
  ['dayafter.offRepeatWeeks', 4, 1, 10, 'week', 'bible', 'I10.5.2'],
  ['dayafter.offRepeatFactor', 0.6, 0, 1, 'ratio', 'bible', 'I10.5.2'],
  ['dayafter.offWednesdayMin', 45, 15, 120, 'minute', 'bible', 'I10.5.2'],
  ['dayafter.lateReturnHour', 2, 0, 6, 'hour', 'bible', 'I10.5.2'],
  ['dayafter.lateReportShiftH', 2, 0, 6, 'hour', 'bible', 'I10.5.2'],
  ['dayafter.sloppyCredibility', -0.02, -0.2, 0, 'ratio', 'assumption', 'I10.5.2 ("costs a little credibility with veterans")'],
  // I10.5.3 plays to the league office
  ['office.error', 0.05, 0, 0.5, 'probability', 'bible', 'I10.5.3'],
  ['office.videoHazardZ', 0.02, 0, 0.1, 'z', 'bible', 'I10.5.3'],
  // I10.5.4 grading the film
  ['grade.filmReadyH', 2, 0, 6, 'hour', 'bible', 'I10.5.4'],
  ['grade.minPerPlayerSnapLow', 0.5, 0, 2, 'minute', 'bible', 'I10.5.4'],
  ['grade.minPerPlayerSnapHigh', 1, 0, 2, 'minute', 'bible', 'I10.5.4'],
  ['grade.belowSelfSatisfaction', -0.01, -0.1, 0, 'satisfaction', 'bible', 'I10.5.4'],
  ['grade.reducedShortWeekH', 3, 0, 10, 'hour', 'bible', 'I10.5.4'],
  ['grade.errorAtZero', 0.5, 0, 0.5, 'probability', 'assumption', 'I10.5.4 (agreement rises with observation quality; at the worst coach a coin flip)'],
  ['grade.lostFilmErrorFactor', 1.5, 1, 3, 'ratio', 'bible', 'I10.5.4'],
  // I10.6.1 contradiction rule
  ['record.contradictionRaise', 0.5, 0, 1, 'probability', 'bible', 'I10.6.1'],
  ['record.dayToDayMissedGames', 3, 1, 10, 'game', 'bible', 'I10.6.1'],
  ['record.qbChangeWeeks', 2, 1, 6, 'week', 'bible', 'I10.6.1'],
];

export const PARAMS: ParamFile = {
  module: GAMEDAY_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name, value, min, max, unit, belongsTo: GAMEDAY_MODULE, basis, leaf, constrainedBy: 'career gameday tests', status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** A tuning value by name; throws on a name the table does not hold. */
export function gp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${GAMEDAY_MODULE}: unknown parameter ${name}`);
  return v;
}

/**
 * Rule keys this module reads. The caller reads each from the rule set and passes the value in
 * (`GameDayRules`). Keys marked "requested" are not in the dictionary yet (sent to the integrator).
 */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'roster.active_limit', type: 'number', meaning: 'Game-day active limit with enough offensive linemen active', ownerLeaf: 'I1.2.2', readBy: ['career/gameday'] },
  { key: 'roster.active_limit_short_line', type: 'number', meaning: 'Active limit when fewer than the minimum offensive linemen are active', ownerLeaf: 'I1.2.2', readBy: ['career/gameday'] },
  { key: 'roster.active_min_linemen', type: 'number', meaning: 'Offensive linemen needed for the full active limit', ownerLeaf: 'I1.2.2', readBy: ['career/gameday'] },
  { key: 'roster.elevations_max_per_game', type: 'number', meaning: 'Practice squad elevations per game', ownerLeaf: 'I1.2.2', readBy: ['career/gameday'] },
  { key: 'roster.inactives_due_minutes_before_kickoff', type: 'number', meaning: 'Game Day Administration Report deadline (inactives, emergency quarterback, radio players, captains)', ownerLeaf: 'I1.1.1', readBy: ['career/gameday'] },
  { key: 'roster.emergency_qb_active_qbs', type: 'number', meaning: 'Quarterbacks on the active list when an emergency quarterback is named (0 means the rule does not exist)', ownerLeaf: 'I1.2.3', readBy: ['career/gameday'] },
  { key: 'roster.emergency_qb_from_practice_squad', type: 'boolean', meaning: 'Whether an elevated practice squad player may be the emergency quarterback', ownerLeaf: 'I1.2.3', readBy: ['career/gameday'] },
  { key: 'comm.c2p_allowed', type: 'boolean', meaning: 'Coach-to-player helmet radio is allowed', ownerLeaf: 'I1.2.4', readBy: ['career/gameday'] },
  { key: 'comm.c2p_receivers_offense', type: 'number', meaning: 'Offensive players on the field with a helmet radio on a scrimmage down', ownerLeaf: 'I1.2.4', readBy: ['career/gameday'] },
  { key: 'comm.c2p_receivers_defense', type: 'number', meaning: 'Defensive players on the field with a helmet radio on a scrimmage down', ownerLeaf: 'I1.2.4', readBy: ['career/gameday'] },
  { key: 'toss.captains_max', type: 'number', meaning: 'Captains at the toss', ownerLeaf: 'I1.5.1', readBy: ['career/gameday'] },
  { key: 'toss.defer_allowed', type: 'boolean', meaning: 'The toss winner may defer to the second half', ownerLeaf: 'I1.5.2', readBy: ['career/gameday'] },
  { key: 'field.end_zone_depth_ft', type: 'number', meaning: 'End zone depth in feet; field goal distance adds it to the line of scrimmage (value under research)', ownerLeaf: 'I1.3.2', readBy: ['career/gameday'] },
  { key: 'clock.halftime_min', type: 'number', meaning: 'Halftime intermission length', ownerLeaf: 'I8.2.1', readBy: ['career/gameday'] },
  // requested (not in the dictionary yet)
  { key: 'toss.minutes_before_kickoff', type: 'number', meaning: 'The toss is held not more than this many minutes before kickoff (Rule 4-2-2; college 3-1-1-e)', ownerLeaf: 'I1.5.2', readBy: ['career/gameday'] },
  { key: 'toss.field_presence_minutes', type: 'number', meaning: 'Both teams on the field this many minutes before kickoff or lose the toss option (Rule 4-2-1); 0 when no such rule', ownerLeaf: 'I1.1.1', readBy: ['career/gameday'] },
  { key: 'toss.late_field_penalty_yd', type: 'number', meaning: 'Yards charged on the opening kickoff to a team late to the field (Rule 4-2-1)', ownerLeaf: 'I1.1.1', readBy: ['career/gameday'] },
  { key: 'replay.challenge_designee_allowed', type: 'boolean', meaning: 'A pregame challenge designee may throw the flag (Rule 15-1-1(a))', ownerLeaf: 'I1.4.5', readBy: ['career/gameday'] },
  { key: 'comm.c2p_designated_offense', type: 'number', meaning: 'Radio helmets a team may designate for its quarterbacks before the game (Rule 5-3-3: three); 0 means no designation rule', ownerLeaf: 'I1.2.4', readBy: ['career/gameday'] },
  { key: 'comm.c2p_designated_defense', type: 'number', meaning: 'Radio helmets a team may designate for defensive primary and backup users (Rule 5-3-3: three); 0 means no designation rule', ownerLeaf: 'I1.2.4', readBy: ['career/gameday'] },
  { key: 'league.officiating_review.max_plays', type: 'number', meaning: 'Plays a head coach may send to the league office per week', ownerLeaf: 'I10.5.3', readBy: ['career/gameday'] },
];
