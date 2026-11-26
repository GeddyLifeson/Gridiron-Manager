// M2.2.1 package charts (triggers and fallback) and M2.2.2 situational specialists.
import { P } from './params.ts';
import { lineupFor, resolveUnit, unitDef, unitSide, type ResolvedUnit, type UnitLineup } from './chart.ts';
import type { DepthChart, PackageTrigger, Problem, UnitDef, UnitSide } from './types.ts';

/** What the signal caller knows at the dead ball (I6 reads it; J5 may have read personnel wrong). */
export interface DeadBall {
  /** A coordinator's call naming a unit id; overrides every trigger (rule 3). */
  readonly call?: string;
  /** Offensive personnel as read by the defense's signal caller. */
  readonly personnelRead?: string;
  readonly down: number;
  readonly toGo: number;
  /** Yards from the goal line being attacked. */
  readonly yardsToGoal: number;
  readonly situations?: readonly string[];
}

function matches(t: PackageTrigger, d: DeadBall, withPersonnel: boolean): boolean {
  if (withPersonnel !== (t.personnel !== undefined)) return false;
  if (t.personnel !== undefined && (d.personnelRead === undefined || !t.personnel.includes(d.personnelRead))) return false;
  if (t.downs !== undefined && !t.downs.includes(d.down)) return false;
  if (t.minToGo !== undefined && d.toGo < t.minToGo) return false;
  if (t.maxToGo !== undefined && d.toGo > t.maxToGo) return false;
  if (t.situation !== undefined && !(d.situations ?? []).includes(t.situation)) return false;
  return true;
}

/**
 * Package for the next snap on one side, checked in the rule 3 order: the coordinator's call, then the
 * personnel read, then down-and-distance and situation rules, then the base package (the side's unit
 * with no base). Only units in the week's plan are eligible.
 */
export function choosePackage(side: UnitSide, defs: readonly UnitDef[], plan: readonly string[], d: DeadBall): string {
  const mine = plan.filter((u) => unitSide(u) === side).map((u) => unitDef(defs, u));
  if (d.call !== undefined && mine.some((u) => u.unitId === d.call)) return d.call;
  const byPersonnel = mine.find((u) => u.trigger !== undefined && matches(u.trigger, d, true));
  if (byPersonnel) return byPersonnel.unitId;
  const bySituation = mine.find((u) => u.trigger !== undefined && matches(u.trigger, d, false));
  if (bySituation) return bySituation.unitId;
  const base = mine.find((u) => u.base === undefined);
  if (!base) throw new Error(`league.depth: no base unit for ${side} in the plan`);
  return base.unitId;
}

export interface PackageLineup extends UnitLineup {
  /** Jobs whose own list had nobody available and fell back to the base mapping (rule 5, I1 warning). */
  readonly fellBack: readonly string[];
}

/**
 * A package's eleven with job-by-job fallback (rule 5 and edge case): each job's own list first, then the
 * base job it maps to.
 */
export function packageLineup(chart: DepthChart, defs: readonly UnitDef[], unitId: string, available: (personId: number) => boolean): PackageLineup {
  const def = unitDef(defs, unitId);
  const own = resolveUnit(chart, defs, unitId);
  if (def.base === undefined) return { ...lineupFor(own, available), fellBack: [] };
  const base = resolveUnit(chart, defs, def.base);
  const lists: Record<string, readonly number[]> = {};
  const fellBack: string[] = [];
  for (const j of def.jobs) {
    const mine = own.lists[j.job] ?? [];
    const from = base.lists[j.mapsTo ?? j.job] ?? [];
    lists[j.job] = [...mine, ...from.filter((id) => !mine.includes(id))];
    if (mine.length > 0 && !own.inherited.includes(j.job) && !mine.some(available)) fellBack.push(j.job);
  }
  const merged: ResolvedUnit = { unitId, lists, inherited: own.inherited };
  return { ...lineupFor(merged, available), fellBack };
}

/** Situational roles (M2.2.2 rule 1); the ids are the role keys in DepthChart.situational. */
export type SituationalRole = 'third_down_back' | 'short_yardage_back' | 'hands_team' | 'kneel_down' | 'last_play_deep' | 'two_point' | 'qb_package';

/** Staff default triggers for the backs (rule 1); the others are called (I5) or follow a kick read (F12). */
export function situationalBack(d: DeadBall): SituationalRole | null {
  const third = P('sit.thirdDown'), fourth = P('sit.fourthDown');
  if ((d.down === third || d.down === fourth) && d.toGo <= P('sit.shortYardageMaxToGo')) return 'short_yardage_back';
  if (d.yardsToGoal <= P('sit.goalLineYardLine')) return 'short_yardage_back';
  if ((d.down === third && d.toGo >= P('sit.thirdDownBackMinToGo')) || (d.situations ?? []).includes('two_minute')) return 'third_down_back';
  return null;
}

export interface SituationalFill {
  readonly players: readonly number[];
  /** True when nobody is named and the base chart covers it (rule 3: I1 lists it as unfilled). */
  readonly unfilled: boolean;
  /** Named players who were not available, replaced from the fallback (edge case: the coach is told). */
  readonly replaced: readonly number[];
}

/**
 * Fill a situational role with `size` players: the named available players, then the fallback order (the
 * base chart for the backs, the next best hands for the hands team) excluding anyone already used.
 */
export function fillSituational(chart: DepthChart, role: SituationalRole, size: number, fallback: readonly number[], available: (personId: number) => boolean): SituationalFill {
  const named = chart.situational[role] ?? [];
  const players = named.filter(available).slice(0, size);
  const replaced = named.filter((id) => !available(id));
  for (const id of fallback) { if (players.length >= size) break; if (available(id) && !players.includes(id)) players.push(id); }
  return { players, unfilled: named.length === 0, replaced };
}

/** I1 pre-kickoff list of situational roles with nobody named (rule 3). */
export function unfilledSituational(chart: DepthChart, roles: readonly SituationalRole[]): Problem[] {
  return roles.filter((r) => (chart.situational[r] ?? []).length === 0)
    .map((r) => ({ leaf: 'M2.2.2', unitId: 'situational', message: `${r.replace(/_/g, ' ')}: nobody named, the base chart covers it` }));
}
