// The read-model spec (P1.3.2) of the roster moves screen. Player cards, the injury report and the depth
// chart come from the world tables through the observer filter (G-27): names, positions, report
// designations and depth order only. The club's transaction state (lists, elevation counts, deadlines)
// is league-office data the roster engine (G-15) holds; until it is a world table (CR-G70-2) the host
// passes it in through `RosterWeekSource`.
import type { ObservedWorld, ReadModelSpec } from '../../observer/index.ts';
import type { Schema } from '../../observer/index.ts';
import type { DepthUnit } from './coverage.ts';
import { buildRosterMovesView, type PlayerCard, type RosterMovesInput } from './model.ts';
import type { RosterMovesView } from './types.ts';

export type RosterWeek = Omit<RosterMovesInput, 'clubId' | 'cards' | 'designations' | 'depth'>;
export type RosterWeekSource = (clubId: number) => RosterWeek | null;

export const ROSTER_MOVES_MODEL = 'rosterMoves';
/** S3 task ids for the permission badge (O7.1.1). */
export const ROSTER_MOVES_TASKS: readonly string[] = ['roster.game_day_list', 'roster.transactions', 'depth_chart.set'];

interface NameLike { first?: string; last?: string; suffix?: string | null }

function displayName(n: NameLike | undefined, id: number): string {
  if (!n?.last) return `#${id}`;
  return [n.first, n.last, n.suffix].filter((x) => !!x).join(' ');
}

/** Inputs the builder reads from the observed world for one club. */
export function worldInputs(world: ObservedWorld, clubId: number): Pick<RosterMovesInput, 'cards' | 'designations' | 'depth'> {
  const ids = new Set(world.table('rosterSlots').filter((r) => r.teamId === clubId && typeof r.personId === 'number').map((r) => r.personId as number));
  const cards: PlayerCard[] = [];
  for (const p of world.table('people')) {
    if (typeof p.id !== 'number' || !ids.has(p.id)) continue;
    const playing = p.playing as { position?: string } | undefined;
    cards.push({ personId: p.id, name: displayName(p.name as NameLike | undefined, p.id), position: playing?.position ?? '' });
  }
  cards.sort((a, b) => a.personId - b.personId);
  const designations: Record<string, string | null> = {};
  for (const inj of world.table('injuries')) {
    if (typeof inj.personId !== 'number' || !ids.has(inj.personId) || inj.status !== 'active') continue;
    const d = (inj.designation as string | null | undefined) ?? null;
    if (d !== null || !(String(inj.personId) in designations)) designations[String(inj.personId)] = d;
  }
  const depth: DepthUnit[] = world.table('depthCharts')
    .filter((d) => d.teamId === clubId && typeof d.unitId === 'string' && d.roles)
    .map((d) => ({ unitId: d.unitId as string, roles: d.roles as Record<string, number[]> }));
  return { cards, designations, depth };
}

/**
 * The spec. `data` is the zod schema of RosterMovesView with a visibility class on every field; it lives
 * in @gm/schema (CR-G70-1) because app-services may not import zod itself.
 */
export function rosterMovesSpec(data: Schema, source: RosterWeekSource): ReadModelSpec<{ clubId: number }, RosterMovesView | null> {
  return {
    name: ROSTER_MOVES_MODEL,
    data,
    taskIds: ROSTER_MOVES_TASKS,
    build: (world, { clubId }) => {
      const week = source(clubId);
      if (!week) return { data: null };
      return { data: buildRosterMovesView({ ...week, clubId, ...worldInputs(world, clubId) }) };
    },
  };
}
