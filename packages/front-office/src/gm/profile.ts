// K7.1.1 general manager record and K7.1.2 college roster-builder record. Truth data: never shown, no labels
// stored, nothing bought or unlocked (K2.1.1 rules). Labels the user reads form from the transaction log (X2).
// Every field has a named reader (FIELD_READERS; the test checks each reader file really reads the field).
import { P } from './params.ts';
import { clamp, type PersonId, type Rng } from './types.ts';

export interface GmPhilosophy {
  /** -1 builds through signed veterans, 1 through picks. Read by trade.ts (pick lines) and roster.ts (own-pick bonus). */
  readonly draftVsVeteran: number;
  /** His own multiplier per position around the M1 league table. */
  readonly positionValues: Readonly<Record<string, number>>;
  /** How sharply he discounts age, per position group (1 = the league curve). */
  readonly ageCurveBelief: Readonly<Record<string, number>>;
  /** -1 production and floor, 1 measurables and projection. */
  readonly riskOnTraits: number;
  /** -1 pays up for top slots, 1 values volume in later rounds. */
  readonly pickValueCurve: number;
  /** 0 pays as he goes, 1 pushes money into later years. */
  readonly capStyle: number;
  /** 0 this season only, 1 weighs the next three as much as this one. */
  readonly timeHorizon: number;
}

export interface GmProfile {
  readonly personId: PersonId;
  readonly philosophy: GmPhilosophy;
  /** Hidden, z-scored. */
  readonly behavior: { readonly evaluation: number; readonly negotiation: number; readonly marketRead: number };
  /** 0 to 1: how much the head coach's input moves him (K7.1.1 rule 3). */
  readonly coachVoiceWeight: number;
  readonly memory: {
    /** Net of past deals with each other general manager, by his own valuation at the time. */
    readonly dealsWith: Readonly<Record<number, { readonly count: number; readonly net: number }>>;
    readonly playersPassedOn: readonly PersonId[];
  };
}

/** K7.1.2. Stored on the head coach's person record, and on the program general manager's where one exists. */
export interface CollegeRosterPhilosophy {
  readonly personId: PersonId;
  readonly highSchoolVsTransfer: number;
  readonly positionValues: Readonly<Record<string, number>>;
  readonly developVsBuy: number;
  readonly payShape: number;
  readonly lockIn: number;
  readonly regionalFocus: number;
  readonly timeHorizon: number;
}

/** Field to the source file that reads it (K7.1.1 rule 1: the validator requires a reader for every field). */
export const FIELD_READERS: Readonly<Record<string, string>> = {
  draftVsVeteran: 'trade.ts', positionValues: 'value.ts', ageCurveBelief: 'value.ts', riskOnTraits: 'value.ts',
  pickValueCurve: 'trade.ts', capStyle: 'contracts.ts', timeHorizon: 'value.ts',
  evaluation: 'value.ts', negotiation: 'contracts.ts', marketRead: 'trade.ts', coachVoiceWeight: 'needs.ts',
  dealsWith: 'trade.ts', playersPassedOn: 'free-agency.ts',
};

const signed = (rng: Rng, sd: number) => clamp(sd * rng.normal(), -1, 1);
const around = (rng: Rng, sd: number, lo: number, hi: number) => clamp(1 + sd * rng.normal(), lo, hi);
const z = (rng: Rng) => clamp(rng.normal(), -P('profile.zClamp'), P('profile.zClamp'));

function multipliers(rng: Rng, keys: readonly string[], sd: number, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of [...keys].sort()) out[k] = around(rng, sd, lo, hi);
  return out;
}

/** Who holds final say on the club's roster building (L5.2.1 starting arrangements). */
export type Arrangement = 'coach_final' | 'gm_final' | 'split' | 'owner_final';

/** K7.1.1 rule 3: the weight starts from the power arrangement and moves with L5.2.4 trust (-1 to 1). */
export function coachVoiceWeight(arrangement: Arrangement, trust: number): number {
  return clamp(P(`voice.start.${arrangement}`) + P('voice.trustSlope') * trust, 0, 1);
}

/** Generation from `gmPopulation.pro` (K7.1.1). Positions and groups come from content (X8, D8). */
export function generateGm(rng: Rng, personId: PersonId, positions: readonly string[], groups: readonly string[], arrangement: Arrangement): GmProfile {
  const philosophy: GmPhilosophy = {
    draftVsVeteran: signed(rng, P('profile.styleSd')),
    positionValues: multipliers(rng, positions, P('profile.positionValueSd'), P('profile.positionValueMin'), P('profile.positionValueMax')),
    ageCurveBelief: multipliers(rng, groups, P('profile.ageBeliefSd'), P('profile.ageBeliefMin'), P('profile.ageBeliefMax')),
    riskOnTraits: signed(rng, P('profile.styleSd')),
    pickValueCurve: signed(rng, P('profile.styleSd')),
    capStyle: clamp(P('profile.capStyleMean') + P('profile.capStyleSd') * rng.normal(), 0, 1),
    timeHorizon: clamp(P('profile.horizonMean') + P('profile.horizonSd') * rng.normal(), 0, 1),
  };
  return {
    personId, philosophy,
    behavior: { evaluation: z(rng), negotiation: z(rng), marketRead: z(rng) },
    coachVoiceWeight: coachVoiceWeight(arrangement, 0),
    memory: { dealsWith: {}, playersPassedOn: [] },
  };
}

/** K7.1.1 edge case and K2.2.2: an imported real general manager gets neutral facets and median behaviour. */
export function medianGm(personId: PersonId, positions: readonly string[], groups: readonly string[], arrangement: Arrangement): GmProfile {
  const still: Rng = { normal: () => 0, uniform: () => P('profile.capStyleMean') };
  return generateGm(still, personId, positions, groups, arrangement);
}

/** Generation from `rosterBuilderPopulation.college` (K7.1.2). `transferShareMean` is the era's calibration mean (rule 7), from rule data. */
export function generateCollegeBuilder(rng: Rng, personId: PersonId, positions: readonly string[], transferShareMean: number): CollegeRosterPhilosophy {
  const unit = (mean: number) => clamp(mean + P('profile.collegeSd') * rng.normal(), 0, 1);
  return {
    personId,
    highSchoolVsTransfer: unit(1 - transferShareMean),
    positionValues: multipliers(rng, positions, P('profile.positionValueSd'), P('profile.positionValueMin'), P('profile.positionValueMax')),
    developVsBuy: unit(P('profile.collegeMid')), payShape: unit(P('profile.collegeMid')), lockIn: unit(P('profile.collegeMid')),
    regionalFocus: unit(P('profile.collegeMid')),
    timeHorizon: clamp(P('profile.horizonMean') + P('profile.horizonSd') * rng.normal(), 0, 1),
  };
}

/** K7.1.2 rule 2: where a program general manager exists the two records blend at the head coach's weight. */
export function blendCollege(head: CollegeRosterPhilosophy, programGm: CollegeRosterPhilosophy | null): CollegeRosterPhilosophy {
  if (!programGm) return head;
  const w = P('profile.collegeHeadCoachWeight');
  const mix = (a: number, b: number) => w * a + (1 - w) * b;
  const positionValues: Record<string, number> = {};
  for (const k of Object.keys(head.positionValues)) positionValues[k] = mix(head.positionValues[k]!, programGm.positionValues[k] ?? head.positionValues[k]!);
  return {
    personId: head.personId, positionValues,
    highSchoolVsTransfer: mix(head.highSchoolVsTransfer, programGm.highSchoolVsTransfer), developVsBuy: mix(head.developVsBuy, programGm.developVsBuy),
    payShape: mix(head.payShape, programGm.payShape), lockIn: mix(head.lockIn, programGm.lockIn),
    regionalFocus: mix(head.regionalFocus, programGm.regionalFocus), timeHorizon: mix(head.timeHorizon, programGm.timeHorizon),
  };
}

/** K7.1.1 rule 4, K7.1.2 rule 4: the horizon shortens when his own job is at risk (K8.3.1 pressure, 0 to 1). */
export function effectiveHorizon(timeHorizon: number, pressure: number): number {
  return timeHorizon * (1 - P('profile.pressureHorizonCut') * clamp(pressure, 0, 1));
}

/**
 * K7.1.1 rule 5 (K2.5.1): use and results move a value a little between seasons. `result` is -1 to 1, how the
 * moves made in that style turned out by his own later grades. No points, nothing chosen.
 */
export function seasonDrift(p: GmProfile, field: 'draftVsVeteran' | 'riskOnTraits' | 'pickValueCurve', result: number): GmProfile {
  const moved = clamp(p.philosophy[field] + P('profile.seasonNudge') * clamp(result, -1, 1) * (p.philosophy[field] >= 0 ? 1 : -1), -1, 1);
  return { ...p, philosophy: { ...p.philosophy, [field]: moved } };
}

/** Memory of a completed deal (K7.1.1 `dealsWith`), net by his own valuation when he agreed. */
export function rememberDeal(p: GmProfile, otherGmId: PersonId, net: number): GmProfile {
  const old = p.memory.dealsWith[otherGmId] ?? { count: 0, net: 0 };
  return { ...p, memory: { ...p.memory, dealsWith: { ...p.memory.dealsWith, [otherGmId]: { count: old.count + 1, net: old.net + net } } } };
}

export function rememberPassedOn(p: GmProfile, personId: PersonId): GmProfile {
  return p.memory.playersPassedOn.includes(personId) ? p : { ...p, memory: { ...p.memory, playersPassedOn: [...p.memory.playersPassedOn, personId] } };
}
