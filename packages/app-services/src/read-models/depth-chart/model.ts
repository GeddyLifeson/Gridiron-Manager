// Builds the depth chart view (M2.1 to M2.5, I6.1) from the club's chart, the installed system's unit
// definitions, the roster and the medical report. All football logic is the G-56 depth module's; this
// file arranges it for the screen and produces the depth map the played game uses. Pure.
import { depth } from '@gm/league';
import type { BattleRow, DepthChartView, EmergencyRow, JobRow, ListEntry, ProblemRow, UnitRow } from './types.ts';

export interface PlayerCard { readonly personId: number; readonly name: string; readonly position: string }

export interface BattleInput { readonly battle: depth.Battle; readonly evidence: readonly depth.BattleEvidence[] }

export interface DepthChartInput {
  readonly clubId: number;
  readonly chart: depth.DepthChart;
  readonly defs: readonly depth.UnitDef[];
  readonly people: readonly depth.DepthPerson[];
  readonly cards: readonly PlayerCard[];
  readonly rules: depth.DepthRules;
  /** Game-day actives, or null before the list is set (everyone not ruled out counts as available). */
  readonly actives: readonly number[] | null;
  readonly battles: readonly BattleInput[];
  readonly today: number;
  readonly openerDay: number;
  /** The game-day list is locked (M2.1.1 rule 4: only actives may enter a list after the lock). */
  readonly locked: boolean;
}

export const EMERGENCY_NEEDS: readonly depth.EmergencyNeed[] = ['quarterback', 'long_snapper', 'holder', 'kicker', 'punter', 'sixth_lineman', 'seventh_lineman'];

const SIDE_ORDER: Record<depth.UnitSide, number> = { off: 0, def: 1, st: 2 };

/** Units in the order the game reads them: base units before their packages, offense, defense, special teams. */
export function unitOrder(defs: readonly depth.UnitDef[]): string[] {
  const depthOf = (d: depth.UnitDef): number => (d.base === undefined ? 0 : 1 + depthOf(depth.unitDef(defs, d.base)));
  return [...defs]
    .sort((a, b) => SIDE_ORDER[depth.unitSide(a.unitId)] - SIDE_ORDER[depth.unitSide(b.unitId)] || depthOf(a) - depthOf(b) || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0))
    .map((d) => d.unitId);
}

export function availability(input: Pick<DepthChartInput, 'people' | 'actives'>): (personId: number) => boolean {
  const out = new Set(input.people.filter((p) => p.out === true).map((p) => p.personId));
  const roster = new Set(input.people.map((p) => p.personId));
  const actives = input.actives === null ? null : new Set(input.actives);
  return (id) => roster.has(id) && !out.has(id) && (actives === null || actives.has(id));
}

/** The depth map for the played game (SimTeam.depth): role label to ordered available ids. */
export function simDepthFor(input: Pick<DepthChartInput, 'chart' | 'defs' | 'people' | 'actives'>): Record<string, number[]> {
  return depth.toSimDepth(input.chart, input.defs, unitOrder(input.defs), availability(input));
}

export function buildDepthChartView(input: DepthChartInput): DepthChartView {
  const { chart, defs } = input;
  const available = availability(input);
  const cards = new Map(input.cards.map((c) => [c.personId, c]));
  const people = new Map(input.people.map((p) => [p.personId, p]));
  const name = (id: number) => cards.get(id)?.name ?? `#${id}`;
  const entry = (id: number): ListEntry => ({
    personId: id, name: name(id), position: cards.get(id)?.position ?? '', out: people.get(id)?.out === true,
    active: input.actives === null ? people.has(id) : input.actives.includes(id),
  });
  const order = unitOrder(defs);

  const units: UnitRow[] = order.map((unitId) => {
    const def = depth.unitDef(defs, unitId);
    const unit = depth.resolveUnit(chart, defs, unitId);
    const { lineup, gaps } = depth.lineupFor(unit, available);
    const jobs: JobRow[] = def.jobs.map((j) => ({
      job: j.job, group: j.group, mapsTo: j.mapsTo ?? null, inherited: unit.inherited.includes(j.job),
      list: (unit.lists[j.job] ?? []).map(entry), onField: lineup[j.job] ?? null,
    }));
    const shares = [...depth.staffShares(chart, defs, unitId)].filter(([, s]) => s > 0)
      .map(([personId, share]) => ({ personId, share })).sort((a, b) => b.share - a.share || a.personId - b.personId);
    return { unitId, side: depth.unitSide(unitId), base: def.base ?? null, core: def.core === true, jobs, gaps: [...gaps], shares };
  });

  const onRoster = (id: number) => people.has(id);
  const starters = new Set<number>();
  for (const u of units) if (u.side !== 'st' && u.base === null) for (const j of u.jobs) if (j.onField !== null) starters.add(j.onField);
  const problems: ProblemRow[] = [
    ...depth.validateChart(chart, defs, order, input.rules, onRoster),
    ...depth.starterCapProblems(chart, defs, starters),
    ...depth.emergencyWarnings(chart, people, available),
  ].map((p) => ({ leaf: p.leaf, unitId: p.unitId, message: p.message }));

  const counts = depth.specialTeamsCounts(chart, defs, available);
  const actives = input.actives ?? input.people.filter((p) => p.out !== true).map((p) => p.personId);
  const emergency: EmergencyRow[] = EMERGENCY_NEEDS.map((need) => {
    const id = chart.emergency[need];
    return { need, personId: id ?? null, name: id === undefined ? null : name(id) };
  });
  const battles: BattleRow[] = input.battles.map(({ battle, evidence }) => {
    const card = depth.battleCard(battle, evidence);
    const clock = depth.battleClock(battle, input.today, input.openerDay);
    return {
      unitId: battle.unitId, job: battle.job, decideBy: battle.decideBy, late: clock.late, readinessPenalty: clock.readinessPenalty,
      competitors: card.map((r, i) => ({ personId: r.personId, name: name(r.personId), split: battle.split[i] ?? 0, reps: r.reps, raw: r.raw, weighted: r.weighted })),
    };
  });

  return {
    clubId: input.clubId, week: chart.week, locked: input.locked, onField: input.rules.onField, units, problems, emergency,
    specialTeams: [...counts].filter(([, n]) => n > 0).map(([personId, firsts]) => ({ personId, name: name(personId), firsts }))
      .sort((a, b) => b.firsts - a.firsts || a.personId - b.personId),
    lowValueBackups: depth.lowValueBackups(actives, starters, counts),
    battles, simDepth: simDepthFor(input),
  };
}
