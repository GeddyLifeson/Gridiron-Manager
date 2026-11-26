// The special-teams call sheet for the console (G7.7.2, O2.4.2), built from the special-teams call menu
// (football-content special-teams `menuGroups`). The menu arrives as data through this port so this module
// does not reach into football-content internals; the wiring line `specialTeamsSheet(specialTeams.menuGroups(
// rules, personnelOf), ...)` is owed with the football-content barrel. One box per kicking unit, in template
// order, two columns; the console's kick focus (kickFocus) opens the box holding the called kick or return kind.
import type { CallSheet, CallTemplate, Readiness, SheetBox, SheetEntry } from './sheet.ts';

export interface SpecialMenuItem { readonly id: string; readonly label: string; readonly call: CallTemplate; readonly fake: boolean; readonly requiredLook: string | null }
export interface SpecialMenuGroup { readonly kind: string; readonly title: string; readonly items: readonly SpecialMenuItem[] }

export interface SpecialSheetInputs {
  /** Staff readiness estimate per call id (G5.4.1). Never true knowledge. */
  readiness(callId: string): Readiness;
  /** Spoken length of the call in the team's terminology (G4.3.1), tenths. */
  spokenTenths(callId: string): number;
  /** Installed relays for the call (I2.4.1). */
  onBand(callId: string): boolean;
  signal(callId: string): boolean;
}

const COLS = 2;

export function specialTeamsSheet(id: string, groups: readonly SpecialMenuGroup[], inp: SpecialSheetInputs): CallSheet {
  const boxes: SheetBox[] = groups.map((g, i) => ({
    id: `st_${g.kind}`, title: g.title, row: Math.floor(i / COLS), col: i % COLS, rule: null,
    entries: g.items.map((it): SheetEntry => ({
      id: it.id, label: it.fake && it.requiredLook !== null ? `${it.label} (needs: ${it.requiredLook})` : it.label, call: it.call,
      spokenTenths: inp.spokenTenths(it.id), readiness: inp.readiness(it.id), tags: [], onBand: inp.onBand(it.id), signal: inp.signal(it.id), replacement: null,
    })),
  }));
  return { id, unit: 'special', boxes };
}
