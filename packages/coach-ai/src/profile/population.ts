// Population files `coachPopulation.<level>.<role>` (K2.2.1 inputs, K2.3.1 outputs) and generation
// templates (K2.2.1 rule 2). Template names are generation data only and are never stored on a person.
// Means that have a real source cite it through sources.ts; every other number is a named Assumption.
// These live here until the content pipeline (G-08) gives coach content a home in football-content;
// the shapes are plain data so they can move to a content file unchanged.
import { BEHAVIOR_KEYS, DEFENSE_RATE_KEYS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, TENDENCY_KEYS, type BehaviorKey, type TendencyKey } from './keys.ts';
import { ASSUMPTIONS, PRO_TARGETS, PRO_TEAM_SPREADS, type SourceStatus } from './sources.ts';
import type { CoachLevel, CoachRole, PersonnelKey, SideOfBall } from './types.ts';

/** One numeric profile field's population distribution: normal, truncated to [min, max]. */
export interface FieldSpec {
  readonly mean: number;
  readonly sd: number;
  readonly min: number;
  readonly max: number;
  /** Status of the mean and of the spread, so the calibration report can print them. */
  readonly meanStatus: SourceStatus;
  readonly sdStatus: SourceStatus;
  readonly citation: string;
}

/** A generation template (K2.2.1 rule 2): leans in units of each field's SD, plus a side. */
export interface Template {
  readonly id: string;
  /** Side of the ball the template belongs to, or 'any'. */
  readonly side: SideOfBall | 'any';
  /** Relative weight in this population. */
  readonly weight: number;
  /** Lean per field path, in SDs of that field. */
  readonly lean: Readonly<Record<string, number>>;
}

export interface CoachPopulation {
  /** `coachPopulation.<level>.<role>` (K2 header). */
  readonly key: string;
  readonly level: CoachLevel;
  readonly role: CoachRole;
  readonly version: number;
  /** Every numeric field except personnel, keyed by path (`offenseRates.playAction`, `behavior.callFit`). */
  readonly fields: Readonly<Record<string, FieldSpec>>;
  /** Mean wanted personnel shares (sum 1) and the relative SD of each share. */
  readonly personnel: Readonly<Record<PersonnelKey, number>>;
  readonly personnelRelativeSd: number;
  readonly families: { readonly offense: Readonly<Record<string, number>>; readonly defense: Readonly<Record<string, number>>; readonly specialTeams: Readonly<Record<string, number>> };
  /** Age distribution of people in this role, for the `analyticsTrust` correlation (K2.2.1 rule 4). */
  readonly age: { readonly mean: number; readonly sd: number };
  readonly templates: readonly Template[];
}

const A = (citation: string) => citation;
/** Default relative SD of a system rate where no team-level spread is sourced (K2.3.1 rule 3). */
export const DEFAULT_RATE_RELATIVE_SD = { value: 0.2, status: 'Assumption' as const, citation: 'K2.3.1 rule 3 (starting SD where none is sourced)' };

function rate(mean: number, meanStatus: SourceStatus, citation: string, sd?: { value: number; status: SourceStatus }): FieldSpec {
  return {
    mean, min: 0.02, max: 0.98, meanStatus, citation,
    sd: sd ? sd.value : mean * DEFAULT_RATE_RELATIVE_SD.value,
    sdStatus: sd ? sd.status : 'Assumption',
  };
}
const z = (citation: string, mean = 0, sd = 1): FieldSpec => ({ mean, sd, min: -3.5, max: 3.5, meanStatus: 'Assumption', sdStatus: 'Assumption', citation });
const assumed = (mean: number, sd: number, min: number, max: number, citation: string): FieldSpec => ({ mean, sd, min, max, meanStatus: 'Assumption', sdStatus: 'Assumption', citation });

/** Pro system rates. Sourced means cite the register; the rest are Assumption starting values. */
function proSystemFields(): Record<string, FieldSpec> {
  const T = PRO_TARGETS, S = PRO_TEAM_SPREADS;
  return {
    'offenseRates.neutralPass': rate(T.neutralPass.value, T.neutralPass.status, `${T.neutralPass.factId}; spread ${S.neutralPass.citation}`, S.neutralPass),
    'offenseRates.motion': rate(T.motion.value, T.motion.status, T.motion.factId!),
    'offenseRates.playAction': rate(T.playAction.value, T.playAction.status, `${T.playAction.factId}; spread ${S.playAction.citation}`, S.playAction),
    'offenseRates.shotgun': rate(T.shotgun.value, T.shotgun.status, T.shotgun.factId!),
    'offenseRates.screen': rate(T.screen.value, T.screen.status, T.screen.factId!),
    'offenseRates.rpo': rate(0.1, 'Assumption', A('K2.1.2: no RPO share sourced')),
    'offenseRates.deepShot': rate(0.1, 'Assumption', A('K2.1.2: no designed deep-shot share sourced')),
    'defenseRates.blitz': rate(T.blitz.value, T.blitz.status, T.blitz.citation, S.blitz),
    'defenseRates.simulatedPressure': rate(0.08, 'Assumption', A('K2.1.2: no simulated-pressure share sourced')),
    'defenseRates.man': rate(0.3, 'Assumption', A('K2.1.2: no man-coverage share in the register')),
    'defenseRates.twoHigh': rate(0.45, 'Assumption', A('K2.1.2: no two-high share in the register')),
    'defenseRates.disguise': rate(0.3, 'Assumption', A('K2.1.2: no disguise share sourced')),
    'tempo.noHuddleShare': rate(T.noHuddle.value, T.noHuddle.status, T.noHuddle.factId!),
    'tempo.snapAtPlayClockS': assumed(8, 3, 1, 20, 'K2.1.2: play-clock second he snaps at, not sourced'),
    'sheet.offenseCalls': assumed(150, 30, 60, 260, 'G6.6.1: plan size, not sourced'),
    'sheet.defenseCalls': assumed(80, 20, 30, 160, 'G6.6.1: plan size, not sourced'),
  };
}

function tendencyFields(): Record<TendencyKey, FieldSpec> {
  return {
    // Positive = more conservative than the model (K2.1.3 rule 3). Coaches historically kicked more
    // than models advised (Romer 2006, 2 of 3 per K2.1.3); the size is tuned by K5 against the go rate.
    fourthDownOffset: assumed(2, 2, -6, 10, 'K2.1.3: mean tuned to J15.3.2 fourth-down mix by the K5 batch run'),
    twoPointOffset: assumed(1, 1.5, -5, 8, 'K2.1.3: tuned by the K5 batch run'),
    endOfHalfAggression: z('K2.1.3'),
    leadProtection: z('K2.1.3'),
    deficitUrgency: z('K2.1.3'),
    lateDefenseRisk: z('K2.1.3'),
    starterRestBias: z('K2.1.3'),
    analyticsTrust: assumed(0.5, 0.18, 0.02, 0.98, 'K2.1.3, I5.1.2'),
    challengeEagerness: z('K2.1.3'),
    iceKicker: assumed(0.35, 0.15, 0.02, 0.98, 'K2.1.3'),
  };
}

function behaviorFields(spread: number): Record<BehaviorKey, FieldSpec> {
  const out = {} as Record<BehaviorKey, FieldSpec>;
  for (const k of BEHAVIOR_KEYS) out[k] = z('K2.1.4 (z-scored at the level; spread scaled by K2.3.2)', 0, spread);
  return out;
}

const PRO_PERSONNEL: Record<PersonnelKey, number> = (() => {
  const T = PRO_TARGETS;
  const named = T.p10.value + T.p11.value + T.p12.value + T.p13.value + T.p21.value + T.p22.value;
  return { p10: T.p10.value, p11: T.p11.value, p12: T.p12.value, p13: T.p13.value, p21: T.p21.value, p22: T.p22.value, other: 1 - named };
})();

/**
 * Templates from the design doc archetype table (plans/handoffs/support/design-doc-section-11-ai.txt).
 * The table gives directions only; every size below is an Assumption in SDs of the field.
 */
export const TEMPLATES: readonly Template[] = [
  { id: 'offensive-play-designer', side: 'offense', weight: 1, lean: {
    'offenseRates.motion': 0.8, 'offenseRates.playAction': 0.8, 'tendencies.fourthDownOffset': -0.6,
    'behavior.callFit': 0.5, 'behavior.preparation': 0.4, 'behavior.clockManagement': -0.4 } },
  { id: 'defensive-tactician', side: 'defense', weight: 1, lean: {
    'defenseRates.disguise': 0.8, 'defenseRates.simulatedPressure': 0.8, 'tendencies.leadProtection': 0.6,
    'behavior.adjustment': 0.5, 'behavior.selfScout': 0.5 } },
  { id: 'manager-delegator', side: 'any', weight: 1, lean: {
    'behavior.clockManagement': 0.5, 'behavior.preparation': -0.4, 'tendencies.analyticsTrust': 0.3 } },
  { id: 'run-and-defense', side: 'any', weight: 1, lean: {
    'offenseRates.neutralPass': -0.8, 'tempo.noHuddleShare': -0.6, 'personnel.heavy': 0.8, 'offenseRates.shotgun': -0.8,
    'tendencies.fourthDownOffset': 0.7, 'tendencies.leadProtection': 0.6, 'behavior.teaching': 0.5, 'behavior.selfScout': -0.5 } },
  { id: 'analytics-led', side: 'any', weight: 1, lean: {
    'offenseRates.neutralPass': 0.4, 'tendencies.fourthDownOffset': -0.8, 'tendencies.twoPointOffset': -0.6,
    'tendencies.analyticsTrust': 1.2, 'behavior.clockManagement': 0.4 } },
];

/** Offensive families by level (F14.2, F14.6.1). Shares by level are Unverified (owner T10): equal weights. */
const PRO_FAMILIES = {
  offense: { 'family.off.pro-passing': 1, 'family.off.wide-zone-play-action': 1, 'family.off.spread-rpo': 1 },
  defense: { 'family.def.four-down-one-high': 1, 'family.def.two-high-split-field': 1, 'family.def.odd-front': 1, 'family.def.pressure-man': 1 },
  specialTeams: { 'family.st.standard': 1 },
};
const COLLEGE_FAMILIES = {
  offense: { 'family.off.tempo-spread': 1, 'family.off.air-raid': 1, 'family.off.spread-option': 1, 'family.off.power-spread': 1, 'family.off.triple-option': 0.25, 'family.off.pro-style': 1 },
  defense: { 'family.def.four-down-one-high': 1, 'family.def.two-high-split-field': 1, 'family.def.odd-front': 1, 'family.def.pressure-man': 1, 'family.def.three-safety': 1 },
  specialTeams: { 'family.st.standard': 1 },
};

/** Age by role (X10.3 head coaches 35 to 70, mode 50; the rest Assumption). */
const AGE: Record<CoachRole, { mean: number; sd: number }> = {
  headCoach: { mean: 50, sd: 8 },
  offensiveCoordinator: { mean: 45, sd: 8 },
  defensiveCoordinator: { mean: 47, sd: 8 },
  specialTeamsCoordinator: { mean: 45, sd: 8 },
  positionCoach: { mean: 40, sd: 10 },
};

export const ROLES: readonly CoachRole[] = ['headCoach', 'offensiveCoordinator', 'defensiveCoordinator', 'specialTeamsCoordinator', 'positionCoach'];
export const LEVELS: readonly CoachLevel[] = ['pro', 'college'];

/** Per-level settings. College system rates are not measured yet (T10, T12): pro values, marked Assumption. */
const LEVEL_SETTINGS: Record<CoachLevel, { behaviorSpread: number; families: CoachPopulation['families']; borrowedSystem: boolean }> = {
  pro: { behaviorSpread: 1, families: PRO_FAMILIES, borrowedSystem: false },
  college: { behaviorSpread: ASSUMPTIONS.collegeBehaviorSpread.value, families: COLLEGE_FAMILIES, borrowedSystem: true },
};

function build(level: CoachLevel, role: CoachRole): CoachPopulation {
  const L = LEVEL_SETTINGS[level];
  const system = proSystemFields();
  const sys: Record<string, FieldSpec> = {};
  for (const [k, f] of Object.entries(system)) {
    sys[k] = L.borrowedSystem
      ? { ...f, meanStatus: 'Assumption', sdStatus: 'Assumption', citation: `college value not measured (T10, T12 owe it); pro value borrowed: ${f.citation}` }
      : f;
  }
  const fields: Record<string, FieldSpec> = { ...sys };
  for (const [k, f] of Object.entries(tendencyFields())) fields[`tendencies.${k}`] = f;
  for (const [k, f] of Object.entries(behaviorFields(L.behaviorSpread))) fields[`behavior.${k}`] = f;
  return {
    key: `coachPopulation.${level}.${role}`,
    level, role, version: 1,
    fields,
    personnel: PRO_PERSONNEL,
    personnelRelativeSd: DEFAULT_RATE_RELATIVE_SD.value,
    families: L.families,
    age: AGE[role],
    templates: TEMPLATES,
  };
}

export const POPULATIONS: Readonly<Record<string, CoachPopulation>> = (() => {
  const out: Record<string, CoachPopulation> = {};
  for (const level of LEVELS) for (const role of ROLES) { const p = build(level, role); out[p.key] = p; }
  return out;
})();

export function populationKey(level: CoachLevel, role: CoachRole): string {
  return `coachPopulation.${level}.${role}`;
}

export function getPopulation(level: CoachLevel, role: CoachRole): CoachPopulation {
  const p = POPULATIONS[populationKey(level, role)];
  if (!p) throw new Error(`no population file ${populationKey(level, role)}`);
  return p;
}

/** Every numeric field path a population must define, in a fixed order (generation draw order). */
export const FIELD_PATHS: readonly string[] = [
  ...OFFENSE_RATE_KEYS.map((k) => `offenseRates.${k}`),
  ...DEFENSE_RATE_KEYS.map((k) => `defenseRates.${k}`),
  'tempo.noHuddleShare', 'tempo.snapAtPlayClockS', 'sheet.offenseCalls', 'sheet.defenseCalls',
  ...TENDENCY_KEYS.map((k) => `tendencies.${k}`),
  ...BEHAVIOR_KEYS.map((k) => `behavior.${k}`),
];

export { PERSONNEL_KEYS };
