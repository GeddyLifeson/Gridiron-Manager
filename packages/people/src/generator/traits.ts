// The X1 trait block (X1.1.1 to X1.1.4, X1.2.1) and the D5 player traits, drawn as truth.
// Nothing here is ever shown: people are known by X2 labels over logged behaviour (X1.3.1).
// Stream: `person.traits` keyed by person id (X1.2.1 rule 6), so a block never depends on generation order.
import type { RandomStream, TraitBlock, GoalRecord } from '@gm/schema';
import { param } from './params.ts';
import { clamp } from './normal.ts';

/** X1.1.2 starting facets with their readers (a facet with no reader fails X1.2.2). */
export const X1_FACETS: Readonly<Record<string, readonly string[]>> = {
  competitiveness: ['X5', 'H3'], coachability: ['D7', 'L1'], ego: ['X5', 'L1', 'K2'], work_habits: ['H3', 'D7', 'K6'],
  risk_tolerance: ['K4', 'K5', 'K8', 'T4'], loyalty: ['E2', 'T6', 'M', 'X7'], composure: ['J6', 'J7', 'H7'], candor: ['L4', 'K6', 'H7'],
  discipline: ['L3', 'D5.4.1'], rule_respect: ['K2.8.1', 'D5.4.1'], faith: ['L4.6.1', 'T4'], patience: ['K8', 'X5'],
  sociability: ['X7', 'T4', 'L2'], ambition: ['E2', 'K7', 'X1.1.4'],
};

/**
 * D5.1.1 player traits not already in X1 (work ethic = work_habits, coachability, competitiveness,
 * ego and role need = ego, loyalty and home ties = loyalty: one facet each, X1.1.2 rule 5 forbids
 * duplicates). Stored in the same facets map, 0 to 100, 50 = population average.
 */
export const D5_PLAYER_FACETS: Readonly<Record<string, readonly string[]>> = {
  motor: ['K1', 'N1'], leadership: ['L2', 'D12'], team_orientation: ['D12', 'L2'], toughness: ['D11.6.2', 'D11.3.3'],
  temperament: ['D4.2.2', 'L3', 'L9'], maturity: ['D5.4', 'L3'], love_of_football: ['D8.4.1', 'D7', 'D13.3.5'],
  classroom_diligence: ['T5.3.1', 'L3'],
};

/** X1.1.3 starting values. */
export const X1_VALUES: Readonly<Record<string, readonly string[]>> = {
  winning: ['X5.1.1', 'T4'], money: ['T4', 'M', 'E2'], family_and_home: ['T4', 'E2'], playing_time_or_role: ['T4', 'T6'],
  development: ['T4'], legacy: ['X5.1.1'], stability: ['E2', 'K7'], tradition: ['T4', 'K8'], independence: ['E2', 'K7'],
};

/** X1.2.1 rule 4 starting population groups. */
export const POPULATION_GROUPS = [
  'recruit', 'college_player', 'pro_player', 'entry_coach', 'position_coach', 'coordinator', 'head_coach',
  'owner', 'athletic_director', 'agent', 'parent', 'reporter', 'official',
] as const;
export type PopulationGroup = (typeof POPULATION_GROUPS)[number];
const PLAYER_GROUPS: ReadonlySet<PopulationGroup> = new Set<PopulationGroup>(['recruit', 'college_player', 'pro_player']);

type Row = readonly [low: number, median: number, high: number, reason?: string];
const FACET_DEFAULT: Row = [0, 50, 100];
const VALUE_DEFAULT: Row = [-50, 0, 50];

/**
 * Group overrides (X1.2.1 rule 5: only shifts a reader needs, each with its reason). Every other row is
 * the default 0:50:100 or -50:0:50.
 */
export const POPULATION_OVERRIDES: Readonly<Partial<Record<PopulationGroup, Readonly<Record<string, Row>>>>> = {
  entry_coach: { ambition: [0, 60, 100, 'X1.2.1 rule 5 example: entry-level coaches are seeking the next rung, which E2 and K7 job-seeking read'] },
};

/** Two-sided truncated normal around the median (X1.2.1 rule 1; divisor from params). */
function drawRow(row: Row, z: number): number {
  const [low, median, high] = row;
  const k = param('traitSideSdDivisor');
  const sd = z < 0 ? (median - low) / k : (high - median) / k;
  return Math.round(clamp(median + z * sd, low, high));
}

/** X1.2.1 rule 7 faith weights: 30% at 0 to 9, 45% at 25 to 60, 25% at 76 to 100; uniform inside a band (Assumption). */
function drawFaith(s: RandomStream): number {
  const band = s.pick([0.30, 0.45, 0.25]);
  const [lo, hi] = band === 0 ? [0, 9] : band === 1 ? [25, 60] : [76, 100];
  return s.int(lo, hi);
}

export interface TraitRequest {
  group: PopulationGroup;
  ageYears: number;
  seasonYear: number;
  /** Roles the person holds, for goal eligibility. */
  roles: readonly string[];
}

/** A person's full trait block from the `person.traits` stream (X1.1.1). */
export function drawTraitBlock(s: RandomStream, req: TraitRequest): TraitBlock {
  const over = POPULATION_OVERRIDES[req.group] ?? {};
  const facets: Record<string, number> = {};
  const facetNames = [...Object.keys(X1_FACETS), ...(PLAYER_GROUPS.has(req.group) ? Object.keys(D5_PLAYER_FACETS) : [])];
  // One standard normal per facet, in a fixed order; correlated pairs share a draw (D5.1.1, X1.1.2).
  const z: Record<string, number> = {};
  for (const f of facetNames) if (f !== 'faith') z[f] = s.normal();
  const corr = (a: string, b: string, r: number) => {
    if (z[a] !== undefined && z[b] !== undefined) z[b] = r * z[a]! + Math.sqrt(1 - r * r) * z[b]!;
  };
  corr('discipline', 'rule_respect', param('corrRuleRespectDiscipline'));
  corr('work_habits', 'love_of_football', param('corrWorkLove'));
  corr('temperament', 'maturity', param('corrMaturityTemperament'));
  for (const f of facetNames) {
    facets[f] = f === 'faith' ? drawFaith(s) : drawRow(over[f] ?? FACET_DEFAULT, z[f]!);
  }
  // D5.1.1: maturity rises 1.5 a year from 18 to 26; the drawn value is the value at 26.
  if (facets.maturity !== undefined) {
    const from = param('maturityFromAge'), to = param('maturityToAge');
    const yearsLeft = clamp(to - Math.max(req.ageYears, from), 0, to - from);
    facets.maturity = Math.round(clamp(facets.maturity - param('maturityPerYear') * yearsLeft, 0, 100));
  }
  const values: Record<string, number> = {};
  for (const v of Object.keys(X1_VALUES)) values[v] = drawRow(over[v] ?? VALUE_DEFAULT, s.normal());
  return { facets, values, goals: drawGoals(s, req, facets, values), schemaVersion: 1, source: 'generated' };
}

/**
 * X1.1.4 starting goal set with eligibility by role and a selection weight from named facets and values
 * (Assumption: weight = 1 + the listed facets above 50 and values above 0, scaled to 0 to 1 each).
 */
export const GOALS: readonly { id: string; roles: readonly string[]; target: string; weightFrom: readonly string[] }[] = [
  { id: 'start_at_position', roles: ['player'], target: 'core:role_starter', weightFrom: ['competitiveness', 'ego', 'playing_time_or_role'] },
  { id: 'win_championship', roles: ['player', 'coach', 'owner', 'administrator'], target: 'core:honour_championship', weightFrom: ['competitiveness', 'winning'] },
  { id: 'earn_major_contract', roles: ['player', 'coach'], target: 'core:contract_major', weightFrom: ['money', 'ambition'] },
  { id: 'reach_pro_level', roles: ['player', 'coach'], target: 'core:level_pro', weightFrom: ['ambition', 'legacy'] },
  { id: 'become_coordinator', roles: ['coach'], target: 'core:rung_coordinator', weightFrom: ['ambition', 'independence'] },
  { id: 'become_head_coach', roles: ['coach'], target: 'core:rung_head_coach', weightFrom: ['ambition', 'ego', 'legacy'] },
  { id: 'stay_here', roles: ['player', 'coach', 'staff'], target: 'core:stay_current_team', weightFrom: ['loyalty', 'stability', 'tradition'] },
  { id: 'near_home', roles: ['player', 'coach', 'staff'], target: 'core:near_home', weightFrom: ['family_and_home'] },
  { id: 'earn_named_honour', roles: ['player', 'coach'], target: 'core:honour_named', weightFrom: ['legacy', 'ego'] },
  { id: 'coach_after_playing', roles: ['player'], target: 'core:role_coach', weightFrom: ['love_of_football', 'leadership'] },
];

function drawGoals(s: RandomStream, req: TraitRequest, facets: Record<string, number>, values: Record<string, number>): GoalRecord[] {
  const eligible = GOALS.filter((g) => g.roles.some((r) => req.roles.includes(r)));
  const weight = (g: (typeof GOALS)[number]) => 1 + g.weightFrom.reduce((a, k) => {
    if (facets[k] !== undefined) return a + Math.max(0, facets[k]! - 50) / 50;
    if (values[k] !== undefined) return a + Math.max(0, values[k]!) / 50;
    return a;
  }, 0);
  const out: GoalRecord[] = [];
  const pool = eligible.slice();
  const count = Math.min(pool.length, s.int(0, 3));
  for (let i = 0; i < count; i++) {
    const idx = s.pick(pool.map(weight));
    const g = pool.splice(idx, 1)[0]!;
    const drive = ((facets.ambition ?? 50) + (facets.competitiveness ?? 50)) / 2;
    const intensity = Math.round(clamp(drive + 15 * s.normal(), 0, 100));
    const byYear = s.chance(param('goalNoByYearShare')) ? null : req.seasonYear + s.int(param('goalHorizonMinYears'), param('goalHorizonMaxYears'));
    out.push({ goalId: g.id, target: g.target, byYear, intensity, status: 'active' });
  }
  return out;
}

/** X1.4.1 and X14.1.1: an imported real person's block. Neutral, no faith, no goals. */
export function neutralTraitBlock(): TraitBlock {
  return { facets: {}, values: {}, goals: [], schemaVersion: 1, source: 'imported_neutral' };
}
