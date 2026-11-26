// Payload schemas of the game plan and call sheet commands (G-68; O3.4.1 plan edits, O3.4.2 sheet edits,
// G7.5.3 card edits, G7.9.1 lock, O3.4.3 export). The union is app-services commands/gameplan
// (GameplanCommand, discriminated by `kind`); each payload here is its member without `kind`, registered in
// COMMANDS as `gameplan.<kind>`. The nested shapes mirror @gm/football-content gameplan (gp.MenuEntry,
// gp.Box, gp.Entry, gp.SituationRule, gp.ScriptEntry, gp.MustCall, gp.PinnedNote, gp.Audible) and playbook
// (pb.Call); a test in app-services checks every kind is registered and real values from the content
// package parse. The plan and sheet are the club's own (own_team).
// Undo (P5.2.2): plan and sheet edits are planning and can be undone; submitting, approving, sending back
// and locking hand the work to another person, so they cannot. All are allowed in certified mode.
import { z } from 'zod';
import { own } from './field.ts';
import type { CommandSpec } from './commands.ts';

const s = () => own(z.string().min(1));
const text = () => own(z.string());
const strs = () => own(z.array(z.string()));
const flag = () => own(z.boolean());
const int0 = (unit: 'count' | 'index' | 'yd' = 'count') => own(z.number().int().min(0), unit);
const arr = <T extends z.ZodType>(t: T) => own(z.array(t));

// --- shared shapes ------------------------------------------------------------------------------
/** pb.Call: a play and its tags, with an optional second call (a "can" or "kill" pair). */
const Call = own(z.object({
  playId: s(), tags: strs(),
  second: own(z.object({ playId: s(), tags: strs() }).strict()).optional(),
}).strict());

const HASH = ['left', 'middle', 'right'] as const;
const TEMPO = ['huddle', 'no_huddle', 'hurry_up'] as const;
const SNAP_KIND = ['scrimmage', 'try', 'kickoff', 'kickoff_return', 'punt', 'punt_return', 'field_goal', 'field_goal_block', 'onside', 'hands_team'] as const;
const AFTER_EVENT = ['none', 'turnover', 'sack', 'lost_yardage', 'penalty', 'first_play'] as const;
const CATEGORY = ['script', 'shots', 'screens', 'play_action', 'movement', 'clock_plays', 'vs_pressure', 'vs_coverage', 'must_calls', 'halftime'] as const;
const PROTECTION = ['slide', 'chip', 'seventh_protector', 'move_pocket', 'quick', 'screen'] as const;

/** gp.Condition (G7.2.1): one condition over the game state. Ranges are inclusive and either end may be open. */
const range = <K extends string>(on: K, unit: 'yd' | 's' | 'points' | 'count') => z.object({
  on: own(z.literal(on)), min: own(z.number(), unit).optional(), max: own(z.number(), unit).optional(),
}).strict();
const inList = <K extends string, T extends z.ZodType>(on: K, item: T) => z.object({ on: own(z.literal(on)), in: own(z.array(item)) }).strict();
const Condition = own(z.discriminatedUnion('on', [
  inList('kind', own(z.enum(SNAP_KIND))),
  inList('down', own(z.number().int().min(1).max(4), 'index')),
  range('distance', 'yd'), range('yardsToGoal', 'yd'),
  range('halfSecondsLeft', 's'), range('gameSecondsLeft', 's'),
  range('scoreDiff', 'points'), range('timeouts', 'count'),
  inList('tempo', own(z.enum(TEMPO))),
  inList('personnel', own(z.string())),
  inList('formationFamily', own(z.string())),
  inList('hash', own(z.enum(HASH))),
  inList('afterEvent', own(z.enum(AFTER_EVENT))),
]));
/** gp.SituationRule: rules joined by "or", conditions inside a rule joined by "and". */
const SituationRule = own(z.object({ id: s(), label: text(), anyOf: arr(own(z.object({ all: arr(Condition) }).strict())) }).strict());

/** gp.MenuEntry (G6.2.1): a call chosen for the plan, its situations and target reps. */
const MenuEntry = own(z.object({
  id: s(), side: own(z.enum(['offense', 'defense', 'special_teams'])), call: Call,
  situationIds: strs(), targetReps: int0(),
  defense: own(z.object({
    package: s(), personnelFaced: strs(), role: own(z.enum(['set', 'stress', 'break'])),
    pressure: flag(), shell: own(z.enum(['zero_high', 'one_high', 'two_high'])),
  }).strict()).optional(),
  protection: own(z.record(z.string(), own(z.enum(PROTECTION)))).optional(),
}).strict());

/** gp.Entry (G7.3.1): one call in a box. */
const Entry = own(z.object({
  id: s(), call: Call, personnel: text().optional(), hash: own(z.enum(HASH)).optional(), note: text().optional(),
  rank: own(z.number().int().min(1), 'index').optional(), setRole: own(z.enum(['set', 'stress', 'break'])).optional(),
  requiredLook: text().optional(), weatherRisk: flag().optional(), kickYardsToGoal: own(z.number().min(0), 'yd').optional(),
}).strict());

/** gp.Box (G7.1.2): a box on the sheet grid. Layout limits (inside the grid, no overlap) are the command's check. */
const Box = own(z.object({
  id: s(), situationId: own(z.string()).nullable(), priority: own(z.number().int(), 'index'), order: int0('index'),
  title: text(), side: own(z.union([z.literal(0), z.literal(1)])),
  col: own(z.number().int(), 'index'), row: own(z.number().int(), 'index'), w: own(z.number().int(), 'count'), h: own(z.number().int(), 'count'),
  category: own(z.enum(CATEGORY)).nullable(), catalogueRef: own(z.string()).nullable(), colour: text(),
  columns: strs(), entries: arr(Entry),
}).strict());

/** gp.ScriptEntry (I2.3.4): a scripted call, its purpose and what the booth watches for. */
const ScriptEntry = own(z.object({
  id: s(), call: Call,
  purpose: own(z.enum(['show_formation', 'early_completion', 'test_matchup', 'set_up', 'best_vs_look', 'other'])),
  purposeText: text().optional(), watchingFor: text().optional(), onlyIf: arr(Condition).optional(), setsUp: s().optional(),
}).strict());

/** gp.MustCall (G7.5.1). */
const MustCall = own(z.object({
  id: s(), call: Call,
  target: own(z.discriminatedUnion('kind', [
    z.object({ kind: own(z.literal('by_half')) }).strict(),
    z.object({ kind: own(z.literal('at_least')), times: own(z.number().int().min(1), 'count') }).strict(),
  ])),
}).strict());

/** gp.PinnedNote (G7.5.2): a tendency note carries its count and sample, never the rate alone. */
const PinnedNote = own(z.object({
  id: s(), boxId: own(z.string()).nullable(), kind: own(z.enum(['tendency', 'matchup', 'pressure', 'rule'])), text: text(),
  tendency: own(z.object({ cell: s(), count: int0(), n: int0() }).strict()).optional(),
}).strict());

/** gp.Audible (G7.6.2). */
const Audible = own(z.object({ name: s(), call: Call }).strict());

/** MatchupRuleRow (G6.3.1): a hunted or avoided matchup. */
const MatchupRule = own(z.object({ id: s(), ours: s(), theirs: s(), rule: own(z.enum(['target', 'avoid', 'double'])) }).strict());

// --- payloads by command kind -------------------------------------------------------------------
const none = () => z.object({}).strict();
export const GAMEPLAN_PAYLOADS = {
  // plan (O3.4.1)
  add_to_plan: z.object({ entry: MenuEntry }).strict(),
  remove_from_plan: z.object({ entryId: s() }).strict(),
  set_matchup: z.object({ rule: MatchupRule }).strict(),
  remove_matchup: z.object({ id: s() }).strict(),
  submit_plan: none(),
  approve_plan: none(),
  send_back_plan: z.object({ notes: own(z.string().min(1)) }).strict(),
  accept_proposal: none(),
  reject_proposal: none(),
  // sheet layout and filling (O3.4.2)
  add_box: z.object({ box: Box }).strict(),
  move_box: z.object({
    boxId: s(), side: own(z.union([z.literal(0), z.literal(1)])),
    col: own(z.number().int(), 'index'), row: own(z.number().int(), 'index'), w: own(z.number().int(), 'count'), h: own(z.number().int(), 'count'),
  }).strict(),
  remove_box: z.object({ boxId: s() }).strict(),
  set_situation: z.object({ situation: SituationRule }).strict(),
  set_box_situation: z.object({ boxId: s(), situationId: own(z.string()).nullable(), priority: own(z.number().int(), 'index').optional() }).strict(),
  add_entry: z.object({ boxId: s(), entry: Entry, at: int0('index').optional() }).strict(),
  remove_entry: z.object({ boxId: s(), entryId: s() }).strict(),
  reorder_box: z.object({ boxId: s(), entryIds: strs() }).strict(),
  set_script: z.object({ which: own(z.enum(['opening', 'second_half'])), entries: arr(ScriptEntry) }).strict(),
  set_must_calls: z.object({ calls: arr(MustCall) }).strict(),
  set_notes: z.object({ notes: arr(PinnedNote) }).strict(),
  fill_band: z.object({ chosen: arr(Call) }).strict(),
  set_audibles: z.object({ list: arr(Audible), freedom: own(z.enum(['none', 'package', 'full'])).optional() }).strict(),
  apply_template: z.object({ text: own(z.string().min(1)) }).strict(),
  transfer_entry: z.object({ fromBoxId: s(), entryId: s(), toBoxId: s(), at: int0('index').optional() }).strict(),
  start_from_sheet: z.object({ text: own(z.string().min(1)) }).strict(),
  // head coach card (G7.5.3)
  edit_fourth: z.object({ distanceYd: own(z.number().min(0), 'yd'), yardsToGoalYd: own(z.number().min(0), 'yd'), call: own(z.enum(['go', 'field_goal', 'punt'])) }).strict(),
  edit_two_point: z.object({ scoreDiff: own(z.number().int(), 'points'), goForTwo: flag() }).strict(),
  refresh_card_block: z.object({ block: s() }).strict(),
  // lock and export (G7.9.1, O3.4.3)
  lock_sheet: none(),
  export_sheet: none(),
} as const satisfies Record<string, z.ZodType>;
export type GameplanCommandKind = keyof typeof GAMEPLAN_PAYLOADS;

/** S3 task of each kind (G5 to G8 game plan and call sheet; the head coach card is his own). */
const TASK: Readonly<Record<GameplanCommandKind, string>> = {
  add_to_plan: 'gameplan.plan', remove_from_plan: 'gameplan.plan', set_matchup: 'gameplan.plan', remove_matchup: 'gameplan.plan',
  submit_plan: 'gameplan.plan', accept_proposal: 'gameplan.plan', reject_proposal: 'gameplan.plan',
  approve_plan: 'gameplan.approve', send_back_plan: 'gameplan.approve',
  add_box: 'gameplan.sheet', move_box: 'gameplan.sheet', remove_box: 'gameplan.sheet', set_situation: 'gameplan.sheet', set_box_situation: 'gameplan.sheet',
  add_entry: 'gameplan.sheet', remove_entry: 'gameplan.sheet', reorder_box: 'gameplan.sheet', set_script: 'gameplan.sheet', set_must_calls: 'gameplan.sheet',
  set_notes: 'gameplan.sheet', fill_band: 'gameplan.sheet', set_audibles: 'gameplan.sheet', apply_template: 'gameplan.sheet', lock_sheet: 'gameplan.sheet',
  transfer_entry: 'gameplan.sheet', start_from_sheet: 'gameplan.sheet',
  edit_fourth: 'gameplan.card', edit_two_point: 'gameplan.card', refresh_card_block: 'gameplan.card',
  export_sheet: 'gameplan.export',
};
/** Hand-offs to another person, and the read-only export, cannot be undone (P5.2.2). */
const NOT_UNDOABLE: ReadonlySet<GameplanCommandKind> = new Set(['submit_plan', 'approve_plan', 'send_back_plan', 'lock_sheet', 'export_sheet']);

/** The COMMANDS type of a game plan command kind. */
export const gameplanCommandType = (kind: string): string => `gameplan.${kind}`;

export const GAMEPLAN_COMMAND_SPECS: readonly CommandSpec[] = (Object.keys(GAMEPLAN_PAYLOADS) as GameplanCommandKind[]).map((kind) => ({
  type: gameplanCommandType(kind), payload: GAMEPLAN_PAYLOADS[kind], task: TASK[kind], undoable: !NOT_UNDOABLE.has(kind), allowedInCertified: true,
}));
