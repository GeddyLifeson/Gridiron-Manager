// Player AI tuning constants (K1, with J4.5.2, D4.2.1, D4.3.1, D9.4.1 and D12.3.2 where K1 reads them).
// Basis 'bible' means the leaf states the number as a starting value; the bible itself marks every
// one of them Assumption (no public source separates deviations by cause, K1.7.8). Basis 'assumption'
// means this module's author chose the number because the leaf gives a direction and no size.
// No row here is a real-world measurement.
import type { ParamFile, ParamTable } from '@gm/schema';
import { defineParams, type ParamRow } from '../tick/param-util.ts';

const LOAF = 'K1.2.1 loaf tags per game (recorded for tuning)', BUST = 'J15 explosive pass and unblocked pressure rows (J4.5.2)';
const INT = 'J15.4.1 interception rate, J15.7.2 explosive rate (K1.3.1)', FOUL = 'J15 interference and holding bands (K1.3.3)';
const DEV = 'K1.7.8 rule 3 engine checks (Q2)', LEARN = 'K1.4.1 one-move series test', COMM = 'K1.5.1 communicator swap test';
const SCR = 'K1.3.2 scripted scramble test', NONE = 'none yet: flagged for J6.8.1 review';

const ROWS = [
  // Facets (X1) arrive on the 0 to 100 scale with 50 in the middle. The divisor that turns them into
  // the z the K1 formulas use is not stated anywhere in the bible.
  ['facetZDivisor', 25, 10, 40, 'facet/z', 'assumption', 'X1.1.2', NONE],

  // K1.2.1 effort
  ['effortMin', 0.80, 0.80, 0.80, 'ratio', 'bible', 'K1.2.1', 'none: structural'],
  ['effortMaxLoss', 0.06, 0, 0.12, 'ratio', 'bible', 'K1.2.1', LOAF],
  ['effortZSpan', 4, 4, 4, 'z', 'bible', 'K1.2.1', 'none: structural'],
  ['effortWorkHabitsWeight', 0.25, 0, 0.5, 'ratio', 'assumption', 'K1.2.1', LOAF],
  ['effortSdBase', 0.004, 0, 0.02, 'ratio', 'assumption', 'K1.2.1', LOAF],
  ['effortSdPerLoss', 0.25, 0, 1, 'ratio', 'assumption', 'K1.2.1', LOAF],
  ['effortFatigueAway', 0.06, 0, 0.15, 'ratio', 'assumption', 'K1.2.1', LOAF],
  ['effortBlowoutMargin', 21, 14, 28, 'points', 'bible', 'K1.2.1', LOAF],
  ['effortBlowoutDrop', 0.02, 0, 0.05, 'ratio', 'bible', 'K1.2.1', LOAF],
  ['effortLowCompetitivenessZ', -0.5, -2, 0, 'z', 'assumption', 'K1.2.1', LOAF],
  ['effortStressDrop', 0.03, 0, 0.06, 'ratio', 'bible', 'K1.2.1', LOAF],
  ['effortNeedBoostZ', 1, 0, 2, 'z', 'assumption', 'K1.2.1', LOAF],
  ['effortPoaFloor', 0.97, 0.9, 1, 'ratio', 'bible', 'K1.2.1', 'X1.4.2 contest bound'],
  ['effortPoaRadiusYd', 5, 2, 10, 'yd', 'assumption', 'K1.2.1', LOAF],
  ['loafLine', 0.90, 0.85, 0.95, 'ratio', 'bible', 'K1.2.1', LOAF],
  ['loafReachYd', 20, 10, 40, 'yd', 'assumption', 'K1.2.1', LOAF],
  ['protestEffort', 0.85, 0.80, 0.90, 'ratio', 'assumption', 'K1.7.4', LOAF],

  // J4.5.2 mental error draw (D9.4.1 knowledge, D4.2.1 discipline, D4.3.1 composure, D12.3.2 buy-in)
  ['knowledgeE', 0.5, 0.2, 0.8, 'probability', 'bible', 'D9.4.1', BUST],
  ['changedAtLine', 1.3, 1, 2, 'ratio', 'bible', 'D9.4.1', BUST],
  ['disciplineBase', 0.015, 0.005, 0.03, 'probability', 'bible', 'D4.2.1', BUST],
  ['disciplineIntercept', 2.0, 2, 2, 'ratio', 'bible', 'D4.2.1', 'none: structural'],
  ['disciplineDivisor', 50, 50, 50, 'iss', 'bible', 'D4.2.1', 'none: structural'],
  ['disciplineFloor', 0.002, 0, 0.01, 'probability', 'bible', 'D4.2.1', BUST],
  ['temptationNear', 2.0, 1, 3, 'ratio', 'bible', 'J4.5.2', BUST],
  ['temptationChance', 3.0, 1, 4, 'ratio', 'bible', 'J4.5.2', BUST],
  ['temptationNearYd', 5, 2, 10, 'yd', 'bible', 'J4.5.2', BUST],
  ['complexityK', 1.0, 0, 2, 'ratio', 'bible', 'J4.5.2', BUST],
  ['iqK', 0.05, 0, 0.1, 'ratio/z', 'bible', 'J4.5.2', BUST],
  ['iqMin', 0.8, 0.5, 1, 'ratio', 'bible', 'J4.5.2', BUST],
  ['iqMax', 1.2, 1, 1.5, 'ratio', 'bible', 'J4.5.2', BUST],
  ['composureDivisor', 250, 100, 500, 'iss', 'bible', 'D4.3.1', BUST],
  ['experienceFloor', 0.6, 0.3, 1, 'ratio', 'bible', 'D4.3.1', BUST],
  ['experienceSnaps', 200, 50, 500, 'count', 'bible', 'D4.3.1', BUST],
  ['errorCap', 0.6, 0.3, 1, 'probability', 'bible', 'J4.5.2', BUST],
  ['buyInMid', 60, 40, 80, 'iss', 'bible', 'D12.3.2', BUST],
  ['buyInSlope', 0.005, 0, 0.01, 'ratio/iss', 'bible', 'D12.3.2', BUST],
  ['buyInMin', 0.8, 0.5, 1, 'ratio', 'bible', 'D12.3.2', BUST],
  ['buyInMax', 1.3, 1, 2, 'ratio', 'bible', 'D12.3.2', BUST],
  // J4.5.3 sizes of the substituted act. The leaf names the forms and gives no sizes.
  ['errDepthYd', 4, 1, 8, 'yd', 'assumption', 'J4.5.3', BUST],
  ['errGapYd', 3, 1, 6, 'yd', 'assumption', 'J4.5.3', BUST],
  ['errLateS', 0.6, 0.2, 1.5, 's', 'assumption', 'J4.5.3', BUST],
  ['errBounceYd', 6, 2, 10, 'yd', 'assumption', 'K1.7.4', BUST],
  ['errDeeperYd', 5, 2, 10, 'yd', 'assumption', 'K1.7.4', BUST],
  ['errShallowYd', 6, 2, 12, 'yd', 'assumption', 'J4.5.3', BUST],
  ['causeWeightShift', 3, 1, 6, 'ratio', 'assumption', 'J4.5.3', BUST],
  ['presnapFormWeight', 0.15, 0, 0.5, 'ratio', 'assumption', 'J4.5.3', BUST],

  // K1.7.4 self weight and credits
  ['selfBase', 0.1, 0, 0.3, 'ratio', 'bible', 'K1.7.4', DEV],
  ['selfEgo', 0.25, 0, 0.5, 'ratio/z', 'bible', 'K1.7.4', DEV],
  ['selfTeam', 0.2, 0, 0.5, 'ratio/z', 'bible', 'K1.7.4', DEV],
  ['selfNeed', 0.15, 0, 0.4, 'ratio', 'bible', 'K1.7.4', DEV],
  ['selfBuyIn', 0.1, 0, 0.3, 'ratio', 'bible', 'K1.7.4', DEV],
  ['selfBuyInMid', 60, 40, 80, 'iss', 'bible', 'K1.7.4', DEV],
  ['selfBuyInSpan', 40, 20, 60, 'iss', 'bible', 'K1.7.4', DEV],
  ['selfMax', 0.8, 0.4, 1, 'ratio', 'bible', 'K1.7.4', DEV],
  ['creditInterception', 1.0, 0, 2, 'credit', 'bible', 'K1.7.4', DEV],
  ['creditSack', 1.0, 0, 2, 'credit', 'bible', 'K1.7.4', DEV],
  ['creditTouchdown', 1.0, 0, 2, 'credit', 'bible', 'K1.7.4', DEV],
  ['creditCatch', 0.2, 0, 1, 'credit', 'bible', 'K1.7.4', DEV],
  ['creditCarry', 0.1, 0, 1, 'credit', 'bible', 'K1.7.4', DEV],
  ['creditStrip', 0.5, 0, 2, 'credit', 'assumption', 'K1.7.4', DEV],
  ['creditTackle', 0.3, 0, 2, 'credit', 'assumption', 'K1.7.4', DEV],
  ['creditPeek', 0.2, 0, 1, 'credit', 'assumption', 'K1.7.4', DEV],
  ['noFreelanceCost', 0.3, 0, 1, 'ep', 'bible', 'K1.7.4', DEV],
  ['motiveFloor', 0.05, 0, 0.2, 'ratio', 'assumption', 'K1.7.4', DEV],
  ['statChanceDefault', 0.5, 0, 1, 'probability', 'assumption', 'K1.7.4', DEV],

  // K1.3.1 gambles
  ['thresholdMin', 0.55, 0.3, 0.7, 'ratio', 'bible', 'K1.3.1', INT],
  ['thresholdMax', 0.90, 0.7, 1.2, 'ratio', 'bible', 'K1.3.1', INT],
  ['thresholdPerRiskZ', 0.0875, 0, 0.2, 'ratio/z', 'assumption', 'K1.3.1', INT],
  ['thresholdPerDisciplineZ', 0.03, 0, 0.1, 'ratio/z', 'assumption', 'K1.3.1', INT],
  ['thresholdInstruction', 0.10, 0, 0.3, 'ratio', 'assumption', 'K1.3.1', INT],
  ['thresholdTeamFrac', 0.5, 0, 1, 'ratio', 'assumption', 'K1.7.5', DEV],
  ['thresholdStripOrder', 0.10, 0, 0.3, 'ratio', 'assumption', 'K1.3.1', 'J15.9.1 fumble rate'],
  ['deepSafetyMargin', 0.15, 0, 0.4, 'ratio', 'bible', 'K1.3.1', INT],
  ['confBase', 0.30, 0, 0.6, 'probability', 'assumption', 'K1.3.1', INT],
  ['confPerRead', 0.30, 0, 0.6, 'probability', 'assumption', 'K1.3.1', INT],
  ['confPerRecZ', 0.08, 0, 0.2, 'probability/z', 'assumption', 'K1.3.1', INT],
  ['confPerLearnZ', 1.0, 0, 3, 'probability/z', 'assumption', 'K1.4.1', LEARN],
  ['confTell', 0.25, 0, 0.5, 'probability', 'assumption', 'K1.7.5', DEV],
  ['confEyes', 0.10, 0, 0.3, 'probability', 'assumption', 'K1.3.1', INT],
  ['confSeen', 0.85, 0.5, 1, 'probability', 'assumption', 'K1.3.1', INT],
  ['confMin', 0.05, 0, 0.2, 'probability', 'assumption', 'K1.3.1', INT],
  ['confMax', 0.95, 0.8, 1, 'probability', 'assumption', 'K1.3.1', INT],
  ['valueJumpRoute', 0.9, 0, 2, 'ep', 'assumption', 'K1.3.1', INT],
  ['valueUndercut', 0.9, 0, 2, 'ep', 'assumption', 'K1.3.1', INT],
  ['valueShootGap', 0.85, 0, 2, 'ep', 'assumption', 'K1.3.1', INT],
  ['valuePeek', 0.6, 0, 2, 'ep', 'assumption', 'K1.3.1', INT],
  ['valueStrip', 0.7, 0, 2, 'ep', 'assumption', 'K1.3.1', 'J15.9.1 fumble rate'],
  ['valueLeaveContain', 0.45, 0, 2, 'ep', 'assumption', 'K1.7.4', DEV],
  ['valueSitOnRoute', 1.0, 0, 2, 'ep', 'assumption', 'K1.7.5', DEV],
  ['valueRescue', 1.0, 0, 2, 'ep', 'assumption', 'K1.7.5', DEV],
  ['valuePickUpFree', 1.0, 0, 2, 'ep', 'assumption', 'K1.7.5', DEV],
  ['jumpRangeYd', 8, 3, 15, 'yd', 'assumption', 'K1.3.1', INT],
  ['breakLatYps', 3, 1, 6, 'yd/s', 'assumption', 'K1.3.1', INT],
  ['jumpLeadS', 0.6, 0.2, 1.2, 's', 'assumption', 'K1.3.1', INT],
  ['undercutDepthYd', 6, 2, 12, 'yd', 'assumption', 'K1.3.1', INT],
  ['stripRangeYd', 2, 1, 4, 'yd', 'assumption', 'K1.3.1', 'J15.9.1 fumble rate'],
  ['shootGapRangeYd', 8, 3, 15, 'yd', 'assumption', 'K1.3.1', INT],
  ['containRangeYd', 7, 3, 12, 'yd', 'assumption', 'K1.7.4', DEV],
  ['eyesCos', 0.94, 0.7, 1, 'cosine', 'assumption', 'K1.3.1', INT],
  ['backfieldDepthYd', 1, 0, 3, 'yd', 'assumption', 'K1.3.1', INT],
  ['peekMinS', 0.8, 0.2, 2, 's', 'assumption', 'K1.3.1', INT],

  // K1.7.5 the veteran's adjustment
  ['gateKnowledge', 85, 60, 100, 'iss', 'bible', 'K1.7.5', DEV],
  ['gateIqZ', 0.5, 0, 2, 'z', 'bible', 'K1.7.5', DEV],
  ['gateSeasons', 2, 0, 5, 'count', 'bible', 'K1.7.5', DEV],
  ['callLeadS', 0.4, 0.1, 1, 's', 'bible', 'K1.7.5', DEV],
  ['cohesionOk', 0.7, 0.3, 1, 'ratio', 'bible', 'K1.7.5', DEV],
  ['coordBias', 0.2, 0, 0.5, 'ratio', 'bible', 'K1.7.5', DEV],
  ['coordCost', 0.25, 0, 1, 'ep', 'assumption', 'K1.7.5', DEV],
  ['estimateSd', 0.15, 0, 0.5, 'ratio', 'assumption', 'K1.7.5', DEV],
  ['estimateSdPerIqZ', 0.25, 0, 0.5, 'ratio/z', 'assumption', 'K1.7.5', DEV],
  ['rescueDeepYd', 10, 5, 20, 'yd', 'assumption', 'K1.7.5', DEV],
  ['rescueOpenYd', 5, 2, 10, 'yd', 'assumption', 'K1.7.5', DEV],
  ['rescueReachYd', 15, 5, 25, 'yd', 'assumption', 'K1.7.5', DEV],
  ['tellRangeYd', 12, 5, 25, 'yd', 'assumption', 'K1.7.5', DEV],
  ['freeRusherYd', 6, 2, 10, 'yd', 'assumption', 'K1.7.5', DEV],
  ['blockedWithinYd', 1.5, 0.5, 3, 'yd', 'assumption', 'K1.7.5', DEV],

  // K1.3.3 deliberate fouls. The estimates are the player's rough arithmetic, not the game's
  // expected-points model (N2), which the engine may not import.
  ['foulThresholdMin', 0.5, 0, 2, 'ep', 'bible', 'K1.3.3', FOUL],
  ['foulThresholdMax', 3.0, 1, 6, 'ep', 'bible', 'K1.3.3', FOUL],
  ['foulThresholdPerDisciplineZ', 0.5, 0, 1.5, 'ep/z', 'assumption', 'K1.3.3', FOUL],
  ['foulThresholdPerCompetitivenessZ', 0.5, 0, 1.5, 'ep/z', 'assumption', 'K1.3.3', FOUL],
  ['foulInstructionShift', 1.0, 0, 3, 'ep', 'assumption', 'K1.3.3', FOUL],
  ['foulEpPerYd', 0.07, 0.02, 0.15, 'ep/yd', 'assumption', 'K1.3.3', FOUL],
  ['foulFirstDownEp', 0.5, 0, 2, 'ep', 'assumption', 'K1.3.3', FOUL],
  ['foulCatchEst', 0.6, 0.2, 0.9, 'probability', 'assumption', 'K1.3.3', FOUL],
  ['foulCatchSd', 0.2, 0, 0.5, 'probability', 'assumption', 'K1.3.3', FOUL],
  ['foulSackEp', 1.5, 0.5, 3, 'ep', 'assumption', 'K1.3.3', FOUL],
  ['foulSackStateMult', 2, 1, 4, 'ratio', 'assumption', 'K1.3.3', FOUL],
  ['foulReachYd', 2.5, 1, 5, 'yd', 'assumption', 'K1.3.3', FOUL],
  ['foulBeatenYd', 1, 0.3, 3, 'yd', 'assumption', 'K1.3.3', FOUL],
  ['foulGoalLineYd', 1, 1, 2, 'yd', 'bible', 'K1.3.3', FOUL],

  // K1.7.2 accidents
  ['accidentBase', 0.02, 0, 0.06, 'probability', 'bible', 'K1.7.2', DEV],
  ['accidentTechIntercept', 1.5, 1, 2, 'ratio', 'bible', 'K1.7.2', DEV],
  ['accidentTechDivisor', 4, 2, 8, 'z', 'bible', 'K1.7.2', DEV],
  ['accidentTechClip', 2, 1, 3, 'z', 'bible', 'K1.7.2', DEV],
  ['accidentReroute', 0.5, 0, 1, 'ratio', 'bible', 'K1.7.2', DEV],
  ['accidentTraffic', 0.3, 0, 1, 'ratio', 'bible', 'K1.7.2', DEV],
  ['accidentTrafficYd', 2, 1, 4, 'yd', 'bible', 'K1.7.2', DEV],
  ['accidentCap', 0.15, 0.05, 0.3, 'probability', 'bible', 'K1.7.2', DEV],
  ['accidentDepthMinYd', 1, 0, 2, 'yd', 'bible', 'K1.7.2', DEV],
  ['accidentDepthMaxYd', 3, 1, 6, 'yd', 'bible', 'K1.7.2', DEV],
  ['accidentAngleMinDeg', 10, 0, 20, 'deg', 'bible', 'K1.7.2', DEV],
  ['accidentAngleMaxDeg', 25, 10, 45, 'deg', 'bible', 'K1.7.2', DEV],
  ['accidentLandmarkMinYd', 1, 0, 2, 'yd', 'bible', 'K1.7.2', DEV],
  ['accidentLandmarkMaxYd', 3, 1, 6, 'yd', 'bible', 'K1.7.2', DEV],
  ['accidentStepMinS', 0.15, 0, 0.3, 's', 'bible', 'K1.7.2', DEV],
  ['accidentStepMaxS', 0.30, 0.1, 0.6, 's', 'bible', 'K1.7.2', DEV],
  ['checkpointJumpYd', 1.5, 0.5, 4, 'yd', 'assumption', 'K1.7.2', DEV],

  // K1.7.3 situational lapses
  ['sitBase', 0.98, 0.8, 1, 'probability', 'bible', 'K1.7.3', DEV],
  ['sitKnowledge', 0.25, 0, 0.5, 'probability', 'bible', 'K1.7.3', DEV],
  ['sitYears', 0.03, 0, 0.1, 'probability', 'bible', 'K1.7.3', DEV],
  ['sitYearsFull', 2, 1, 5, 'count', 'bible', 'K1.7.3', DEV],
  ['sitIq', 0.02, 0, 0.05, 'probability/z', 'bible', 'K1.7.3', DEV],
  ['sitMin', 0.5, 0.2, 0.8, 'probability', 'bible', 'K1.7.3', DEV],
  ['sitMax', 0.995, 0.9, 1, 'probability', 'bible', 'K1.7.3', DEV],
  ['sitReminder', 0.05, 0, 0.15, 'probability', 'bible', 'K1.7.3', DEV],

  // K1.4.1 matchup learning
  ['learnMax', 0.25, 0, 0.5, 'z', 'bible', 'K1.4.1', LEARN],
  ['learnHalfReps', 6, 2, 15, 'count', 'bible', 'K1.4.1', LEARN],
  ['learnCarry', 0.25, 0, 0.6, 'ratio', 'bible', 'K1.4.1', LEARN],
  ['learnIqBase', 0.5, 0, 1, 'ratio', 'assumption', 'K1.4.1', LEARN],
  ['learnIqPerZ', 0.25, 0, 0.5, 'ratio/z', 'assumption', 'K1.4.1', LEARN],
  ['learnOthersFrac', 1.0, 0, 1, 'ratio', 'assumption', 'K1.4.1', LEARN],

  // K1.5.1 communication
  ['commBase', 0.5, 0.2, 0.8, 'ratio', 'assumption', 'K1.5.1', COMM],
  ['commPerZ', 0.15, 0, 0.3, 'ratio/z', 'assumption', 'K1.5.1', COMM],
  ['commRecognitionPerZ', 0.05, 0, 0.2, 'ratio/z', 'assumption', 'K1.5.1', COMM],
  ['commNoise', 0.25, 0, 0.6, 'ratio', 'assumption', 'K1.5.1', COMM],
  ['commTempo', 0.10, 0, 0.3, 'ratio', 'assumption', 'K1.5.1', COMM],
  ['commDeliveryK', 0.10, 0, 0.3, 'probability', 'assumption', 'K1.5.1', COMM],
  ['commCorrectMax', 0.6, 0, 1, 'probability', 'assumption', 'K1.5.1', COMM],
  ['commCorrectClockS', 10, 3, 25, 's', 'assumption', 'K1.5.1', COMM],
  ['commHeardBase', 0.9, 0.5, 1, 'probability', 'assumption', 'K1.5.1', COMM],

  // K1.3.2 offensive improvisation
  ['scrambleKnown', 0.98, 0.9, 1, 'probability', 'assumption', 'K1.3.2', SCR],
  ['scrambleUnknown', 0.10, 0, 0.2, 'probability', 'assumption', 'K1.3.2', SCR],
  ['scramblePocketYd', 4, 2, 8, 'yd', 'assumption', 'K1.3.2', SCR],
  ['scrambleDeepYd', 15, 8, 25, 'yd', 'assumption', 'K1.3.2', SCR],
  ['scrambleShortYd', 8, 3, 12, 'yd', 'assumption', 'K1.3.2', SCR],
  ['scrambleGoYd', 15, 5, 30, 'yd', 'assumption', 'K1.3.2', SCR],
  ['scrambleComeBackYd', 5, 2, 10, 'yd', 'assumption', 'K1.3.2', SCR],
  ['adjustAwarenessZ', 1, 0, 2, 'z', 'assumption', 'K1.3.2', SCR],
  ['adjustChemistry', 0.6, 0.2, 1, 'ratio', 'assumption', 'K1.3.2', SCR],
  ['adjustMinDepthYd', 8, 3, 15, 'yd', 'assumption', 'K1.3.2', SCR],
  ['holeRadiusYd', 5, 2, 10, 'yd', 'assumption', 'K1.3.2', SCR],
  ['patienceShiftMax', 0.15, 0, 0.4, 'ratio', 'assumption', 'K1.3.2', 'J8 patience parameter bounds'],
] as const satisfies readonly ParamRow[];

export type PlayerAiParamName = (typeof ROWS)[number][0];
export type PlayerAiParams = Readonly<Record<PlayerAiParamName, number>>;

export const PARAMS: ParamFile = defineParams('playerAi', '0.1.0', ROWS);

/** Resolve once per play, never inside the tick. */
export function playerAiParams(t: ParamTable): PlayerAiParams {
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`playerAi.${row[0]}`);
  return out as PlayerAiParams;
}
