// Generating a coach by level and role (K2.2.1) and profiles for imported real coaches (K2.2.2).
import { clamp, correlatedNormal, pickKey, pickWeighted, type Draws } from './draws.ts';
import { BEHAVIOR_KEYS, CALLER_FIELDS, DEFENSE_RATE_KEYS, EMPHASIS_KEYS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, ROLE_USES, TENDENCY_KEYS, type BehaviorKey } from './keys.ts';
import { blendMentorSystems, inheritTendencies, mentorWeights, type MentorInput } from './lineage.ts';
import { FIELD_PATHS, LATE_FIELD_PATHS, getPopulation, type CoachPopulation, type FieldSpec, type Template } from './population.ts';
import { ASSUMPTIONS } from './sources.ts';
import type { BehaviorBlock, CoachLevel, CoachProfile, CoachRole, DefenseRates, OffenseRates, PersonnelKey, SideOfBall, SystemBlock, TendencyBlock } from './types.ts';

/** X1 facet names this leaf reads for its correlations (K2.2.1 rule 4). 0 to 100, 50 is the middle. */
export interface FacetInput {
  readonly risk_tolerance?: number;
  readonly work_habits?: number;
}

export interface CoachGenInput {
  readonly personId: string;
  readonly level: CoachLevel;
  readonly role: CoachRole;
  readonly age: number;
  /** Side of the ball he played, from his playing history (K2.2.1 rule 1), or null when he did not play. */
  readonly playedSide: SideOfBall | null;
  /** A head coach who calls one side himself (K2.6.1 rule 1), else null. */
  readonly callsSide?: SideOfBall | null;
  readonly facets?: FacetInput;
  /** Seasons he has called plays and seasons as a head coach: parameters he has not used start lower (K2.2.1 rule 5). */
  readonly seasonsCalling: number;
  readonly seasonsAsHeadCoach: number;
  /** People he worked under who have a system (K2.5.2). The user may be one (rule 5). */
  readonly mentors?: readonly MentorInput[];
}

/** K2.2.1 rule 1 for roles whose side is fixed by the job. */
const ROLE_SIDE: Partial<Record<CoachRole, SideOfBall>> = {
  offensiveCoordinator: 'offense',
  defensiveCoordinator: 'defense',
  specialTeamsCoordinator: 'specialTeams',
};

/** Side when a head coach or position coach did not play: even (background shares Unverified, K2.2.1). */
export const NO_BACKGROUND_OFFENSE_SHARE = { value: 0.5, status: 'Assumption' as const, citation: 'K2.2.1 open question: background shares by level' };

function chooseSide(d: Draws, input: CoachGenInput): SideOfBall {
  const fixed = ROLE_SIDE[input.role];
  if (fixed) return fixed;
  if (input.callsSide) return input.callsSide;
  const lean = ASSUMPTIONS.offenseLeanFromOffensivePlayer.value;
  const pOffense = input.playedSide === 'offense' ? lean : input.playedSide === 'defense' ? 1 - lean : NO_BACKGROUND_OFFENSE_SHARE.value;
  return d.uniform() < pOffense ? 'offense' : 'defense';
}

export function eligibleTemplates(pop: CoachPopulation, side: SideOfBall): readonly Template[] {
  const eligible = pop.templates.filter((t) => t.side === 'any' || t.side === side);
  return eligible.length ? eligible : pop.templates;
}

function chooseTemplate(d: Draws, pop: CoachPopulation, side: SideOfBall): Template {
  const list = eligibleTemplates(pop, side);
  return list[pickWeighted(d, list.map((t) => t.weight))]!;
}

/**
 * Template leans centred on the population's weighted mean, and the variance they add, per field.
 * Centring keeps the population mean on the file's mean; the individual draw then uses the rest of
 * the variance so the total spread equals the file's SD (K2.3.1 rules 2 and 3).
 */
export interface TemplateMoments { readonly centred: ReadonlyMap<string, ReadonlyMap<string, number>>; readonly variance: ReadonlyMap<string, number> }

const momentCache = new WeakMap<CoachPopulation, Map<SideOfBall, TemplateMoments>>();
/** Moments over the templates a person on `side` can draw, so each side's population is centred. */
export function templateMoments(pop: CoachPopulation, side: SideOfBall): TemplateMoments {
  let bySide = momentCache.get(pop);
  if (!bySide) { bySide = new Map(); momentCache.set(pop, bySide); }
  const hit = bySide.get(side);
  if (hit) return hit;
  const list = eligibleTemplates(pop, side);
  const totalW = list.reduce((s, t) => s + t.weight, 0);
  const paths = new Set<string>();
  for (const t of list) for (const k of Object.keys(t.lean)) paths.add(k);
  const centred = new Map<string, Map<string, number>>();
  const variance = new Map<string, number>();
  for (const t of list) centred.set(t.id, new Map());
  for (const p of [...paths].sort()) {
    const mean = list.reduce((s, t) => s + t.weight * (t.lean[p] ?? 0), 0) / totalW;
    let v = 0;
    for (const t of list) {
      const c = (t.lean[p] ?? 0) - mean;
      centred.get(t.id)!.set(p, c);
      v += t.weight * c * c;
    }
    variance.set(p, v / totalW);
  }
  const out = { centred, variance };
  bySide.set(side, out);
  return out;
}

/** Smallest share of a field's SD left to the individual draw when templates explain a lot. */
const MIN_INDIVIDUAL_SD_SHARE = 0.25;

function drawField(d: Draws, spec: FieldSpec, path: string, template: Template, m: TemplateMoments, opts: { meanShiftSd?: number; sdScale?: number; zIn?: number; r?: number } = {}): number {
  const lean = m.centred.get(template.id)?.get(path) ?? 0;
  const v = m.variance.get(path) ?? 0;
  const indiv = Math.sqrt(Math.max(1 - v, MIN_INDIVIDUAL_SD_SHARE * MIN_INDIVIDUAL_SD_SHARE));
  // The stated correlation is with the whole field, so the individual part carries r / indiv.
  const n = opts.zIn !== undefined && opts.r !== undefined ? correlatedNormal(d, opts.zIn, clamp(opts.r / indiv, -1, 1)) : d.normal();
  const sd = spec.sd * (opts.sdScale ?? 1);
  const x = spec.mean + spec.sd * (opts.meanShiftSd ?? 0) + sd * lean + sd * indiv * n;
  return clamp(x, spec.min, spec.max);
}

const facetZ = (f: number | undefined): number | undefined => (f === undefined ? undefined : (f - 50) / ASSUMPTIONS.facetPointsPerZ.value);

/** Which behaviour parameters this person has not had the chance to use (K2.2.1 rules 5 and 7). */
export function unusedParameters(role: CoachRole, callsSide: SideOfBall | null | undefined): Set<BehaviorKey> {
  const used = new Set<BehaviorKey>(ROLE_USES[role]);
  if (callsSide) for (const k of CALLER_FIELDS) used.add(k);
  return new Set(BEHAVIOR_KEYS.filter((k) => !used.has(k)));
}

/** K2.2.1: one generated profile. Draw order is fixed, so one seed and one file give one profile. */
export function generateCoachProfile(input: CoachGenInput, d: Draws, pop: CoachPopulation = getPopulation(input.level, input.role)): CoachProfile {
  return generateTraced(input, d, pop).profile;
}

/**
 * Same draw as `generateCoachProfile`, also returning the template used. For tests and the
 * calibration report only: the template id is generation data and is never stored (K2.2.1 rule 2).
 */
export function generateTraced(input: CoachGenInput, d: Draws, pop: CoachPopulation = getPopulation(input.level, input.role)): { profile: CoachProfile; templateId: string; side: SideOfBall } {
  const side = chooseSide(d, input);
  const template = chooseTemplate(d, pop, side);
  const m = templateMoments(pop, side);
  const unused = unusedParameters(input.role, input.callsSide);
  const firstYearCaller = input.seasonsCalling <= 0;
  const zRisk = facetZ(input.facets?.risk_tolerance);
  const zWork = facetZ(input.facets?.work_habits);
  // A missing facet means no correlation: the field is drawn with its full independent spread.
  const zAge = (input.age - pop.age.mean) / pop.age.sd;

  const values = new Map<string, number>();
  for (const path of FIELD_PATHS) {
    const spec = pop.fields[path];
    if (!spec) throw new Error(`${pop.key} has no field ${path}`);
    const opts: { meanShiftSd?: number; sdScale?: number; zIn?: number; r?: number } = {};
    if (path === 'tendencies.fourthDownOffset' && zRisk !== undefined) { opts.zIn = zRisk; opts.r = ASSUMPTIONS.corrFourthDownWithRiskTolerance.value; }
    if (path === 'behavior.preparation' && zWork !== undefined) { opts.zIn = zWork; opts.r = ASSUMPTIONS.corrPreparationWithWorkHabits.value; }
    if (path === 'tendencies.analyticsTrust') { opts.zIn = zAge; opts.r = ASSUMPTIONS.corrAnalyticsTrustWithAge.value; }
    if (path.startsWith('behavior.')) {
      const k = path.slice('behavior.'.length) as BehaviorKey;
      const off = ASSUMPTIONS.firstYearCallerOffset.value;
      if (unused.has(k)) { opts.meanShiftSd = off / spec.sd; opts.sdScale = ASSUMPTIONS.unusedParameterSpread.value; }
      else if (firstYearCaller && (k === 'adjustment' || k === 'clockManagement')) opts.meanShiftSd = off / spec.sd;
    }
    values.set(path, drawField(d, spec, path, template, m, opts));
  }

  const personnel = drawPersonnel(d, pop, template, m);
  const families = {
    offense: pickKey(d, pop.families.offense),
    defense: pickKey(d, pop.families.defense),
    specialTeams: pickKey(d, pop.families.specialTeams),
  };

  let system = assembleSystem(values, personnel, families, side);
  const behavior = assembleBehavior(values);
  const mentors = input.mentors ?? [];
  if (mentors.length > 0) system = blendMentorSystems(mentors, system, pop, d);
  // K2.1.3 rule 4 fields are the last draws, so every value that existed before them is unchanged.
  for (const path of LATE_FIELD_PATHS) {
    const spec = pop.fields[path];
    if (!spec) throw new Error(`${pop.key} has no field ${path}`);
    values.set(path, drawField(d, spec, path, template, m));
  }
  let tendencies = assembleTendencies(values);
  if (mentors.length > 0) tendencies = inheritTendencies(mentors, tendencies, pop);
  const profile: CoachProfile = {
    personId: input.personId,
    league: input.level,
    role: input.role,
    system,
    tendencies,
    behavior,
    memory: { opponentNotes: {}, ownTendencyLog: null },
    lineage: { mentors: mentorWeights(mentors).map(({ mentor }) => ({ mentorId: mentor.mentorId, seasons: mentor.seasons, lastSeason: mentor.lastSeason })) },
    imported: false,
    version: 1,
  };
  return { profile, templateId: template.id, side };
}

const HEAVY: readonly PersonnelKey[] = ['p12', 'p13', 'p21', 'p22'];

function drawPersonnel(d: Draws, pop: CoachPopulation, template: Template, m: TemplateMoments): Record<PersonnelKey, number> {
  const heavyLean = m.centred.get(template.id)?.get('personnel.heavy') ?? 0;
  const raw = {} as Record<PersonnelKey, number>;
  let sum = 0;
  for (const k of PERSONNEL_KEYS) {
    const lean = HEAVY.includes(k) ? heavyLean : 0;
    const w = Math.max(pop.personnel[k] * (1 + pop.personnelRelativeSd * (lean + d.normal())), pop.personnel[k] * 0.05);
    raw[k] = w; sum += w;
  }
  for (const k of PERSONNEL_KEYS) raw[k] = raw[k] / sum;
  return raw;
}

function get(values: ReadonlyMap<string, number>, path: string): number {
  const v = values.get(path);
  if (v === undefined) throw new Error(`missing ${path}`);
  return v;
}

export function assembleSystem(values: ReadonlyMap<string, number>, personnel: Record<PersonnelKey, number>, families: { offense: string; defense: string; specialTeams: string }, side: SideOfBall): SystemBlock {
  const offenseRates = {} as OffenseRates;
  for (const k of OFFENSE_RATE_KEYS) offenseRates[k] = get(values, `offenseRates.${k}`);
  const defenseRates = {} as DefenseRates;
  for (const k of DEFENSE_RATE_KEYS) defenseRates[k] = get(values, `defenseRates.${k}`);
  const noHuddle = get(values, 'tempo.noHuddleShare');
  return {
    primarySide: side,
    offenseFamily: families.offense,
    defenseFamily: families.defense,
    specialTeamsFamily: families.specialTeams,
    playbookId: null,
    personnelWeights: personnel,
    tempoBase: { huddleShare: 1 - noHuddle, noHuddleShare: noHuddle, snapAtPlayClockS: get(values, 'tempo.snapAtPlayClockS') },
    offenseRates,
    defenseRates,
    sheetSize: { offenseCalls: Math.round(get(values, 'sheet.offenseCalls')), defenseCalls: Math.round(get(values, 'sheet.defenseCalls')) },
  };
}

function assembleTendencies(values: ReadonlyMap<string, number>): TendencyBlock {
  const t = {} as TendencyBlock;
  for (const k of TENDENCY_KEYS) t[k] = get(values, `tendencies.${k}`);
  t.emphasis = { takeaway: 0, tackleAttack: 0, rushLanes: 0, cornerJump: 0 };
  for (const k of EMPHASIS_KEYS) t.emphasis[k] = get(values, `tendencies.emphasis.${k}`);
  return t;
}

function assembleBehavior(values: ReadonlyMap<string, number>): BehaviorBlock {
  const b = {} as BehaviorBlock;
  for (const k of BEHAVIOR_KEYS) b[k] = get(values, `behavior.${k}`);
  return b;
}

/** A pack row's football-only estimates for an imported real coach (K2.2.2, U3 owns the estimation). */
export interface ImportEstimates {
  readonly offenseRates?: Partial<OffenseRates>;
  readonly defenseRates?: Partial<DefenseRates>;
  readonly tendencies?: Partial<TendencyBlock>;
  readonly families?: { offense?: string; defense?: string; specialTeams?: string };
  /** Behaviour estimates are used only with a cited source (K2.2.2 rule 2). */
  readonly behavior?: Partial<BehaviorBlock>;
  readonly behaviorSource?: string;
}

/**
 * K2.2.2: a profile for an imported real coach. Unestimated fields take the population mean (the
 * median of a symmetric distribution); behaviour is the role median unless a sourced estimate exists.
 * No draw is made, so nothing invented is attached to a real person.
 */
export function profileFromImport(personId: string, level: CoachLevel, role: CoachRole, side: SideOfBall, est: ImportEstimates, pop: CoachPopulation = getPopulation(level, role)): CoachProfile {
  const values = new Map<string, number>();
  for (const path of [...FIELD_PATHS, ...LATE_FIELD_PATHS]) values.set(path, pop.fields[path]!.mean);
  for (const [k, v] of Object.entries(est.offenseRates ?? {})) if (typeof v === 'number') values.set(`offenseRates.${k}`, v);
  for (const [k, v] of Object.entries(est.defenseRates ?? {})) if (typeof v === 'number') values.set(`defenseRates.${k}`, v);
  for (const [k, v] of Object.entries(est.tendencies ?? {})) if (typeof v === 'number') values.set(`tendencies.${k}`, v);
  for (const [k, v] of Object.entries(est.tendencies?.emphasis ?? {})) if (typeof v === 'number') values.set(`tendencies.emphasis.${k}`, v);
  if (est.behaviorSource) for (const [k, v] of Object.entries(est.behavior ?? {})) if (typeof v === 'number') values.set(`behavior.${k}`, v);
  const firstKey = (w: Readonly<Record<string, number>>) => Object.keys(w).sort()[0]!;
  const families = {
    offense: est.families?.offense ?? firstKey(pop.families.offense),
    defense: est.families?.defense ?? firstKey(pop.families.defense),
    specialTeams: est.families?.specialTeams ?? firstKey(pop.families.specialTeams),
  };
  return {
    personId, league: level, role,
    system: assembleSystem(values, { ...pop.personnel }, families, side),
    tendencies: assembleTendencies(values),
    behavior: assembleBehavior(values),
    memory: { opponentNotes: {}, ownTendencyLog: null },
    lineage: { mentors: [] },
    imported: true,
    version: 1,
  };
}
