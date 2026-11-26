// The console's call sheets for the playtest, built from the real content set (WP-25 plays and defensive calls)
// instead of hand-made test sheets. Nothing in the app builds a console config from the user's game plan yet:
// the G-68 sheet designer writes `gameplan.Sheet`, the G-60 console reads `ConsoleConfig`, and no code joins
// them (finding `console.no_sheet_bridge`). This builder is the playtest's stand-in for that join, so a game
// can be called by keys with real plays; it is not a game-plan decision.
import { gameCallingCommands as gc } from '@gm/app-services';
import { shell } from '@gm/app-ui';
import { full } from '@gm/football-content';
import { resolveRuleSet } from '@gm/rules-data';
import type { DefenseCall, KickCall, OffenseCall, ReturnCall } from '@gm/schema';

type Play = (typeof full.FULL_PLAYS)[number];
type Def = (typeof full.FULL_DEFENSE)[number];

export const BINDINGS = shell.DEFAULT_KEYMAP.bindings;
export const resolveKey = (chord: string, contexts: readonly string[]): string | undefined => shell.actionFor(chord, contexts, BINDINGS);

let n = 0;
function entry(label: string, call: gc.CallTemplate, spokenTenths = 20): gc.SheetEntry {
  return { id: `pt${++n}`, label, call, spokenTenths, readiness: 'ready', tags: [], onBand: true, signal: false, replacement: null };
}
function box(id: string, row: number, col: number, rule: gc.SheetBox['rule'], entries: gc.SheetEntry[], baseDown?: number): gc.SheetBox {
  return { id, title: id, row, col, rule, entries: entries.slice(0, 9), ...(baseDown === undefined ? {} : { baseDown }) };
}

function offense(p: Play): Omit<OffenseCall, 'players'> {
  return {
    unit: 'offense', playContentId: p.id, contentHash: null, kind: p.kind, personnelCode: p.personnel, formationId: p.formationId,
    strength: null, motionId: null, protectionId: null, tags: [],
    runDirection: p.kind === 'run' ? p.runDirection ?? 'middle' : p.runDirection, shotgun: p.shotgun, tempo: 'huddle',
  };
}
function defense(d: Def): Omit<DefenseCall, 'players'> {
  return {
    unit: 'defense', callContentId: d.id, contentHash: null, packageId: d.package, frontId: null, coverageId: d.id, pressureId: null,
    coverageFamily: d.coverageFamily, rushers: d.rushers, boxCount: d.boxCount,
  };
}
const kick = (k: KickCall['kickKind']): Omit<KickCall, 'players'> => ({ unit: 'kick', kickKind: k, callContentId: null, contentHash: null, direction: null });
const ret = (k: ReturnCall['returnKind']): Omit<ReturnCall, 'players'> => ({ unit: 'return', returnKind: k, callContentId: null, contentHash: null });

const CALLABLE: ReadonlySet<string> = new Set(['run', 'dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen', 'rpo', 'draw']);

export function offenseSheet(): gc.CallSheet {
  const plays = full.FULL_PLAYS.filter((p) => CALLABLE.has(p.kind));
  const e = (ps: readonly Play[]) => ps.map((p) => entry(p.name, offense(p)));
  const runs = plays.filter((p) => p.kind === 'run' || p.kind === 'draw');
  const pass = plays.filter((p) => p.kind !== 'run' && p.kind !== 'draw');
  const quick = pass.filter((p) => p.kind === 'quick_pass' || p.kind === 'screen');
  const mix = (a: readonly Play[], b: readonly Play[], k: number) => [...a.slice(0, k), ...b.slice(0, k)];
  return {
    id: 'playtest-offense', unit: 'offense', boxes: [
      box('red', 0, 0, { toGoalMax: 20 }, e(mix(runs.slice(2), quick, 4))),
      box('two_minute', 0, 1, { twoMinute: true }, e(pass.slice(0, 8))),
      box('third', 0, 2, { downs: [3] }, e([...pass.slice(3, 10), runs[0]!])),
      box('first', 1, 0, null, e(mix(runs, pass, 4)), 1),
      box('second', 1, 1, null, e(mix(runs.slice(1), pass.slice(2), 4)), 2),
      box('fourth', 1, 2, null, e([runs[0]!, quick[0]!, pass[0]!]), 4),
      box('base', 2, 0, null, e(mix(runs, pass, 4))),
    ],
  };
}

export function defenseSheet(): gc.CallSheet {
  const ds = full.FULL_DEFENSE;
  const e = (xs: readonly Def[]) => xs.map((d) => entry(d.name, defense(d)));
  const pressure = ds.filter((d) => d.rushers >= 5);
  const shell2 = ds.filter((d) => d.rushers <= 4);
  return {
    id: 'playtest-defense', unit: 'defense', boxes: [
      box('two_minute', 0, 0, { twoMinute: true }, e(shell2.filter((d) => d.coverageFamily !== 'cover0').slice(0, 4))),
      box('third', 0, 1, { downs: [3] }, e([...pressure.slice(0, 3), ...shell2.slice(0, 3)])),
      box('base', 1, 0, null, e(shell2.slice(0, 8))),
    ],
  };
}

export function specialSheet(): gc.CallSheet {
  return {
    id: 'playtest-special', unit: 'special', boxes: [
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

export function consoleConfig(ruleSetId: string): gc.ConsoleConfig {
  const reserved = gc.consoleReservedKeys(BINDINGS);
  const sheets = { offense: offenseSheet(), defense: defenseSheet(), special: specialSheet() };
  return {
    sheets,
    keys: { offense: gc.assignKeys(sheets.offense, reserved), defense: gc.assignKeys(sheets.defense, reserved), special: gc.assignKeys(sheets.special, reserved) },
    cadences: ['on one', 'on two'], singlePress: false, guards: { challenge: true, lateTimeout: true },
    defaultTempo: 'huddle', defaultRelay: 'radio', radioCutoffTenths: gc.radioCutoffTenths(resolveRuleSet(ruleSetId)),
  };
}
