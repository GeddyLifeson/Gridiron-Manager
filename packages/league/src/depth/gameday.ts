// M2.1.4 building the game-day list from the chart. The staff draft fills in the order of rule 2; the
// active limit comes from the roster module (C5.2.1, roster.activeLimitFor) and is passed in as a
// function of the offensive linemen dressed, so 47 with seven linemen falls out of the same loop.
import { P } from './params.ts';
import { lineupFor, resolveUnit, unitSide } from './chart.ts';
import type { DepthChart, DepthPerson, PositionGroup, Problem, UnitDef } from './types.ts';

export type InactiveReason = 'ruled_out' | 'depth';

export interface GameDayDraft {
  readonly actives: readonly number[];
  readonly inactives: readonly { readonly personId: number; readonly reason: InactiveReason }[];
  /** Limit for the list as drafted (48, or 47 short of linemen, from the roster rules). */
  readonly limit: number;
  /** Plain-words risks: a group under its staff minimum, a unit without a named active backup. */
  readonly warnings: readonly Problem[];
}

export interface GameDayInput {
  readonly chart: DepthChart;
  readonly defs: readonly UnitDef[];
  /** Units and packages in the week's plan (G6), special teams included. */
  readonly plan: readonly string[];
  /** Roster plus this game's elevations (roster.gameDayCandidates). */
  readonly candidates: readonly number[];
  readonly people: ReadonlyMap<number, DepthPerson>;
  /** Active limit for a list with this many offensive linemen (roster.activeLimitFor). */
  readonly limitFor: (linemen: number) => number;
}

type MinGroup = PositionGroup | 'front';
const MIN_GROUPS: readonly MinGroup[] = ['qb', 'ol', 'rb', 'wr', 'te', 'k', 'p', 'ls', 'front', 'db'];
const inGroup = (p: DepthPerson | undefined, g: MinGroup) => p !== undefined && (g === 'front' ? p.group === 'dl' || p.group === 'lb' : p.group === g);

/** Staff draft of the active list (rule 2 order (a) to (e)); the coach accepts it or swaps players. */
export function draftGameDay(input: GameDayInput): GameDayDraft {
  const { chart, defs, plan, people } = input;
  const healthy = input.candidates.filter((id) => people.get(id)?.out !== true);
  const healthySet = new Set(healthy);
  const ok = (id: number) => healthySet.has(id);
  const units = plan.map((u) => resolveUnit(chart, defs, u));
  const coreUnits = units.filter((u) => unitSide(u.unitId) === 'st' && defs.find((d) => d.unitId === u.unitId)?.core === true);

  // Chart rank: best position on any list in the plan; special teams counts first or second on core units.
  const rank = new Map<number, number>();
  for (const u of units) for (const ids of Object.values(u.lists)) ids.forEach((id, i) => rank.set(id, Math.min(rank.get(id) ?? i, i)));
  const stCount = new Map<number, number>();
  for (const u of coreUnits) for (const ids of Object.values(u.lists)) ids.filter(ok).filter((_, i) => i <= 1).forEach((id) => stCount.set(id, (stCount.get(id) ?? 0) + 1));
  const byDepth = (a: number, b: number) => (stCount.get(b) ?? 0) - (stCount.get(a) ?? 0) || (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a - b;

  const actives: number[] = [];
  const chosen = new Set<number>();
  const linemen = (extra: number) => actives.filter((id) => people.get(id)?.group === 'ol').length + (people.get(extra)?.group === 'ol' ? 1 : 0);
  const take = (id: number) => {
    if (chosen.has(id) || !ok(id)) return;
    if (actives.length + 1 > input.limitFor(linemen(id))) return;
    chosen.add(id);
    actives.push(id);
  };

  // (a) starters and package starters in the plan.
  for (const u of units) if (unitSide(u.unitId) !== 'st') for (const id of Object.values(lineupFor(u, ok).lineup)) take(id);
  // (b) first on a core special teams unit.
  for (const u of coreUnits) for (const id of Object.values(lineupFor(u, ok).lineup)) take(id);
  // (c) the emergency card.
  for (const id of Object.values(chart.emergency)) if (id !== undefined) take(id);
  // (d) position-group minimums, best ranked first.
  const pool = [...healthy].sort(byDepth);
  for (const g of MIN_GROUPS) {
    const need = P(`gameday.min.${g}`);
    for (const id of pool) {
      if (actives.filter((a) => inGroup(people.get(a), g)).length >= need) break;
      if (inGroup(people.get(id), g)) take(id);
    }
  }
  // (e) the rest by special teams count, then chart rank.
  for (const id of pool) take(id);

  const limit = input.limitFor(linemen(Number.NaN));
  const warnings: Problem[] = [];
  for (const g of MIN_GROUPS) {
    const n = actives.filter((a) => inGroup(people.get(a), g)).length;
    const need = P(`gameday.min.${g}`);
    if (n < need) warnings.push({ leaf: 'M2.1.4', unitId: 'actives', message: `${n} ${g} dressed against a staff minimum of ${need}: one injury from playing someone out of position` });
  }
  const activeSet = new Set(actives);
  for (const u of coreUnits) {
    const thin = Object.entries(u.lists).filter(([, ids]) => ids.filter((id) => activeSet.has(id)).length <= 1).map(([j]) => j);
    if (thin.length > 0) warnings.push({ leaf: 'M2.1.4', unitId: u.unitId, message: `no named active backup at ${thin.join(', ')}` });
  }
  const inactives = input.candidates.filter((id) => !activeSet.has(id))
    .map((personId) => ({ personId, reason: (people.get(personId)?.out === true ? 'ruled_out' : 'depth') as InactiveReason }));
  return { actives, inactives, limit, warnings };
}

/**
 * Healthy-scratch streaks (rule 5): weeks in a row each player was a healthy inactive, from the
 * newest week backwards. The role-expectation event is D12's; this gives it the count.
 */
export function healthyScratchStreaks(weeks: readonly GameDayDraft[]): Map<number, number> {
  const out = new Map<number, number>();
  const ended = new Set<number>();
  for (let w = weeks.length - 1; w >= 0; w--) {
    const scratched = new Set(weeks[w]!.inactives.filter((i) => i.reason === 'depth').map((i) => i.personId));
    for (const id of new Set([...scratched, ...out.keys()])) {
      if (ended.has(id)) continue;
      if (scratched.has(id)) out.set(id, (out.get(id) ?? 0) + 1); else ended.add(id);
    }
  }
  return out;
}
