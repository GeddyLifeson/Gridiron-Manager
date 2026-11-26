// J5 formulas that are pure functions of attributes, settings and draws. The phase planner uses them;
// tests and later modules (J6 line contests, J7 quarterback) may call them directly. Starting values
// live in params.ts; nothing here holds a football number.
import { issToZ, type DeterministicMath } from '@gm/schema';
import type { PresnapParams } from './params.ts';

const clip = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export type Tempo = 'huddle' | 'no_huddle' | 'hurry_up';

// ---------------------------------------------------------------------------------------------- J5.1

/** J5.1.1 run-on time: bench-to-spot distance at jog speed. */
export function runOnS(distanceYd: number, p: PresnapParams): number { return distanceYd / p['sub.jogSpeedYps']!; }

/**
 * J5.1.1 substitution error chance for one changing player: base 0.2% per changed player, times 4 at
 * hurry-up, rising with how late the call came, falling with package readiness (D9 knowledge 0 to 100).
 * No coach or staff term (J5.1.1 rule 3).
 */
export function substitutionErrorChance(tempo: Tempo, callLateS: number, readiness: number, p: PresnapParams): number {
  const hurry = tempo === 'huddle' ? 1 : p['sub.errorHurryMult']!;
  const late = 1 + p['sub.errorLatePerS']! * (callLateS > 0 ? callLateS : 0);
  const ready = Math.max(p['sub.readinessFloor']!, p['sub.readinessIntercept']! - readiness / p['sub.readinessDivisor']!);
  return clip(p['sub.errorBasePerPlayer']! * hurry * late * ready, 0, 1);
}

/**
 * J5.1.2 hold window: when the offense substitutes and the rule set gives the defense its chance to
 * match, the snap is held until the defense's matching substitution is done, capped. Before the
 * two-minute warning only (B2.4.3). Returns the earliest snap time, seconds from the phase start.
 */
export function holdEndS(offenseSubbed: boolean, matchWindow: boolean, insideTwoMinute: boolean, defenseSubStartS: number, defenseSubDurS: number, p: PresnapParams): number {
  if (!offenseSubbed || !matchWindow || insideTwoMinute) return 0;
  return defenseSubStartS + Math.min(defenseSubDurS, p['hold.capS']!);
}

/** J5.1.3 huddle delivery: near 1, less for the last-named players of a long call and for a quarterback with poor clock command (D4.5.1). */
export function huddleDeliveryChance(callWords: number, orderInCall: number, clockCommandIss: number, p: PresnapParams): number {
  const over = callWords - p['huddle.longCallWords']!;
  const longCut = over > 0 ? p['huddle.longCallPerWord']! * over * clip(orderInCall, 0, 1) : 0;
  return clip(p['huddle.deliveryBase']! - longCut + p['huddle.clockCommandPerZ']! * issToZ(clockCommandIss), 0, 1);
}

// ---------------------------------------------------------------------------------------------- J5.2

export type Technique = '0' | '1' | '2i' | '2' | '3' | '4i' | '4' | '5' | '6' | '7' | '9';

/**
 * J5.2.2 technique offset from the lineman it is numbered on, in yards toward the outside (positive) or
 * the inside (negative): head-up 0, shade 0.35 yd, gap half the split. Odd numbers are outside shades
 * (1 and 3 are outside shades of centre and guard), "i" techniques are inside shades.
 * Returns [the offensive lineman counted from the centre (0 centre, 1 guard, 2 tackle, 3 tight end), offset].
 */
export function techniqueSpot(t: Technique, splitYd: number, p: PresnapParams): readonly [number, number] {
  const shade = p['align.shadeYd']!, gap = p['align.gapSplitFrac']! * splitYd;
  switch (t) {
    case '0': return [0, 0];
    case '1': return [0, shade];
    case '2i': return [1, -shade];
    case '2': return [1, 0];
    case '3': return [1, shade];
    case '4i': return [2, -shade];
    case '4': return [2, 0];
    case '5': return [2, shade];
    case '6': return [3, 0];
    case '7': return [3, -shade];
    case '9': return [3, shade + gap];
  }
}

/**
 * J5.2.2 coverage alignment against a receiver at lateral `recPy`: press at 1 yd or off at 6 to 8 yd,
 * with inside or outside leverage of 0.5 to 1 yd. `towardSideline` is +1 when larger py is outside.
 * `depthFrac` and `leverageFrac` (0 to 1) place him within the bands; the call or the player supplies them.
 */
export function coverageSpot(recPy: number, press: boolean, leverage: 'inside' | 'outside' | 'head', towardSideline: 1 | -1, depthFrac: number, leverageFrac: number, p: PresnapParams): { px: number; py: number } {
  const px = press ? p['align.pressDepthYd']! : p['align.offDepthMinYd']! + clip(depthFrac, 0, 1) * (p['align.offDepthMaxYd']! - p['align.offDepthMinYd']!);
  const lev = p['align.leverageMinYd']! + clip(leverageFrac, 0, 1) * (p['align.leverageMaxYd']! - p['align.leverageMinYd']!);
  const sign = leverage === 'head' ? 0 : leverage === 'outside' ? towardSideline : -towardSideline;
  return { px, py: recPy + sign * lev };
}

/** J5.2.1 boundary split: a receiver aligned within the margin of the sideline is pulled in to it. */
export function tightenSplit(py: number, minPy: number, maxPy: number, p: PresnapParams): number {
  const m = p['align.sidelineMarginYd']!;
  return clip(py, minPy + m, maxPy - m);
}

// ---------------------------------------------------------------------------------------------- J5.3

/** J5.3.1 snap-to-motion timing error SD: 0.15 s at grade 50, from the quarterback's cadence and the centre's snap grade. */
export function snapMotionSdS(cadenceIss: number, snapIss: number, p: PresnapParams): number {
  const z = (issToZ(cadenceIss) + issToZ(snapIss)) / 2;
  return Math.max(p['motion.snapTimingSdMinS']!, p['motion.snapTimingSdS']! - p['motion.snapTimingSdPerZ']! * z);
}

// ---------------------------------------------------------------------------------------------- J5.4

/** J5.4.1 chance of a correct pre-snap read item: logistic(1.5 + 0.7 z - 1.0 disguise + 0.3 prepared). About 82% at grade 50, no disguise. */
export function readCorrectChance(coverageReadIss: number, disguiseQuality: number, prepared: number, math: DeterministicMath, p: PresnapParams): number {
  return math.logistic(p['read.intercept']! + p['read.perZ']! * issToZ(coverageReadIss) - p['read.disguiseK']! * disguiseQuality + p['read.preparedK']! * prepared);
}

/** J5.4.2 step 5: the chance the identifier sees the true threat. `simulated` is 1 for a simulated pressure or a late creeper. */
export function protectionRecognitionChance(protectionIss: number, disguiseQuality: number, simulated: number, noise: number, math: DeterministicMath, p: PresnapParams): number {
  return math.logistic(p['prot.intercept']! + p['prot.perZ']! * issToZ(protectionIss) - p['prot.disguiseK']! * disguiseQuality - p['prot.simulatedK']! * simulated - p['prot.noiseK']! * noise);
}

/**
 * J5.4.2 steps 1 and 4 for one side of the formation: rushers beyond blockers. With a correct set the
 * protection's answer (slide redirect to the side with spare blockers) is applied; the remainder is hot.
 * Returns the unblocked rushers on each side after the answer: [left, right].
 */
export function unblockedAfterSet(rushL: number, rushR: number, blockL: number, blockR: number, recognized: boolean, canRedirect: boolean): [number, number] {
  let l = rushL - blockL, r = rushR - blockR;
  if (recognized && canRedirect) {
    // Spare blockers on one side slide to the other.
    if (l > 0 && r < 0) { const m = Math.min(l, -r); l -= m; r += m; }
    else if (r > 0 && l < 0) { const m = Math.min(r, -l); r -= m; l += m; }
  }
  return [l > 0 ? l : 0, r > 0 ? r : 0];
}

/** J5.4.3 time cost of a line change: a one-word kill or a full audible. */
export function audibleCostS(kind: 'kill' | 'audible', p: PresnapParams): number { return kind === 'kill' ? p['audible.killS']! : p['audible.fullS']!; }

// ---------------------------------------------------------------------------------------------- J5.5

/** J5.5.1 per-player disguise quality: clamp(0.5 + 0.1 z_disguise - 0.25 stemLead, 0, 1). */
export function disguiseQualityOf(disguiseIss: number, stemLeadS: number, p: PresnapParams): number {
  return clip(p['disguise.base']! + p['disguise.perZ']! * issToZ(disguiseIss) - p['disguise.leadK']! * stemLeadS, 0, 1);
}

/** J5.3.2 and J5.5.2: the signal caller's recognition delay and the time a check takes, from his checks grade. */
export function checkRecognitionS(checksIss: number, p: PresnapParams): number {
  return Math.max(p['check.recognitionFloorS']!, p['check.recognitionBaseS']! - p['check.recognitionPerZS']! * issToZ(checksIss));
}
export function checkDurationS(checksIss: number, p: PresnapParams): number {
  return clip(p['check.midS']! - p['check.perZS']! * issToZ(checksIss), p['check.minS']!, p['check.maxS']!);
}

// ---------------------------------------------------------------------------------------------- J5.6

/** J5.6.1 offensive start time: 0 on a voiced count he heard, 0.05 to 0.15 s on a silent count (he reacts to the centre), better with get-off. No draw. */
export function offenseStartS(silent: boolean, heard: boolean, getOffIss: number, p: PresnapParams): number {
  if (!silent && heard) return 0;
  const mid = (p['getoff.silentMinS']! + p['getoff.silentMaxS']!) / 2;
  return clip(mid - p['getoff.silentPerZS']! * issToZ(getOffIss), p['getoff.silentMinS']!, p['getoff.silentMaxS']!);
}

/** J5.6.1 defender key delay: 0.20 - 0.04 z, minus up to 0.08 s anticipation after 6 snaps on one count, floor 0.08 after the bonus. */
export function defenderKeyDelayS(getOffIss: number, snapsOnSameCount: number, p: PresnapParams): number {
  const antic = p['getoff.anticipationMaxS']! * clip(snapsOnSameCount / p['getoff.anticipationSnaps']!, 0, 1);
  return Math.max(p['getoff.keyDelayFloorS']!, p['getoff.keyDelayBaseS']! - p['getoff.keyDelayPerZS']! * issToZ(getOffIss) - antic);
}

/** J5.6.1 pass-block starting advantage A0 = clamp(-3 (tBlocker - tRusher), -0.3, 0); negative favours the rusher (J6.2 sign). */
export function startingAdvantage(tStartBlockerS: number, tStartRusherS: number, p: PresnapParams): number {
  return clip(-p['getoff.a0PerS']! * (tStartBlockerS - tStartRusherS), p['getoff.a0Min']!, 0);
}

// ---------------------------------------------------------------------------------------------- J5.7

/** D4.2.2 discipline multiplier: max(0.25, 2.0 - foulDiscipline / 50). The one place foul discipline enters. */
export function disciplineMult(foulDisciplineIss: number, p: PresnapParams): number {
  return Math.max(p['foul.discFloor']!, p['foul.discIntercept']! - foulDisciplineIss / p['foul.discDivisor']!);
}

export type Venue = 'home' | 'road' | 'neutral';

/** J5.7.1 venue term: separate from noise and discipline. Neutral site 1. */
export function venueMult(venue: Venue, offense: boolean, p: PresnapParams): number {
  if (venue === 'neutral') return 1;
  if (offense) return venue === 'home' ? p['foul.venueHomeOffense']! : p['foul.venueRoadOffense']!;
  return venue === 'home' ? p['foul.venueHomeDefense']! : p['foul.venueRoadDefense']!;
}

export interface FalseStartTerms { noise: number; hardCountOwn: boolean; defensiveMovement: boolean; rushedSnap: boolean; longCount: boolean; fatigue: number }
export interface OffsideTerms { hardCountOpp: boolean; anticipated: boolean; aggression: boolean; fatigue: number }

/** J5.7.1 false start hazard of one offensive player. */
export function falseStartChance(base: number, foulDisciplineIss: number, venue: Venue, t: FalseStartTerms, math: DeterministicMath, p: PresnapParams): number {
  const x = p['foul.gNoise']! * clip(t.noise, 0, 1) + (t.hardCountOwn ? p['foul.gHard']! : 0) + (t.defensiveMovement ? p['foul.gStem']! : 0)
    + (t.rushedSnap ? p['foul.gRush']! : 0) + (t.longCount ? p['foul.gLong']! : 0) + p['foul.gFatigue']! * clip(t.fatigue, 0, 1);
  return clip(base * disciplineMult(foulDisciplineIss, p) * p['foul.teamStandards']! * math.exp(x) * venueMult(venue, true, p), 0, 1);
}

/** J5.7.1 offside, encroachment or neutral zone infraction hazard of one down lineman or blitzer. */
export function defensiveOffsideChance(base: number, foulDisciplineIss: number, venue: Venue, t: OffsideTerms, math: DeterministicMath, p: PresnapParams): number {
  const x = (t.hardCountOpp ? p['foul.gHardOpp']! : 0) + (t.anticipated ? p['foul.gAnticip']! : 0) + (t.aggression ? p['foul.gAggr']! : 0)
    + p['foul.gFatigue']! * clip(t.fatigue, 0, 1);
  return clip(base * disciplineMult(foulDisciplineIss, p) * p['foul.teamStandards']! * math.exp(x) * venueMult(venue, false, p), 0, 1);
}

export type DefensiveForm = 'encroachment' | 'neutral_zone_infraction' | 'offside' | 'false_start';

/**
 * J5.7.1 and B4.4.2 item 6 decision order for a defender who moved early. `u` picks the physical form
 * (contact, an unimpeded path or a flinch, still across at the snap) by weight. A flinch by an offensive
 * player not in close proximity is a false start on the offense. In the last two minutes of a half a
 * defender across at the snap is a dead-ball neutral zone infraction, so there is no free play (B4.4.2 item 3).
 */
export function classifyDefensiveForm(u: number, flinchCloseYd: number | null, insideTwoMinute: boolean, p: PresnapParams): DefensiveForm {
  const wE = p['foul.formEncroachment']!, wN = p['foul.formNeutralZone']!, wO = p['foul.formOffside']!;
  const x = u * (wE + wN + wO);
  if (x < wE) return 'encroachment';
  if (x < wE + wN) {
    if (flinchCloseYd !== null && flinchCloseYd > p['foul.closeProximityYd']!) return 'false_start';
    return 'neutral_zone_infraction';
  }
  return insideTwoMinute ? 'neutral_zone_infraction' : 'offside';
}

// ---------------------------------------------------------------------------------------------- J5.8

/** J5.8.1 the play-clock reading the tempo aims to snap at. The real distribution is an open research item. */
export function targetClockAtSnapS(tempo: Tempo, p: PresnapParams): number {
  return tempo === 'huddle' ? p['sched.targetClockHuddleS']! : tempo === 'no_huddle' ? p['sched.targetClockNoHuddleS']! : p['sched.targetClockHurryS']!;
}
