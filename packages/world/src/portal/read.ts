// The portal's public face for screens (T6.1.1 "a live list shows entries", O7.5.1 portal tab). Entries are
// public once announced, so this reads no truth: who entered, from where, on what day, and the window. The
// shape is the recruiting board read model's `PortalInput` (app-services read-models/recruiting), so a host
// passes it straight through as `portal`.
import type { LiveWorld } from '../loop/types.ts';
import { dayOfWorld } from '../recruiting/calendar.ts';
import { portalOf } from './binding.ts';

export interface PortalBoardInput {
  readonly window: { readonly open: number; readonly close: number } | null;
  readonly entries: readonly { readonly personId: number; readonly position: string; readonly fromTeamId: number; readonly enteredDay: number }[];
}

/** One public portal row with where he went, for history pages and the team's own retention view. */
export interface PortalPublicRow {
  readonly personId: number; readonly position: string; readonly fromTeamId: number; readonly enteredDay: number;
  readonly via: string; readonly toTeamId: number | null; readonly signedDay: number | null; readonly unplaced: boolean;
}

/**
 * The recruiting board's portal input on the world date: this season's window and every entry announced so
 * far, newest first. Null before the world has a portal cycle (the tab then says it has no data).
 */
export function portalInput(world: LiveWorld, day: number = dayOfWorld(world.date)): PortalBoardInput | null {
  const c = portalOf(world).cycle;
  if (!c) return null;
  return {
    window: { open: c.window.open, close: c.window.close },
    entries: c.entries.filter((e) => e.status !== 'pending' && e.enteredDay <= day)
      .map((e) => ({ personId: e.personId, position: e.position, fromTeamId: e.fromTeamId, enteredDay: e.enteredDay }))
      .sort((a, b) => b.enteredDay - a.enteredDay || a.personId - b.personId),
  };
}

/** Every announced entry of the open cycle with its outcome so far (signed where, or unplaced). Public facts only. */
export function portalRows(world: LiveWorld, day: number = dayOfWorld(world.date)): PortalPublicRow[] {
  const c = portalOf(world).cycle;
  if (!c) return [];
  return c.entries.filter((e) => e.status !== 'pending' && e.enteredDay <= day).map((e) => ({
    personId: e.personId, position: e.position, fromTeamId: e.fromTeamId, enteredDay: e.enteredDay, via: e.via,
    toTeamId: e.signedDay !== null && e.signedDay <= day ? e.toTeamId : null, signedDay: e.signedDay !== null && e.signedDay <= day ? e.signedDay : null,
    unplaced: e.status === 'unplaced',
  })).sort((a, b) => a.personId - b.personId);
}
