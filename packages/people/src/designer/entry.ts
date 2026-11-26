// D13.1.1 entry points 1 and 2. Start 1 (archetype) runs the generator (D13.2) and applies the archetype's
// lean; start 2 (measurables) takes the user's body and tests, computes physical values (D2) and either
// generates technique and mental values or leaves them for the user. Start 3 is blankSheet (sheet.ts).
import { ATTRIBUTE_IDS, type PersonRecord } from '@gm/schema';
import { PHYSICAL, groupOf, profileOf } from '../generator/catalogue.ts';
import { proProfile, WORSE_DIRECTION, type ProfileVar } from '../generator/profiles.ts';
import { TIER_BODY_SHIFT_SD, TIER_BODY_WIDEN } from '../generator/params.ts';
import { physicalIss, type BodyVector, type Tier } from '../generator/body.ts';
import {
  generatePlayer, placeholderNames, type ClassKey, type GeneratorRandom, type NameSource, type PlayerRequest, type Talent,
} from '../generator/generate.ts';
import type { PopulationGroup } from '../generator/traits.ts';
import { archetypeById, archetypesFor, type Archetype } from './archetypes.ts';
import { adultEquivalent, currentBody, derivedPhysical, designerWarnings, impliedSplit, type DesignerWarning } from './checks.ts';
import { param } from './params.ts';
import { EMPTY_TESTS, sheetFromRecord, type Sheet, type SheetTests } from './sheet.ts';

/** What the generator needs to build the starting player. */
export interface StartRequest {
  personId: number;
  position: string;
  ageYears: number;
  seasonYear: number;
  talent: Talent;
  group: PopulationGroup;
  homeRegion: string;
  hometown: string | null;
  /** Keyed like a generated class slot, so the same request gives the same player (D13.2.1 step 1). */
  classKey: ClassKey;
}

export interface StartResult {
  sheet: Sheet;
  /** Draws used; 1 when the first passed D13.1.2. */
  attempts: number;
  /** Warnings left on the last draw when every draw failed (shown to the user, never hidden). */
  warnings: DesignerWarning[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const ZERO = { strengthE: 0, staminaE: 0, durabilityZ: 0 };

function playerRequest(req: StartRequest, attempt: number): PlayerRequest {
  return {
    personId: req.personId, position: req.position, ageYears: req.ageYears, seasonYear: req.seasonYear, talent: req.talent,
    classKey: { ...req.classKey, classType: `${req.classKey.classType}:designer:${attempt}` },
    group: req.group, homeRegion: req.homeRegion, hometown: req.hometown,
  };
}

/** A sheet seeded from a generated record (not a copy: the generated person never existed in the world). */
function seeded(rec: PersonRecord, req: StartRequest, entry: Sheet['entry'], archetypeId: string | null): Sheet {
  const s = sheetFromRecord(rec, req.personId, req.seasonYear);
  return { ...s, entry, archetypeId, source: rec, ageYears: req.ageYears };
}

/** sqrt(1 - mean square shift) of a variable over a position's archetypes (1 when none shift it). */
function shrinkOf(position: string, v: ProfileVar): number {
  const list = archetypesFor(position);
  const ms = list.reduce((acc, x) => acc + (x.bodyShiftSd[v] ?? 0) * (x.bodyShiftSd[v] ?? 0), 0) / list.length;
  return Math.sqrt(1 - ms);
}

const TEST_KEY: Readonly<Partial<Record<ProfileVar, keyof SheetTests>>> = {
  fortyS: 'fortyS', verticalIn: 'verticalIn', broadIn: 'broadIn', threeConeS: 'threeConeS', shuttleS: 'shuttleS', benchReps: 'benchReps',
};

/**
 * Applies an archetype's lean to a sheet: body in profile sd (current values keep their youth share),
 * groups in ISS. The body is treated as a draw from the archetype's slice of the profile: its standard
 * score is shrunk by sqrt(1 - mean square shift of the position's archetypes) and the shift added, so an
 * even mix of archetypes has the profile's mean and spread (D13.4.5 checks both). `tier` is the talent
 * tier the generator drew the body with (null: the pro profile), whose shifted, widened profile is the
 * one the score is taken in.
 */
export function applyArchetype(sheet: Sheet, a: Archetype, tier: Tier | null = null): Sheet {
  if (sheet.position === null) throw new Error('archetype needs a position');
  const prof = proProfile(profileOf(sheet.position));
  if (prof.position !== a.position) throw new Error(`archetype ${a.id} is for ${a.position}, not ${sheet.position}`);
  const cur = currentBody(sheet);
  const adult = adultEquivalent(sheet);
  const cur2: BodyVector = { ...cur }, adult2: BodyVector = { ...adult };
  for (const v of prof.vars) {
    const s = a.bodyShiftSd[v] ?? 0;
    if (shrinkOf(a.position, v) === 1 && s === 0) continue;
    if (adult[v] === undefined || cur[v] === undefined) continue;
    const sd = prof.sd(v) * (tier === null ? 1 : TIER_BODY_WIDEN[tier]);
    const mean = prof.mean(v) + prof.sd(v) * (tier === null ? 0 : TIER_BODY_SHIFT_SD[tier] * WORSE_DIRECTION[v]);
    const z = (adult[v]! - mean) / sd;
    const next = mean + sd * (s + shrinkOf(a.position, v) * z);
    cur2[v] = cur[v]! * (next / adult[v]!);
    adult2[v] = next;
  }
  const tests: SheetTests = { ...sheet.tests };
  for (const [v, k] of Object.entries(TEST_KEY) as [ProfileVar, keyof SheetTests][]) {
    if (cur2[v] !== undefined && tests[k] !== null) tests[k] = v === 'verticalIn' || v === 'benchReps' ? r1(cur2[v]!) : v === 'broadIn' ? Math.round(cur2[v]!) : r2(cur2[v]!);
  }
  if (tests.tenSplitS !== null && sheet.tests.fortyS !== null && tests.fortyS !== null) tests.tenSplitS = r2(tests.tenSplitS * (tests.fortyS / sheet.tests.fortyS));
  // Physical values move by the change the new body makes, keeping each person's own independent parts.
  const pNow = physicalIss(prof, cur, ZERO), pNow2 = physicalIss(prof, cur2, ZERO);
  const pAd = physicalIss(prof, adult, ZERO), pAd2 = physicalIss(prof, adult2, ZERO);
  const attributes = { ...sheet.attributes };
  const ceilings = { ...sheet.ceilings };
  for (const k of ['play_strength', 'explosiveness', 'stamina'] as const) {
    if (attributes[k] !== undefined) attributes[k] = r1(clamp(attributes[k]! + pNow2[k] - pNow[k], 0, 100));
    if (ceilings[k] !== undefined) ceilings[k] = r1(clamp(ceilings[k]! + pAd2[k] - pAd[k], 0, 100));
  }
  for (const [group, shift] of Object.entries(a.groupShiftIss)) {
    for (const id of ATTRIBUTE_IDS) {
      if (groupOf(id) !== group) continue;
      if (attributes[id] !== undefined) attributes[id] = r1(clamp(attributes[id]! + shift, 0, 100));
      if (ceilings[id] !== undefined) ceilings[id] = r1(clamp(ceilings[id]! + shift, 0, 100));
    }
  }
  for (const id of ATTRIBUTE_IDS) {
    if (attributes[id] !== undefined && ceilings[id] !== undefined && ceilings[id]! < attributes[id]!) ceilings[id] = attributes[id]!;
  }
  return {
    ...sheet, archetypeId: a.id,
    heightIn: cur2.heightIn !== undefined ? r1(cur2.heightIn) : sheet.heightIn,
    weightLb: cur2.weightLb !== undefined ? Math.round(cur2.weightLb) : sheet.weightLb,
    tests, attributes, ceilings,
  };
}

/**
 * D13.1.1 start 1: position, then archetype. The generator builds a plausible player and the lean is
 * applied; a draw that the lean pushes past D13.1.2 is redrawn with the next sub-seed, as the generator
 * redraws (D13.2.1 step 9), so the designer never offers an implausible start.
 */
export function fromArchetype(archetypeId: string, req: StartRequest, rnd: GeneratorRandom, names: NameSource = placeholderNames): StartResult {
  const a = archetypeById(archetypeId);
  if (profileOf(req.position) !== a.position) throw new Error(`archetype ${a.id} is for ${a.position}, not ${req.position}`);
  const max = param('archetypeMaxRedraws');
  let sheet!: Sheet;
  let warnings: DesignerWarning[] = [];
  let attempt = 0;
  for (attempt = 0; attempt < max; attempt++) {
    const g = generatePlayer(playerRequest(req, attempt), rnd, names);
    sheet = applyArchetype(seeded(g.record, req, 'archetype', a.id), a, req.talent.kind === 'tier' ? req.talent.tier : null);
    warnings = designerWarnings(sheet, rnd.math);
    if (warnings.length === 0) break;
  }
  const attempts = Math.min(attempt + 1, max);
  return { sheet, attempts, warnings: attempts === max ? warnings : [] };
}

/** The user's measurables for start 2. Tests left out stay unset. */
export interface Measurables {
  heightIn: number;
  weightLb: number;
  tests: Partial<SheetTests> & { fortyS: number };
  armLengthIn?: number;
  handSizeIn?: number;
}

/**
 * D13.1.1 start 2: the user enters height, weight and tests; physical values are computed (D2), with the
 * independent parts at their mean. Technique and mental values are generated (`fill = 'generate'`) or left
 * for the user (`fill = 'hand'`).
 */
export function fromMeasurables(m: Measurables, fill: 'generate' | 'hand', req: StartRequest, rnd: GeneratorRandom, names: NameSource = placeholderNames): Sheet {
  const g = generatePlayer(playerRequest(req, 0), rnd, names);
  const base = seeded(g.record, req, 'measurables', null);
  const tests: SheetTests = { ...EMPTY_TESTS, ...m.tests };
  if (tests.tenSplitS === null) tests.tenSplitS = impliedSplit(tests.fortyS!);
  const hidden: Record<string, number> = { ...base.hidden, maturity_offset_y: 0 };
  let sheet: Sheet = {
    ...base,
    heightIn: m.heightIn, weightLb: m.weightLb, tests,
    armLengthIn: m.armLengthIn ?? base.armLengthIn, handSizeIn: m.handSizeIn ?? base.handSizeIn,
    hidden,
    attributes: fill === 'generate' ? { ...base.attributes } : {},
    ceilings: fill === 'generate' ? { ...base.ceilings } : {},
  };
  if (fill === 'hand') sheet = { ...sheet, firstName: null, lastName: null };
  const now = derivedPhysical(sheet)!;
  const prof = proProfile(profileOf(req.position));
  const ad = physicalIss(prof, adultEquivalent(sheet), ZERO);
  const attributes = { ...sheet.attributes };
  const ceilings = { ...sheet.ceilings };
  for (const k of PHYSICAL as readonly ('play_strength' | 'explosiveness' | 'stamina' | 'durability')[]) {
    attributes[k] = now[k];
    ceilings[k] = Math.max(now[k], r1(ad[k]));
  }
  return { ...sheet, attributes, ceilings };
}
