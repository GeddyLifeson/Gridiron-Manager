// M2.4.1 unit charts (special teams counts, the starter cap, load) and M2.4.2 specialists (recorded
// operation times are J9's; this module keeps the shared-timing penalty and the slow marks).
import { P } from './params.ts';
import { resolveUnit, unitSide } from './chart.ts';
import type { DepthChart, Problem, UnitDef } from './types.ts';

const coreDefs = (defs: readonly UnitDef[]) => defs.filter((d) => unitSide(d.unitId) === 'st' && d.core === true);

/** Each player's special teams count: core units he is first on (rule 2). */
export function specialTeamsCounts(chart: DepthChart, defs: readonly UnitDef[], available: (personId: number) => boolean = () => true): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of coreDefs(defs)) {
    const unit = resolveUnit(chart, defs, d.unitId);
    const firsts = new Set<number>();
    for (const ids of Object.values(unit.lists)) { const f = ids.find(available); if (f !== undefined) firsts.add(f); }
    for (const id of firsts) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Starters first on more core units than the cap, not counting exempt jobs (rule 4: returners, field goal linemen). */
export function starterCapProblems(chart: DepthChart, defs: readonly UnitDef[], starters: ReadonlySet<number>): Problem[] {
  const counts = new Map<number, number>();
  for (const d of coreDefs(defs)) {
    const unit = resolveUnit(chart, defs, d.unitId);
    for (const j of d.jobs) {
      if (j.stExempt === true) continue;
      const first = unit.lists[j.job]?.[0];
      if (first !== undefined && starters.has(first)) counts.set(first, (counts.get(first) ?? 0) + 1);
    }
  }
  const cap = P('st.starterMaxCoreUnits');
  return [...counts.entries()].filter(([, n]) => n > cap).sort((a, b) => a[0] - b[0])
    .map(([id, n]) => ({ leaf: 'M2.4.1', unitId: 'st', message: `starter ${id} is first on ${n} core units; the staff limit is ${cap}` }));
}

/** Backups with a zero special teams count: flagged as low value at cutdown and inactives (rule 2). */
export function lowValueBackups(actives: readonly number[], starters: ReadonlySet<number>, counts: ReadonlyMap<number, number>): number[] {
  return actives.filter((id) => !starters.has(id) && (counts.get(id) ?? 0) === 0);
}

/** Load per special teams snap against an average scrimmage snap (rule 5), fed to D10. */
export function specialTeamsLoad(def: UnitDef): number {
  if (def.load === 'coverage') return P('st.loadCoverage');
  if (def.load === 'kicking') return P('st.loadKicking');
  return P('st.loadOther');
}

/**
 * Shared-timing penalty on field goal operation time after one member of the snapper, holder and kicker
 * trio changes (M2.4.2 rule 2). `week` counts from 1 (the week of the change); each practice period with
 * the new trio together removes a share of what is left.
 */
export function timingPenalty(week: number, periodsTogether: number): { readonly meanS: number; readonly sdS: number } {
  if (week < 1 || week > P('spec.penaltyWeeks')) return { meanS: 0, sdS: 0 };
  const left = powInt(P('spec.penaltyWeekDecay'), week - 1) * powInt(1 - P('spec.practiceRemoval'), periodsTogether);
  return { meanS: P('spec.penaltyMeanS') * left, sdS: P('spec.penaltySdS') * left };
}

/** Slow mark on a recorded operation time (rule 1). */
export function slowOperation(kind: 'field_goal' | 'punt', seconds: number): boolean {
  return seconds > P(kind === 'field_goal' ? 'spec.slowFieldGoalS' : 'spec.slowPuntS');
}

/** Whole-number power by repeated multiplication (core code avoids platform transcendental math, P1.1.1). */
function powInt(base: number, n: number): number {
  let out = 1;
  for (let i = 0; i < n; i++) out *= base;
  return out;
}
