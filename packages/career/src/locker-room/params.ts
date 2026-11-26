// Tuning constants of the locker room module (G-45: L2.2, L2.3, L2.5, L2.6, L3). Every number here is
// either a starting value the bible leaf states (`bible`) or a value this module chose because the leaf
// names the rule but gives no number (`assumption`). The bible marks every one of the `bible` rows as a
// design starting value with no quantitative source (L2 "What a builder needs", L3 per leaf), so none of
// them is a real-world fact. Real-world rule values (the CBA fine schedule, the 40/70/100 ladder, the
// conduct-detrimental limits and grievance clocks) are NOT here: they are rule keys (keys.ts) filled by
// G-10 with fact rows.
import type { ParamFile, TuningParam } from '@gm/schema';

export const LOCKER_ROOM_MODULE = 'career.locker_room';

/** A seeded uniform draw in [0, 1). Callers pass an engine-core stream (career may not import engine-core). */
export type Draw = () => number;

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const ROWS: readonly Row[] = [
  // L2.2.1 captains
  ['captains.countDefault', 6, 1, 12, 'count', 'bible', 'L2.2.1 (5 to 6)'],
  ['captains.appointTeamTrust', -3, -20, 0, 'trust', 'bible', 'L2.2.1'],
  ['captains.appointPassedOverTrust', -8, -30, 0, 'trust', 'bible', 'L2.2.1'],
  ['captains.vetoTeamTrust', -6, -20, 0, 'trust', 'bible', 'L2.2.1'],
  ['captains.legitimateResistTrustBelow', 40, 0, 100, 'trust', 'bible', 'L2.2.1'],
  // L2.2.2 leadership council
  ['council.minMembers', 6, 1, 20, 'count', 'bible', 'L2.2.2'],
  ['council.maxMembers', 12, 1, 20, 'count', 'bible', 'L2.2.2'],
  ['council.agendaMin', 2, 0, 10, 'count', 'bible', 'L2.2.2'],
  ['council.agendaMax', 4, 0, 10, 'count', 'bible', 'L2.2.2'],
  ['council.surface.base', 0.2, 0, 1, 'probability', 'bible', 'L2.2.2'],
  ['council.surface.trustSlope', 0.6, 0, 1, 'probability', 'bible', 'L2.2.2'],
  ['council.surface.minTie', 50, 0, 100, 'tie', 'bible', 'L2.2.2'],
  ['council.issue.moraleClusterBelow', 35, 0, 100, 'morale', 'bible', 'L2.2.2'],
  ['council.act.memberTrust', 4, 0, 20, 'trust', 'bible', 'L2.2.2'],
  ['council.act.groupTrust', 2, 0, 20, 'trust', 'bible', 'L2.2.2'],
  ['council.explain.coachWordAbove', 60, 0, 100, 'index', 'bible', 'L2.2.2'],
  ['council.explain.trustMax', 1, 0, 5, 'trust', 'bible', 'L2.2.2 (0 to +1)'],
  ['council.defer.limit', 2, 1, 5, 'count', 'bible', 'L2.2.2'],
  ['council.defer.trust', -5, -20, 0, 'trust', 'bible', 'L2.2.2'],
  ['council.policing.cultureAbove', 60, 0, 100, 'index', 'bible', 'L2.2.2'],
  ['council.policing.cultureBelow', 40, 0, 100, 'index', 'bible', 'L2.2.2'],
  ['council.policing.minorCut', 0.25, 0, 1, 'ratio', 'bible', 'L2.2.2, L3.2.1'],
  ['council.policing.lostStanding', -3, -20, 0, 'tie', 'assumption', 'L2.2.2 (members lose standing; no number given)'],
  ['council.meetingMinutesMin', 30, 0, 120, 'min', 'bible', 'L2.2.2'],
  ['council.meetingMinutesMax', 45, 0, 120, 'min', 'bible', 'L2.2.2'],
  // L2.2.3 position-room leaders
  ['roomLeader.hysteresis', 10, 0, 50, 'influence', 'bible', 'L2.2.3'],
  ['roomLeader.recomputeWeeks', 4, 1, 12, 'weeks', 'bible', 'L2.2.3 (monthly)'],
  ['roomLeader.studyWorkEthicAbove', 70, 0, 100, 'index', 'bible', 'L2.2.3'],
  ['roomLeader.studyGain', 0.03, 0, 0.2, 'ratio', 'bible', 'L2.2.3'],
  ['roomLeader.loafWorkEthicBelow', 40, 0, 100, 'index', 'bible', 'L2.2.3'],
  ['roomLeader.effortLoss', -0.02, -0.2, 0, 'ratio', 'bible', 'L2.2.3'],
  ['roomLeader.releaseCohesionDrop', 10, 0, 50, 'tie', 'bible', 'L2.2.3'],
  // L2.3.1 mentors and traditions
  ['mentor.leadershipAbove', 55, 0, 100, 'index', 'bible', 'L2.3.1'],
  ['mentor.knowledgeGain', 0.05, 0, 0.2, 'ratio', 'bible', 'L2.3.1'],
  ['mentor.tieBoost', 10, 0, 30, 'tie', 'bible', 'L2.3.1'],
  ['mentor.unwillingFriction', -3, -20, 0, 'tie', 'assumption', 'L2.3.1 (may add friction; no number given)'],
  ['traditions.banVeteranTrust', -1, -10, 0, 'trust', 'bible', 'L2.3.1'],
  ['traditions.hazingMult.banned', 0.25, 0, 1, 'ratio', 'bible', 'L2.3.1 (a quarter of the limited rate)'],
  ['traditions.hazingMult.limited', 1, 0, 5, 'ratio', 'bible', 'L2.3.1 (reference rate)'],
  ['traditions.hazingMult.allowed', 2, 1, 5, 'ratio', 'assumption', 'L2.3.1 (highest chance; no number given)'],
  // L2.3.2 specialists
  ['specialist.slumpMisses', 2, 1, 10, 'count', 'bible', 'L2.3.2'],
  ['specialist.slumpGames', 2, 1, 10, 'games', 'bible', 'L2.3.2'],
  ['specialist.backPublicTrust', 10, 0, 30, 'trust', 'bible', 'L2.3.2'],
  ['specialist.tryoutTrust', -10, -30, 0, 'trust', 'bible', 'L2.3.2'],
  ['specialist.kickConfidenceEffect', 0, 0, 0, 'ratio', 'bible', 'L2.3.2 (kick_confidence_effect default 0, no evidence)'],
  // L2.5.1 players-only meetings and public complaints
  ['trouble.meeting.losingStreak', 3, 1, 10, 'games', 'bible', 'L2.5.1'],
  ['trouble.meeting.captainInfluenceAbove', 70, 0, 100, 'influence', 'bible', 'L2.5.1'],
  ['trouble.meeting.positiveTrustAbove', 55, 0, 100, 'trust', 'bible', 'L2.5.1'],
  ['trouble.meeting.warningTrustBelow', 40, 0, 100, 'trust', 'bible', 'L2.5.1'],
  ['trouble.meeting.positiveCulture', 3, 0, 10, 'index', 'bible', 'L2.5.1'],
  ['trouble.complaint.egoAbove', 70, 0, 100, 'index', 'bible', 'L2.5.1'],
  ['trouble.complaint.roleBeliefBelow', 35, 0, 100, 'index', 'bible', 'L2.5.1'],
  ['trouble.complaint.leakAbove', 60, 0, 100, 'index', 'assumption', 'L2.5.1 (leak propensity above a threshold, L6.3)'],
  // L2.5.2 losing the room
  ['roomLost.trustFloor', 30, 0, 100, 'trust', 'bible', 'L2.5.2'],
  ['roomLost.cultureFloor', 30, 0, 100, 'index', 'bible', 'L2.5.2'],
  ['roomLost.setWeeks', 4, 1, 20, 'weeks', 'bible', 'L2.5.2'],
  ['roomLost.clearAbove', 40, 0, 100, 'index', 'bible', 'L2.5.2'],
  ['roomLost.clearWeeks', 3, 1, 20, 'weeks', 'bible', 'L2.5.2'],
  ['roomLost.signWeeks', 4, 1, 20, 'weeks', 'bible', 'L2.5.2 acceptance (four weeks of visible signs)'],
  ['roomLost.attention', 0.85, 0, 1, 'ratio', 'bible', 'L2.5.2'],
  ['roomLost.practiceEffort', 0.85, 0, 1, 'ratio', 'bible', 'L2.5.2'],
  ['roomLost.pursuitChance', 0.03, 0, 1, 'probability/snap', 'bible', 'L2.5.2'],
  ['roomLost.lowBuyInBelow', 40, 0, 100, 'index', 'assumption', 'L2.5.2 (low-buy-in player; no line given)'],
  // L2.6.1 college room
  ['college.hiredGunWeeks', 10, 0, 52, 'weeks', 'bible', 'L2.6.1'],
  ['college.hiredGunTie', -10, -30, 0, 'tie', 'assumption', 'L2.6.1 (hired gun perception; no number given)'],
  ['college.payGapTie', -10, -30, 0, 'tie', 'bible', 'L2.6.1'],
  ['college.payGapPerformKeep', 0.5, 0, 1, 'ratio', 'bible', 'L2.6.1 (halved if the newcomer performs)'],
  ['college.studyMultiplier', 2, 1, 5, 'ratio', 'bible', 'L2.6.1'],
  ['college.boundWiden', 1.25, 1, 2, 'ratio', 'bible', 'L2.6.1, L3.4.1'],
  // L2.6.2 lower rung
  ['rung.reportConfidenceTrust', -15, -30, 0, 'trust', 'bible', 'L2.6.2'],
  ['rung.reportConfidenceStanding', 3, 0, 10, 'standing', 'bible', 'L2.6.2'],
  ['rung.notReportedStanding', -8, -30, 0, 'standing', 'bible', 'L2.6.2'],
  // L3.1.1 rule list
  ['rules.strictStress', 1, 0, 5, 'stress/week', 'bible', 'L3.1.1'],
  ['rules.lowDisciplineBelow', 40, 0, 100, 'index', 'assumption', 'L3.1.1 (low discipline facet; no line given)'],
  ['rules.toleranceGapWide', 25, 0, 100, 'percent', 'assumption', 'L3.1.1 (stricter by a wide margin)'],
  ['rules.veteranBuyInMax', -5, -20, 0, 'buy_in', 'bible', 'L3.1.1 (up to 5)'],
  ['rules.raiseAfterViolationTrust', -5, -20, 0, 'trust', 'bible', 'L3.1.1'],
  ['rules.loosenAfterStarConsistency', -3, -20, 0, 'index', 'assumption', 'L3.1.1 (costs consistency; no number given)'],
  // L3.2.1 violations
  ['violation.disciplineIntercept', 1.6, 0, 3, 'ratio', 'bible', 'L3.2.1'],
  ['violation.stressDivisor', 200, 1, 1000, 'stress', 'bible', 'L3.2.1'],
  ['violation.cultureIntercept', 1.3, 0, 3, 'ratio', 'bible', 'L3.2.1'],
  ['violation.cultureDivisor', 200, 1, 1000, 'index', 'bible', 'L3.2.1'],
  ['violation.witness.room', 0.4, 0, 1, 'probability', 'assumption', 'L3.2.1 (who saw it: room, team or staff only; no split given)'],
  ['violation.witness.team', 0.3, 0, 1, 'probability', 'assumption', 'L3.2.1'],
  // L3.2.2 fines
  ['fine.memoryMin', -3, -20, 0, 'memory', 'bible', 'L3.2.2'],
  ['fine.memoryMax', -8, -30, 0, 'memory', 'bible', 'L3.2.2'],
  ['fine.memoryFullShareOfWeek', 0.5, 0.01, 5, 'ratio', 'assumption', 'L3.2.2 (fine as a share of weekly pay that reaches -8)'],
  // L3.2.3 playing time
  ['bench.series', -4, -30, 0, 'memory', 'bible', 'L3.2.3'],
  ['bench.half', -8, -30, 0, 'memory', 'bible', 'L3.2.3'],
  ['bench.game', -12, -30, 0, 'memory', 'bible', 'L3.2.3'],
  ['bench.listedKeep', 0.5, 0, 1, 'ratio', 'bible', 'L3.2.3 (halved if the list said so)'],
  ['bench.unpunishedMult', 2, 1, 5, 'ratio', 'bible', 'L3.2.3 (doubled)'],
  ['bench.unpunishedWeeks', 8, 1, 52, 'weeks', 'bible', 'L3.2.3'],
  ['bench.abilityFlagWeeks', 2, 0, 10, 'weeks', 'bible', 'L3.2.3'],
  // L3.2.4 conduct detrimental
  ['conduct.playerMemory', -25, -50, 0, 'memory', 'bible', 'L3.2.4'],
  ['conduct.witnessFair', 5, 0, 20, 'memory', 'bible', 'L3.2.4'],
  ['conduct.witnessUnfair', -10, -30, 0, 'memory', 'bible', 'L3.2.4'],
  // L3.2.5 grievance (filing and outcome rates have no source)
  ['grievance.base', 0.05, 0, 1, 'probability', 'bible', 'L3.2.5'],
  ['grievance.aboveOthers', 0.3, 0, 1, 'probability', 'bible', 'L3.2.5'],
  ['grievance.offList', 0.3, 0, 1, 'probability', 'bible', 'L3.2.5'],
  ['grievance.trustSlope', 0.1, 0, 1, 'probability', 'bible', 'L3.2.5'],
  ['grievance.singleAct', 0.15, 0, 1, 'probability', 'bible', 'L3.2.4, L3.2.5'],
  ['grievance.abilityFlag', 0.2, 0, 1, 'probability', 'bible', 'L3.2.3, L3.2.5'],
  ['grievance.overLimit', 0.3, 0, 1, 'probability', 'assumption', 'L3.2.2 (the player always knows; treated like an off-list offence)'],
  ['grievance.stay', 0.3, 0, 1, 'probability', 'bible', 'L3.2.5'],
  ['grievance.winIfTestFails', 0.75, 0, 1, 'probability', 'assumption', 'L3.2.5 (outcome favours the player when a test fails)'],
  ['grievance.winIfTestsPass', 0.1, 0, 1, 'probability', 'assumption', 'L3.2.5'],
  // L3.3.1 consistency
  ['consistency.start', 60, 0, 100, 'index', 'bible', 'L3.3.1'],
  ['consistency.restTarget', 60, 0, 100, 'index', 'bible', 'L3.3.1'],
  ['consistency.decayPerWeek', 1, 0, 10, 'index/week', 'bible', 'L3.3.1'],
  ['consistency.compareCases', 3, 1, 10, 'count', 'bible', 'L3.3.1'],
  ['consistency.lighterPerStep', -4, -20, 0, 'index', 'bible', 'L3.3.1'],
  ['consistency.equal', 1.5, 0, 10, 'index', 'bible', 'L3.3.1'],
  ['consistency.heavierStar', -1, -10, 0, 'index', 'bible', 'L3.3.1'],
  ['consistency.equalBand', 0.5, 0, 2, 'level', 'assumption', 'L3.3.1 (what counts as equal on the five-step scale)'],
  ['consistency.unevenLowerPerStep', -2, -10, 0, 'index', 'assumption', 'L3.3.1 (uneven treatment of a lower-influence player; no number given)'],
  ['consistency.calloutHook', -3, -10, 0, 'index', 'bible', 'L3.3.1 (H4.2.2 hook)'],
  ['consistency.calloutWeeks', 4, 1, 12, 'weeks', 'bible', 'L3.3.1'],
  // L3.3.2 star player
  ['star.influenceAbove', 70, 0, 100, 'influence', 'bible', 'L3.3.2'],
  ['star.gradePercentileAbove', 75, 0, 100, 'percentile', 'bible', 'L3.3.2 (top quartile)'],
  ['star.equalCulture', 4, 0, 10, 'index', 'bible', 'L3.3.2'],
  ['star.lowTrustBelow', 35, 0, 100, 'trust', 'bible', 'L3.3.2'],
  ['star.lowTrustStress', 20, 0, 100, 'stress', 'bible', 'L3.3.2'],
  // L3.4.1 team discipline modifier (coach-controlled bounds; R31, starting values)
  ['modifier.offPresnap.lo', 0.95, 0.95, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.offPresnap.hi', 1.05, 1, 1.05, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.defPresnap.lo', 0.85, 0.5, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.defPresnap.hi', 1.15, 1, 1.5, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.defCoverage.lo', 0.9, 0.5, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.defCoverage.hi', 1.1, 1, 1.5, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.postPlay.lo', 0.925, 0.5, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.postPlay.hi', 1.075, 1, 1.5, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.w.culture', 0.5, 0, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.w.consistency', 0.3, 0, 1, 'ratio', 'bible', 'L3.4.1'],
  ['modifier.w.strictness', 0.2, 0, 1, 'ratio', 'bible', 'L3.4.1'],
  // L3.5.1 college discipline
  ['college.scholarshipMemory', -30, -60, 0, 'memory', 'bible', 'L3.5.1'],
  ['college.scholarshipHalfLifeWeeks', 104, 1, 520, 'weeks', 'bible', 'L3.5.1'],
  // L3.5.2 enforcing someone else's rules
  ['assistant.handleTrust', 2, 0, 10, 'trust', 'bible', 'L3.5.2'],
  ['assistant.handleFoundOutStanding', -6, -20, 0, 'standing', 'bible', 'L3.5.2'],
  ['assistant.reportStanding', 1, 0, 10, 'standing', 'bible', 'L3.5.2'],
  ['assistant.reportCoachBond', -1, -10, 0, 'coach_bond', 'bible', 'L3.5.2'],
  // Shared scales
  ['scale.max', 100, 100, 100, 'index', 'bible', 'L1, L2 (0 to 100 scales)'],
  ['trust.mid', 50, 50, 50, 'trust', 'bible', 'L2.4.2, L3.2.5 (trust/50)'],
];

export const PARAMS: ParamFile = {
  module: LOCKER_ROOM_MODULE,
  version: 'g45.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${LOCKER_ROOM_MODULE}.${name}`, value, min, max, unit, belongsTo: LOCKER_ROOM_MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} acceptance (design starting value, no quantitative source)` : `${leaf} (assumption, needs research or Marlon's approval)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(LOCKER_ROOM_MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function lp(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`career.locker_room: unknown parameter ${name}`);
  return v;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
