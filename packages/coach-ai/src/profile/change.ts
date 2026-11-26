// Change over a career: between-season change (K2.5.1) and the memory block's updates (K2.1.5).
// Use, not time, drives growth. No rule here reads points, experience totals or a level counter.
import { clamp, type Draws } from './draws.ts';
import { BEHAVIOR_KEYS, CALLER_FIELDS, DEFENSE_RATE_KEYS, EMPHASIS_KEYS, OFFENSE_RATE_KEYS, ROLE_USES, TENDENCY_KEYS, type BehaviorKey } from './keys.ts';
import { getPopulation, type CoachPopulation } from './population.ts';
import { ASSUMPTIONS } from './sources.ts';
import type { CoachProfile, CoachRole, MemoryBlock, OpponentNoteRow, SideOfBall, SystemBlock, TendencyBlock } from './types.ts';

export interface SeasonChangeContext {
  readonly age: number;
  /** Role held last season, or null when out of football (no gains, K2.5.1 edge case). */
  readonly roleLastSeason: CoachRole | null;
  /** Side a head coach called himself last season, if any (K2.6.1 rule 1). */
  readonly calledSideLastSeason?: SideOfBall | null;
  /** Consecutive seasons in that role, counting last season. */
  readonly seasonsInRole: number;
  /** Per tendency, the value that would have scored best by N3.3.1 over his own decisions last season. */
  readonly bestTendency?: Partial<TendencyBlock>;
  /** Systems of a coordinator he hired or an opponent who beat him repeatedly (K2.5.1 rule 6). */
  readonly seenSystems?: readonly SystemBlock[];
}

/** K2.5.1 rule 4 "plus noise": size not stated. Assumption: 0.05 of the field's SD. */
export const TENDENCY_DRIFT_NOISE_SD = { value: 0.05, status: 'Assumption' as const, citation: 'K2.5.1 rule 4 (noise size not stated)' };

/** Parameters the role held last season reads (K2.5.1 rule 2). */
export function parametersInUse(role: CoachRole | null, calledSide?: SideOfBall | null): Set<BehaviorKey> {
  if (!role) return new Set();
  const used = new Set<BehaviorKey>(ROLE_USES[role]);
  if (calledSide) for (const k of CALLER_FIELDS) used.add(k);
  return used;
}

/** K2.5.1: one coach's offseason step. Draw order is fixed. Memory decays one season (K2.1.5 rule 3). */
export function advanceSeason(p: CoachProfile, ctx: SeasonChangeContext, d: Draws, pop: CoachPopulation = getPopulation(p.league, p.role)): CoachProfile {
  const behavior = { ...p.behavior };
  const inUse = parametersInUse(ctx.roleLastSeason, ctx.calledSideLastSeason);
  const halve = ctx.seasonsInRole > ASSUMPTIONS.growthHalvingSeasons.value ? 0.5 : 1;
  for (const k of BEHAVIOR_KEYS) {
    const spec = pop.fields[`behavior.${k}`]!;
    let x = behavior[k];
    // Rule 2: growth only in use, shrinking with seasons in role.
    if (inUse.has(k)) x += halve * (ASSUMPTIONS.growthMean.value + ASSUMPTIONS.growthSd.value * d.normal());
    // Rule 3: age decline on adjustment and preparation from the starting age.
    if ((k === 'adjustment' || k === 'preparation') && ctx.age >= ASSUMPTIONS.declineStartAge.value) x += ASSUMPTIONS.declinePerSeason.value;
    behavior[k] = clamp(x, spec.min, spec.max);
  }
  // Rule 4: tendencies step toward what worked for him, plus noise (he can learn the wrong lesson from luck).
  const tendencies = { ...p.tendencies, emphasis: { ...p.tendencies.emphasis } };
  // The emphasis dials move the same way (K2.1.3 rule 4).
  for (const k of EMPHASIS_KEYS) {
    const best = ctx.bestTendency?.emphasis?.[k];
    if (best === undefined || ctx.roleLastSeason === null) continue;
    const spec = pop.fields[`tendencies.emphasis.${k}`]!;
    const step = ASSUMPTIONS.tendencyLearnStep.value * (best - tendencies.emphasis[k]) + TENDENCY_DRIFT_NOISE_SD.value * spec.sd * d.normal();
    tendencies.emphasis[k] = clamp(tendencies.emphasis[k] + step, spec.min, spec.max);
  }
  for (const k of TENDENCY_KEYS) {
    const best = ctx.bestTendency?.[k];
    if (best === undefined || ctx.roleLastSeason === null) continue;
    const spec = pop.fields[`tendencies.${k}`]!;
    const step = ASSUMPTIONS.tendencyLearnStep.value * (best - tendencies[k]) + TENDENCY_DRIFT_NOISE_SD.value * spec.sd * d.normal();
    tendencies[k] = clamp(tendencies[k] + step, spec.min, spec.max);
  }
  // Rule 6: adopt elements of systems he has seen.
  let system = p.system;
  for (const seen of ctx.seenSystems ?? []) system = adoptFrom(system, seen, d);
  return {
    ...p,
    behavior,
    tendencies,
    system,
    memory: decayMemory(p.memory, 1),
    version: p.version + 1,
  };
}

function adoptFrom(sys: SystemBlock, seen: SystemBlock, d: Draws): SystemBlock {
  const chance = ASSUMPTIONS.systemAdoptChance.value, step = ASSUMPTIONS.systemAdoptStep.value;
  const offenseRates = { ...sys.offenseRates };
  for (const k of OFFENSE_RATE_KEYS) if (d.uniform() < chance) offenseRates[k] += step * (seen.offenseRates[k] - offenseRates[k]);
  const defenseRates = { ...sys.defenseRates };
  for (const k of DEFENSE_RATE_KEYS) if (d.uniform() < chance) defenseRates[k] += step * (seen.defenseRates[k] - defenseRates[k]);
  return { ...sys, offenseRates, defenseRates };
}

/** Per-season decay factor f with f^h = 0.5 for an integer half-life h, found by bisection (no platform pow). */
export function halfLifeFactor(h: number): number {
  if (!Number.isInteger(h) || h < 1) throw new Error('half-life must be a positive whole number of seasons');
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    let v = 1;
    for (let j = 0; j < h; j++) v *= mid;
    if (v < 0.5) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** K2.1.5 rule 3: decay every note weight by `seasons` whole seasons. */
export function decayMemory(m: MemoryBlock, seasons: number): MemoryBlock {
  const f = halfLifeFactor(ASSUMPTIONS.memoryHalfLifeSeasons.value);
  let factor = 1;
  for (let i = 0; i < seasons; i++) factor *= f;
  const opponentNotes: Record<string, OpponentNoteRow[]> = {};
  for (const id of Object.keys(m.opponentNotes).sort()) opponentNotes[id] = m.opponentNotes[id]!.map((r) => ({ ...r, weight: r.weight * factor }));
  return { ...m, opponentNotes };
}

/**
 * K2.1.5: record one observed call by an opposing caller in a situation bucket after a game commit.
 * `observed` must be a field a charter can see (rule 2); the caller's true call name is never written.
 * Keeps at most the starting 40 rows per caller, dropping the weakest then the oldest (rule 4).
 */
export function recordObservation(m: MemoryBlock, callerId: string, obs: { bucket: string; observed: string; worked: boolean; season: number; week: number }): MemoryBlock {
  const rows = [...(m.opponentNotes[callerId] ?? [])];
  const i = rows.findIndex((r) => r.bucket === obs.bucket && r.observed === obs.observed);
  const base: OpponentNoteRow = i >= 0 ? rows[i]! : { bucket: obs.bucket, observed: obs.observed, count: 0, worked: 0, lastSeason: obs.season, lastWeek: obs.week, weight: 0 };
  const row: OpponentNoteRow = { ...base, count: base.count + 1, worked: base.worked + (obs.worked ? 1 : 0), lastSeason: obs.season, lastWeek: obs.week, weight: base.weight + 1 };
  if (i >= 0) rows[i] = row; else rows.push(row);
  const cap = ASSUMPTIONS.memoryRowsPerCaller.value;
  if (rows.length > cap) {
    rows.sort((a, b) => b.weight - a.weight || b.lastSeason - a.lastSeason || b.lastWeek - a.lastWeek || (a.bucket + a.observed < b.bucket + b.observed ? -1 : 1));
    rows.length = cap;
  }
  return { ...m, opponentNotes: { ...m.opponentNotes, [callerId]: rows } };
}

/** Share of weighted evidence on each observed tag in one bucket: the starting belief K4.2.1 reads. */
export function bucketBelief(m: MemoryBlock, callerId: string, bucket: string): Record<string, number> {
  const rows = (m.opponentNotes[callerId] ?? []).filter((r) => r.bucket === bucket);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const r of rows) out[r.observed] = r.weight / total;
  return out;
}
