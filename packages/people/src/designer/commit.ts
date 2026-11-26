// Commit: a complete sheet becomes a person record (D13.1.1 outputs), with the designer log entry, the
// sandbox mark (D13.1.2) and the world's "edited" flag. The record is the same PersonRecord everything
// else uses, and the result has the generator's GeneratedPlayer shape, so a designed player goes through
// the same plausibility check, class statistics and drift guards as a generated one (D13.4).
import { ATTRIBUTE_IDS, PersonRecord, type WorldDate } from '@gm/schema';
import { durabilityMultiplier, type BodyVector } from '../generator/body.ts';
import { STREAM_TRAITS, type GeneratedPlayer, type GeneratorRandom } from '../generator/generate.ts';
import { drawTraitBlock, type PopulationGroup } from '../generator/traits.ts';
import { param as gparam } from '../generator/params.ts';
import { adultEquivalent, designerWarnings, impliedSplit, rangeProblems, sheetChangeOfDirection, type DesignerWarning } from './checks.ts';
import { PARAMS } from './params.ts';
import { lockedChanges, missingFields, originOf, type Sheet } from './sheet.ts';

/** Version stamp written in place of a generator version (D1.1.1 provenance). */
export const DESIGNER_VERSION = PARAMS.version;
/** Stream the designer opens for a designed person's birth day, appearance and grade look. Keyed by person. */
export const STREAM_DESIGN = 'person.design';

/** Where the designer is being opened (D13.1.1 rules, N4). */
export type DesignerWorld =
  | { kind: 'none' }
  | { kind: 'career'; started: boolean; sandboxWorld: boolean; certified: boolean };

export interface Refusal { ok: false; rule: string; message: string; problems: string[] }
const refuse = (rule: string, message: string, problems: string[] = []): Refusal => ({ ok: false, rule, message, problems });

/**
 * D13.1.1: outside a certified career (N4) only; in career mode only before the world starts or in a world
 * flagged sandbox.
 */
export function designerAccess(world: DesignerWorld): { ok: true } | Refusal {
  if (world.kind === 'none') return { ok: true };
  if (world.certified) return refuse('N4', 'the designer is closed in a certified career');
  if (world.started && !world.sandboxWorld) return refuse('D13.1.1', 'the designer opens in a career only before the world starts or in a sandbox world');
  return { ok: true };
}

/** D13.1.1 outputs: who, when, which checks were overridden. */
export interface DesignerLogEntry {
  personId: number;
  editorId: number | null;
  at: WorldDate | null;
  entry: Sheet['entry'];
  archetypeId: string | null;
  sourcePersonId: number | null;
  sandbox: boolean;
  overridden: { field: string; kind: DesignerWarning['kind']; value: number }[];
}

export interface DesignedPlayer extends GeneratedPlayer {
  sandbox: boolean;
  log: DesignerLogEntry;
  /** True in a career world: the world's record is marked "edited" (D13.1.1). */
  marksWorldEdited: boolean;
}

export interface CommitInput {
  sheet: Sheet;
  world: DesignerWorld;
  editorId: number | null;
  at: WorldDate | null;
  rnd: GeneratorRandom;
}

function groupForAge(age: number): PopulationGroup {
  return age <= 18 ? 'recruit' : age <= 22 ? 'college_player' : 'pro_player';
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Body-derived hidden keys, written from the sheet so edits always reach them (generator names). */
function bodyHidden(sheet: Sheet, adult: BodyVector, base: Record<string, number>, math: GeneratorRandom['math']): Record<string, number> {
  const h: Record<string, number> = { ...base };
  for (const k of ['adult_three_cone_s', 'adult_shuttle_s', 'adult_vertical_in', 'adult_broad_in', 'adult_bench_reps', 'bench_reps']) delete h[k];
  h.adult_height_in = r2(adult.heightIn!);
  h.frame_weight_lb = r1(adult.weightLb!);
  h.adult_forty_s = r2(adult.fortyS!);
  h.adult_ten_split_s = r2(sheet.tests.tenSplitS !== null ? sheet.tests.tenSplitS * (adult.fortyS! / sheet.tests.fortyS!) : impliedSplit(adult.fortyS!));
  for (const [key, v] of [['adult_three_cone_s', adult.threeConeS], ['adult_shuttle_s', adult.shuttleS], ['adult_vertical_in', adult.verticalIn],
    ['adult_broad_in', adult.broadIn], ['adult_bench_reps', adult.benchReps], ['bench_reps', sheet.tests.benchReps]] as const) {
    if (v !== undefined && v !== null) h[key] = r2(v);
  }
  h.development_rate ??= 1;
  h.learning_rate ??= 1;
  h.maturity_offset_y ??= 0;
  if (h.durability_mult === undefined) {
    // D2.4.2: durability ISS is 50 - 10 z of the multiplier's log; invert it.
    const z = -(sheet.attributes.durability! - gparam('physicalProfileIss')) / gparam('issPerSd');
    h.durability_mult = r2(durabilityMultiplier(z, math));
  }
  if (sheet.armLengthIn !== null) h.arm_length_in = sheet.armLengthIn; else delete h.arm_length_in;
  if (sheet.handSizeIn !== null) h.hand_size_in = sheet.handSizeIn; else delete h.hand_size_in;
  h.throws_left = sheet.throwingHand === 'left' ? 1 : 0;
  h.kicks_left = sheet.kickingFoot === 'left' ? 1 : 0;
  if (sheet.sandbox) h.designed_sandbox = 1; else delete h.designed_sandbox;
  return h;
}

/**
 * Commits a sheet. Refused when the designer is closed here, required fields are missing (D13.1.1
 * acceptance 3), a value is outside what the record holds, a real person's locked field changed
 * (D13.6.2 rule 5), or a D13.1.2 warning stands without the sandbox switch.
 */
export function commitSheet(input: CommitInput): { ok: true; player: DesignedPlayer } | Refusal {
  const { sheet, world, rnd } = input;
  const access = designerAccess(world);
  if (!access.ok) return access;
  const missing = missingFields(sheet);
  if (missing.length) return refuse('D13.1.1', 'required fields are missing', missing);
  const range = rangeProblems(sheet);
  if (range.length) return refuse('D13.1.2', 'values outside what a record holds', range.map((r) => `${r.field}: ${r.detail}`));
  const locked = lockedChanges(sheet);
  if (locked.length) return refuse('D13.6.2', 'these fields cannot be changed on a real person', locked);
  const warnings = designerWarnings(sheet, rnd.math);
  if (warnings.length && !sheet.sandbox) return refuse('D13.1.2', 'plausibility warnings stand; fix them or turn on the sandbox switch', warnings.map((w) => `${w.field}: ${w.detail}`));

  const src = sheet.source;
  const s = rnd.open(STREAM_DESIGN, [sheet.personId]);
  const age = sheet.ageYears!;
  const dayIndex = src ? src.birthDate.dayIndex : s.int(0, 364);
  const birthYear = sheet.seasonYear - age - (dayIndex > 243 ? 1 : 0);
  const adult = adultEquivalent(sheet);
  const hidden = bodyHidden(sheet, adult, sheet.hidden, rnd.math);
  const attributes: Record<string, number> = {};
  const ceilings: Record<string, number> = {};
  for (const id of ATTRIBUTE_IDS) { attributes[id] = sheet.attributes[id]!; ceilings[id] = sheet.ceilings[id]!; }
  const t = sheet.tests;
  const real = originOf(sheet) === 'imported';
  const traitBlock = src ? src.traitBlock : drawTraitBlock(rnd.open(STREAM_TRAITS, [sheet.personId]), {
    group: groupForAge(age), ageYears: age, seasonYear: sheet.seasonYear, roles: ['player'],
  });
  const record = PersonRecord.parse({
    id: sheet.personId,
    origin: originOf(sheet),
    externalRef: real ? src!.externalRef : null,
    provenance: { generatorVersion: DESIGNER_VERSION, seedHex: rnd.seedHex(STREAM_DESIGN, [sheet.personId]) },
    name: { first: sheet.firstName!, last: sheet.lastName!, suffix: src?.name.suffix ?? null, nickname: src?.name.nickname ?? null },
    birthDate: { seasonYear: birthYear, dayIndex },
    hometown: sheet.hometown,
    appearanceSeed: src ? src.appearanceSeed : s.nextU32(),
    roles: src ? [...src.roles] : ['player'],
    agentId: src && src.id === sheet.personId ? src.agentId : null,
    diedYear: null,
    playing: {
      position: sheet.position!,
      lastJersey: src && src.id === sheet.personId ? src.playing?.lastJersey ?? null : null,
      heightIn: sheet.heightIn!,
      weightLb: sheet.weightLb!,
      attributes,
      tests: {
        fortyS: t.fortyS!, tenSplitS: t.tenSplitS ?? impliedSplit(t.fortyS!), threeConeS: t.threeConeS, shuttleS: t.shuttleS,
        verticalIn: t.verticalIn, broadIn: t.broadIn, changeOfDirectionZ: r2(sheetChangeOfDirection(sheet)),
      },
      ceilings,
      hidden,
      // Editing in place keeps the season's load and counters (D13.1.1 edge case); a new person arrives fresh.
      conditioning: src && src.id === sheet.personId && src.playing ? src.playing.conditioning : attributes.stamina!,
      freshnessLongTerm: src && src.id === sheet.personId && src.playing ? src.playing.freshnessLongTerm : 1,
      eligibility: src && src.id === sheet.personId && src.playing ? src.playing.eligibility : {
        college: { seasonsOfCompetitionUsed: 0, clockStartYear: null, redshirtUsed: false },
        pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 },
      },
    },
    life: src?.life ? { ...src.life, homeRegion: sheet.homeRegion! } : { householdId: null, homeRegion: sheet.homeRegion! },
    // Statistics and honours stay with the person edited in place; a copy starts with none.
    history: src && src.id === sheet.personId ? src.history : { honourEventIds: [] },
    traitBlock,
  });
  const log: DesignerLogEntry = {
    personId: sheet.personId, editorId: input.editorId, at: input.at, entry: sheet.entry, archetypeId: sheet.archetypeId,
    sourcePersonId: src && sheet.entry === 'copy' ? src.id : null, sandbox: sheet.sandbox,
    overridden: warnings.map((w) => ({ field: w.field, kind: w.kind, value: w.value })),
  };
  return {
    ok: true,
    player: {
      record, adult, attempts: 1, failures: [],
      extras: {
        armLengthIn: hidden.arm_length_in ?? 0, handSizeIn: hidden.hand_size_in ?? 0, throwingHand: sheet.throwingHand, kickingFoot: sheet.kickingFoot,
        naturalSide: hidden.natural_side === -1 ? 'left' : hidden.natural_side === 1 ? 'right' : 'either',
        benchReps: t.benchReps, declinedTests: [],
      },
      sandbox: sheet.sandbox, log, marksWorldEdited: world.kind === 'career',
    },
  };
}

/** A sandbox person never enters a certified career (D13.1.2). */
export function mayEnterCertifiedCareer(rec: PersonRecord): boolean {
  return rec.playing?.hidden.designed_sandbox !== 1;
}

/** Sandbox players are excluded from any shared ranking (D13.1.2 acceptance). */
export function inSharedRankings(rec: PersonRecord): boolean {
  return rec.playing?.hidden.designed_sandbox !== 1;
}
