// Need levels, moving reference points and career stages (X5.1.1, X5.1.2).
import { np } from './params.ts';
import type { NeedDef, NeedId } from './registry.ts';

/** What the world measured this update for one need. */
export interface NeedCondition {
  /** Share of the need met this week against what the person expects, 0 (not at all) to 1 (fully). */
  readonly met: number;
  /** For moving-reference needs: the current level on the need's own 0 to 100 scale (snap share, pay percentile, role rank). */
  readonly current?: number;
  /** Relief events this week by source id (X5.1.2 `relief`). Unknown sources are ignored. */
  readonly reliefSources?: readonly string[];
}

/**
 * Moving reference for one need (X5.1.2 rule 5): the best the person has had in the last seasons, falling
 * toward the current level by a quarter of the gap per season. Truth, not in the G-00 shape yet (CR-G23-1).
 */
export interface NeedReference {
  readonly needId: NeedId;
  /** Season year to the best level held that season. */
  readonly seasonBest: Readonly<Record<string, number>>;
  readonly reference: number;
}

export function newReference(needId: NeedId, year: number, current: number): NeedReference {
  return { needId, seasonBest: { [String(year)]: current }, reference: current };
}

/** Records the level held this week. The reference rises at once with a new best (the bar rises with what one has had). */
export function observeReference(ref: NeedReference, year: number, current: number): NeedReference {
  const key = String(year);
  const best = Math.max(ref.seasonBest[key] ?? current, current);
  return { needId: ref.needId, seasonBest: { ...ref.seasonBest, [key]: best }, reference: Math.max(ref.reference, best) };
}

/** Season rollover: drop seasons outside the window, then fall toward the current level by the fall share. */
export function rollReference(ref: NeedReference, newYear: number, current: number): NeedReference {
  const keep = np('needs.reference.seasons');
  const seasonBest: Record<string, number> = {};
  for (const [y, b] of Object.entries(ref.seasonBest)) if (Number(y) > newYear - keep - 1 && Number(y) < newYear + 1) seasonBest[y] = b;
  const fallen = ref.reference - (ref.reference - current) * np('needs.reference.fallShare');
  return { needId: ref.needId, seasonBest, reference: round1(Math.max(current, fallen)) };
}

/** Build multiplier from the reference gap: a demoted three-year starter builds faster than a career backup. */
export function referenceMultiplier(ref: NeedReference | undefined, current: number | undefined): number {
  if (!ref || current === undefined) return 1;
  return 1 + Math.max(0, ref.reference - current) * np('needs.reference.gapGainPerPoint');
}

/**
 * One weekly step of a need level (X5.1.2 rule 1, X5.2.1 rule 4). Unmet share builds at the need's rate,
 * capped so no need goes from met to maximal in under half a season (rule 3); a met share and relief
 * events lower it. `weeks` lets the offseason step run monthly (X5.2.1 edge case).
 */
export function stepNeedLevel(level: number, def: NeedDef, cond: NeedCondition, ref: NeedReference | undefined, weeks = 1): number {
  const met = Math.min(1, Math.max(0, cond.met));
  const build = Math.min(def.buildRate * (1 - met) * referenceMultiplier(ref, cond.current), np('needs.build.maxEffectivePerWeek'));
  let next = level + build * weeks - met * np('needs.metReliefPerWeek') * weeks;
  for (const s of cond.reliefSources ?? []) next -= def.relief.find((r) => r.source === s)?.size ?? 0;
  return Math.round(Math.min(np('needs.level.max'), Math.max(0, next)));
}

/** Career stages (X5.1.1 rule 1). */
export const PLAYER_STAGES = ['entering', 'establishing', 'prime', 'late', 'post_playing'] as const;
export const COACH_STAGES = ['entry', 'rising', 'established', 'senior'] as const;
export type CareerStage = (typeof PLAYER_STAGES)[number] | (typeof COACH_STAGES)[number];

/** A stage boundary (content by level and role, X5.1.1 rule 1). The transition fires only on a qualifying event (rule 2). */
export interface StageBoundary {
  readonly from: CareerStage;
  readonly to: CareerStage;
  /** Event types that may trigger it: `season_rollover`, `named_starter`, `promoted`, `retired`, `level_changed`. */
  readonly onEvents: readonly string[];
  readonly minSeasonsAtLevel?: number;
  readonly minAge?: number;
}

/** Starting boundaries (Assumption, X5.1.1 rule 1). Ages and seasons are starting values, not facts. */
export const STARTING_STAGE_BOUNDARIES: readonly StageBoundary[] = [
  { from: 'entering', to: 'establishing', onEvents: ['season_rollover', 'named_starter'], minSeasonsAtLevel: 1 },
  { from: 'establishing', to: 'prime', onEvents: ['season_rollover', 'named_starter'], minSeasonsAtLevel: 3 },
  { from: 'prime', to: 'late', onEvents: ['season_rollover'], minAge: 30 },
  { from: 'entering', to: 'post_playing', onEvents: ['retired'] },
  { from: 'establishing', to: 'post_playing', onEvents: ['retired'] },
  { from: 'prime', to: 'post_playing', onEvents: ['retired'] },
  { from: 'late', to: 'post_playing', onEvents: ['retired'] },
  { from: 'entry', to: 'rising', onEvents: ['promoted'] },
  { from: 'rising', to: 'established', onEvents: ['promoted', 'season_rollover'], minSeasonsAtLevel: 4 },
  { from: 'established', to: 'senior', onEvents: ['season_rollover'], minSeasonsAtLevel: 10 },
];

/**
 * Stage after a qualifying event, or null if it does not change (X5.1.1 rule 2: never by polling).
 * A player who changes level re-enters at `entering` (edge case).
 */
export function nextCareerStage(current: CareerStage, eventType: string, ctx: { seasonsAtLevel: number; age: number }, bounds = STARTING_STAGE_BOUNDARIES): CareerStage | null {
  if (eventType === 'level_changed' && (PLAYER_STAGES as readonly string[]).includes(current) && current !== 'post_playing') {
    return current === 'entering' ? null : 'entering';
  }
  for (const b of bounds) {
    if (b.from !== current || !b.onEvents.includes(eventType)) continue;
    if (b.minSeasonsAtLevel !== undefined && ctx.seasonsAtLevel < b.minSeasonsAtLevel) continue;
    if (b.minAge !== undefined && ctx.age < b.minAge) continue;
    return b.to;
  }
  return null;
}

function round1(x: number): number { return Math.round(x * 10) / 10; }
