// D13.1.2 plausibility checks for a designed player, and the derived physical values of D13.1.1 start 2.
// The checks are the generator's own (plausibilityWarnings: record limits, single-value z, joint pair
// probability), run on the adult-equivalent body, so a young prospect is judged the way the generator
// judged him at creation (D13.2.1 step 9 checks the adult draw).
import { ATTRIBUTE_IDS, type DeterministicMath } from '@gm/schema';
import { profileOf } from '../generator/catalogue.ts';
import { proProfile, type ProfileVar } from '../generator/profiles.ts';
import { growthShare, physicalIss, changeOfDirectionZ, type BodyVector } from '../generator/body.ts';
import { plausibilityWarnings, type PlausibilityWarning } from '../generator/plausibility.ts';
import { param as gparam } from '../generator/params.ts';
import { isRealPerson, sheetFromRecord, type Sheet } from './sheet.ts';

/** The current body of a sheet as a profile vector (only the variables that are set). */
export function currentBody(sheet: Sheet): BodyVector {
  const t = sheet.tests;
  const b: BodyVector = {};
  const put = (v: ProfileVar, x: number | null) => { if (x !== null) b[v] = x; };
  put('heightIn', sheet.heightIn); put('weightLb', sheet.weightLb);
  put('fortyS', t.fortyS); put('verticalIn', t.verticalIn); put('broadIn', t.broadIn);
  put('threeConeS', t.threeConeS); put('shuttleS', t.shuttleS); put('benchReps', t.benchReps);
  return b;
}

/**
 * Adult-equivalent body: the inverse of the generator's youth growth (D8.1.1, generator youthBody), at
 * the sheet's age plus its maturity offset (0 when the sheet carries none). At 23 and over it is the body.
 */
export function adultEquivalent(sheet: Sheet): BodyVector {
  const body = currentBody(sheet);
  if (sheet.ageYears === null) return body;
  const eff = sheet.ageYears + (sheet.hidden.maturity_offset_y ?? 0);
  const h = growthShare(eff, 'height'), w = growthShare(eff, 'weight');
  const st = growthShare(eff, 'strength'), sp = growthShare(eff, 'speed');
  const out: BodyVector = {};
  for (const [k, a] of Object.entries(body) as [ProfileVar, number][]) {
    switch (k) {
      case 'heightIn': out[k] = a / h; break;
      case 'weightLb': out[k] = a / w; break;
      case 'fortyS': case 'threeConeS': case 'shuttleS': out[k] = a * sp; break;
      case 'verticalIn': case 'broadIn': out[k] = a / sp; break;
      case 'benchReps': out[k] = a / st; break;
    }
  }
  return out;
}

/** A hard problem: the record cannot hold it even in sandbox (0 to 100 ISS, ceiling at or above current). */
export interface RangeProblem { field: string; value: number; detail: string }

export function rangeProblems(sheet: Sheet): RangeProblem[] {
  const out: RangeProblem[] = [];
  for (const id of ATTRIBUTE_IDS) {
    const a = sheet.attributes[id], c = sheet.ceilings[id];
    if (a !== undefined && !(a >= 0 && a <= 100)) out.push({ field: `attributes.${id}`, value: a, detail: 'outside 0 to 100' });
    if (c !== undefined && !(c >= 0 && c <= 100)) out.push({ field: `ceilings.${id}`, value: c, detail: 'outside 0 to 100' });
    if (a !== undefined && c !== undefined && c < a) out.push({ field: `ceilings.${id}`, value: c, detail: `below the current value ${a}` });
  }
  for (const [f, x] of [['heightIn', sheet.heightIn], ['weightLb', sheet.weightLb], ['ageYears', sheet.ageYears]] as const) {
    if (x !== null && !(x > 0)) out.push({ field: f, value: x, detail: 'must be above 0' });
  }
  for (const [k, x] of Object.entries(sheet.tests)) if (x !== null && !(x > 0)) out.push({ field: `tests.${k}`, value: x, detail: 'must be above 0' });
  return out;
}

const SHEET_FIELD: Readonly<Record<ProfileVar, string>> = {
  heightIn: 'heightIn', weightLb: 'weightLb', fortyS: 'tests.fortyS', verticalIn: 'tests.verticalIn', broadIn: 'tests.broadIn',
  threeConeS: 'tests.threeConeS', shuttleS: 'tests.shuttleS', benchReps: 'tests.benchReps',
};

/** A D13.1.2 warning in sheet terms: which sheet fields it names, and how rare the value is. */
export interface DesignerWarning extends PlausibilityWarning {
  /** Sheet paths the warning is about (two for a joint warning). */
  fields: string[];
}

function changedFromSource(sheet: Sheet): Set<string> | null {
  if (!isRealPerson(sheet) || !sheet.source) return null;
  const base = sheetFromRecord(sheet.source, sheet.personId, sheet.seasonYear);
  const changed = new Set<string>();
  if (base.heightIn !== sheet.heightIn) changed.add('heightIn');
  if (base.weightLb !== sheet.weightLb) changed.add('weightLb');
  if (base.ageYears !== sheet.ageYears) changed.add('ageYears');
  for (const k of Object.keys(sheet.tests) as (keyof Sheet['tests'])[]) if (base.tests[k] !== sheet.tests[k]) changed.add(`tests.${k}`);
  return changed;
}

/**
 * D13.1.2 warnings for a sheet. Empty until a position is set. A real imported player's own numbers are
 * records, not designs, so they are never flagged (D13.1.2 edge case); a value the user changed on him is.
 */
export function designerWarnings(sheet: Sheet, math: DeterministicMath): DesignerWarning[] {
  if (sheet.position === null) return [];
  let prof;
  try { prof = proProfile(profileOf(sheet.position)); } catch { return []; }
  const adult = adultEquivalent(sheet);
  const raw = plausibilityWarnings(prof, adult, math);
  const out: DesignerWarning[] = raw.map((w) => ({ ...w, fields: w.field.split('+').map((v) => SHEET_FIELD[v as ProfileVar] ?? v) }));
  const changed = changedFromSource(sheet);
  if (changed === null) return out;
  const ageChanged = changed.has('ageYears');
  return out.filter((w) => ageChanged || w.fields.some((f) => changed.has(f)));
}

/**
 * D13.1.1 start 2: physical attributes computed from the current body (D2.3, D2.4) with the independent
 * parts at their mean (play strength's own part, stamina's own part, durability at the median). Returns
 * null when height, weight or the 40 is missing.
 */
export function derivedPhysical(sheet: Sheet): Record<'play_strength' | 'explosiveness' | 'stamina' | 'durability', number> | null {
  if (sheet.position === null || sheet.heightIn === null || sheet.weightLb === null || sheet.tests.fortyS === null) return null;
  const prof = proProfile(profileOf(sheet.position));
  const v = physicalIss(prof, currentBody(sheet), { strengthE: 0, staminaE: 0, durabilityZ: 0 });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { play_strength: r1(v.play_strength), explosiveness: r1(v.explosiveness), stamina: r1(v.stamina), durability: r1(v.durability) };
}

/** D2.2.2 change-of-direction score of the sheet's current body (0 with neither drill). */
export function sheetChangeOfDirection(sheet: Sheet): number {
  if (sheet.position === null) return 0;
  return changeOfDirectionZ(proProfile(profileOf(sheet.position)), currentBody(sheet));
}

/** The 10-yard split implied by a 40 when none is entered (D2.1.1 ratio, the generator's constant). */
export function impliedSplit(fortyS: number): number {
  return Math.round((fortyS / gparam('splitRatio')) * 100) / 100;
}
