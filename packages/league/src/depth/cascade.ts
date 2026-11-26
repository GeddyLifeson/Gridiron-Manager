// M2.1.3 injury cascade and emergency roles. Rules are ordered moves; the first legal one applies. With
// none legal, the next available man on the job's list enters; then the emergency card; then the best
// fit by position group, logged. The engine's own in-play fallback (WP-18 emergency depth) stays the last
// resort; this is the plan the staff wrote in advance.
import { P } from './params.ts';
import type { DepthChart, DepthPerson, EmergencyNeed, Problem, UnitDef } from './types.ts';
import { unitDef } from './chart.ts';

export type Replacement = 'cascade' | 'next_man' | 'emergency_card' | 'best_fit' | 'none';

export interface CascadeResult {
  readonly lineup: Readonly<Record<string, number>>;
  readonly how: Replacement;
  /** Players who changed job or entered, for the substitution log and N3. */
  readonly moves: readonly { readonly personId: number; readonly from: string | null; readonly to: string }[];
  /** Plain-words log line when the result was not planned (best fit or no one). */
  readonly logged: string | null;
}

const EMERGENCY_FOR_GROUP: Readonly<Record<string, readonly EmergencyNeed[]>> = {
  qb: ['quarterback'], ol: ['sixth_lineman', 'seventh_lineman'], k: ['kicker'], p: ['punter'], ls: ['long_snapper'],
};

/**
 * Replace the player at `job` in `lineup` (I6.3.1 consumer). `available` says who is dressed and able;
 * players already on the field are never taken for the open job except by a planned slide.
 */
export function replaceInjured(chart: DepthChart, defs: readonly UnitDef[], unitId: string, lineup: Readonly<Record<string, number>>, job: string,
  available: (personId: number) => boolean, people: ReadonlyMap<number, DepthPerson>): CascadeResult {
  const def = unitDef(defs, unitId);
  const jobDef = def.jobs.find((j) => j.job === job);
  if (jobDef === undefined) throw new Error(`league.depth: unit ${unitId} has no job ${job}`);
  const out = lineup[job];
  const onField = new Set(Object.values(lineup).filter((id) => id !== out));
  const free = (id: number) => available(id) && !onField.has(id);
  const rest: Record<string, number> = { ...lineup };
  delete rest[job];

  // 1. Planned moves, first legal one (rule list).
  for (const move of chart.cascades[`${unitId}/${job}`] ?? []) {
    if (!move.slides.every((sl) => rest[sl.from] !== undefined) || !free(move.enters.personId)) continue;
    const next: Record<string, number> = { ...rest };
    const moves: { personId: number; from: string | null; to: string }[] = [];
    const sliding = move.slides.map((sl) => ({ ...sl, personId: rest[sl.from]! }));
    for (const sl of sliding) delete next[sl.from];
    for (const sl of sliding) { next[sl.to] = sl.personId; moves.push({ personId: sl.personId, from: sl.from, to: sl.to }); }
    next[move.enters.job] = move.enters.personId;
    moves.push({ personId: move.enters.personId, from: null, to: move.enters.job });
    // Legal only when every job of the unit is filled once and nobody plays two jobs.
    const ids = Object.values(next);
    if (new Set(ids).size !== ids.length || Object.keys(next).length !== Object.keys(rest).length + 1 || !def.jobs.every((j) => j.job in next || !(j.job in lineup))) continue;
    return { lineup: next, how: 'cascade', moves, logged: null };
  }

  const enter = (personId: number, how: Replacement, logged: string | null): CascadeResult =>
    ({ lineup: { ...rest, [job]: personId }, how, moves: [{ personId, from: null, to: job }], logged });

  // 2. Straight next man on the list. A line job whose next man cannot play the line goes to the card first.
  const listed = (chart.units[unitId]?.[job] ?? []).filter(free);
  const nextMan = listed[0];
  const lineJob = jobDef.group === 'ol';
  if (nextMan !== undefined && !(lineJob && people.get(nextMan)?.lineCapable === false)) return enter(nextMan, 'next_man', null);

  // 3. Emergency card.
  const needs = jobDef.emergency !== undefined ? [jobDef.emergency] : EMERGENCY_FOR_GROUP[jobDef.group] ?? [];
  for (const need of needs) {
    const id = chart.emergency[need];
    if (id !== undefined && free(id)) return enter(id, 'emergency_card', null);
  }
  if (nextMan !== undefined) return enter(nextMan, 'next_man', null);

  // 4. Best fit by group, then any line-capable player for a line job, then anyone; logged (rule list end).
  const pool = [...people.values()].filter((p) => free(p.personId)).sort((a, b) => a.personId - b.personId);
  const best = pool.find((p) => p.group === jobDef.group) ?? (lineJob ? pool.find((p) => p.lineCapable) : undefined) ?? pool[0];
  if (best !== undefined) return enter(best.personId, 'best_fit', `${unitId} ${job}: no planned replacement; ${best.personId} (${best.group}) plays it`);
  return { lineup: rest, how: 'none', moves: [], logged: `${unitId} ${job}: nobody available` };
}

/** Line-capable players on the field (M2.1.3 edge case: below the minimum, the card is used). */
export function lineCapableOnField(lineup: Readonly<Record<string, number>>, people: ReadonlyMap<number, DepthPerson>): number {
  return Object.values(lineup).filter((id) => { const p = people.get(id); return p !== undefined && (p.group === 'ol' || p.lineCapable === true); }).length;
}

export function lineShort(lineup: Readonly<Record<string, number>>, people: ReadonlyMap<number, DepthPerson>): boolean {
  return lineCapableOnField(lineup, people) < P('emergency.minLinemenCapable');
}

const ALL_NEEDS: readonly EmergencyNeed[] = ['quarterback', 'long_snapper', 'holder', 'kicker', 'punter', 'sixth_lineman', 'seventh_lineman'];

/** Assignment knowledge multiplier for a player in an emergency role (rule 4): full with the reps, else the penalty. */
export function emergencyKnowledge(person: DepthPerson, need: EmergencyNeed): number {
  return (person.emergencyReps?.[need] ?? 0) >= P('emergency.minReps') ? 1 : P('emergency.untrainedKnowledge');
}

/** Pre-game warnings for I1 (acceptance: a specialist with no practised emergency backup warns). */
export function emergencyWarnings(chart: DepthChart, people: ReadonlyMap<number, DepthPerson>, active: (personId: number) => boolean): Problem[] {
  const out: Problem[] = [];
  for (const need of ALL_NEEDS) {
    const id = chart.emergency[need];
    if (id === undefined) { out.push({ leaf: 'M2.1.3', unitId: 'emergency', message: `no emergency ${need.replace('_', ' ')} named` }); continue; }
    const p = people.get(id);
    if (p === undefined || !active(id)) { out.push({ leaf: 'M2.1.3', unitId: 'emergency', message: `emergency ${need.replace('_', ' ')} ${id} is not active` }); continue; }
    if (emergencyKnowledge(p, need) < 1) out.push({ leaf: 'M2.1.3', unitId: 'emergency', message: `emergency ${need.replace('_', ' ')} ${id} has fewer than ${P('emergency.minReps')} practice reps in ${P('emergency.repWindowWeeks')} weeks` });
  }
  return out;
}
