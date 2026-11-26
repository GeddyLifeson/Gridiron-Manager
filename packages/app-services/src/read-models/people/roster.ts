// The roster table (O4.2.1): every player by list with each limit and its current count. Limits come from
// the league rules (C5) through the caller; the table shows them and enforces nothing (O4.2.1 rule).
// Counters are direct counts of the observed roster slots (acceptance).
import type { ObservedWorld } from '../../observer/index.ts';
import type { PositionSubtotal, RosterLimit, RosterRequestRow, RosterRow, RosterTableView } from './types.ts';
import { ageAt, displayName, peopleById, worldDate } from './world.ts';

export interface RosterInputs {
  /** List key to its limit (C5 config), null where the list has no limit. Lists keep this order. */
  readonly limits: Readonly<Record<string, number | null>>;
  /** The coach's roster plan by position (M1), for the subtotals. */
  readonly plan?: Readonly<Record<string, number>>;
  /** Moves the general manager holds, shown as requests (O4.2.1 edge case). */
  readonly requests?: readonly RosterRequestRow[];
}

type Row = Record<string, unknown>;

export function buildRosterTable(world: ObservedWorld, clubId: number, input: RosterInputs): RosterTableView {
  const people = peopleById(world);
  const at = worldDate(world);
  const designations = new Map<number, string>();
  for (const inj of world.table('injuries') as readonly Row[]) {
    if (typeof inj.personId === 'number' && inj.status === 'active' && typeof inj.designation === 'string') designations.set(inj.personId, inj.designation);
  }
  const rows: RosterRow[] = (world.table('rosterSlots') as readonly Row[])
    .filter((s) => s.teamId === clubId && typeof s.personId === 'number' && typeof s.list === 'string')
    .map((s) => {
      const id = s.personId as number;
      const p = people.get(id);
      const playing = (p?.playing ?? {}) as { position?: string; eligibility?: { pro?: { accruedSeasons?: number } } };
      return {
        personId: id, name: displayName(p?.name as { first?: string; last?: string } | undefined, id), position: playing.position ?? '', list: s.list as string,
        jersey: typeof s.jersey === 'number' ? s.jersey : null, age: ageAt(p?.birthDate, at), experience: playing.eligibility?.pro?.accruedSeasons ?? null,
        designation: designations.get(id) ?? null,
      };
    })
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.personId - b.personId));

  const lists = [...Object.keys(input.limits)];
  for (const r of rows) if (!lists.includes(r.list)) lists.push(r.list);
  const limits: RosterLimit[] = lists.map((list) => {
    const count = rows.filter((r) => r.list === list).length;
    const limit = input.limits[list] ?? null;
    return { list, limit, count, over: limit !== null && count > limit };
  });

  const positions = new Set<string>(rows.map((r) => r.position));
  for (const k of Object.keys(input.plan ?? {})) positions.add(k);
  const subtotals: PositionSubtotal[] = [...positions].sort().map((position) => ({
    position, count: rows.filter((r) => r.position === position).length, planned: input.plan?.[position] ?? null,
  }));

  return { clubId, lists, rows, limits, subtotals, requests: [...(input.requests ?? [])] };
}
