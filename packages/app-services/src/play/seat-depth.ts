// The user's depth chart in the seat's played game (M2.1, I6.1). The depth chart screen (read-models
// depth-chart, PR 264) owns the chart; this file turns it into the seat team the engine plays: who takes the
// field for each of the engine's four units (offense, defense, kick, return), the role-label depth map
// (`simDepthFor`, SimTeam.depth) and the lineup the console sends with each call. All selection logic is the
// G-56 depth module's (`resolveUnit`, `lineupFor`): first available listed player per job, nobody twice.
//
// Which chart unit plays which engine unit: offense is the chart's first base offensive unit (or the package
// named by the call's personnel, `off:<code>`, when the chart has one), defense its first base defensive unit,
// kick its kickoff unit (else its first special-teams coverage or kicking unit), return a unit whose id says
// return. An engine unit with no chart unit keeps the placeholder eleven.
//
// PLACEHOLDER attributes: the people's own ratings do not reach the game yet, so every listed person plays with
// the placeholder roster's attribute values. The chart decides who plays, not how well.
import { depth } from '@gm/league';
import type { SimPlayer, SimTeam } from '@gm/schema';
import { simDepthFor, unitOrder, availability, type DepthChartInput } from '../read-models/depth-chart/index.ts';
import type { LineupFor } from '../commands/game-calling/index.ts';

/** What the session needs of the depth chart screen's input: the chart, the unit definitions, the roster, the actives. */
export type SeatDepth = Pick<DepthChartInput, 'chart' | 'defs' | 'people' | 'actives'>;

const ENGINE_UNITS = ['offense', 'defense', 'kick', 'return'] as const;
type EngineUnit = typeof ENGINE_UNITS[number];

/** The chart unit that plays each engine unit, or null when the chart has none. */
export function engineUnits(defs: readonly depth.UnitDef[]): Record<EngineUnit, string | null> {
  const order = unitOrder(defs).map((id) => depth.unitDef(defs, id));
  const base = (side: depth.UnitSide) => order.find((d) => depth.unitSide(d.unitId) === side && d.base === undefined)?.unitId ?? null;
  const st = order.filter((d) => depth.unitSide(d.unitId) === 'st');
  const kick = st.find((d) => /kickoff/.test(d.unitId) && !/return/.test(d.unitId))
    ?? st.find((d) => (d.load === 'coverage' || d.load === 'kicking') && !/return/.test(d.unitId));
  const ret = st.find((d) => /return/.test(d.unitId));
  return { offense: base('off'), defense: base('def'), kick: kick?.unitId ?? null, return: ret?.unitId ?? null };
}

export interface SeatTeam {
  readonly team: SimTeam;
  /** The console's lineup for a call: the chart unit's players, role labels as the engine's units name them. */
  readonly lineup: LineupFor;
  /** Chart unit used for each engine unit (null: placeholder eleven). */
  readonly units: Record<EngineUnit, string | null>;
}

/**
 * The seat's team for one game: `base` (the placeholder team the real game built) with the chart's players in
 * every engine unit the chart covers. Throws when a covered unit cannot field a full side, naming the empty jobs.
 */
export function seatTeamFromDepth(base: SimTeam, d: SeatDepth): SeatTeam {
  const units = engineUnits(d.defs);
  const available = availability(d);
  const perUnit = (base.depth['offense'] ?? []).length || 11;
  const pick = (unitId: string): number[] => {
    const r = depth.lineupFor(depth.resolveUnit(d.chart, d.defs, unitId), available);
    const ids = Object.values(r.lineup);
    if (ids.length < perUnit) throw new Error(`season session: depth chart unit ${unitId} fields ${ids.length} of ${perUnit} (empty: ${r.gaps.join(', ') || 'none'})`);
    return ids.slice(0, perUnit);
  };
  const template = base.players[0]!;
  const group = new Map(d.people.map((p) => [p.personId, p.group]));
  const players = new Map<number, SimPlayer>();
  const person = (id: number): SimPlayer => ({
    ...template, playerId: id, position: group.get(id) ?? template.position, jersey: id % 100,
    attributes: { ...template.attributes }, gameDay: { ...template.gameDay, playingHurt: [], knowledge: {} },
  });
  const map: Record<string, number[]> = simDepthFor(d);
  const depthOut: Record<string, number[]> = { ...map };
  for (const u of ENGINE_UNITS) {
    const unitId = units[u];
    if (unitId === null) {
      const ids = base.depth[u] ?? [];
      for (const p of base.players) if (ids.includes(p.playerId)) players.set(p.playerId, p);
      depthOut[u] = [...ids];
      continue;
    }
    depthOut[u] = pick(unitId);
  }
  for (const ids of Object.values(depthOut)) for (const id of ids) if (!players.has(id)) players.set(id, person(id));
  const team: SimTeam = { ...base, players: [...players.values()], depth: depthOut };
  const lineup: LineupFor = (unit, personnelCode) => {
    let unitId = units[unit as EngineUnit] ?? null;
    if (unit === 'offense' && personnelCode !== null && d.defs.some((x) => x.unitId === `off:${personnelCode}`)) unitId = `off:${personnelCode}`;
    const ids = unitId === null || unitId === units[unit as EngineUnit] ? depthOut[unit] ?? [] : pick(unitId);
    return ids.map((playerId) => ({ playerId, role: unit }));
  };
  return { team, lineup, units };
}
