// The special-teams sheet for the console from the special-teams call menu (football-content special-teams
// `menuGroups`, G7.7.2): the wiring line `specialTeams.menuGroups` -> `specialTeamsSheet` owed by special-sheet.ts.
import { specialTeams } from '@gm/football-content';
import type { RuleSet } from '@gm/schema';
import type { CallSheet, Readiness } from '../commands/game-calling/sheet.ts';
import { specialTeamsSheet } from '../commands/game-calling/special-sheet.ts';

export interface SpecialSheetOptions {
  /** Personnel code of a fake or two-point play, from the depth chart for the unit on the field (G1.1.1). */
  readonly personnelOf: (def: specialTeams.SpecialCallDef) => string;
  readonly readiness?: (callId: string) => Readiness;
  readonly spokenTenths?: (callId: string) => number;
  readonly onBand?: (callId: string) => boolean;
  readonly signal?: (callId: string) => boolean;
}

export function consoleSpecialSheet(id: string, rules: Pick<RuleSet, 'keys' | 'bool' | 'opt'>, o: SpecialSheetOptions): CallSheet {
  return specialTeamsSheet(id, specialTeams.menuGroups(rules, o.personnelOf), {
    readiness: o.readiness ?? (() => 'ready'), spokenTenths: o.spokenTenths ?? (() => 0), onBand: o.onBand ?? (() => false), signal: o.signal ?? (() => false),
  });
}
