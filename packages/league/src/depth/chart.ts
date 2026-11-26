// M2.1.1 the chart object and M2.2.1 package charts: resolving a unit to job lists, choosing the eleven
// from the available players, validation, and the hand-offs to the engine (SimTeam.depth) and the save
// (world DepthChartRecord).
import type { DepthChartRecord } from '@gm/schema';
import type { DepthRecordRotation } from './records.ts';
import type { DepthRules } from './keys.ts';
import type { DepthChart, JobLists, Problem, UnitDef, UnitSide } from './types.ts';

const SIDES: readonly UnitSide[] = ['off', 'def', 'st'];

/** Side of a unit content id (`off:11`, `def:nickel`, `st:punt`). Throws on any other namespace. */
export function unitSide(unitId: string): UnitSide {
  const ns = unitId.slice(0, unitId.indexOf(':'));
  const side = SIDES.find((s) => s === ns);
  if (side === undefined) throw new Error(`league.depth: unit ${unitId} is not in the off:, def: or st: namespace`);
  return side;
}

export function unitDef(defs: readonly UnitDef[], unitId: string): UnitDef {
  const d = defs.find((u) => u.unitId === unitId);
  if (d === undefined) throw new Error(`league.depth: no unit ${unitId}`);
  return d;
}

export interface ResolvedUnit {
  readonly unitId: string;
  readonly lists: JobLists;
  /** Package jobs with no list of their own, filled from the base job (shown as "inherited", M2.2.1 rule 2). */
  readonly inherited: readonly string[];
}

/** A unit's job lists with package inheritance applied (M2.2.1). */
export function resolveUnit(chart: DepthChart, defs: readonly UnitDef[], unitId: string): ResolvedUnit {
  const def = unitDef(defs, unitId);
  const own = chart.units[unitId] ?? {};
  const lists: Record<string, readonly number[]> = {};
  const inherited: string[] = [];
  for (const j of def.jobs) {
    const mine = own[j.job] ?? [];
    if (mine.length > 0 || def.base === undefined) { lists[j.job] = mine; continue; }
    const base = resolveUnit(chart, defs, def.base);
    lists[j.job] = base.lists[j.mapsTo ?? j.job] ?? [];
    inherited.push(j.job);
  }
  return { unitId, lists, inherited };
}

export interface UnitLineup {
  /** Job to the player who fills it. */
  readonly lineup: Readonly<Record<string, number>>;
  /** Jobs no listed available player could fill (filled at game time by the cascade, M2.1.1 edge case). */
  readonly gaps: readonly string[];
}

/**
 * First available listed player per job, in job order, never using a player twice (M2.1.1 rule 2: a
 * player first in two jobs takes the first and the second job goes to its next man).
 */
export function lineupFor(unit: ResolvedUnit, available: (personId: number) => boolean): UnitLineup {
  const used = new Set<number>();
  const lineup: Record<string, number> = {};
  const gaps: string[] = [];
  for (const [job, ids] of Object.entries(unit.lists)) {
    const pick = ids.find((id) => !used.has(id) && available(id));
    if (pick === undefined) { gaps.push(job); continue; }
    used.add(pick);
    lineup[job] = pick;
  }
  return { lineup, gaps };
}

/**
 * M2.1.1 acceptance: for every unit in the week's plan the chart yields `onField` distinct players.
 * Lists every unit that fails, and every player first at two jobs of one unit (rule 2), and every listed
 * person who is not available to the club (`onRoster`).
 */
export function validateChart(chart: DepthChart, defs: readonly UnitDef[], plan: readonly string[], rules: DepthRules,
  onRoster: (personId: number) => boolean): Problem[] {
  const problems: Problem[] = [];
  for (const unitId of plan) {
    const def = unitDef(defs, unitId);
    if (def.jobs.length !== rules.onField) problems.push({ leaf: 'M2.1.1', unitId, message: `unit has ${def.jobs.length} jobs; a side fields ${rules.onField}` });
    const unit = resolveUnit(chart, defs, unitId);
    const firsts = new Map<number, string>();
    for (const [job, ids] of Object.entries(unit.lists)) {
      for (const id of ids) if (!onRoster(id)) problems.push({ leaf: 'M2.1.1', unitId, message: `${job}: person ${id} is not on the roster` });
      const first = ids[0];
      if (first === undefined) { problems.push({ leaf: 'M2.1.1', unitId, message: `${job}: empty column, filled at game time and logged as a preparation error` }); continue; }
      const other = firsts.get(first);
      if (other !== undefined) problems.push({ leaf: 'M2.1.1', unitId, message: `person ${first} is first at ${other} and ${job}, which are on the field together` });
      else firsts.set(first, job);
    }
    const { lineup } = lineupFor(unit, onRoster);
    const n = Object.keys(lineup).length;
    if (n < rules.onField) problems.push({ leaf: 'M2.1.1', unitId, message: `yields ${n} distinct players of ${rules.onField}` });
  }
  return problems;
}

/**
 * The engine's depth map for one game (SimTeam.depth, role label to ordered ids). The engine fills a
 * play's role labels from it (WP-18 chooseLineup); each listed unit's jobs are written under their job
 * label, later units never overwriting a job an earlier unit set, so pass the base units first.
 * Inactive players are dropped (M2.1.4 outputs: inactive players get no snaps).
 */
export function toSimDepth(chart: DepthChart, defs: readonly UnitDef[], unitIds: readonly string[], active: (personId: number) => boolean): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const unitId of unitIds) {
    const unit = resolveUnit(chart, defs, unitId);
    for (const [job, ids] of Object.entries(unit.lists)) {
      if (job in out) continue;
      out[job] = ids.filter(active);
    }
  }
  return out;
}

/** Rotation rows the save keeps beside each unit (world DepthChartRecord.rotation). */
export type RecordRotation = DepthRecordRotation;

/** The chart as world rows, one per unit (P3.2.4). Job lists only; cascades and the card live in the club's plan state. */
export function toRecords(chart: DepthChart, updated: DepthChartRecord['updated'], rotation: (unitId: string) => RecordRotation[] = () => []): DepthChartRecord[] {
  return Object.keys(chart.units).sort().map((unitId) => ({
    teamId: chart.teamId,
    unitId,
    roles: Object.fromEntries(Object.entries(chart.units[unitId]!).map(([j, ids]) => [j, [...ids]])),
    rotation: rotation(unitId),
    updated,
  }));
}

/** Job lists back from world rows of one team. */
export function unitsFromRecords(rows: readonly DepthChartRecord[], teamId: number): Record<string, JobLists> {
  const out: Record<string, JobLists> = {};
  for (const r of rows) if (r.teamId === teamId) out[r.unitId] = r.roles;
  return out;
}

/** M2.1.1 rule 4: after the active list locks, a change may only reorder or add active players. */
export function changeAllowedAfterLock(before: JobLists, after: JobLists, active: (personId: number) => boolean): boolean {
  for (const [job, ids] of Object.entries(after)) {
    const was = new Set(before[job] ?? []);
    for (const id of ids) if (!was.has(id) && !active(id)) return false;
  }
  return true;
}
