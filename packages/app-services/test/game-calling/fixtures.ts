// Test call sheets and console setup for the G-60 tests. PLACEHOLDER content: hand-made sheets in the shape the
// sheet designer (G-68) will write, with plain labels, so the console can run a full game before G-68 lands.
import { shell } from '@gm/app-ui';
import { resolveRuleSet } from '@gm/rules-data';
import type { DefenseCall, KickCall, OffenseCall, ReturnCall } from '@gm/schema';
import {
  assignKeys, consoleReservedKeys, radioCutoffTenths, type CallSheet, type CallTemplate, type ConsoleConfig, type SheetBox, type SheetEntry, type TagDef, type Unit,
} from '../../src/commands/game-calling/index.ts';

export const BINDINGS = shell.DEFAULT_KEYMAP.bindings;
export const resolve = (chord: string, contexts: readonly string[]) => shell.actionFor(chord, contexts, BINDINGS);
export const RESERVED = consoleReservedKeys(BINDINGS);

type Off = Omit<OffenseCall, 'players'>;
const off = (kind: OffenseCall['kind'], personnelCode: string, extra: Partial<Off> = {}): Off => ({
  unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode, formationId: null, strength: null, motionId: null,
  protectionId: null, tags: [], runDirection: kind === 'run' ? 'middle' : null, shotgun: kind !== 'run', tempo: 'huddle', ...extra,
});
const def = (coverageFamily: DefenseCall['coverageFamily'], rushers: number): Omit<DefenseCall, 'players'> => ({
  unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null, coverageFamily, rushers, boxCount: 7,
});
const kick = (kickKind: KickCall['kickKind']): Omit<KickCall, 'players'> => ({ unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null });
const ret = (returnKind: ReturnCall['returnKind']): Omit<ReturnCall, 'players'> => ({ unit: 'return', returnKind, callContentId: null, contentHash: null });

export const FLIP: TagDef = { id: 'flip', kind: 'flip', label: 'Flip', group: 'flip', spokenTenths: 3, installed: true };
export const MOTIONS: TagDef[] = [
  { id: 'm_jet', kind: 'motion', label: 'Jet', group: 'motion', spokenTenths: 4, installed: true },
  { id: 'm_orbit', kind: 'motion', label: 'Orbit', group: 'motion', spokenTenths: 5, installed: false },
];

let n = 0;
const entry = (label: string, call: CallTemplate, spokenTenths = 20, tags: TagDef[] = []): SheetEntry =>
  ({ id: `e${++n}`, label, call, spokenTenths, readiness: 'ready', tags, onBand: true, signal: false, replacement: null });
const box = (id: string, row: number, col: number, rule: SheetBox['rule'], entries: SheetEntry[], baseDown?: number): SheetBox =>
  ({ id, title: id, row, col, rule, entries, ...(baseDown === undefined ? {} : { baseDown }) });

export function offenseSheet(): CallSheet {
  const runs = () => [entry('Inside zone', off('run', '11'), 18, [FLIP, ...MOTIONS]), entry('Power', off('run', '12'), 16, [FLIP]), entry('Toss', off('run', '21', { runDirection: 'right' }), 14)];
  const passes = () => [entry('Smash', off('dropback_pass', '11'), 22, [FLIP]), entry('Play-action boot', off('play_action', '12'), 26), entry('Slant flat', off('quick_pass', '11'), 18), entry('Screen', off('screen', '11'), 20)];
  return {
    id: 'test-offense', unit: 'offense', boxes: [
      box('red', 0, 0, { toGoalMax: 20 }, [...runs().slice(0, 2), ...passes().slice(0, 2)]),
      box('two_minute', 0, 1, { twoMinute: true }, passes()),
      box('third', 0, 2, { downs: [3] }, [...passes(), runs()[0]!]),
      box('first', 1, 0, null, [...runs(), ...passes()], 1),
      box('second', 1, 1, null, [...runs(), ...passes()], 2),
      box('fourth', 1, 2, null, [runs()[1]!, passes()[2]!], 4),
      box('base', 2, 0, null, [...runs(), ...passes()]),
    ],
  };
}

export function defenseSheet(): CallSheet {
  return {
    id: 'test-defense', unit: 'defense', boxes: [
      box('two_minute', 0, 0, { twoMinute: true }, [entry('Cover 2, three down', def('cover2', 3)), entry('Quarters', def('cover4', 4))]),
      box('third', 0, 1, { downs: [3] }, [entry('Zero blitz', def('cover0', 6)), entry('Cover 1 dog', def('cover1', 5)), entry('Cover 3', def('cover3', 4))]),
      box('base', 1, 0, null, [entry('Cover 3', def('cover3', 4)), entry('Cover 1', def('cover1', 4)), entry('Cover 2', def('cover2', 4)), entry('Quarters', def('cover4', 4))]),
    ],
  };
}

export function specialSheet(): CallSheet {
  return {
    id: 'test-special', unit: 'special', boxes: [
      box('kickoff', 0, 0, null, [entry('Kickoff deep', kick('kickoff')), entry('Onside', kick('onside_kick'))]),
      box('punt', 0, 1, null, [entry('Punt', kick('punt'))]),
      box('field_goal', 0, 2, null, [entry('Field goal', kick('field_goal'))]),
      box('try', 1, 0, null, [entry('Kick the try', kick('try_kick'))]),
      box('safety', 1, 1, null, [entry('Safety kick', kick('safety_kick')), entry('Fair catch kick', kick('fair_catch_kick'))]),
      box('kick_return', 2, 0, null, [entry('Return middle', ret('kick_return')), entry('Hands team', ret('hands_team'))]),
      box('punt_return', 2, 1, null, [entry('Punt return', ret('punt_return'))]),
      box('fg_block', 2, 2, null, [entry('Field goal block', ret('field_goal_block'))]),
    ],
  };
}

export function testConsoleConfig(over: Partial<ConsoleConfig> = {}, ruleSetId = 'pro_2026'): ConsoleConfig {
  const sheets: Record<Unit, CallSheet> = { offense: offenseSheet(), defense: defenseSheet(), special: specialSheet() };
  const keys = { offense: assignKeys(sheets.offense, RESERVED), defense: assignKeys(sheets.defense, RESERVED), special: assignKeys(sheets.special, RESERVED) };
  return {
    sheets, keys, cadences: ['on one', 'on two'], singlePress: false, guards: { challenge: true, lateTimeout: true },
    defaultTempo: 'huddle', defaultRelay: 'radio', radioCutoffTenths: radioCutoffTenths(resolveRuleSet(ruleSetId)), ...over,
  };
}
