// Fouls and injuries from play: the hazard formulas (J10). Pure functions of their inputs; no stream,
// no world. Every chance returned here is a possible act, so it goes through the contest floor and
// ceiling of J6.1.3 (never exactly 0 or 1, A3 ruling 22).
import { possible } from '@gm/schema';
import { clampProbability } from '../contest/math.ts';
import { dExp, logistic } from '../dmath.ts';
import type { FoulsInjuriesParams } from './params.ts';

type P = FoulsInjuriesParams;

/** J6.1.1: z from an ISS grade. */
export const zOf = (iss: number): number => (iss - 50) / 10;
const clip = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * J10.2.1 per-tick holding hazard: logistic(b0 + 2.0 (-A - 0.6) - 0.4 zDisc + 0.3 desperation).
 * `a` is the block's advantage (negative: the blocker is losing).
 */
export function holdingChance(a: number, zDisc: number, desperation: boolean, p: P): number {
  return clampProbability(logistic(p['hold.b0'] + p['hold.gGap'] * (-a + p['hold.aOpen']) - p.zDiscipline * zDisc + (desperation ? p['hold.gDesperation'] : 0)));
}

/** J10.1.1 illegal use of hands to the face: the same exposures as holding, its own intercept. */
export function handsToFaceChance(b0: number, beaten: number, zDisc: number, p: P): number {
  return clampProbability(logistic(b0 + p['hold.gGap'] * beaten - p.zDiscipline * zDisc));
}

/** J10.2.2: the chance a blocker arriving from an illegal angle pulls off (and misses the block). */
export function avoidIllegalBlockChance(zDisc: number, zAware: number, p: P): number {
  return clampProbability(logistic(p['block.avoidB0'] + p['block.avoidPerZ'] * (zDisc + zAware)));
}

export interface InterferenceInputs {
  /** 1 when the defender never found the ball (J3.5.1). */
  readonly notLocated: number;
  /** Yards the defender is behind the receiver at the catch point, 0 when even or ahead. */
  readonly trailingYd: number;
  /** 1 when he arrived before the ball. */
  readonly early: number;
  readonly bothLocated: boolean;
  readonly zDisc: number;
  readonly zBallSkills: number;
  /** L3.4.1 `team_discipline.def_coverage`, already clamped. Multiplies the hazard only. */
  readonly team: number;
}

/** J10.3.1 interference: logistic(b0 + 1.2 notLocated + 0.8 trailing + 0.5 early - 0.4 zDisc - 0.3 zBallSkills). */
export function interferenceChance(x: InterferenceInputs, p: P): number {
  const lin = p['dpi.b0'] + p['dpi.gNotLocated'] * x.notLocated + p['dpi.gTrailing'] * x.trailingYd + p['dpi.gEarly'] * x.early
    - p.zDiscipline * x.zDisc - p['dpi.gBallSkills'] * x.zBallSkills + (x.bothLocated ? p['dpi.gBothLocated'] : 0);
  return clampProbability(logistic(lin) * x.team);
}

/** J10.3.1 defensive holding and illegal contact: rises with how beaten he is and with press technique. */
export function coverageHoldChance(beatenBy: number, zPress: number, zDisc: number, team: number, p: P): number {
  return clampProbability(logistic(p['dh.b0'] + p['dh.gBeaten'] * beatenBy + p['dh.gPress'] * zPress - p.zDiscipline * zDisc) * team);
}

/** J10.3.2 push-off at a contested catch point by a receiver with little separation. */
export function pushOffChance(separationYd: number, zDisc: number, p: P): number {
  const low = p['opi.sepYd'] - separationYd;
  return clampProbability(logistic(p['opi.b0'] + p['opi.gLowSep'] * (low > 0 ? low : 0) - p.zDiscipline * zDisc));
}

/** J10.3.2 pick contact beyond the allowed depth with the path bent toward the defender. */
export function pickChance(zDisc: number, p: P): number {
  return clampProbability(logistic(p['opi.pickB0'] - p.zDiscipline * zDisc));
}

/**
 * J10.4.1. Inside the "could not stop" gap the hit is legal unless its form is illegal (drawn from body
 * control); beyond it he pulls up with a chance from discipline and body control, falling as the gap
 * grows. Returns the chance the contact is a foul.
 */
export function lateHitChance(gapS: number, zDisc: number, zControl: number, p: P): number {
  if (gapS <= p['late.couldNotStopS']) return clampProbability(logistic(p['late.formB0'] - p['late.formPerZ'] * zControl));
  const pull = logistic(p['late.pullB0'] + p['late.pullPerZ'] * (zDisc + zControl) + p['late.pullPerS'] * (gapS - p['late.couldNotStopS']));
  return clampProbability(1 - pull);
}

export interface FormInputs {
  readonly energy: number;
  readonly lunge: boolean;
  readonly behind: boolean;
  readonly defenseless: boolean;
  readonly zDisc: number;
  readonly zTackling: number;
  /** Coach aggression instruction, -1 to +1 (I3, I8). */
  readonly aggression: number;
}

/** J10.4.2 one form: P(form) from technique and discipline, raised by energy, lunge, pursuit from behind, a defenseless target and aggression. */
export function contactFormChance(form: string, x: FormInputs, p: P): number {
  const b0 = p[`form.b0.${form}` as keyof P];
  // Pursuit from behind raises only the forms that come from behind; a defenseless target only helmet and forcible-contact forms.
  const fromBehind = form === 'horse_collar' || form === 'face_mask' || form === 'hip_drop';
  const forcible = form === 'helmet_use' || form === 'defenseless_player' || form === 'targeting';
  const lin = b0 + p['form.gEnergy'] * (x.energy - 1) + (x.lunge ? p['form.gLunge'] : 0) + (fromBehind && x.behind ? p['form.gBehind'] : 0)
    + (forcible && x.defenseless ? p['form.gDefenseless'] : 0) - p.zDiscipline * x.zDisc - p['form.gTechnique'] * x.zTackling + p['form.gAggression'] * x.aggression;
  return clampProbability(logistic(lin));
}

/** J10.4.3: P(commit | contact geometry) = logistic(b0 + 1.5 closingSpeedExcess - 0.4 zDisc + 0.5 blockItCall). */
export function kickerContactChance(closingYps: number, zDisc: number, blockIt: boolean, p: P): number {
  const excess = closingYps - p['kick.closingFreeYps'];
  return clampProbability(logistic(p['kick.b0'] + p['kick.gClosing'] * excess - p.zDiscipline * zDisc + (blockIt ? p['kick.gBlockIt'] : 0)));
}

/** J10.4.3 kick catch interference: rises with how early he arrives, falls with his awareness. */
export function kickCatchInterferenceChance(earlyS: number, zAware: number, p: P): number {
  return clampProbability(logistic(p['kci.b0'] + p['kci.gEarly'] * earlyS - p['kci.gAware'] * zAware));
}

/** J10.5.1 after-whistle conduct for one player near the ball. */
export function conductChance(weight: number, zComposure: number, zDisc: number, retaliation: boolean, team: number, p: P): number {
  const lin = p['conduct.b0'] + p['conduct.gWeight'] * weight - p['conduct.gComposure'] * zComposure - p.zDiscipline * zDisc + (retaliation ? p['conduct.gRetaliation'] : 0);
  return clampProbability(logistic(lin) * team);
}

/** J10.1.1 severity: rises with how badly the contest was lost (0 to 1), with spread. */
export function severityOf(howBad: number, u: number, p: P): number {
  return clip(p['severity.base'] + p['severity.gain'] * clip(howBad, 0, 1) + p['severity.spread'] * (u - 0.5), 0, 1);
}

// --- J10.6.1 injury hazard ---------------------------------------------------------------------------

export const MECHANISMS = ['contact_lower', 'contact_upper', 'head_impact', 'noncontact_sprint', 'noncontact_cut', 'overuse'] as const;
export type Mechanism = (typeof MECHANISMS)[number];

/**
 * Body regions by mechanism: G-21 catalogue report-level row ids. The weights are an Assumption until
 * a sourced position-by-mechanism table exists (J10.6.1 open question, R3); D11 maps region and seed
 * to a diagnosis, so no diagnosis is chosen here.
 */
export const REGION_TABLE: Readonly<Record<Exclude<Mechanism, 'overuse'>, readonly (readonly [string, number])[]>> = {
  contact_lower: [['knee', 0.34], ['ankle', 0.3], ['foot', 0.1], ['hip', 0.08], ['quadriceps', 0.1], ['toe', 0.08]],
  contact_upper: [['shoulder', 0.36], ['ribs', 0.14], ['hand', 0.18], ['elbow', 0.1], ['back', 0.12], ['neck', 0.1]],
  head_impact: [['concussion', 1]],
  noncontact_sprint: [['hamstring', 0.55], ['groin', 0.15], ['calf', 0.15], ['quadriceps', 0.15]],
  noncontact_cut: [['knee', 0.35], ['ankle', 0.35], ['foot', 0.1], ['groin', 0.1], ['toe', 0.1]],
};

export interface InjuryInputs {
  /** J2.6.1 hit energy (1 = a league-typical open-field tackle); 1 for non-contact exposures. */
  readonly energy: number;
  /** In-play fatigue 0 to 1 (J2.4). */
  readonly fatigue: number;
  /** Weekly and season load beyond tolerance (D10), 0 when unknown. */
  readonly loadExcess: number;
  /** Already hurt in a region this mechanism reaches. */
  readonly priorSameRegion: boolean;
  readonly playingHurt: boolean;
  readonly zDurability: number;
  /** J12 surface factor; a7 starts at 0 (J10.6.1). */
  readonly surface: number;
  readonly ageYears: number;
  /** Position-group multiplier on contact mechanisms (kickers and punters below 1). */
  readonly group: number;
}

/** J10.6.1: P(injury) for one mechanism at one exposure. */
export function injuryChance(m: Mechanism, x: InjuryInputs, p: P): number {
  const h0 = p[`injury.h0.${m}` as keyof P];
  const contact = m === 'contact_lower' || m === 'contact_upper' || m === 'head_impact';
  const ageOver = x.ageYears - p['injury.peakAge'];
  const lin = p['injury.a1'] * (x.energy - 1) + p['injury.a2'] * x.fatigue * x.fatigue + p['injury.a3'] * x.loadExcess
    + (x.priorSameRegion ? p['injury.a4'] : 0) + (x.playingHurt ? p['injury.a5'] : 0) - p['injury.a6'] * x.zDurability
    + p['injury.a7'] * x.surface + p['injury.a8'] * (ageOver > 0 ? ageOver : 0);
  // Per-exposure injury chances sit below the contest floor, so they take the project floor (prob.floor, MA-52).
  return possible(h0 * (contact ? x.group : 1) * dExp(lin));
}

/** Picks a region from a weighted table with one uniform. */
export function pickRegion(table: readonly (readonly [string, number])[], u: number): string {
  let total = 0;
  for (const [, w] of table) total += w;
  let acc = 0;
  for (const [r, w] of table) { acc += w / total; if (u < acc) return r; }
  return table[table.length - 1]![0];
}

/** J10.7.2: the chance the medical staff and spotters start an evaluation after a head impact. */
export function concussionDetectChance(energy: number, injured: boolean, p: P): number {
  return clampProbability(logistic(p['concussion.detectB0'] + p['concussion.detectPerE'] * (energy - p['concussion.energy']) + (injured ? p['concussion.detectSigns'] : 0)));
}

/** L3.4.1: the team layer, clamped to its coach-controlled bounds. */
export function teamMultiplier(value: number, lo: number, hi: number): number { return clip(value, lo, hi); }
