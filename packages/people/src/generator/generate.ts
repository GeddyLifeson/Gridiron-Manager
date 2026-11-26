// The generator core (D13.2.1): one request in, one full person record out, the same way every time for
// the same world seed. Every value written to the record is class truth except the identity and body
// fields the contract marks public (P3.2.2); no estimate is produced here (scouting is G-19).
import { ATTRIBUTE_IDS, PersonRecord, type DeterministicMath, type RandomStream } from '@gm/schema';
import { GROUPS, POSITION_RELEVANCE, RELEVANCE_OFFSET_ISS, profileOf, type ProfilePosition } from './catalogue.ts';
import { proProfile } from './profiles.ts';
import {
  changeOfDirectionZ, drawAdultBody, durabilityMultiplier, physicalIss, youthBody, type BodyVector, type Tier,
} from './body.ts';
import { plausibilityWarnings, type PlausibilityWarning } from './plausibility.ts';
import { drawTraitBlock, type PopulationGroup } from './traits.ts';
import { AGE_GAP_ISS, TIER_CEILING_MEAN, interp, param } from './params.ts';
import { clamp, normalInv } from './normal.ts';

export const GENERATOR_VERSION = 'g17.1';

/** Stream names this module opens. Both are keyed so a person never depends on generation order (D13.2.1 step 1, X1.2.1 rule 6). */
export const STREAM_GEN = 'person.gen';
export const STREAM_TRAITS = 'person.traits';

/**
 * Randomness and math handed in by the caller (the world layer binds @gm/engine-core's keyed streams
 * and DMATH; P1.2.1 does not let this package import the engine). `open` must return the same sequence
 * for the same name and scope, from the world seed (J13.1.1).
 */
export interface GeneratorRandom {
  open(name: string, scope: readonly (string | number)[]): RandomStream;
  /** 16 lowercase hex digits naming the same key, stored as provenance (D1.1.1; truth, W-12). */
  seedHex(name: string, scope: readonly (string | number)[]): string;
  math: DeterministicMath;
}

/** D13.2.1 step 1: hash(world seed, class year, class type, slot index). */
export interface ClassKey { classYear: number; classType: string; slotIndex: number }

/** Talent request (D13.2.1 inputs: "talent tier or percentile"). `pro_entrant` draws from the pro-entrant ceiling distribution. */
export type Talent = { kind: 'tier'; tier: Tier } | { kind: 'pro_entrant' } | { kind: 'percentile'; percentile: number };

export interface PlayerRequest {
  personId: number;
  /** Position code (catalogue POSITION_TO_PROFILE). */
  position: string;
  /** Football age: age on September 1 of `seasonYear` (D1.1.1). */
  ageYears: number;
  seasonYear: number;
  talent: Talent;
  classKey: ClassKey;
  /** X1.2.1 population group for the trait block. */
  group: PopulationGroup;
  homeRegion: string;
  hometown: string | null;
  /** D13.4.2 rule 3 active correction for this position, in ISS on ceiling means. 0 when none. */
  ceilingShiftIss?: number;
}

/** Names come from G-18's tables through the caller (people may not import football-content, P1.2.1). */
export type NameSource = (s: RandomStream, req: PlayerRequest) => PersonRecord['name'];

/** Placeholder names: never a real person's name (D13.5.2). Used by tests and until G-18 lands. */
export const placeholderNames: NameSource = (_s, req) => ({ first: 'Generated', last: `Player${req.personId}`, suffix: null, nickname: null });

/** Fields the contract has no slot for yet (CR-G17-1), also kept in `playing.hidden` so they persist. */
export interface BodyExtras {
  armLengthIn: number;
  handSizeIn: number;
  throwingHand: 'left' | 'right';
  kickingFoot: 'left' | 'right';
  naturalSide: 'left' | 'right' | 'either';
  /** True bench ability on a good day, current; null where the profile has no bench (D2.3.1). */
  benchReps: number | null;
  /** D2.1.1: tests this prospect will decline at his first testing event (generator's seeded draw). */
  declinedTests: string[];
}

export interface GeneratedPlayer {
  record: PersonRecord;
  extras: BodyExtras;
  adult: BodyVector;
  /** Attempts used: 1 when the first draw passed D13.1.2. */
  attempts: number;
  /** Warnings of the last attempt when every attempt failed (logged error case of step 9). */
  failures: PlausibilityWarning[];
}

/** D2.1.1 share of forty runners who recorded each test, by profile position (1 of 3, computed from the register). */
export const TEST_PARTICIPATION: Readonly<Partial<Record<ProfilePosition, readonly [number, number, number, number, number]>>> = {
  // vertical, broad, 3-cone, shuttle, bench
  QB: [0.83, 0.84, 0.76, 0.78, 0.03], RB: [0.86, 0.84, 0.53, 0.56, 0.72], WR: [0.84, 0.82, 0.59, 0.62, 0.47],
  TE: [0.84, 0.83, 0.68, 0.69, 0.74], OT: [0.84, 0.81, 0.69, 0.71, 0.67], IOL: [0.83, 0.82, 0.75, 0.77, 0.74],
  DT: [0.79, 0.76, 0.64, 0.66, 0.73], EDGE: [0.82, 0.82, 0.64, 0.65, 0.73], LB: [0.84, 0.84, 0.61, 0.64, 0.73],
  CB: [0.82, 0.81, 0.51, 0.54, 0.67], S: [0.78, 0.80, 0.62, 0.61, 0.81],
};
const PARTICIPATION_TESTS = ['verticalIn', 'broadIn', 'threeConeS', 'shuttleS', 'benchReps'] as const;

/** D8.1.1 age of the adult reference: values at 23 and over are adult. */
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

function gapAt(age: number): number { return interp(AGE_GAP_ISS, age); }

function talentBase(t: Talent, math: DeterministicMath): { mean: number; sd: number; fixedG: number | null } {
  if (t.kind === 'tier') return { mean: TIER_CEILING_MEAN[t.tier], sd: param('tierCeilingSd'), fixedG: null };
  if (t.kind === 'percentile') return { mean: param('proEntrantCeilingMean'), sd: param('proEntrantCeilingSd'), fixedG: normalInv(clamp(t.percentile, 1e-6, 1 - 1e-6), math) };
  return { mean: param('proEntrantCeilingMean'), sd: param('proEntrantCeilingSd'), fixedG: null };
}

/** Generates one player (D13.2.1 steps 1 to 9). Throws only on a malformed request. */
export function generatePlayer(req: PlayerRequest, rnd: GeneratorRandom, names: NameSource = placeholderNames): GeneratedPlayer {
  const position = profileOf(req.position);
  const prof = proProfile(position);
  const tier = req.talent.kind === 'tier' ? req.talent.tier : null;
  const k = req.classKey;
  const maxAttempts = param('maxRedraws');
  let failures: PlausibilityWarning[] = [];
  let attempt = 0;
  let s!: RandomStream;
  let adult!: BodyVector;
  // Step 9: redraw with the next sub-seed until D13.1.2 passes, up to the limit; then keep the last and report.
  for (attempt = 0; attempt < maxAttempts; attempt++) {
    s = rnd.open(STREAM_GEN, [k.classYear, k.classType, k.slotIndex, attempt]);
    adult = drawAdultBody(s, prof, tier).adult;
    failures = plausibilityWarnings(prof, adult, rnd.math);
    if (failures.length === 0) break;
  }
  const attempts = Math.min(attempt + 1, maxAttempts);
  const usedAttempt = attempts - 1;

  // Split (D2.1.1, Assumption until sourced), arm and hand (D1.2.1, Assumption).
  const adultForty = adult.fortyS!;
  const adultSplit = adultForty / param('splitRatio') + param('splitResidualSdS') * s.normal();
  const armLengthIn = adult.heightIn! * param('armPerHeightIn') + param('armResidualSdIn') * s.normal();
  const handSizeIn = adult.heightIn! * param('handPerHeightIn') + param('handResidualSdIn') * s.normal();

  // Step 7: maturity offset and youth growth backward from adult values (D8.1.1).
  const maxOff = param('maturityOffsetMax');
  const maturityOffset = clamp(param('maturityOffsetSd') * s.normal(), -maxOff, maxOff);
  const effAge = req.ageYears + maturityOffset;
  const body = youthBody(adult, effAge);
  const youthShareSpeed = adultForty / body.fortyS!;
  const split = adultSplit / youthShareSpeed;

  // Step 6: hidden traits drawn fresh (durability, development and learning rate).
  const physDraws = { strengthE: s.normal(), staminaE: s.normal(), durabilityZ: s.normal() };
  const rate = () => clamp(1 + param('rateSd') * s.normal(), param('rateMin'), param('rateMax'));
  const developmentRate = rate();
  const learningRate = rate();

  // Handedness (D1.2.3).
  const throwingHand = s.chance(param('leftHandedThrowerShare')) ? 'left' as const : 'right' as const;
  const kickingFoot = s.chance(param('leftFootedKickerShare')) ? 'left' as const : 'right' as const;
  const naturalSide = s.chance(param('eitherSideShare')) ? 'either' as const : s.chance(0.5) ? 'left' as const : 'right' as const;

  // D2.1.1: tests declined at the first testing event.
  const declinedTests: string[] = [];
  const part = TEST_PARTICIPATION[position];
  PARTICIPATION_TESTS.forEach((t, i) => {
    const u = s.uniform();
    if (part && u >= part[i]!) declinedTests.push(t);
  });

  // Physical attributes (D2.3, D2.4): current from the current body, ceiling from the adult body.
  const physNow = physicalIss(prof, body, physDraws);
  const physAdult = physicalIss(prof, adult, physDraws);

  // Steps 4 and 5: ceilings per group by talent, current = ceiling - gap(age) / development rate + noise.
  const tb = talentBase(req.talent, rnd.math);
  const g = tb.fixedG ?? s.normal();
  const L = param('talentLoading');
  const shift = req.ceilingShiftIss ?? 0;
  const ceilings: Record<string, number> = {};
  const attributes: Record<string, number> = {};
  const gap = gapAt(effAge) / developmentRate;
  for (const [group, list] of Object.entries(GROUPS)) {
    const rel = POSITION_RELEVANCE[position][group] ?? 'o';
    const groupCeiling = tb.mean + RELEVANCE_OFFSET_ISS[rel] + shift + tb.sd * (L * g + Math.sqrt(1 - L * L) * s.normal());
    for (const a of list) {
      const c = clamp(groupCeiling + param('attributeOffsetSd') * s.normal(), 0, 100);
      const cur = clamp(c - gap + param('currentNoiseSd') * s.normal(), 0, c);
      ceilings[a] = r1(c);
      attributes[a] = Math.min(r1(cur), r1(c));
    }
  }
  for (const a of ['play_strength', 'explosiveness', 'stamina', 'durability'] as const) {
    const cur = r1(physNow[a]);
    attributes[a] = cur;
    ceilings[a] = Math.max(cur, r1(physAdult[a]));
  }
  for (const id of ATTRIBUTE_IDS) if (attributes[id] === undefined) throw new Error(`attribute ${id} not generated`);

  const benchNow = body.benchReps ?? null;
  const hidden: Record<string, number> = {
    development_rate: r2(developmentRate),
    learning_rate: r2(learningRate),
    durability_mult: r2(durabilityMultiplier(physDraws.durabilityZ, rnd.math)),
    maturity_offset_y: r2(maturityOffset),
    adult_height_in: r2(adult.heightIn!),
    frame_weight_lb: r1(adult.weightLb!),
    adult_forty_s: r2(adultForty),
    adult_ten_split_s: r2(adultSplit),
    // CR-G17-1: these belong in public or test fields of the contract; kept here so they persist.
    arm_length_in: r2(armLengthIn),
    hand_size_in: r2(handSizeIn),
    throws_left: throwingHand === 'left' ? 1 : 0,
    kicks_left: kickingFoot === 'left' ? 1 : 0,
    natural_side: naturalSide === 'left' ? -1 : naturalSide === 'right' ? 1 : 0,
  };
  for (const [key, v] of [['adult_three_cone_s', adult.threeConeS], ['adult_shuttle_s', adult.shuttleS], ['adult_vertical_in', adult.verticalIn],
    ['adult_broad_in', adult.broadIn], ['adult_bench_reps', adult.benchReps], ['bench_reps', benchNow]] as const) {
    if (v !== undefined && v !== null) hidden[key] = r2(v);
  }

  // D1.1.1: birth month uniform; day index counted from January 1 (CR-G17-2 asks the integrator to confirm
  // the C4 day convention). Football age is age on September 1 (day 243 of a common year).
  const dayIndex = s.int(0, 364);
  const birthYear = req.seasonYear - req.ageYears - (dayIndex > 243 ? 1 : 0);
  const appearanceSeed = s.nextU32();
  const name = names(s, req);

  const traits = drawTraitBlock(rnd.open(STREAM_TRAITS, [req.personId]), {
    group: req.group, ageYears: req.ageYears, seasonYear: req.seasonYear, roles: ['player'],
  });

  const record = {
    id: req.personId,
    origin: 'generated' as const,
    externalRef: null,
    provenance: { generatorVersion: GENERATOR_VERSION, seedHex: rnd.seedHex(STREAM_GEN, [k.classYear, k.classType, k.slotIndex, usedAttempt]) },
    name,
    birthDate: { seasonYear: birthYear, dayIndex },
    hometown: req.hometown,
    appearanceSeed,
    roles: ['player' as const],
    agentId: null,
    diedYear: null,
    playing: {
      position: req.position,
      lastJersey: null,
      heightIn: r1(body.heightIn!),
      weightLb: Math.round(body.weightLb!),
      attributes,
      tests: {
        fortyS: r2(body.fortyS!),
        tenSplitS: r2(split),
        threeConeS: body.threeConeS !== undefined ? r2(body.threeConeS) : null,
        shuttleS: body.shuttleS !== undefined ? r2(body.shuttleS) : null,
        verticalIn: body.verticalIn !== undefined ? r1(body.verticalIn) : null,
        broadIn: body.broadIn !== undefined ? Math.round(body.broadIn) : null,
        changeOfDirectionZ: r2(changeOfDirectionZ(prof, body)),
      },
      ceilings,
      hidden,
      // Assumption: a new person arrives conditioned to his stamina (D10 owns the state after creation).
      conditioning: attributes.stamina!,
      freshnessLongTerm: 1,
      eligibility: {
        college: { seasonsOfCompetitionUsed: 0, clockStartYear: null, redshirtUsed: false },
        pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 },
      },
    },
    life: { householdId: null, homeRegion: req.homeRegion },
    history: { honourEventIds: [] },
    traitBlock: traits,
  };
  return {
    record: PersonRecord.parse(record),
    extras: { armLengthIn: r2(armLengthIn), handSizeIn: r2(handSizeIn), throwingHand, kickingFoot, naturalSide, benchReps: benchNow === null ? null : r1(benchNow), declinedTests },
    adult,
    attempts,
    failures: attempts === maxAttempts && failures.length > 0 ? failures : [],
  };
}
