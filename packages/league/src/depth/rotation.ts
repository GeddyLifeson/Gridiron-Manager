// M2.3.1 rotation rules: staff default shares by depth rank, the three units of change, defensive line
// waves, the exception order, and the hand-off to the engine's substitution assistant (WP-18 RotationPlan
// shape; league may not import engine-game, so the shape is restated and kept structurally equal).
import { P, hasP } from './params.ts';
import { resolveUnit, unitDef } from './chart.ts';
import type { DepthRecordRotation } from './records.ts';
import type { DepthChart, PositionGroup, UnitDef } from './types.ts';

export type ChangeUnit = 'play' | 'series' | 'fatigue';
export type RotationException = 'third_down' | 'red_zone' | 'two_minute' | 'last_four_minutes';

export interface RotationRule {
  readonly unitId: string;
  readonly job: string;
  /** Players sharing the job, most used first. */
  readonly personIds: readonly number[];
  /** Target share of the unit's snaps per player, same order (each 0 to 1). */
  readonly shares: readonly number[];
  readonly change: ChangeUnit;
  /** Situations where the first player stays in regardless of target (rule 4). */
  readonly starterIn: readonly RotationException[];
}

/** Staff default share at a depth rank (1 = most used), or null when the group does not rotate by default. */
export function defaultShare(group: PositionGroup, rank: number): number | null {
  if (!hasP(`rotateByDefault.${group}`) || P(`rotateByDefault.${group}`) === 0) return null;
  const key = `share.${group}.r${rank}`;
  return hasP(key) ? P(key) : 0;
}

/**
 * Planned share per player for one unit from the staff defaults (rule 1): players of each position group
 * are ranked by their best place on the unit's lists, and rank n gets the group's rank-n share. Groups
 * that do not rotate by default give the first player at each job the whole job and nobody else a share.
 */
export function staffShares(chart: DepthChart, defs: readonly UnitDef[], unitId: string): Map<number, number> {
  const def = unitDef(defs, unitId);
  const unit = resolveUnit(chart, defs, unitId);
  const out = new Map<number, number>();
  const groups = [...new Set(def.jobs.map((j) => j.group))];
  for (const g of groups) {
    const jobs = def.jobs.filter((j) => j.group === g).map((j) => unit.lists[j.job] ?? []);
    if (defaultShare(g, 1) === null) { for (const ids of jobs) if (ids[0] !== undefined) out.set(ids[0], 1); continue; }
    const best = new Map<number, number>();
    for (const ids of jobs) ids.forEach((id, i) => best.set(id, Math.min(best.get(id) ?? i, i)));
    const ranked = [...best.keys()].sort((a, b) => best.get(a)! - best.get(b)! || a - b);
    ranked.forEach((id, i) => out.set(id, defaultShare(g, i + 1) ?? 0));
  }
  return out;
}

export interface RotationState {
  /** Snaps the unit has taken this game. */
  readonly unitSnaps: number;
  /** This game's snaps by player in this unit. */
  readonly playerSnaps: Readonly<Record<string, number>>;
  /** The last snaps of the unit, newest last: who held the job (by-play recentSnaps). */
  readonly recent: readonly number[];
  /** Staff-visible fatigue cue per player (D10 sideline signs; never the hidden value, K9). */
  readonly cue: Readonly<Record<string, boolean>>;
  readonly startOfPossession: boolean;
  readonly situations: readonly RotationException[];
  /** Players at a medical limit (M2.3.2), who come off first whatever the targets say. */
  readonly medicalOut: ReadonlySet<number>;
}

/**
 * Who holds the job on the next snap (rule 2 and the exception order of rule 4): medical limit, then the
 * situation rules (the first player stays in), then the target by the rule's unit of change.
 */
export function holderForNextSnap(rule: RotationRule, current: number, s: RotationState): number {
  const eligible = rule.personIds.filter((id) => !s.medicalOut.has(id));
  if (eligible.length === 0) return current;
  if (s.medicalOut.has(current)) return eligible[0]!;
  const first = eligible[0]!;
  if (rule.starterIn.some((x) => s.situations.includes(x))) return first;
  const target = (id: number) => rule.shares[rule.personIds.indexOf(id)] ?? 0;
  if (rule.change === 'fatigue') {
    if (s.cue[String(current)] !== true) return current;
    return eligible.find((id) => id !== current && s.cue[String(id)] !== true) ?? current;
  }
  const behind = (id: number, share: number) => target(id) - share;
  if (rule.change === 'series') {
    if (!s.startOfPossession) return current;
    const actual = (id: number) => (s.unitSnaps > 0 ? (s.playerSnaps[String(id)] ?? 0) / s.unitSnaps : 0);
    return [...eligible].sort((a, b) => behind(b, actual(b)) - behind(a, actual(a)) || rule.personIds.indexOf(a) - rule.personIds.indexOf(b))[0]!;
  }
  // By play: swap at a dead ball when someone is more than the margin behind over the recentSnaps.
  const recentSnaps = s.recent.slice(-P('rotation.byPlayWindowSnaps'));
  if (recentSnaps.length === 0) return current;
  const recentShare = (id: number) => recentSnaps.filter((x) => x === id).length / recentSnaps.length;
  const most = [...eligible].filter((id) => id !== current).sort((a, b) => behind(b, recentShare(b)) - behind(a, recentShare(a)))[0];
  if (most !== undefined && behind(most, recentShare(most)) > P('rotation.byPlayBehind') && behind(current, recentShare(current)) < behind(most, recentShare(most))) return most;
  return current;
}

/** Defensive line waves (rule 3): the second group comes on at the next legal dead ball after the length or at a series end. */
export function waveDue(snapsThisWave: number, seriesEnded: boolean, waveLength: number = P('rotation.waveLengthSnaps')): boolean {
  return seriesEnded || snapsThisWave >= waveLength;
}

/** A missed swap (rule 5: the defense could not match a no-huddle offense), carried to the next chance. */
export interface MissedSwap { readonly unitId: string; readonly job: string; readonly wanted: number; readonly stayed: number }

export function plannedVersusActual(shares: ReadonlyMap<number, number>, snaps: Readonly<Record<string, number>>, unitSnaps: number): { personId: number; planned: number; actual: number; within: boolean }[] {
  const tol = P('rotation.gameTargetTolerance');
  return [...shares.entries()].sort((a, b) => a[0] - b[0]).map(([personId, planned]) => {
    const actual = unitSnaps > 0 ? (snaps[String(personId)] ?? 0) / unitSnaps : 0;
    return { personId, planned, actual, within: Math.abs(actual - planned) <= tol };
  });
}

/** The engine's plan shape (WP-18 bench/lineup.ts RotationPlan): floors in words, target shares, snap caps. */
export interface EnginePlayerPlan { readonly floor?: 'fresh_legs' | 'normal' | 'ride_him'; readonly targetShare?: number; readonly snapCap?: number }
export interface EngineRotationPlan { readonly floor: 'fresh_legs' | 'normal' | 'ride_him'; readonly players: Readonly<Record<string, EnginePlayerPlan>> }

/** Planned shares and snap caps to the engine's substitution assistant (I6 consumer). */
export function toEnginePlan(shares: ReadonlyMap<number, number>, snapCaps: ReadonlyMap<number, number>,
  floor: EngineRotationPlan['floor'] = 'normal', floors: ReadonlyMap<number, EngineRotationPlan['floor']> = new Map()): EngineRotationPlan {
  const players: Record<string, EnginePlayerPlan> = {};
  const ids = [...new Set([...shares.keys(), ...snapCaps.keys(), ...floors.keys()])].sort((a, b) => a - b);
  for (const id of ids) {
    const share = shares.get(id), cap = snapCaps.get(id), f = floors.get(id);
    players[String(id)] = { ...(share !== undefined && share < 1 ? { targetShare: share } : {}), ...(cap !== undefined ? { snapCap: cap } : {}), ...(f !== undefined ? { floor: f } : {}) };
  }
  return { floor, players };
}

/** Rotation rules as world rows (DepthChartRecord.rotation): one row per player, rule key per unit of change. */
export function toRecordRotation(rules: readonly RotationRule[]): DepthRecordRotation[] {
  return rules.flatMap((r) => r.personIds.map((id, i) => ({ role: r.job, personIds: [id], ruleKey: `rotation.by_${r.change}`, share: r.shares[i] ?? null })));
}
