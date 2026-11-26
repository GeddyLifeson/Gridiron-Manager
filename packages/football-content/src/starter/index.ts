// Starter content (WP-15): formations, one base play per OffensePlayKind, one defensive call per
// CoverageFamily, each as assignments the WP-10 language compiles. Content is data (P1.1.2).
import type { Assignment } from '@gm/schema';
import { toAssignment } from './build.ts';
import { DEFENSE } from './defense.ts';
import { FORMATIONS, FORMATION_BY_ID } from './formations.ts';
import { PLAYS } from './offense.ts';
import type { DefenseDef, PlayDef } from './types.ts';

export { SOURCES, SOURCE_BY_ID, type Source } from './sources.ts';
export { FORMATIONS, FORMATION_BY_ID } from './formations.ts';
export { PLAYS } from './offense.ts';
export { DEFENSE } from './defense.ts';
export { JERSEYS, toAssignment } from './build.ts';
export { formationSvg } from './svg.ts';
export type { Basis, DefenseDef, FormationDef, FormationPlayer, PlayDef, Pt, Slot } from './types.ts';

/** The play's eleven assignments in the play frame (lateral positive to the offense's left). */
export function assignmentsOf(def: PlayDef | DefenseDef): Assignment[] { return def.slots.map(toAssignment); }

export const STARTER = { formations: FORMATIONS, plays: PLAYS, defense: DEFENSE } as const;
export function formationOf(play: PlayDef) { return FORMATION_BY_ID.get(play.formationId) ?? null; }
