// T9.2.2 facilities: grades from build year and spending, projects that take 1 to 3 years, and small
// local effects read by recruiting (T4.4.1), strength (T8.1.1), recovery (D10) and practice (H3, J12).
// A completed project changes its input the following season (T9.2.2 acceptance).
import { P } from './params.ts';
import { FACILITY_KINDS, type Facility, type FacilityKind, type FacilityProject } from './types.ts';

function clampGrade(g: number): number { return g < 0 ? 0 : g > 100 ? 100 : g; }

/** Grade after ageing one year without a project (T9.2.2 rules). */
export function ageFacility(f: Facility): Facility {
  return f.exists ? { ...f, grade: clampGrade(f.grade - P('facility.decay_per_year')) } : f;
}

export type ProposeResult =
  | { readonly ok: true; readonly project: FacilityProject }
  | { readonly ok: false; readonly reason: 'build_years_out_of_range' | 'bad_cost' | 'renovate_missing' };

/** A proposed project with its cost and build time (T9.2.2 "What the user sees"). Funding is the AD's and boosters'. */
export function proposeProject(id: string, kind: FacilityKind, mode: 'build' | 'renovate', costCents: number, startYear: number, buildYears: number, facilities: readonly Facility[]): ProposeResult {
  if (buildYears < P('facility.min_build_years') || buildYears > P('facility.max_build_years') || !Number.isInteger(buildYears)) return { ok: false, reason: 'build_years_out_of_range' };
  if (!Number.isInteger(costCents) || costCents <= 0) return { ok: false, reason: 'bad_cost' };
  if (mode === 'renovate' && !facilities.some((f) => f.kind === kind && f.exists)) return { ok: false, reason: 'renovate_missing' };
  return { ok: true, project: { id, kind, mode, costCents, startYear, buildYears, funded: false } };
}

export function completionYear(p: FacilityProject): number { return p.startYear + p.buildYears; }

/** The first season whose inputs see the project (the season after completion). */
export function effectiveSeason(p: FacilityProject): number { return completionYear(p) + 1; }

/**
 * Roll facilities to a new season: age every facility, then apply every funded project whose effective
 * season has arrived. Returns the new list and the projects still under way.
 */
export function rollFacilities(facilities: readonly Facility[], projects: readonly FacilityProject[], season: number): { readonly facilities: readonly Facility[]; readonly projects: readonly FacilityProject[] } {
  let next = facilities.map(ageFacility);
  const open: FacilityProject[] = [];
  for (const p of projects) {
    if (!p.funded || effectiveSeason(p) > season) { open.push(p); continue; }
    const built = completionYear(p);
    const have = next.some((f) => f.kind === p.kind);
    const apply = (f: Facility): Facility => p.mode === 'build'
      ? { kind: f.kind, exists: true, grade: P('facility.new_build_grade'), lastBuiltYear: built }
      : { ...f, grade: clampGrade(f.grade + P('facility.renovation_gain')) };
    next = have ? next.map((f) => (f.kind === p.kind ? apply(f) : f)) : [...next, apply({ kind: p.kind, exists: true, grade: 0, lastBuiltYear: built })];
  }
  return { facilities: next, projects: open };
}

function gradeOf(facilities: readonly Facility[], kind: FacilityKind): number | null {
  const f = facilities.find((x) => x.kind === kind && x.exists);
  return f ? f.grade : null;
}

/** Inputs the facilities hand to other systems. Effects are small and local (T9.2.2). Neutral is 1. */
export interface FacilityEffects {
  readonly recruitingDraw: number;
  readonly strengthGain: number;
  readonly recovery: number;
  readonly badWeatherPracticeQuality: number;
}

export function facilityEffects(facilities: readonly Facility[]): FacilityEffects {
  const existing = FACILITY_KINDS.map((k) => gradeOf(facilities, k)).filter((g): g is number => g !== null);
  const meanGrade = existing.length ? existing.reduce((a, b) => a + b, 0) / existing.length : 0;
  const around = (g: number | null) => (g === null ? 0 : g) - 50;
  return {
    recruitingDraw: 1 + P('facility.recruit_draw_per_grade') * (meanGrade - 50),
    strengthGain: 1 + P('facility.strength_per_grade') * around(gradeOf(facilities, 'weight_room')),
    recovery: 1 + P('facility.recovery_per_grade') * around(gradeOf(facilities, 'training_room')),
    badWeatherPracticeQuality: gradeOf(facilities, 'indoor_field') === null ? P('facility.no_indoor_practice_quality') : 1,
  };
}
