// Quarterback model tuning constants (bible J7, work package WP-20).
//
// Basis 'bible' means J7 states the number as a starting value. J7 itself marks nearly all of them
// Assumption: the leaf gives a starting point to be fitted to the J15 rates, not a measurement.
// Basis 'assumption' means this module's author chose the number because the leaf gives a direction
// and no size. NO ROW HERE IS A MEASURED FOOTBALL FACT. The measured rates J7 cites (time to throw,
// interception, sack, scramble and throwaway rates, completion clean and under pressure) are TARGETS
// that constrain these rows through calibration (J15, Q2); they are named in `constrainedBy` and are
// never typed into the model as outputs.
//
// The expected-points numbers (`value.*`) are stand-ins for the N2 model, which lives in the game
// layer. The caller passes its own value function when it has one; these rows only keep the module
// runnable on its own.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams, fastParams, type ParamRow } from '../tick/param-util.ts';

const TTT = 'J15 time to throw 2.68 s (1 of 3); J7.1.1 acceptance';
const PROG = 'J7.2.1 acceptance (read 3 at tSet + 1.1 s for grade 50)';
const EST = 'J7.3.1 acceptance (estimate error falls with coverage reading)';
const RATES = 'J15 interception, sack, scramble and throwaway rates, fitted together (J7.3.2, J7.4.2)';
const HOT = 'J7.3.3 acceptance (ball out under 1.8 s on 90% of recognised hot throws)';
const SACK = 'J7.4.1 acceptance; J15 sack rate and strip-sack share';
const SCR = 'J15 scramble rate 4.9% of dropbacks (1 of 3); J7.5.1 acceptance';
const GRD = 'J15 grounding flags per game 0.16 (1 of 3); J7.5.2 acceptance';
const ARM = 'J7.6.1 acceptance; open question: sourced ball velocity (R3)';
const ACC = 'J15.4.1 completion by depth; clean 70.1% and pressured 40.9% completion (1 of 3)';
const MESH = 'J7.7.1 acceptance';
const CLOCK = 'J7.8.1 acceptance';
const FREE = 'J7.8.2 acceptance (free-play air yards at least twice normal)';
const N2 = 'N2 expected points model (replaces this stand-in)';
const STRUCT = 'none: structural';
const LEVEL = 'equal rosters at 25, 40, 50 and 75: sack, pressure and completion rates do not move with the level (ruling 2026-11-26)';

const ROWS = [
  // Ruling 2026-11-26: the share of the other eleven's reading grades set against each quarterback grade that has no
  // opponent term of its own (accuracy, pocket movement, anticipation, the reads of coverage and blitz, football
  // intelligence, ball handling, composure). 1: equal rosters play the 50 v 50 game at any level. 0: the leaf's formulas.
  ['oppose.gradeShare', 1, 0, 1, 'ratio', 'assumption', 'J7.1.1', LEVEL],
  // J7.1.1 drops: set time and depth at grade 50
  ['drop.gunQuick.setS', 0.9, 0.6, 1.2, 's', 'bible', 'J7.1.1', TTT],
  ['drop.gunQuick.depthYd', 5, 4, 6, 'yd', 'bible', 'J7.1.1', TTT],
  ['drop.gun3.setS', 1.5, 1.2, 1.8, 's', 'bible', 'J7.1.1', TTT],
  ['drop.gun3.depthYd', 7, 6, 8, 'yd', 'bible', 'J7.1.1', TTT],
  ['drop.uc3.setS', 1.6, 1.3, 1.9, 's', 'bible', 'J7.1.1', TTT],
  ['drop.uc3.depthYd', 5, 4, 6, 'yd', 'bible', 'J7.1.1', TTT],
  ['drop.uc5.setS', 2.1, 1.8, 2.4, 's', 'bible', 'J7.1.1', TTT],
  ['drop.uc5.depthYd', 7, 6, 8, 'yd', 'bible', 'J7.1.1', TTT],
  ['drop.uc7.setS', 2.7, 2.4, 3.0, 's', 'bible', 'J7.1.1', TTT],
  ['drop.uc7.depthYd', 9, 8, 10, 'yd', 'bible', 'J7.1.1', TTT],
  ['drop.footworkPerZS', 0.05, 0, 0.1, 's/z', 'bible', 'J7.1.1', TTT],
  // The other side of the drop: seconds per z of the rush he is dropping away from. Same size as his own slope.
  ['drop.rushPerZS', 0.05, 0, 0.1, 's/z', 'assumption', 'J7.1.1', LEVEL],
  // He is "at" the launch point inside this distance (J7.1.1 acceptance tolerance).
  ['drop.arriveYd', 0.5, 0.2, 1, 'yd', 'bible', 'J7.1.1', STRUCT],

  // J7.1.2 anticipation
  ['anticipation.maxEarlyS', 0.3, 0.1, 0.5, 's', 'bible', 'J7.1.2', 'J7.1.2 acceptance (grade 70 gets more separation at arrival than grade 30)'],
  // The leaf gives the cap and no curve: none at z = -span, the full cap at z = +span.
  ['anticipation.zSpan', 2, 1, 3, 'z', 'assumption', 'J7.1.2', 'J7.1.2 acceptance'],
  ['anticipation.errorMult', 1.08, 1, 1.3, 'ratio', 'assumption', 'J7.6.2', ACC],
  // Longest he stays on a read whose break has not come before he moves on.
  ['read.maxWaitS', 0.6, 0.2, 1.2, 's', 'assumption', 'J7.1.2', TTT],

  // J7.2.1 progression
  ['read.tReadBaseS', 0.55, 0.4, 0.7, 's', 'bible', 'J7.2.1', PROG],
  ['read.tReadPerZS', 0.08, 0, 0.15, 's/z', 'bible', 'J7.2.1', PROG],
  // The other side of a read: seconds per z of the coverage he is sorting out. Same size as his own slope.
  ['read.coveragePerZS', 0.08, 0, 0.15, 's/z', 'assumption', 'J7.2.1', LEVEL],
  ['read.tReadFloorS', 0.30, 0.2, 0.4, 's', 'bible', 'J7.2.1', PROG],
  // Tuned from the bible's 2 against J15.4.1 sacks per pressure: with a rusher on him he may dump it to the back from his first read on.
  ['read.checkdownAfter', 1, 1, 3, 'reads', 'bible', 'J7.3.3', PROG],
  ['read.maxPasses', 2, 1, 3, 'count', 'assumption', 'J7.2.1', TTT],
  // J7.2.1 step 4: reading the key defender right.
  ['read.keyBeta0', 1.2, 0, 3, 'logit', 'assumption', 'J7.2.1', EST],
  ['read.keyPerZ', 0.6, 0, 1.5, 'logit/z', 'assumption', 'J7.2.1', EST],
  ['read.keySinkYps', 1, 0.2, 3, 'yd/s', 'assumption', 'J7.2.1', EST],

  // J7.3.1 judging open
  ['judge.sepSdBaseYd', 1.2, 0.6, 2, 'yd', 'bible', 'J7.3.1', EST],
  ['judge.sepSdPerZYd', 0.25, 0, 0.5, 'yd/z', 'bible', 'J7.3.1', EST],
  ['judge.sepSdFloorYd', 0.3, 0.1, 0.6, 'yd', 'bible', 'J7.3.1', EST],
  // What he assumes about a defender he is watching. League-typical guesses, never the defender's true values.
  // Tuned from 7.5 (Assumption): he rated every trailing defender slower than the receiver, so a man a step behind
  // fell out of the play in his head on any throw over a second in the air.
  ['judge.defenderSpeedYps', 9, 6, 9, 'yd/s', 'assumption', 'J7.3.1', EST],
  ['judge.defenderReactS', 0.25, 0.1, 0.5, 's', 'assumption', 'J7.3.1', EST],
  ['judge.accelLagS', 0.35, 0, 0.8, 's', 'assumption', 'J7.3.1', EST],
  ['judge.routeSpeedYps', 7, 5, 9, 'yd/s', 'assumption', 'J7.3.1', EST],
  // Where his eyes go for a man he has not picked up yet and has no drawn route for (J3.4.1).
  ['look.downfieldYd', 10, 5, 20, 'yd', 'assumption', 'J7.2.1', STRUCT],
  ['judge.movingYps', 2, 0.5, 4, 'yd/s', 'assumption', 'J7.3.1', STRUCT],
  // League-typical receiver legs for walking a route through its break (J2.1.3, J2.2), used when the
  // play gives him no numbers for his own receiver. The brake value is J2.2.2's base.
  ['judge.routeTauS', 0.9, 0.5, 1.5, 's', 'assumption', 'J7.3.1', EST],
  ['judge.routeBrakeYps2', 8, 6, 11, 'yd/s^2', 'assumption', 'J7.3.1', EST],
  ['judge.breakHorizonS', 4, 2, 6, 's', 'assumption', 'J7.1.2', STRUCT],
  // Height a lane defender gets a hand to: standing reach of a 6 ft 2 in man (catch.reachPerHeight 1.3) plus a small jump.
  ['judge.laneReachHeightYd', 2.8, 2.2, 3.4, 'yd', 'assumption', 'J7.6.1', EST],
  ['judge.laneRadiusYd', 1.0, 0.5, 2, 'yd', 'assumption', 'J7.3.1', EST],
  ['judge.laneReachYps', 3, 1, 6, 'yd/s', 'assumption', 'J7.3.1', EST],
  ['judge.laneNearYd', 1.5, 0.5, 3, 'yd', 'assumption', 'J7.3.1', STRUCT],
  ['judge.laneUnderYd', 2, 1, 4, 'yd', 'assumption', 'J7.3.1', STRUCT],
  ['judge.lanePickShare', 0.35, 0.1, 0.7, 'probability', 'assumption', 'J7.3.1', RATES],
  // J6.5 reach test "given where he can get to": how far he expects the receiver to adjust to the ball in flight.
  ['judge.reachAdjustYd', 1.0, 0, 2.5, 'yd', 'assumption', 'J7.3.1', 'J7.3.1 acceptance; J15 completion by depth (DP-1)'],
  // A receiver running at the sideline turns up it this far inside (football-lang `route.sidelineRoomYd`).
  ['judge.sidelineRoomYd', 2, 0.5, 5, 'yd', 'assumption', 'J7.3.1', STRUCT],
  // Tuned from 0.10 (Assumption) against J15.4.1 interceptions by depth: an off-target ball into coverage is picked far
  // more often than one on target, and at 0.10 a covered deep throw still rated above his threshold.
  ['judge.missPickContested', 0.25, 0, 0.3, 'probability', 'assumption', 'J7.3.1', RATES],
  ['judge.missPickOpen', 0.02, 0, 0.1, 'probability', 'assumption', 'J7.3.1', RATES],
  // Added share of off-target balls picked per yard of air beyond the short band, receiver judged open (J15 interceptions by depth).
  ['judge.missPickOpenPerYd', 0.002, 0, 0.01, 'probability/yd', 'assumption', 'J7.3.1', RATES],
  ['judge.positionTolYd', 0.5, 0.2, 1.5, 'yd', 'assumption', 'J7.3.1', STRUCT],
  ['judge.undercutLateralYd', 2, 1, 4, 'yd', 'assumption', 'J7.3.1', STRUCT],
  ['judge.yacBaseYd', 2, 0, 5, 'yd', 'assumption', 'J7.3.1', 'J15 yards after catch (N2)'],
  ['judge.yacPerSepYd', 0.8, 0, 2, 'yd/yd', 'assumption', 'J7.3.1', 'J15 yards after catch (N2)'],
  ['judge.yacMaxYd', 8, 3, 15, 'yd', 'assumption', 'J7.3.1', 'J15 yards after catch (N2)'],
  ['judge.alertBonusEp', 0.15, 0, 0.5, 'EP', 'assumption', 'J7.3.1', RATES],
  ['judge.alertLeadYd', 1, 0, 3, 'yd', 'assumption', 'J7.3.1', RATES],

  // Stand-in for the N2 expected points model.
  ['value.epPerYd', 0.065, 0.03, 0.1, 'EP/yd', 'assumption', 'J7.3.1', N2],
  ['value.turnoverCostEp', 4, 2, 6, 'EP', 'assumption', 'J7.3.1', N2],
  // What the lost down costs when a throw is neither caught nor intercepted. At 0 a covered deep throw (one chance
  // in four for 25 yards) rated above his threshold; tuned against J15.4.1 air yards per attempt and completion (1 of 3, 2 of 3).
  ['value.incompleteCostEp', 0.3, 0, 0.8, 'EP', 'assumption', 'J7.3.1', N2],
  ['value.conversionBonusEp', 0.9, 0, 2, 'EP', 'assumption', 'J7.3.2', N2],
  ['value.conversionDownFrom', 3, 2, 4, 'down', 'assumption', 'J7.3.2', N2],

  // J7.3.2 throw threshold
  ['risk.offsetPer10', 0.04, 0, 0.1, 'EP per 10 grade', 'bible', 'J7.3.2', RATES],
  ['risk.instructionOffsetEp', 0.08, 0, 0.2, 'EP', 'bible', 'J7.3.2', RATES],
  ['risk.timeDecayEpPerS', 0.05, 0, 0.2, 'EP/s', 'bible', 'J7.3.2', RATES],
  ['risk.pressureDropEp', 0.15, 0, 0.4, 'EP', 'bible', 'J7.3.2', RATES],
  ['risk.pressureWindowS', 1.0, 0.5, 1.5, 's', 'bible', 'J7.3.2', RATES],
  ['risk.intCeiling', 0.25, 0.1, 0.4, 'probability', 'bible', 'J7.3.2', RATES],
  ['risk.intCeilingTrailing', 0.40, 0.25, 0.6, 'probability', 'bible', 'J7.3.2', RATES],
  ['risk.trailingClockS', 480, 240, 900, 's', 'bible', 'J7.3.2', RATES],
  ['risk.lastPeriod', 4, 4, 4, 'period', 'bible', 'J7.3.2', STRUCT],

  // J7.3.3 hot throws
  ['hot.seeBeta0', 1.5, 0, 3, 'logit', 'assumption', 'J7.3.3', HOT],
  ['hot.seePerZ', 0.6, 0, 1.5, 'logit/z', 'assumption', 'J7.3.3', HOT],
  ['hot.preSnapBonus', 1.0, 0, 2, 'logit', 'assumption', 'J7.3.3', HOT],
  ['hot.comePx', 1, 0, 3, 'yd', 'assumption', 'J7.3.3', HOT],
  ['hot.comeYps', 1, 0.2, 3, 'yd/s', 'assumption', 'J7.3.3', HOT],

  // J7.4.1 feeling pressure
  ['pressure.feltAdvantage', -0.5, -0.8, -0.2, 'A', 'bible', 'J7.4.1', SACK],
  ['pressure.feltDistYd', 3, 2, 4, 'yd', 'bible', 'J7.4.1', SACK],
  ['pressure.imminentS', 0.6, 0.3, 0.9, 's', 'bible', 'J7.4.1', SACK],
  ['pressure.feelBase', 0.15, 0.05, 0.3, 'probability per tick', 'bible', 'J7.4.1', SACK],
  ['pressure.feelPerZ', 0.07, 0, 0.15, 'probability/z', 'bible', 'J7.4.1', SACK],
  ['pressure.feelMin', 0.02, 0.02, 0.02, 'probability', 'bible', 'J7.4.1', STRUCT],
  ['pressure.feelMax', 0.50, 0.50, 0.50, 'probability', 'bible', 'J7.4.1', STRUCT],
  ['pressure.falseMax', 0.20, 0.1, 0.3, 'probability', 'bible', 'J7.4.1', SACK],
  ['pressure.falsePerHit', 0.02, 0, 0.05, 'probability', 'bible', 'J7.4.1', SACK],
  ['pressure.falseAfterSetS', 0.4, 0, 1, 's', 'assumption', 'J7.4.1', SACK],
  ['pressure.faceConeDeg', 30, 15, 60, 'deg', 'assumption', 'J7.4.1', SACK],
  ['pressure.minClosingYps', 0.5, 0.1, 2, 'yd/s', 'assumption', 'J7.4.1', STRUCT],

  // J7.4.2 response
  ['pressure.eyesBase', 0.6, 0.3, 0.9, 'probability per tick', 'bible', 'J7.4.2', RATES],
  ['pressure.eyesPerZ', 0.1, 0, 0.2, 'probability/z', 'bible', 'J7.4.2', RATES],
  ['pressure.eyesMin', 0.1, 0.1, 0.1, 'probability', 'bible', 'J7.4.2', STRUCT],
  ['pressure.eyesMax', 0.95, 0.95, 0.95, 'probability', 'bible', 'J7.4.2', STRUCT],
  ['pressure.softmaxTempEp', 0.1, 0.03, 0.3, 'EP', 'bible', 'J7.4.2', RATES],
  ['resp.pocketEp', -0.05, -0.5, 0.5, 'EP', 'assumption', 'J7.4.2', RATES],
  ['resp.pocketPerZEp', 0.06, 0, 0.2, 'EP/z', 'assumption', 'J7.4.2', RATES],
  ['resp.escapeEp', -0.10, -0.5, 0.5, 'EP', 'assumption', 'J7.4.2', RATES],
  ['resp.escapePerZEp', 0.07, 0, 0.2, 'EP/z', 'assumption', 'J7.4.2', RATES],
  ['resp.escapeCodPerZEp', 0.03, 0, 0.1, 'EP/z', 'assumption', 'J7.4.2', RATES],
  // Tuned from -0.15 (Assumption) against J15.4.1 sacks per pressure.
  ['resp.throwAwayEp', 0.2, -0.6, 0.2, 'EP', 'assumption', 'J7.4.2', RATES], // tuned from 0: a pressured passer threw it away too rarely (pressured completion 58.5% against real 48.1%, sacks per pressure 0.27 against 0.155)
  ['resp.sackEp', -0.45, -1.5, 0, 'EP', 'assumption', 'J7.4.2', RATES],
  ['resp.protectBallEp', 0.15, 0, 0.5, 'EP', 'assumption', 'J7.4.2', RATES],
  // Seconds after a pocket move before the same rusher, on him again, gets a second answer (throw now, throw away or go down).
  ['resp.secondAnswerS', 0.5, 0.1, 0.8, 's', 'assumption', 'J7.4.2', RATES],
  ['pocket.stepYd', 1.5, 0.5, 3, 'yd', 'assumption', 'J7.4.2', SACK],
  ['pocket.minBehindLineYd', 1.5, 0.5, 3, 'yd', 'assumption', 'J7.4.2', STRUCT],
  ['pocket.defaultHalfWidthYd', 4.5, 3, 6, 'yd', 'assumption', 'J7.5.2', GRD],
  // J6.2.5 arrival: a rusher who just missed cannot try again at once; two hands on the ball; the stumble.
  // Bodies that collide never overlap (J2.6), so "reached him" is a small gap between the body circles, not zero.
  ['arrival.contactGapYd', 0.1, 0, 0.5, 'yd', 'assumption', 'J6.2.5', SACK],
  ['arrival.rearmS', 0.5, 0.2, 1, 's', 'assumption', 'J6.2.5', SACK],
  ['arrival.secondRusherYd', 2, 1, 4, 'yd', 'assumption', 'J6.2.5', SACK],
  ['arrival.twoHandsZ', 1, 0, 2, 'z', 'assumption', 'J7.4.2', SACK],
  ['arrival.stumbleS', 0.3, 0.1, 0.6, 's', 'assumption', 'J6.2.5', SACK],
  ['arrival.hitAfterReleaseS', 0.3, 0.1, 0.6, 's', 'assumption', 'J6.2.5', 'J15 quarterback hits per game'],

  // J7.5.1 scramble
  // Tuned from -3.6 (Assumption) against J15.4.1 scramble share: he weighs a run only when his reads run out.
  ['scramble.s0', -2.4, -6, 0, 'logit', 'assumption', 'J7.5.1', SCR],
  ['scramble.s1', 0.5, 0, 1.5, 'logit/z', 'bible', 'J7.5.1', SCR],
  ['scramble.s2', 1.0, 0, 2, 'logit', 'bible', 'J7.5.1', SCR],
  ['scramble.s3', 0.8, 0, 2, 'logit', 'bible', 'J7.5.1', SCR],
  ['scramble.s4', 1.0, 0, 2, 'logit', 'bible', 'J7.5.1', SCR],
  ['scramble.s5', 0.5, 0, 1.5, 'logit', 'bible', 'J7.5.1', SCR],
  ['scramble.s6', 1.0, 0, 2, 'logit', 'bible', 'J7.5.1', SCR],
  ['scramble.shortYd', 4, 2, 6, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.backsTurnedShare', 0.6, 0.4, 0.9, 'share', 'assumption', 'J7.5.1', SCR],
  ['scramble.coverageDepthYd', 5, 3, 8, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.spyDepthYd', 8, 5, 12, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.spyMinDepthYd', 2.5, 1, 5, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.spyWidthYd', 6, 3, 10, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.laneHalfWidthYd', 3, 1.5, 5, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.laneDepthYd', 8, 4, 12, 'yd', 'assumption', 'J7.5.1', SCR],
  ['scramble.runAheadYd', 12, 5, 20, 'yd', 'assumption', 'J7.5.1', STRUCT],

  // J7.5.2 throwing it away
  ['throwaway.vicinityYd', 5, 3, 8, 'yd', 'bible', 'J7.5.2', GRD],
  ['throwaway.knowBeta0', 2.0, 0, 4, 'logit', 'assumption', 'J7.5.2', GRD],
  ['throwaway.knowPerZ', 0.8, 0, 2, 'logit/z', 'assumption', 'J7.5.2', GRD],
  ['throwaway.dumpBeta0', -0.5, -3, 2, 'logit', 'assumption', 'J7.5.2', GRD],
  ['throwaway.dumpPerZ', 0.6, 0, 1.5, 'logit/z', 'assumption', 'J7.5.2', GRD],
  ['throwaway.oobMarginYd', 3, 1, 6, 'yd', 'assumption', 'J7.5.2', STRUCT],
  ['throwaway.pastLineYd', 2, 0.5, 5, 'yd', 'assumption', 'J7.5.2', GRD],
  ['throwaway.shortYd', 2, 1, 4, 'yd', 'assumption', 'J7.5.2', GRD],

  // J7.5.3 extending the play
  ['extend.driftYd', 5, 2, 8, 'yd', 'assumption', 'J7.5.3', 'J7.5.3 acceptance (out-of-pocket completion below in-pocket)'],
  ['extend.depthYd', 5, 2, 9, 'yd', 'assumption', 'J7.5.3', 'J7.5.3 acceptance'],
  ['extend.giveUpS', 6, 4, 9, 's', 'assumption', 'J7.5.3', RATES],

  // J7.6.1 release and ball speed
  ['throw.releaseBaseS', 0.40, 0.3, 0.5, 's', 'bible', 'J7.6.1', TTT],
  ['throw.releasePerZS', 0.03, 0, 0.06, 's/z', 'bible', 'J7.6.1', TTT],
  // The other side of the release: seconds per z of the rush closing on him. Same size as his own slope.
  ['throw.releaseRushPerZS', 0.03, 0, 0.06, 's/z', 'assumption', 'J7.6.1', LEVEL],
  ['throw.releaseFloorS', 0.2, 0.1, 0.3, 's', 'assumption', 'J7.6.1', STRUCT],
  ['throw.vBallBaseYps', 26, 22, 30, 'yd/s', 'bible', 'J7.6.1', ARM],
  ['throw.vBallPerZYps', 1.5, 0.5, 3, 'yd/s/z', 'bible', 'J7.6.1', ARM],
  // The other side of ball speed: yd/s per z of the eleven it is thrown against, same size as his own slope, so the
  // race between the ball and the men breaking on it is the same at any level. How far he can throw stays his own arm.
  ['throw.vBallDefensePerZYps', 1.5, 0, 3, 'yd/s/z', 'assumption', 'J7.6.1', LEVEL],
  ['throw.vBallFloorYps', 15, 10, 20, 'yd/s', 'assumption', 'J7.6.1', STRUCT],
  ['throw.touchRoomYd', 3, 1.5, 6, 'yd', 'assumption', 'J7.6.1', ACC],
  ['throw.driveSepYd', 3, 1, 5, 'yd', 'assumption', 'J7.6.1', ACC],

  // J7.6.2 accuracy
  ['acc.sdShortYd', 0.6, 0.3, 1, 'yd', 'bible', 'J7.6.2', ACC],
  ['acc.sdMidYd', 1.0, 0.6, 1.5, 'yd', 'bible', 'J7.6.2', ACC],
  // Tuned from the bible's 1.8 (so an Assumption now) against J15.4.1 completion by depth: deep balls were almost never
  // uncatchable (3 of 93 in a trace) and completed 49% at 21+ yards (real 29 to 37%, 1 of 3).
  ['acc.sdDeepYd', 2.6, 1.2, 2.6, 'yd', 'assumption', 'J7.6.2', ACC],
  ['acc.midFromYd', 10, 10, 10, 'yd', 'bible', 'J7.6.2', STRUCT],
  ['acc.deepFromYd', 20, 20, 20, 'yd', 'bible', 'J7.6.2', STRUCT],
  ['acc.perZ', 0.12, 0, 0.25, 'share/z', 'bible', 'J7.6.2', ACC],
  ['acc.minShare', 0.3, 0.1, 0.6, 'share', 'assumption', 'J7.6.2', STRUCT],
  ['acc.movingMult', 1.3, 1, 1.8, 'ratio', 'bible', 'J7.6.2', ACC],
  ['acc.movingThrowSideMult', 1.15, 1, 1.5, 'ratio', 'bible', 'J7.6.2', ACC],
  ['acc.hitMult', 1.8, 1.2, 2.5, 'ratio', 'bible', 'J7.6.2', ACC], // bible value; 2.5 was tried and changed nothing measurable (a hit throw's error does not reach the gate)
  ['acc.faceMult', 1.6, 1, 1.6, 'ratio', 'bible', 'J7.6.2', ACC], // tuned from 1.25 with acc.hitMult
  ['acc.wetMult', 1.1, 1, 1.3, 'ratio', 'bible', 'J7.6.2', ACC],
  ['acc.unsetMult', 1.15, 1, 1.5, 'ratio', 'assumption', 'J7.1.1', ACC],
  ['acc.multPerZ', 0.10, 0, 0.2, 'share/z', 'bible', 'J7.6.2', ACC],
  ['acc.deepAlongRatio', 2, 1, 2, 'ratio', 'assumption', 'J7.6.2', ACC], // tuned from 1.4 with acc.sdDeepYd: a deep ball misses long or short far more than wide
  ['acc.heightSdShare', 0.5, 0, 1, 'ratio', 'assumption', 'J7.6.2', ACC],
  ['acc.leadYd', 0.6, 0, 1.5, 'yd', 'assumption', 'J7.6.2', ACC],
  ['acc.leadPerZ', 0.15, 0, 0.4, 'share/z', 'assumption', 'J7.6.2', ACC],

  // J7.7.1 mesh reads
  ['mesh.beta0', 1.2, 0, 3, 'logit', 'bible', 'J7.7.1', MESH],
  ['mesh.perZ', 0.6, 0, 1.5, 'logit/z', 'bible', 'J7.7.1', MESH],
  ['mesh.defDisciplinePerZ', 0.5, 0, 1.5, 'logit/z', 'bible', 'J7.7.1', MESH],
  // Mean closing speed on the mesh below which the key is "feathering": the read is then a draw.
  ['mesh.ambiguousYps', 1.5, 0.5, 3, 'yd/s', 'assumption', 'J7.7.1', MESH],
  ['mesh.lateS', 0.15, 0, 0.4, 's', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  // A designed handoff the back never arrives for: after this long with the ball he keeps it and runs.
  ['handoff.giveUpS', 1.5, 0.8, 3, 's', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  // J7.7.1 edge case: the ball on the ground at the exchange. No measured rate in project research.
  ['mesh.fumbleBeta0', -6.0, -9, -3, 'logit', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  ['mesh.fumblePerZ', 0.5, 0, 1.5, 'logit/z', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  ['mesh.fumbleLate', 2.5, 0, 5, 'logit', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  ['mesh.fumbleWet', 0.7, 0, 2, 'logit', 'assumption', 'J7.7.1', 'J6.7 fumbled exchange rate'],
  // J7.6.1 edge case: the pump fake. The leaf gives its cost and its cue, not when he uses it.
  ['pump.beta0', -1.5, -4, 1, 'logit', 'assumption', 'J7.6.1', 'J15 interception rate; J4.5 defender bite rate'],
  ['pump.perZ', 0.5, 0, 1.5, 'logit/z', 'assumption', 'J7.6.1', 'J15 interception rate; J4.5 defender bite rate'],
  // J7.6.2 edge case: a rusher's reach with his hands up and a short jump, as a share of his height. Not measured.
  ['bat.reachPerHeight', 1.45, 1.3, 1.6, 'ratio', 'assumption', 'J7.6.2', 'J9.2.1 batted-pass rate (to be measured, R3)'],
  ['mesh.pitchDistYd', 3, 1.5, 5, 'yd', 'assumption', 'J7.7.1', MESH],
  ['mesh.pitchSpeedYps', 10, 6, 14, 'yd/s', 'assumption', 'J7.7.1', MESH],

  // J7.8.1 clock plays
  ['spike.releaseS', 0.5, 0.2, 0.8, 's', 'assumption', 'J7.8.1', CLOCK],
  ['spike.aheadYd', 1, 0.5, 2, 'yd', 'assumption', 'J7.8.1', CLOCK],
  ['spike.speedYps', 12, 8, 20, 'yd/s', 'assumption', 'J7.8.1', CLOCK],
  ['kneel.liveS', 2.0, 1, 3, 's', 'bible', 'J7.8.1', CLOCK],
  ['kneel.lossYd', 1.0, 1, 2, 'yd', 'bible', 'J7.8.1', CLOCK],
  ['sneak.aheadYd', 3, 1, 5, 'yd', 'assumption', 'J7.8.1', CLOCK],

  // J7.8.2 free play and Hail Mary
  ['freePlay.seeBeta0', 1.0, -1, 3, 'logit', 'assumption', 'J7.8.2', FREE],
  ['freePlay.seePerZ', 0.8, 0, 2, 'logit/z', 'assumption', 'J7.8.2', FREE],
  ['freePlay.deepBonusEp', 0.5, 0, 1.5, 'EP', 'assumption', 'J7.8.2', FREE],
  ['hailMary.holdMaxS', 4.5, 3, 6, 's', 'assumption', 'J7.8.2', 'J7.8.2 (Hail Mary completion, Unverified)'],
  ['hailMary.arriveYd', 5, 2, 10, 'yd', 'assumption', 'J7.8.2', 'J7.8.2 (Hail Mary completion, Unverified)'],
] as const satisfies readonly ParamRow[];

export type QbParamName = (typeof ROWS)[number][0];
export type QbParams = Readonly<Record<QbParamName, number>>;

export const PARAMS: ParamFile = defineParams('qb', '0.1.0', ROWS);

const RESOLVED = new WeakMap<ParamTable, QbParams>();
/** Resolve once per play, never inside the tick. */
export function qbParams(t: ParamTable): QbParams {
  // A parameter table never changes, so its rows are read once per table, not once per play (G-97).
  const hit = RESOLVED.get(t);
  if (hit !== undefined) return hit;
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`qb.${row[0]}`);
  const fast = fastParams(out) as QbParams;
  RESOLVED.set(t, fast);
  return fast;
}

const READ_BY = ['engine-core/qb'];
/** Rule keys read. All exist in the WP-01 dictionary. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'pass.spike_requires_under_center', type: 'boolean', meaning: 'Only a quarterback under center may spike the ball to stop the clock', ownerLeaf: 'B13.5.4', readBy: READ_BY },
  { key: 'foul.intentional_grounding.exists', type: 'boolean', meaning: 'Intentional grounding exists at this level', ownerLeaf: 'B8', readBy: READ_BY },
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Points for a touchdown', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'try.two_point_points', type: 'number', unit: 'points', meaning: 'Points for a successful two-point try', ownerLeaf: 'B7', readBy: READ_BY },
];
