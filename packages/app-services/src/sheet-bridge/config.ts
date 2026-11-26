// One call that gives the calling console everything for a game (G-60 `ConsoleConfig`): the offense and
// defense sheets (the user's edited game plan sheets, or the staff's draft when he has none), the special-teams
// sheet from the call menu, key hints that skip the console's own keys, and the radio cutoff from the rule set.
import type { gameplan as gp } from '@gm/football-content';
import type { RuleSet } from '@gm/schema';
import type { ConsoleConfig } from '../commands/game-calling/console.ts';
import type { ConsoleTempo } from '../commands/game-calling/cycle.ts';
import { consoleReservedKeys } from '../commands/game-calling/driver.ts';
import { radioCutoffTenths } from '../commands/game-calling/keys.ts';
import { assignKeys, type CallSheet, type SheetKeys, type Unit } from '../commands/game-calling/sheet.ts';
import { toConsoleSheet, type ConsoleSheetInputs } from './console.ts';
import type { Preferences, Suggestion } from './prefs.ts';
import { consoleSpecialSheet, type SpecialSheetOptions } from './special.ts';
import { staffDraft, type DraftUnit, type PlanEstimates, type StaffObservation } from './staff.ts';

export interface ConsoleConfigInput {
  readonly rules: Pick<RuleSet, 'keys' | 'num' | 'bool' | 'opt'>;
  readonly gameId: string;
  /** The key bindings table (settings); console keys are left out of the sheet's hints. */
  readonly bindings: readonly { readonly context: string; readonly keys: readonly string[] }[];
  /** The user's sheets. A side without one is drafted by the staff. */
  readonly sheets?: Partial<Record<DraftUnit, gp.Sheet>>;
  /** The week's game plan menus (G6), read by the staff draft. */
  readonly plan?: Partial<Record<DraftUnit, readonly gp.MenuEntry[]>>;
  /** K2.1.4 preparation of the coordinator who drafts each side, as a z value. */
  readonly staffPreparationZ: Readonly<Record<DraftUnit, number>>;
  readonly estimates?: Partial<Record<DraftUnit, PlanEstimates>>;
  readonly preferences?: Partial<Record<DraftUnit, Preferences>>;
  readonly reference?: gp.ReferenceTable | null;
  /** Rule level: picks the league table for box sizes when `reference` is not given. Default 'pro'. */
  readonly level?: gp.ReferenceLevel;
  /** The staff's own charted film per side: the boxes are ranked by their estimates from it. */
  readonly observed?: Partial<Record<DraftUnit, StaffObservation>>;
  readonly inputs?: ConsoleSheetInputs;
  readonly special: SpecialSheetOptions;
  /** Snap counts of the playbook (G4); empty: the cadence key does nothing. */
  readonly cadences?: readonly string[];
  readonly singlePress?: boolean;
  readonly defaultTempo?: ConsoleTempo;
}

export interface ConsoleConfigResult {
  readonly config: ConsoleConfig;
  /** The sheets the console was built from (drafted ones are what the game plan screen shows for editing). */
  readonly sheets: Readonly<Record<DraftUnit, gp.Sheet>>;
  readonly drafted: readonly DraftUnit[];
  readonly suggestions: Readonly<Record<DraftUnit, readonly Suggestion[]>>;
  readonly manualOnly: readonly string[];
  readonly broken: readonly string[];
  readonly skipped: readonly string[];
}

export function consoleConfigFor(inp: ConsoleConfigInput): ConsoleConfigResult {
  const drafted: DraftUnit[] = [];
  const skipped: string[] = [];
  const suggestions: Record<DraftUnit, readonly Suggestion[]> = { offense: [], defense: [] };
  const sideSheet = (unit: DraftUnit): gp.Sheet => {
    const own = inp.sheets?.[unit];
    if (own) return own;
    drafted.push(unit);
    const d = staffDraft({
      unit, gameId: inp.gameId, menu: inp.plan?.[unit] ?? [], preparationZ: inp.staffPreparationZ[unit],
      ...(inp.reference !== undefined ? { reference: inp.reference } : {}),
      ...(inp.estimates?.[unit] ? { estimates: inp.estimates[unit] } : {}),
      ...(inp.level ? { level: inp.level } : {}),
      ...(inp.observed?.[unit] ? { observed: inp.observed[unit] } : {}),
      ...(inp.preferences?.[unit] ? { preferences: inp.preferences[unit] } : {}),
    });
    suggestions[unit] = d.suggestions;
    skipped.push(...d.skipped.map((s) => `${unit}:${s}`));
    return d.sheet;
  };
  const sheets = { offense: sideSheet('offense'), defense: sideSheet('defense') };
  const off = toConsoleSheet(sheets.offense, inp.inputs);
  const def = toConsoleSheet(sheets.defense, inp.inputs);
  const consoleSheets: Record<Unit, CallSheet> = { offense: off.sheet, defense: def.sheet, special: consoleSpecialSheet(`special:${inp.gameId}`, inp.rules, inp.special) };
  const reserved = consoleReservedKeys(inp.bindings);
  const keys: Record<Unit, SheetKeys> = { offense: assignKeys(consoleSheets.offense, reserved), defense: assignKeys(consoleSheets.defense, reserved), special: assignKeys(consoleSheets.special, reserved) };
  const relay = sheets.offense.relayDefault;
  return {
    config: {
      sheets: consoleSheets, keys, cadences: inp.cadences ?? [], singlePress: inp.singlePress ?? false, guards: { challenge: true, lateTimeout: true },
      defaultTempo: inp.defaultTempo ?? 'huddle', defaultRelay: relay, radioCutoffTenths: radioCutoffTenths(inp.rules),
    },
    sheets, drafted, suggestions,
    manualOnly: [...off.manualOnly.map((b) => `offense:${b}`), ...def.manualOnly.map((b) => `defense:${b}`)],
    broken: [...off.broken.map((b) => `offense:${b}`), ...def.broken.map((b) => `defense:${b}`)],
    skipped,
  };
}
