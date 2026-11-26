// Pre-snap phase tuning constants and rule-key manifest (J5). Every number is the starting value of
// the J5 leaf named, or an Assumption where the bible gives no number. No value here is a fact: the
// rates are fitted against J15 rows later (J6.8.1). Rule values (set period, motion rule, radio cut,
// substitution matching, foul catalogue) are read from the rule set by key, never written here.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams, fastParams, type ParamRow } from '../tick/param-util.ts';

const NONE = 'none yet: flagged for J6.8.1 review';
const FS = 'J15.7 false start 2.30 per game (1 of 3)';
const DO = 'J15.7 offside 0.54, NZI 0.33, encroachment 0.12 per game (1 of 3)';
const VEN = 'J5.7.1 home/road split (1 of 3)';
const SUB = 'J15.7 defensive too many men 0.15 per game (1 of 3)';
const READ = 'J5.4.1 acceptance (read accuracy test)';
const PROT = 'J5.4.2 acceptance 2';
const DOG = 'J12.6.1 acceptance 2: delay of game 0.34 home, 0.47 road per 100 snaps (1 of 3)';
const SNAP = 'aborted snaps per scrimmage snap: shotgun 0.247%, under center 0.403%; team-season (centre and QB pair) true sd 0.61 / 0.39 logit (nflverse play-by-play 2018-2025, 1 of 3; research/tuning/dead-skills.md)';
const SCHED = 'J5.8.1 acceptance 1 and 3 (play-clock-at-snap data not yet sourced)';

const ROWS: readonly ParamRow[] = [
  // J5.1.1 substitution run-on and errors.
  ['sub.jogSpeedYps', 6, 4, 8, 'yd/s', 'bible', 'J5.1.1', NONE],
  ['sub.errorBasePerPlayer', 0.002, 0, 0.01, 'probability', 'bible', 'J5.1.1', SUB],
  ['sub.errorHurryMult', 4, 3, 6, 'ratio', 'bible', 'J5.1.1', 'J5.1.1 acceptance 2'],
  ['sub.errorLatePerS', 0.25, 0, 1, '1/s', 'assumption', 'J5.1.1', SUB],
  ['sub.readinessIntercept', 2, 1, 3, 'ratio', 'assumption', 'J5.1.1', SUB],
  ['sub.readinessDivisor', 50, 25, 100, 'iss', 'assumption', 'J5.1.1', SUB],
  ['sub.readinessFloor', 0.25, 0.1, 1, 'ratio', 'assumption', 'J5.1.1', SUB],
  ['sub.extraShare', 0.5, 0, 1, 'probability', 'assumption', 'J5.1.1', SUB],
  // I4.1.1 a kicking unit coming on for a fourth down: dead ball to set, by unit; more when the unit
  // was not alerted on third down; the full run-off and run-on when the coach changed his mind after a
  // unit had started on. The same four starting values as the calling console's marker (console.*Unit*).
  ['unit.puntSetS', 8, 5, 12, 's', 'bible', 'I4.1.1', 'I4.1.1: set with 10 s left in 95% of trials when alerted'],
  ['unit.fieldGoalSetS', 9, 5, 13, 's', 'bible', 'I4.1.1', 'I4.1.1: set with 10 s left in 95% of trials when alerted'],
  ['unit.notAlertedS', 5, 0, 10, 's', 'bible', 'I4.1.1', 'I4.1.1'],
  ['unit.reversalS', 10, 5, 15, 's', 'bible', 'I4.1.1', 'I4.1.1: a reversal leaves under 8 s in a share of trials'],
  // J5.1.2 substitution hold.
  ['hold.capS', 8, 3, 15, 's', 'bible', 'J5.1.2', 'J5.1.2 acceptance'],
  // J5.1.3 huddle delivery.
  // Ruling 2026-11-26: the J5.1.3 target (under 0.5 missed calls a game) wins over the leaf's 0.998,
  // which gives about 1.4. 0.9995 gives 11 x 0.0005 x 62.1 = 0.34. Assumption, to be fitted.
  ['huddle.deliveryBase', 0.9995, 0.99, 1, 'probability', 'assumption', 'J5.1.3', 'J5.1.3 acceptance (under 0.5 misses per game)'],
  ['huddle.longCallWords', 8, 4, 16, 'count', 'assumption', 'J5.1.3', 'J5.1.3 acceptance'],
  ['huddle.longCallPerWord', 0.002, 0, 0.01, 'probability', 'assumption', 'J5.1.3', 'J5.1.3 acceptance'],
  ['huddle.clockCommandPerZ', 0.001, 0, 0.005, 'probability', 'assumption', 'J5.1.3', 'J5.1.3 acceptance'],
  // J5.1.3 no-huddle: the call comes by signal and by the quarterback's voice at the line. The J3.6.1 voice chance
  // (0.97 in silence) is for a call made during the play; taken for the whole play call it gave 40 missed calls a
  // game at home. Base as the huddle's; the noise term is an Assumption sized to the J5.1.3 acceptance
  // ("below 0.5 for a huddle offense at home and rise on the road in loud stadiums at no-huddle").
  ['nohuddle.deliveryBase', 0.9995, 0.99, 1, 'probability', 'assumption', 'J5.1.3', 'J5.1.3 acceptance'],
  ['nohuddle.noiseK', 0.004, 0, 0.02, 'probability', 'assumption', 'J5.1.3', 'J5.1.3 acceptance; J12.8.1 acceptance 1'],
  // I2.1.1 stages 1 to 3 and I2.4.1 garble: the call's way to the huddle runs on the play clock. The decision tail
  // (mean of an exponential lateness of the call) and the noise term of the garble chance are Assumptions fitted to
  // the delay-of-game rates by venue (J12.6.1: 0.34 home, 0.47 road per 100 snaps, 1 of 3).
  // I2.1.1 stage durations the content port fills the relay with: spotting 3 to 6 s (the middle), radio 2 s and
  // signals 3 s (I2.4.1). The caller's usual decision time and the seconds per spoken word are Assumptions (a long
  // call "took a full three seconds" to read, I2.4.1, 1 of 3: about 8 words).
  ['relay.spottingS', 4.5, 3, 6, 's', 'bible', 'I2.1.1', DOG],
  ['relay.decisionS', 6, 2, 12, 's', 'assumption', 'I2.1.1', DOG],
  ['relay.radioS', 2, 1, 4, 's', 'bible', 'I2.4.1', DOG],
  ['relay.signalS', 3, 1, 6, 's', 'bible', 'I2.4.1', DOG],
  ['relay.perWordS', 0.4, 0.2, 0.8, 's', 'assumption', 'I2.4.1', DOG],
  ['relay.decisionTailS', 3.5, 0.5, 6, 's', 'assumption', 'I2.1.1', DOG],
  // J12.6.1 "noise lengthens the visiting offense's call relay and huddle-to-snap time": seconds added per unit of
  // noise the offense hears (the call is said twice, the huddle leans in). Assumption, fitted with the tail above.
  ['relay.noiseSlowS', 1.3, 0, 5, 's', 'assumption', 'J12.6.1', DOG],
  ['relay.garbleBase', 0.005, 0, 0.05, 'probability', 'bible', 'I2.4.1', DOG],
  ['relay.garblePerNoise', 0.05, 0, 0.5, 'probability', 'assumption', 'I2.4.1', DOG],
  ['relay.garblePerWord', 0.002, 0, 0.02, 'probability', 'assumption', 'I2.4.1', DOG],
  ['huddle.breakS', 3, 1, 6, 's', 'assumption', 'J5.1.3', SCHED],
  // J5.2 alignment.
  ['align.lineSplitYd', 0.7, 0.3, 1.5, 'yd', 'bible', 'J5.2.1', 'J5.2.1 acceptance'],
  ['align.sidelineMarginYd', 2, 0.5, 5, 'yd', 'assumption', 'J5.2.1', 'J5.2.1 acceptance'],
  ['align.errorBase', 0.003, 0, 0.02, 'probability', 'assumption', 'J5.2.1', 'J15.7 illegal formation 0.29 per game (1 of 3)'],
  ['align.errorOffYd', 1.5, 1, 3, 'yd', 'assumption', 'J5.2.1', 'J15.7 illegal formation 0.29 per game (1 of 3)'],
  ['align.arriveYd', 0.25, 0.05, 1, 'yd', 'assumption', 'J5.2.1', NONE],
  ['align.shadeYd', 0.35, 0.2, 0.6, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.gapSplitFrac', 0.5, 0.3, 0.7, 'ratio', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.lbDepthYd', 4.5, 3, 7, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.pressDepthYd', 1, 0.5, 2, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.offDepthMinYd', 6, 4, 8, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.offDepthMaxYd', 8, 6, 10, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.leverageMinYd', 0.5, 0.25, 1, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.leverageMaxYd', 1, 0.5, 2, 'yd', 'bible', 'J5.2.2', 'J5.2.2 acceptance'],
  ['align.defCommS', 1, 0.3, 2.5, 's', 'assumption', 'J5.2.2', SCHED],
  // J5.3.1 shifts and motion.
  ['motion.snapTimingSdS', 0.15, 0.05, 0.3, 's', 'bible', 'J5.3.1', 'J15.7 illegal shift 0.15 per game (1 of 3)'],
  ['motion.snapTimingSdPerZ', 0.02, 0, 0.05, 's', 'assumption', 'J5.3.1', 'J15.7 illegal shift 0.15 per game (1 of 3)'],
  ['motion.snapTimingSdMinS', 0.03, 0.01, 0.1, 's', 'assumption', 'J5.3.1', NONE],
  // J5.3.2 and J5.5.2 defensive checks.
  ['check.minS', 0.5, 0.3, 1, 's', 'bible', 'J5.3.2', 'J5.8.1 acceptance 1'],
  ['check.maxS', 1.5, 1, 2.5, 's', 'bible', 'J5.3.2', 'J5.8.1 acceptance 1'],
  ['check.midS', 1, 0.5, 1.5, 's', 'assumption', 'J5.3.2', 'J5.8.1 acceptance 1'],
  ['check.perZS', 0.1, 0, 0.3, 's', 'assumption', 'J5.3.2', 'J5.8.1 acceptance 1'],
  ['check.recognitionBaseS', 0.5, 0.2, 1, 's', 'assumption', 'J5.5.2', 'J5.8.1 acceptance 1'],
  ['check.recognitionPerZS', 0.08, 0, 0.2, 's', 'assumption', 'J5.5.2', 'J5.8.1 acceptance 1'],
  ['check.recognitionFloorS', 0.2, 0.05, 0.5, 's', 'assumption', 'J5.5.2', 'J5.8.1 acceptance 1'],
  ['check.recognizeIntercept', 2.5, 1, 4, 'ratio', 'assumption', 'J5.5.2', 'J5.5.2 acceptance'],
  ['check.recognizePerZ', 0.5, 0, 1, 'ratio', 'assumption', 'J5.5.2', 'J5.5.2 acceptance'],
  ['check.bluffAlignCostYd', 0.5, 0, 1.5, 'yd', 'assumption', 'J5.3.2', 'J5.3.2 acceptance'],
  ['check.bunchWidthYd', 2.5, 1, 4, 'yd', 'assumption', 'J5.5.2', NONE],
  ['check.emptyDepthYd', 2, 1, 4, 'yd', 'assumption', 'J5.5.2', NONE],
  // J5.4.1 shell read and box count.
  ['read.intercept', 1.5, 0.5, 2.5, 'ratio', 'bible', 'J5.4.1', READ],
  ['read.perZ', 0.7, 0.3, 1.2, 'ratio', 'bible', 'J5.4.1', READ],
  ['read.disguiseK', 1, 0.5, 2, 'ratio', 'bible', 'J5.4.1', READ],
  ['read.preparedK', 0.3, 0, 0.6, 'ratio', 'bible', 'J5.4.1', READ],
  ['read.boxIntercept', 5, 3, 7, 'ratio', 'assumption', 'J5.4.1', READ],
  ['read.motionTellK', 1.5, 0, 3, 'ratio', 'assumption', 'J5.3.2', 'J5.3.2 acceptance'],
  ['read.minTimeS', 2, 1, 3, 's', 'bible', 'J5.4.1', READ],
  ['read.boxDepthYd', 7, 5, 9, 'yd', 'assumption', 'J5.4.1', READ],
  ['read.boxWidthYd', 5, 3, 7, 'yd', 'assumption', 'J5.4.1', READ],
  ['read.highSafetyDepthYd', 10, 8, 14, 'yd', 'assumption', 'J5.4.1', READ],
  // J5.4.2 protection.
  ['prot.setS', 1, 0.3, 2, 's', 'assumption', 'J5.4.2', SCHED],
  ['prot.intercept', 2, 1, 3, 'ratio', 'assumption', 'J5.4.2', PROT],
  ['prot.perZ', 0.7, 0.3, 1.2, 'ratio', 'assumption', 'J5.4.2', PROT],
  ['prot.disguiseK', 1, 0.5, 2, 'ratio', 'assumption', 'J5.4.2', PROT],
  ['prot.simulatedK', 0.5, 0, 1.5, 'ratio', 'assumption', 'J5.4.2', PROT],
  ['prot.noiseK', 0.5, 0, 1.5, 'ratio', 'assumption', 'J5.4.2', PROT],
  ['prot.rusherDepthYd', 2.5, 1, 4, 'yd', 'assumption', 'J5.4.2', PROT],
  // J5.4.3 checks and audibles.
  ['audible.killS', 2, 1, 3, 's', 'bible', 'J5.4.3', 'J5.4.3 acceptance'],
  ['audible.fullS', 3.5, 3, 4, 's', 'bible', 'J5.4.3', 'J5.4.3 acceptance'],
  ['audible.hardCountS', 1, 0.5, 2, 's', 'assumption', 'J5.8.1', SCHED],
  // J5.5.1 disguise.
  ['disguise.base', 0.5, 0.3, 0.7, 'ratio', 'bible', 'J5.5.1', 'J5.5.1 acceptance'],
  ['disguise.perZ', 0.1, 0, 0.2, 'ratio', 'bible', 'J5.5.1', 'J5.5.1 acceptance'],
  ['disguise.leadK', 0.25, 0.1, 0.5, '1/s', 'bible', 'J5.5.1', 'J5.5.1 acceptance'],
  ['disguise.leadBaseS', 1, 0.3, 2, 's', 'assumption', 'J5.5.1', 'J5.5.1 acceptance'],
  ['disguise.leadSdS', 0.3, 0, 0.6, 's', 'assumption', 'J5.5.1', 'J5.5.1 acceptance'],
  // J5.6.1 get-off.
  ['getoff.silentMinS', 0.05, 0, 0.1, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.silentMaxS', 0.15, 0.1, 0.25, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.silentPerZS', 0.025, 0, 0.05, 's', 'assumption', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.keyDelayBaseS', 0.2, 0.1, 0.3, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.keyDelayPerZS', 0.04, 0, 0.08, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.keyDelayFloorS', 0.08, 0.04, 0.12, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.anticipationMaxS', 0.08, 0, 0.15, 's', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.anticipationSnaps', 6, 3, 10, 'count', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.a0PerS', 3, 1, 5, '1/s', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  ['getoff.a0Min', -0.3, -0.5, -0.1, 'ratio', 'bible', 'J5.6.1', 'J5.6.1 acceptance'],
  // J5.6.2 snap exchange (event contest, J6.1.3).
  ['snap.offTargetShotgun', 0.015, 0.005, 0.04, 'probability', 'bible', 'J5.6.2', 'J5.6.2 acceptance (rate unmeasured, R3)'],
  ['snap.looseShotgun', 0.0025, 0.0005, 0.005, 'probability', 'bible', 'J5.6.2', SNAP],
  ['snap.underCenterOffTargetMult', 0.3, 0.1, 1, 'ratio', 'assumption', 'J5.6.2', 'J5.6.2 acceptance (rate unmeasured, R3)'],
  ['snap.underCenterLooseMult', 1.6, 0.5, 2, 'ratio', 'assumption', 'J5.6.2', SNAP],
  ['snap.beta1', 0.7, 0, 1.2, 'per z', 'assumption', 'J5.6.2', SNAP],
  ['snap.wetGamma', 0.5, 0, 1.5, 'ratio', 'assumption', 'J5.6.2', 'J5.6.2 acceptance: rate rises in rain'],
  ['snap.silentGamma', 0.2, 0, 1, 'ratio', 'assumption', 'J5.6.2', NONE],
  ['snap.offTargetMinS', 0.2, 0.1, 0.4, 's', 'bible', 'J5.6.2', NONE],
  ['snap.offTargetMaxS', 0.6, 0.4, 1, 's', 'bible', 'J5.6.2', NONE],
  // J5.7.1 pre-snap foul hazards. Base rates are starting values derived from the J15 rows named, to be fitted.
  ['foul.baseFalseStartLine', 0.0028, 0.0005, 0.01, 'probability', 'assumption', 'J5.7.1', FS],
  ['foul.baseFalseStartOther', 0.0008, 0.0001, 0.005, 'probability', 'assumption', 'J5.7.1', FS],
  ['foul.baseDefOffside', 0.0016, 0.0003, 0.006, 'probability', 'assumption', 'J5.7.1', DO],
  ['foul.discIntercept', 2, 1.5, 2.5, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.discDivisor', 50, 40, 60, 'iss', 'bible', 'J5.7.1', FS],
  ['foul.discFloor', 0.25, 0.1, 0.5, 'ratio', 'bible', 'J5.7.1', FS],
  // J5.7.1 starts g_noise at 0.7 "to be fitted"; J12.6.1 (measured later) gives the direct false-start term "little
  // or no noise weight, because measured road false starts show no excess" (1.63 road, 1.68 home per 100 snaps), and
  // its acceptance 2 wants home and road within 8%. At 0.7 the road rate was 1.4 to 1.5 times the home rate.
  ['foul.gNoise', 0.05, 0, 1.5, 'per unit', 'bible', 'J12.6.1', 'J12.6.1 acceptance 2 (false starts within 8% home and road)'],
  ['foul.gHard', 0.4, 0, 1, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.gStem', 0.3, 0, 1, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.gRush', 0.3, 0, 1, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.gLong', 0.2, 0, 1, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.gFatigue', 0.2, 0, 1, 'per unit', 'bible', 'J5.7.1', FS],
  ['foul.gHardOpp', 0.5, 0, 1, 'ratio', 'bible', 'J5.7.1', DO],
  ['foul.gAnticip', 0.4, 0, 1, 'ratio', 'bible', 'J5.7.1', DO],
  ['foul.gAggr', 0.3, 0, 1, 'ratio', 'bible', 'J5.7.1', DO],
  ['foul.formOffside', 0.54, 0, 1, 'weight', 'assumption', 'J5.7.1', DO],
  ['foul.formNeutralZone', 0.33, 0, 1, 'weight', 'assumption', 'J5.7.1', DO],
  ['foul.formEncroachment', 0.12, 0, 1, 'weight', 'assumption', 'J5.7.1', DO],
  ['foul.closeProximityYd', 1.5, 0.5, 3, 'yd', 'assumption', 'J5.7.1', DO],
  // J5.7.1: "calibration fits the noise weights first, then sets this term to close the remaining gap". The measured
  // offensive split (2.194 road, 2.087 home per 100 snaps, all pre-snap fouls) is 0.107, and the delay-of-game split
  // that the relay now produces from the clock is 0.13 (0.47 against 0.34): nothing is left for the venue term on
  // offense. The defensive pair keeps the J5.7.1 starting values.
  ['foul.venueRoadOffense', 1, 1, 1.1, 'ratio', 'bible', 'J5.7.1', VEN],
  ['foul.venueHomeOffense', 1, 0.9, 1, 'ratio', 'bible', 'J5.7.1', VEN],
  ['foul.venueRoadDefense', 1.066, 1, 1.2, 'ratio', 'bible', 'J5.7.1', VEN],
  ['foul.venueHomeDefense', 0.934, 0.8, 1, 'ratio', 'bible', 'J5.7.1', VEN],
  ['foul.teamStandards', 1, 0.85, 1.15, 'ratio', 'bible', 'J5.7.1', FS],
  ['foul.severity', 0.5, 0, 1, 'ratio', 'assumption', 'J5.7.1', NONE],
  // J5.8.1 schedule. Target play-clock reading at the snap by tempo: real distributions are not sourced (J5.8.1 open question).
  ['sched.targetClockHuddleS', 5, 0, 15, 's', 'assumption', 'J5.8.1', SCHED],
  ['sched.targetClockNoHuddleS', 12, 0, 30, 's', 'assumption', 'J5.8.1', SCHED],
  ['sched.targetClockHurryS', 38, 25, 40, 's', 'assumption', 'J5.8.1', SCHED],
  ['sched.forcedMarginS', 0.3, 0, 1, 's', 'assumption', 'J5.8.1', SCHED],
  ['sched.strengthS', 0.5, 0.2, 1, 's', 'assumption', 'J5.8.1', SCHED],
];

export const PARAMS: ParamFile = defineParams('presnap', '0.1.0', ROWS);

export type PresnapParams = Readonly<Record<string, number>>;

/** Resolve once per play, never inside the tick. Property names are the row names above. */
export function presnapParams(t: ParamTable): PresnapParams {
  // The pre-snap stages ask every tick; the rows of one table are read once (P6.3.1).
  if (memoTable === t && memo !== null) return memo;
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`presnap.${row[0]}`);
  const fast = fastParams(out);
  memoTable = t; memo = fast;
  return fast;
}
let memoTable: ParamTable | null = null, memo: PresnapParams | null = null;

const READ_BY = ['engine-core.presnap'];

/** Pre-snap fouls this module can commit, by catalogue id (WP-01 `fouls.json`). */
export const PRESNAP_FOUL_IDS = [
  'false_start', 'offside', 'encroachment', 'neutral_zone_infraction', 'delay_of_game',
  'illegal_formation', 'illegal_shift', 'illegal_motion', 'too_many_in_formation', 'too_many_on_field',
] as const;
export type PresnapFoulId = (typeof PRESNAP_FOUL_IDS)[number];

/** Keys in the WP-01 dictionary that this module reads. The foul catalogue rows are read through `foul.<id>.exists`. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'formation.shift_set_seconds', type: 'number', unit: 's', meaning: 'Time all offensive players must be set after a shift', ownerLeaf: 'B4.3.1', readBy: READ_BY },
  { key: 'formation.motion_rule', type: 'option', options: ['one_back_not_forward'], meaning: 'Who may be in motion at the snap', ownerLeaf: 'B4.3.3', readBy: READ_BY },
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players per team on the field', ownerLeaf: 'B2.3.1', readBy: READ_BY },
  { key: 'substitution.match_window', type: 'boolean', meaning: 'After the offense substitutes, the snap is held until the defense has had the chance to substitute', ownerLeaf: 'B2.4.3', readBy: READ_BY },
  { key: 'comm.c2p_cutoff_seconds', type: 'number', unit: 's', meaning: 'Play clock reading at which the helmet radio cuts off', ownerLeaf: 'B2.5.1', readBy: READ_BY },
  ...PRESNAP_FOUL_IDS.map((id) => ({ key: `foul.${id}.exists`, type: 'boolean' as const, meaning: `The foul ${id} exists in this rule set`, ownerLeaf: 'B8.1.2', readBy: READ_BY })),
];
