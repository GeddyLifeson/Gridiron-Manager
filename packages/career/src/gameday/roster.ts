// The game-day roster (I1.2): pregame workouts of questionable players (I1.2.1), the inactive list and the
// active limit (I1.2.2), the emergency third quarterback (I1.2.3), radio helmet designations (I1.2.4) and the
// game-day depth card (I1.2.5). Limits come from rule keys (GameDayRules); a level with no active limit
// (activeLimit null) dresses the whole list the caller passes, which is the travel list there (I1.2.2 "By level").
import { gp } from './params.ts';
import { chance, clamp, lerp, normal, type Draw } from './math.ts';
import type { GameDayRules } from './rules.ts';

export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'K' | 'P' | 'LS';
export type MedicalStatus = 'clear' | 'questionable' | 'doubtful' | 'out' | 'concussion_protocol';

export interface GameDayPlayer {
  readonly id: string;
  readonly group: PositionGroup;
  /** On the 53 (true) or an elevated practice squad player (false). */
  readonly onRoster: boolean;
  readonly medical: MedicalStatus;
  /** Special teams and emergency jobs this player holds (for example 'holder', 'punt.gunner'). */
  readonly jobs?: readonly string[];
}

// ---------------------------------------------------------------------------------------------- I1.2.1

export type WorkoutVerdict = 'full' | 'limited' | 'cannot_go';

export interface WorkoutReport {
  readonly playerId: string;
  readonly verdict: WorkoutVerdict;
  /** Recommended snap ceiling when limited (tracked by I6); null otherwise. */
  readonly snapCeiling: number | null;
  /** The reported readiness the verdict rests on (staff view, never the truth). */
  readonly reported: number;
  /** The player aggravated the injury in the workout and is now cannot go (I1.2.1 edge case). */
  readonly aggravated: boolean;
}

function verdictOf(r: number): WorkoutVerdict {
  return r >= gp('workout.fullFrom') ? 'full' : r >= gp('workout.limitedFrom') ? 'limited' : 'cannot_go';
}

/**
 * I1.2.1: the report is the true readiness (0 to 1) plus noise that shrinks with the staff's accuracy (hidden
 * K6 value, 0 to 1, medical staff and position coach together). A small aggravation risk applies. A player in
 * the concussion protocol is never worked out (returns null).
 */
export function workout(p: GameDayPlayer, trueReadiness: number, staffAccuracy: number, draw: Draw): WorkoutReport | null {
  if (p.medical === 'concussion_protocol') return null;
  const aggravated = chance(gp('workout.aggravationChance'), draw);
  const sd = lerp(gp('workout.noiseAtZero'), gp('workout.noiseAtFull'), staffAccuracy);
  const reported = clamp(trueReadiness + sd * normal(draw), 0, 1);
  const verdict = aggravated ? 'cannot_go' : verdictOf(reported);
  return {
    playerId: p.id, verdict, reported, aggravated,
    snapCeiling: verdict === 'limited' ? Math.round(reported * gp('workout.snapCeilingPerReadiness')) : null,
  };
}

// ---------------------------------------------------------------------------------------------- I1.2.2

/** The active limit for a count of active offensive linemen (I1.2.2 rule 1); null when the level has none. */
export function activeLimit(rules: GameDayRules, linemenActive: number): number | null {
  if (rules.activeLimit === null) return null;
  if (rules.activeMinLinemen !== null && rules.activeLimitShortLine !== null && linemenActive < rules.activeMinLinemen) return rules.activeLimitShortLine;
  return rules.activeLimit;
}

/** A breakable act the caller routes to compliance (G-28, L8.2.5 class id), warned and logged, never blocked. */
export interface BreakableAct {
  readonly classId: 'medical_clearance' | 'concussion_protocol' | 'media_policy' | 'injury_report_shading';
  readonly playerId?: string;
  readonly leaf: string;
}

export type ActiveListProblem =
  | { readonly kind: 'over_limit'; readonly active: number; readonly limit: number }
  | { readonly kind: 'unknown_player'; readonly playerId: string }
  | { readonly kind: 'too_many_elevations'; readonly elevated: number; readonly max: number }
  | { readonly kind: 'emergency_qb_on_active_list'; readonly playerId: string };

export interface ActiveListCheck {
  readonly legal: boolean;
  readonly limit: number | null;
  readonly problems: readonly ActiveListProblem[];
  /** Players medically out (or in protocol) put on the list against the doctors: breakable acts (I11.8.1). */
  readonly acts: readonly BreakableAct[];
  readonly inactive: readonly string[];
}

/**
 * I1.2.2: check an active list. Medically ruled-out players are inactive unless the coach overrides, which is
 * allowed only as a breakable act (I1.2.1 rules, audit Part 17). The emergency quarterback is not on the list.
 */
export function checkActiveList(pool: readonly GameDayPlayer[], activeIds: readonly string[], rules: GameDayRules, emergencyQbId?: string): ActiveListCheck {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const problems: ActiveListProblem[] = [];
  const acts: BreakableAct[] = [];
  const active = [...new Set(activeIds)];
  for (const id of active) if (!byId.has(id)) problems.push({ kind: 'unknown_player', playerId: id });
  const players = active.map((id) => byId.get(id)).filter((p): p is GameDayPlayer => p !== undefined);
  const linemen = players.filter((p) => p.group === 'OL').length;
  const limit = activeLimit(rules, linemen);
  if (limit !== null && players.length > limit) problems.push({ kind: 'over_limit', active: players.length, limit });
  const elevated = pool.filter((p) => !p.onRoster).length;
  if (elevated > rules.elevationsMaxPerGame) problems.push({ kind: 'too_many_elevations', elevated, max: rules.elevationsMaxPerGame });
  if (emergencyQbId !== undefined && active.includes(emergencyQbId)) problems.push({ kind: 'emergency_qb_on_active_list', playerId: emergencyQbId });
  for (const p of players) {
    if (p.medical === 'out') acts.push({ classId: 'medical_clearance', playerId: p.id, leaf: 'I1.2.1' });
    if (p.medical === 'concussion_protocol') acts.push({ classId: 'concussion_protocol', playerId: p.id, leaf: 'I1.2.1' });
  }
  const inactive = pool.filter((p) => !active.includes(p.id) && p.id !== emergencyQbId).map((p) => p.id);
  return { legal: problems.length === 0, limit, problems, acts, inactive };
}

/** Minimum healthy players per group or job for the thin-spot panel (I1.2.2 rule 5). */
function groupMinimum(g: PositionGroup): number {
  if (g === 'QB') return gp('thin.quarterbacks');
  if (g === 'OL') return gp('thin.offensiveLinemen');
  if (g === 'K' || g === 'P' || g === 'LS') return 1;
  return gp('thin.otherGroup');
}

export interface ThinSpot {
  readonly what: string;
  readonly have: number;
  readonly need: number;
}

const GROUPS: readonly PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P', 'LS'];
const healthy = (p: GameDayPlayer) => p.medical !== 'out' && p.medical !== 'concussion_protocol';

/**
 * I1.2.2 rule 5: every position group and job below its minimum on the active list. Each specialist job (K, P,
 * LS, and any job named on players) needs `thin.specialistBackups` backups beyond its holder.
 */
export function thinSpots(pool: readonly GameDayPlayer[], activeIds: readonly string[]): ThinSpot[] {
  const act = pool.filter((p) => activeIds.includes(p.id) && healthy(p));
  const out: ThinSpot[] = [];
  for (const g of GROUPS) {
    const have = act.filter((p) => p.group === g).length;
    const need = groupMinimum(g);
    if (have < need) out.push({ what: `group.${g}`, have, need });
  }
  const jobs = new Map<string, number>();
  for (const p of act) for (const j of p.jobs ?? []) jobs.set(j, (jobs.get(j) ?? 0) + 1);
  const allJobs = new Set(pool.flatMap((p) => p.jobs ?? []));
  for (const j of [...allJobs].sort()) {
    const have = jobs.get(j) ?? 0;
    const need = 1 + gp('thin.specialistBackups');
    if (have < need) out.push({ what: `job.${j}`, have, need });
  }
  return out;
}

/**
 * I1.2.2 AI use: the staff's proposed list. Medically out players are dropped first, then the lowest value
 * (expected snaps and special teams value for this opponent, from the caller), never below a group minimum
 * while another player can go. With an active limit of null (no game-day cut) everyone healthy dresses.
 */
export function staffActiveList(pool: readonly GameDayPlayer[], value: (id: string) => number, rules: GameDayRules, emergencyQbId?: string): string[] {
  const candidates = pool.filter((p) => healthy(p) && p.id !== emergencyQbId);
  const ordered = [...candidates].sort((a, b) => value(b.id) - value(a.id) || a.id.localeCompare(b.id));
  const linemen = ordered.filter((p) => p.group === 'OL').length;
  const limit = activeLimit(rules, linemen);
  if (limit === null || ordered.length <= limit) return ordered.map((p) => p.id);
  const keep: GameDayPlayer[] = [];
  // first fill each group to its minimum by value, then the rest by value
  for (const g of GROUPS) {
    for (const p of ordered.filter((x) => x.group === g).slice(0, groupMinimum(g))) {
      keep.push(p);
    }
  }
  for (const p of ordered) {
    if (keep.length >= limit) break;
    if (!keep.includes(p)) keep.push(p);
  }
  const finalLimit = activeLimit(rules, keep.filter((p) => p.group === 'OL').length) ?? limit;
  return keep.slice(0, finalLimit).map((p) => p.id);
}

// ---------------------------------------------------------------------------------------------- I1.2.3

export type EmergencyQbProblem = 'rule_off' | 'not_a_quarterback' | 'elevated_player' | 'wrong_active_qb_count' | 'on_active_list';

/** I1.2.3 rules 1 and 2: may this player be named the emergency quarterback? */
export function checkEmergencyQb(p: GameDayPlayer, pool: readonly GameDayPlayer[], activeIds: readonly string[], rules: GameDayRules): EmergencyQbProblem[] {
  const out: EmergencyQbProblem[] = [];
  if (rules.emergencyQbActiveQbs <= 0) return ['rule_off'];
  if (p.group !== 'QB') out.push('not_a_quarterback');
  if (!p.onRoster && !rules.emergencyQbFromPracticeSquad) out.push('elevated_player');
  const activeQbs = pool.filter((x) => x.group === 'QB' && activeIds.includes(x.id));
  if (activeQbs.length !== rules.emergencyQbActiveQbs || activeQbs.some((x) => !x.onRoster)) out.push('wrong_active_qb_count');
  if (activeIds.includes(p.id)) out.push('on_active_list');
  return out;
}

export type QbAvailability = 'available' | 'injured' | 'disqualified' | 'poor_play';

/** I1.2.3 rule 3: he may enter only when both other quarterbacks are injured or disqualified. */
export function emergencyQbMayEnter(others: readonly QbAvailability[]): boolean {
  return others.length > 0 && others.every((a) => a === 'injured' || a === 'disqualified');
}

/** I1.2.3 rule 4: a cleared quarterback returning sends the emergency quarterback out. */
export function emergencyQbMustLeave(others: readonly QbAvailability[]): boolean {
  return others.some((a) => a === 'available' || a === 'poor_play');
}

/** I1.2.3 rule 5: while he is in, only he takes a direct snap and he plays no other job. */
export function playCallableWithEmergencyQb(play: { directSnapTo: 'quarterback' | 'other' }): boolean {
  return play.directSnapTo === 'quarterback';
}

// ---------------------------------------------------------------------------------------------- I1.2.4

export interface RadioDesignation {
  readonly offense: readonly string[];
  readonly defensePrimary: string | null;
  readonly defenseBackup: string | null;
}

export type RadioProblem =
  | { readonly kind: 'radio_off' }
  | { readonly kind: 'too_many_offense'; readonly count: number; readonly max: number }
  | { readonly kind: 'too_many_defense'; readonly count: number; readonly max: number }
  | { readonly kind: 'not_active'; readonly playerId: string }
  | { readonly kind: 'backup_without_primary' };

/** I1.2.4 rules 2 and 6: designations on the report (pro). A level with no designation rule returns no problems. */
export function checkRadio(d: RadioDesignation, activeIds: readonly string[], rules: GameDayRules): RadioProblem[] {
  if (!rules.radioAllowed) return d.offense.length || d.defensePrimary || d.defenseBackup ? [{ kind: 'radio_off' }] : [];
  const out: RadioProblem[] = [];
  if (rules.radioDesignatedOffense > 0 && d.offense.length > rules.radioDesignatedOffense) out.push({ kind: 'too_many_offense', count: d.offense.length, max: rules.radioDesignatedOffense });
  const def = [d.defensePrimary, d.defenseBackup].filter((x): x is string => x !== null);
  if (rules.radioDesignatedDefense > 0 && def.length > rules.radioDesignatedDefense) out.push({ kind: 'too_many_defense', count: def.length, max: rules.radioDesignatedDefense });
  if (d.defenseBackup !== null && d.defensePrimary === null) out.push({ kind: 'backup_without_primary' });
  for (const id of [...d.offense, ...def]) if (!activeIds.includes(id)) out.push({ kind: 'not_active', playerId: id });
  return out;
}

/**
 * I1.2.4 rules 1, 3 and 5 for one defensive snap: who on the field hears the coach. Pro designation: the
 * primary if on the field, else the backup; with both out of the game nobody does and the call goes by signal.
 * A level without designation lets any one defender wear it (`handedTo`). Never more than the on-field limit.
 */
export function defensiveRadioForSnap(onField: readonly string[], d: RadioDesignation, rules: GameDayRules, handedTo?: string): string | null {
  if (!rules.radioAllowed || rules.radioOnFieldDefense < 1) return null;
  if (rules.radioDesignatedDefense > 0) {
    if (d.defensePrimary && onField.includes(d.defensePrimary)) return d.defensePrimary;
    if (d.defenseBackup && onField.includes(d.defenseBackup)) return d.defenseBackup;
    return null;
  }
  return handedTo !== undefined && onField.includes(handedTo) ? handedTo : null;
}

/** I1.2.4 edge case: warn when the primary leaves in a sub package and the backup is not on the field for it. */
export function radioPackageWarnings(d: RadioDesignation, packages: Readonly<Record<string, readonly string[]>>): string[] {
  const out: string[] = [];
  for (const [name, players] of Object.entries(packages)) {
    const p = d.defensePrimary !== null && players.includes(d.defensePrimary);
    const b = d.defenseBackup !== null && players.includes(d.defenseBackup);
    if (!p && !b) out.push(name);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------------------------- I1.2.5

/** A depth card: each slot (position or job) holds an ordered list of active players. */
export type DepthCard = Readonly<Record<string, readonly string[]>>;

/** I1.2.5: filter the depth chart to the active list (regenerated when the list changes). */
export function buildDepthCard(depthChart: DepthCard, activeIds: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [slot, ids] of Object.entries(depthChart)) out[slot] = ids.filter((id) => activeIds.includes(id));
  return out;
}

/** I1.2.5: each player's chain: every slot that needs a replacement if he goes down (he is first there). */
export function chains(card: DepthCard): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [slot, ids] of Object.entries(card)) {
    const first = ids[0];
    if (first !== undefined) (out[first] ??= []).push(slot);
  }
  for (const k of Object.keys(out)) out[k]!.sort();
  return out;
}

/** I1.2.5: red marks: slots with no healthy backup (fewer than two names). */
export function slotsWithoutBackup(card: DepthCard): string[] {
  return Object.entries(card).filter(([, ids]) => ids.length < 2).map(([s]) => s).sort();
}

/** The next man up at a slot when `downIds` are out (I6 reads this in seconds, I1.2.5 purpose). */
export function nextUp(card: DepthCard, slot: string, downIds: readonly string[]): string | null {
  return (card[slot] ?? []).find((id) => !downIds.includes(id)) ?? null;
}
