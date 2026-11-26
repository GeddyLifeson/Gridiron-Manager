// The full content set (WP-25): the v1 play and coverage set. Content is data (P1.1.2). It extends the starter set:
// every starter play and call is kept and the additions follow, in the same shapes, so everything the starter
// helpers do (`assignmentsOf`, `formationSvg`) works on the full set too.
import type { Assignment } from '@gm/schema';
import { toAssignment } from '../starter/build.ts';
import type { DefenseDef, PlayDef } from '../starter/types.ts';
import { FULL_DEFENSE, ADDED_DEFENSE } from './defense.ts';
import { ALL_FORMATIONS, FORMATION_BY_ID } from './kit.ts';
import { ADDED_PLAYS, FULL_PLAYS } from './offense.ts';

export { ALL_SOURCES, FULL_SOURCES, SOURCE_BY_ID } from './sources.ts';
export { FULL_FORMATIONS } from './formations.ts';
export { PRO_BOOK, COLLEGE_BOOK, STARTER_BOOKS, STARTER_BOOK_BY_LEVEL, INTENT_WEIGHT, starterBookFor, menuFor, pickEntry, bookPlay, bookCall, type StarterBook, type BookEntry, type BookSituation } from './books.ts';
export { ADDED_PLAYS, FULL_PLAYS, ADDED_DEFENSE, FULL_DEFENSE, ALL_FORMATIONS, FORMATION_BY_ID };

export const FULL = { formations: ALL_FORMATIONS, plays: FULL_PLAYS, defense: FULL_DEFENSE, added: { plays: ADDED_PLAYS, defense: ADDED_DEFENSE } } as const;

/** The eleven assignments of a play or call in the play frame. */
export function assignmentsOf(def: PlayDef | DefenseDef): Assignment[] { return def.slots.map(toAssignment); }
export function formationOf(play: PlayDef) { return FORMATION_BY_ID.get(play.formationId) ?? null; }
