// The console setup for the seat's game when the user brought no sheet of his own: the staff drafts both sides
// from the content book (sheet bridge, Marlon's ruling 2026-11-26 07:06), special teams from the rule set.
import { resolveRuleSet } from '@gm/rules-data';
import { consoleConfigFor } from '../../sheet-bridge/index.ts';
import type { ConsoleConfig } from '../../commands/game-calling/index.ts';

/**
 * ASSUMPTION until the staff people are in the season (K2.1.4): an average coordinator on each side (z 0).
 * PLACEHOLDER until the depth chart feeds the unit on the field: fakes and two-point plays use 11 personnel.
 */
const AVERAGE_STAFF_Z = 0;
const PLACEHOLDER_SPECIAL_PERSONNEL = '11';

export function staffConsoleConfig(ruleSetId: string, gameId: string, bindings: readonly { readonly context: string; readonly keys: readonly string[] }[]): ConsoleConfig {
  return consoleConfigFor({
    rules: resolveRuleSet(ruleSetId), gameId, bindings,
    staffPreparationZ: { offense: AVERAGE_STAFF_Z, defense: AVERAGE_STAFF_Z },
    special: { personnelOf: () => PLACEHOLDER_SPECIAL_PERSONNEL },
  }).config;
}
