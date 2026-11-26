// The designer sheet (D13.1.1): the editable form of one player. Every entry point produces a sheet; the
// user edits fields; commit turns a complete sheet into a person record. A field the user has not set is
// null (or absent from the attribute maps), so a blank sheet lists exactly what is missing.
import { ATTRIBUTE_IDS, type AttributeId, type PersonOrigin, type PersonRecord } from '@gm/schema';
import { POSITION_TO_PROFILE } from '../generator/catalogue.ts';

/** Entry point a sheet came from (D13.1.1), plus `copy` for "edit a copy" from a player card. */
export type EntryPoint = 'archetype' | 'measurables' | 'blank' | 'copy';

/** Current test results, as the engine reads them (TrueTests) plus bench reps (kept in `hidden`, CR-G17-1). */
export interface SheetTests {
  fortyS: number | null;
  tenSplitS: number | null;
  threeConeS: number | null;
  shuttleS: number | null;
  verticalIn: number | null;
  broadIn: number | null;
  benchReps: number | null;
}

export type Side = 'left' | 'right';

export interface Sheet {
  entry: EntryPoint;
  archetypeId: string | null;
  /** World id for the new person. A copy always gets a new id. */
  personId: number;
  /** The record this sheet was copied from, when there is one (kept for history, real-person locks). */
  source: PersonRecord | null;
  position: string | null;
  /** Football age on September 1 of `seasonYear` (D1.1.1). */
  ageYears: number | null;
  seasonYear: number;
  firstName: string | null;
  lastName: string | null;
  homeRegion: string | null;
  hometown: string | null;
  heightIn: number | null;
  weightLb: number | null;
  armLengthIn: number | null;
  handSizeIn: number | null;
  throwingHand: Side;
  kickingFoot: Side;
  tests: SheetTests;
  attributes: Partial<Record<AttributeId, number>>;
  ceilings: Partial<Record<AttributeId, number>>;
  /** D7, D8 parameters by name. Missing ones take neutral values at commit (rate 1, no maturity offset). */
  hidden: Record<string, number>;
  /** D13.1.2 sandbox switch: limits removed, person marked sandbox. */
  sandbox: boolean;
}

export const EMPTY_TESTS: SheetTests = { fortyS: null, tenSplitS: null, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, benchReps: null };

/** D13.1.1 start 3: every field by hand. */
export function blankSheet(personId: number, seasonYear: number): Sheet {
  return {
    entry: 'blank', archetypeId: null, personId, source: null, position: null, ageYears: null, seasonYear,
    firstName: null, lastName: null, homeRegion: null, hometown: null, heightIn: null, weightLb: null,
    armLengthIn: null, handSizeIn: null, throwingHand: 'right', kickingFoot: 'right',
    tests: { ...EMPTY_TESTS }, attributes: {}, ceilings: {}, hidden: {}, sandbox: false,
  };
}

/** Age on September 1 of the season from a stored birth date (D1.1.1; day 243 is September 1, as G-17). */
export function footballAge(birth: PersonRecord['birthDate'], seasonYear: number): number {
  return seasonYear - birth.seasonYear - (birth.dayIndex > 243 ? 1 : 0);
}

/**
 * "Edit a copy" from any player card (D13.1.1). The copy keeps every value; statistics and history stay
 * with the original (a copy is a new person). Editing a person in place keeps his id: pass his id.
 */
export function sheetFromRecord(rec: PersonRecord, personId: number, seasonYear: number): Sheet {
  const p = rec.playing;
  if (!p) throw new Error(`person ${rec.id} has no playing component`);
  const h = p.hidden;
  const hidden: Record<string, number> = { ...h };
  const t = p.tests;
  return {
    entry: 'copy', archetypeId: null, personId, source: rec, position: p.position,
    ageYears: footballAge(rec.birthDate, seasonYear), seasonYear,
    firstName: rec.name.first, lastName: rec.name.last, homeRegion: rec.life?.homeRegion ?? null, hometown: rec.hometown,
    heightIn: p.heightIn, weightLb: p.weightLb,
    armLengthIn: h.arm_length_in ?? null, handSizeIn: h.hand_size_in ?? null,
    throwingHand: h.throws_left === 1 ? 'left' : 'right', kickingFoot: h.kicks_left === 1 ? 'left' : 'right',
    tests: {
      fortyS: t.fortyS, tenSplitS: t.tenSplitS, threeConeS: t.threeConeS, shuttleS: t.shuttleS, verticalIn: t.verticalIn, broadIn: t.broadIn,
      benchReps: h.bench_reps ?? null,
    },
    attributes: { ...p.attributes } as Partial<Record<AttributeId, number>>,
    ceilings: { ...p.ceilings } as Partial<Record<AttributeId, number>>,
    hidden, sandbox: h.designed_sandbox === 1,
  };
}

/** A person with `real_person = true` (D13.6.2): an imported person, or any copy of one. */
export function isRealPerson(sheet: Pick<Sheet, 'source'>): boolean {
  return sheet.source?.origin === 'imported';
}

/** Origin the committed record carries. A real person stays real: he cannot be converted (D13.6.2 rule 5). */
export function originOf(sheet: Pick<Sheet, 'source'>): PersonOrigin {
  return isRealPerson(sheet) ? 'imported' : 'designed';
}

/** Required fields, by sheet path. Tests other than the 40 may be left out (TrueTests allows null). */
export const REQUIRED_SCALARS = ['position', 'ageYears', 'firstName', 'lastName', 'homeRegion', 'heightIn', 'weightLb', 'tests.fortyS'] as const;

/** D13.1.1 acceptance 3: the list of missing required fields. Empty when the sheet can be committed. */
export function missingFields(sheet: Sheet): string[] {
  const out: string[] = [];
  const val = (path: string): unknown => (path.startsWith('tests.') ? sheet.tests[path.slice(6) as keyof SheetTests] : (sheet as unknown as Record<string, unknown>)[path]);
  for (const f of REQUIRED_SCALARS) {
    const x = val(f);
    if (x === null || x === undefined || x === '') out.push(f);
  }
  if (sheet.position !== null && !POSITION_TO_PROFILE[sheet.position]) out.push('position (unknown code)');
  for (const id of ATTRIBUTE_IDS) if (sheet.attributes[id] === undefined) out.push(`attributes.${id}`);
  for (const id of ATTRIBUTE_IDS) if (sheet.ceilings[id] === undefined) out.push(`ceilings.${id}`);
  return out;
}

/** Fields the designer may not change on a real person (D13.1.1 rules, D13.6.2 rule 5). */
export const REAL_PERSON_LOCKED = ['firstName', 'lastName', 'ageYears', 'homeRegion', 'hometown'] as const;

/** Locked fields a sheet has changed relative to its real-person source. Empty for anyone else. */
export function lockedChanges(sheet: Sheet): string[] {
  if (!isRealPerson(sheet) || !sheet.source) return [];
  const base = sheetFromRecord(sheet.source, sheet.personId, sheet.seasonYear);
  return REAL_PERSON_LOCKED.filter((f) => sheet[f] !== base[f]);
}
