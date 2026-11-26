// Persisted rows (P3.2.4): each roster entry maps onto world:RosterSlot. Jersey and game-day status are
// owned by other modules (D1, I1); the roster engine writes null and not_applicable.
import type { RosterSlot } from '@gm/schema';
import type { LeagueRosters } from './types.ts';

export function toRosterSlots(state: LeagueRosters): RosterSlot[] {
  const rows: RosterSlot[] = [];
  for (const c of state.clubs) {
    for (const e of c.entries) {
      rows.push({ teamId: c.clubId, personId: e.personId, list: e.list, jersey: null, gameDayStatus: 'not_applicable', since: { seasonYear: state.seasonYear, dayIndex: e.sinceDay } });
    }
  }
  return rows;
}
