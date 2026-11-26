// The coverage board (H6.2.1 rules 2 and 3, M2.1.4 counters). Reads the depth chart records the
// depth chart module writes (world:DepthChartRecord, M2.1.1: per job, ordered player ids) and the
// working active list. A job needs a starter and a backup among the actives; a special teams unit
// needs a full side of distinct named actives.
import { param, SPECIAL_TEAMS_NAMESPACE } from './params.ts';
import type { CoverageLevel, CoverageRow, UnitRow } from './types.ts';

/** The part of a depth chart record the board reads (world:DepthChartRecord). */
export interface DepthUnit {
  readonly unitId: string;
  readonly roles: Readonly<Record<string, readonly number[]>>;
}

export const isSpecialTeamsUnit = (unitId: string): boolean => unitId.split(':')[0] === SPECIAL_TEAMS_NAMESPACE;

const sortedKeys = (o: Readonly<Record<string, unknown>>) => Object.keys(o).sort();

/**
 * One row per job of every non-special-teams unit. Starter and backup are the first and second
 * players listed at the job who are on the active list; emergency is the next one after them.
 */
export function coverageRows(depth: readonly DepthUnit[], actives: ReadonlySet<number>): CoverageRow[] {
  const depthNeeded = param('roster_moves.coverage_depth');
  const out: CoverageRow[] = [];
  for (const u of [...depth].filter((d) => !isSpecialTeamsUnit(d.unitId)).sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0))) {
    for (const role of sortedKeys(u.roles)) {
      const dressed = (u.roles[role] ?? []).filter((id) => actives.has(id));
      const starter = dressed[0] ?? null, backup = dressed[1] ?? null, emergency = dressed[2] ?? null;
      const level: CoverageLevel = starter === null ? 'red' : dressed.length < depthNeeded ? 'amber' : 'ok';
      out.push({ unitId: u.unitId, role, starter, backup, emergency, level });
    }
  }
  return out;
}

/** First active player at each job of a special teams unit, distinct (a man fills one job on a play). */
export function unitNamed(unit: DepthUnit, actives: ReadonlySet<number>): number[] {
  const taken = new Set<number>();
  for (const role of sortedKeys(unit.roles)) {
    const pick = (unit.roles[role] ?? []).find((id) => actives.has(id) && !taken.has(id));
    if (pick !== undefined) taken.add(pick);
  }
  return [...taken];
}

/** H6.2.1 rule 3: each special teams unit needs `side` named actives; short by any is red. */
export function unitRows(depth: readonly DepthUnit[], actives: ReadonlySet<number>, side: number): UnitRow[] {
  return [...depth].filter((d) => isSpecialTeamsUnit(d.unitId)).sort((a, b) => (a.unitId < b.unitId ? -1 : 1)).map((u) => {
    const named = unitNamed(u, actives).length;
    return { unitId: u.unitId, named, needed: side, level: named >= side ? 'ok' : 'red' };
  });
}

/** Gap labels for the lock confirmation (H6.2.1 acceptance 2). */
export function gapLabels(rows: readonly CoverageRow[], units: readonly UnitRow[], level: CoverageLevel): string[] {
  const out = rows.filter((r) => r.level === level).map((r) => `${r.unitId}/${r.role}`);
  if (level === 'red') for (const u of units) if (u.level === 'red') out.push(`${u.unitId} (${u.named} of ${u.needed})`);
  return out;
}

/** Jobs as `unit/role#rank` per player, and the count of special teams units he is first on (M2.4.1 rule 2). */
export function jobsByPlayer(depth: readonly DepthUnit[]): { jobs: Map<number, string[]>; stFirsts: Map<number, number> } {
  const jobs = new Map<number, string[]>(), stFirsts = new Map<number, number>();
  for (const u of depth) {
    const firstHere = new Set<number>();
    for (const role of sortedKeys(u.roles)) {
      (u.roles[role] ?? []).forEach((id, i) => {
        const list = jobs.get(id) ?? [];
        list.push(`${u.unitId}/${role}#${i + 1}`);
        jobs.set(id, list);
        if (i === 0 && isSpecialTeamsUnit(u.unitId)) firstHere.add(id);
      });
    }
    for (const id of firstHere) stFirsts.set(id, (stFirsts.get(id) ?? 0) + 1);
  }
  for (const l of jobs.values()) l.sort();
  return { jobs, stFirsts };
}
