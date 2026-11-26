// @gm/app-services, game plan and call sheet commands (G-68 screens; O3.4.1 plan edits, O3.4.2 sheet edits,
// G7.5.3 card edits, G7.9.1 lock, O3.4.3 export). Each command checks the user's job first (G3.4.3 through
// the playbook access table): a control he does not hold is refused with its holder named, never applied.
// A locked sheet takes only the edits I1 allows (G7.9.1). Commands return the new state; the host stores it
// and logs the command (P5).
import { gameplan as gp, playbook as pb } from '@gm/football-content';
import type { MatchupRuleRow } from '../../read-models/gameplan/types.ts';
import { cardLock, type GameplanUnit, type Proposal } from '../../read-models/gameplan/model.ts';

export interface GameplanState {
  readonly menu: readonly gp.MenuEntry[];
  readonly approval: gp.Approval;
  readonly matchups: readonly MatchupRuleRow[];
  readonly proposal: Proposal | null;
  readonly sheet: gp.Sheet;
  readonly card: gp.HeadCoachCard | null;
}

export interface BandContext {
  readonly format: pb.BandFormat;
  readonly spokenS: (c: pb.Call) => number;
  readonly versionOf: (playId: string) => number;
  readonly week: number;
}

export interface CommandContext {
  readonly holder: pb.Holder;
  readonly unit: GameplanUnit;
  /** Game-week tick for approvals, edits and the lock. */
  readonly at: number;
  readonly userId: string;
  /** G7.9.1 review of a sheet, built by the host with its injected readiness, practice and availability. */
  readonly review: (sheet: gp.Sheet) => gp.SheetReview;
  readonly band?: BandContext;
}

export type GameplanCommand =
  // plan (O3.4.1)
  | { readonly kind: 'add_to_plan'; readonly entry: gp.MenuEntry }
  | { readonly kind: 'remove_from_plan'; readonly entryId: string }
  | { readonly kind: 'set_matchup'; readonly rule: MatchupRuleRow }
  | { readonly kind: 'remove_matchup'; readonly id: string }
  | { readonly kind: 'submit_plan' }
  | { readonly kind: 'approve_plan' }
  | { readonly kind: 'send_back_plan'; readonly notes: string }
  | { readonly kind: 'accept_proposal' }
  | { readonly kind: 'reject_proposal' }
  // sheet layout and filling (O3.4.2)
  | { readonly kind: 'add_box'; readonly box: gp.Box }
  | { readonly kind: 'move_box'; readonly boxId: string; readonly side: 0 | 1; readonly col: number; readonly row: number; readonly w: number; readonly h: number }
  | { readonly kind: 'remove_box'; readonly boxId: string }
  | { readonly kind: 'set_situation'; readonly situation: gp.SituationRule }
  | { readonly kind: 'set_box_situation'; readonly boxId: string; readonly situationId: string | null; readonly priority?: number }
  | { readonly kind: 'add_entry'; readonly boxId: string; readonly entry: gp.Entry; readonly at?: number }
  | { readonly kind: 'remove_entry'; readonly boxId: string; readonly entryId: string }
  | { readonly kind: 'reorder_box'; readonly boxId: string; readonly entryIds: readonly string[] }
  | { readonly kind: 'set_script'; readonly which: 'opening' | 'second_half'; readonly entries: readonly gp.ScriptEntry[] }
  | { readonly kind: 'set_must_calls'; readonly calls: readonly gp.MustCall[] }
  | { readonly kind: 'set_notes'; readonly notes: readonly gp.PinnedNote[] }
  | { readonly kind: 'fill_band'; readonly chosen: readonly pb.Call[] }
  | { readonly kind: 'set_audibles'; readonly list: readonly gp.Audible[]; readonly freedom?: gp.QbFreedom }
  | { readonly kind: 'apply_template'; readonly text: string }
  /** Drag an entry to another box (or another place in its own box) at position `at` (end when absent). */
  | { readonly kind: 'transfer_entry'; readonly fromBoxId: string; readonly entryId: string; readonly toBoxId: string; readonly at?: number }
  /** Start this week's sheet from a saved sheet (last week's export): layout, entries, scripts, audibles and notes come over; the wristband is refilled. */
  | { readonly kind: 'start_from_sheet'; readonly text: string }
  // head coach card (G7.5.3)
  | { readonly kind: 'edit_fourth'; readonly distanceYd: number; readonly yardsToGoalYd: number; readonly call: gp.FourthCall }
  | { readonly kind: 'edit_two_point'; readonly scoreDiff: number; readonly goForTwo: boolean }
  | { readonly kind: 'refresh_card_block'; readonly block: string }
  // lock and export (G7.9.1, O3.4.3)
  | { readonly kind: 'lock_sheet' }
  | { readonly kind: 'export_sheet' };

export type CommandResult =
  | { readonly ok: true; readonly state: GameplanState; readonly file?: string; readonly notes: readonly string[] }
  | { readonly ok: false; readonly refusal: string; readonly rule: string };

const refuse = (rule: string, refusal: string): CommandResult => ({ ok: false, rule, refusal });
const done = (state: GameplanState, notes: readonly string[] = [], file?: string): CommandResult => (file === undefined ? { ok: true, state, notes } : { ok: true, state, notes, file });

type Group = 'plan' | 'approve' | 'sheet' | 'card' | 'read';
const GROUP: Readonly<Record<GameplanCommand['kind'], Group>> = {
  add_to_plan: 'plan', remove_from_plan: 'plan', set_matchup: 'plan', remove_matchup: 'plan', submit_plan: 'plan', accept_proposal: 'plan', reject_proposal: 'plan',
  approve_plan: 'approve', send_back_plan: 'approve',
  add_box: 'sheet', move_box: 'sheet', remove_box: 'sheet', set_situation: 'sheet', set_box_situation: 'sheet', add_entry: 'sheet', remove_entry: 'sheet',
  reorder_box: 'sheet', set_script: 'sheet', set_must_calls: 'sheet', set_notes: 'sheet', fill_band: 'sheet', set_audibles: 'sheet', apply_template: 'sheet', lock_sheet: 'sheet', transfer_entry: 'sheet', start_from_sheet: 'sheet',
  edit_fourth: 'card', edit_two_point: 'card', refresh_card_block: 'card',
  export_sheet: 'read',
};
/** G3.4.3 rights per group. Plan approval follows G6.6.1 through the table (head coach, or a coordinator on his own side). */
const ACTION: Readonly<Record<Exclude<Group, 'card'>, pb.PlaybookAction>> = { plan: 'build_plan_and_sheet', sheet: 'build_plan_and_sheet', approve: 'approve', read: 'view' };

/** Boxes of a layout problem that involve the given box. */
function layoutRefusal(sheet: gp.Sheet, boxId: string): CommandResult | null {
  const p = gp.layoutProblems(sheet).find((x) => x.boxes.includes(boxId));
  return p ? refuse('O3.4.2', p.kind === 'overlap' ? `boxes cannot overlap: ${p.boxes.join(', ')}` : `${boxId} is outside the ${sheet.page.cols} by ${sheet.page.rows} grid`) : null;
}

function withSheet(s: GameplanState, sheet: gp.Sheet): GameplanState { return { ...s, sheet }; }

export function runGameplanCommand(s: GameplanState, ctx: CommandContext, cmd: GameplanCommand): CommandResult {
  const group = GROUP[cmd.kind];
  if (group === 'card') {
    const l = cardLock(ctx.holder);
    if (!l.allowed) return refuse('G7.5.3', `held by ${l.heldBy}`);
  } else {
    const access = pb.access(ctx.holder, ACTION[group], ctx.unit);
    if (!access.allowed) return refuse('G3.4.3', `held by ${access.heldBy}`);
  }
  if (group === 'sheet' && !gp.lockedEditAllowed(s.sheet, 'other')) return refuse('G7.9.1', 'the sheet is locked; only inactives and weather versions change it now');
  const sheet = s.sheet;
  switch (cmd.kind) {
    case 'add_to_plan':
      if (s.menu.some((m) => m.id === cmd.entry.id)) return refuse('G6.2.1', `${cmd.entry.id} is already in the plan`);
      return done({ ...s, menu: [...s.menu, cmd.entry] });
    case 'remove_from_plan': {
      if (!s.menu.some((m) => m.id === cmd.entryId)) return refuse('G6.2.1', `no plan entry ${cmd.entryId}`);
      const removed = s.menu.find((m) => m.id === cmd.entryId)!;
      const onSheet = sheet.boxes.some((b) => b.entries.some((e) => gp.callKey(e.call) === gp.callKey(removed.call)));
      const notes = ['reps already given stay in the readiness record; removing the play frees nothing (O3.4.1)'];
      if (onSheet) notes.push('the call stays on the sheet with a warning; you decide (O3.4.2)');
      return done({ ...s, menu: s.menu.filter((m) => m.id !== cmd.entryId) }, notes);
    }
    case 'set_matchup':
      return done({ ...s, matchups: [...s.matchups.filter((m) => m.id !== cmd.rule.id), cmd.rule] });
    case 'remove_matchup':
      return done({ ...s, matchups: s.matchups.filter((m) => m.id !== cmd.id) });
    case 'submit_plan':
      return done({ ...s, approval: gp.submit(s.approval, ctx.at) });
    case 'approve_plan':
      return done({ ...s, approval: gp.approve(s.approval, ctx.at, ctx.userId) });
    case 'send_back_plan':
      if (!cmd.notes.trim()) return refuse('G6.6.1', 'say what to change when sending the plan back');
      return done({ ...s, approval: gp.sendBack(s.approval, ctx.at, cmd.notes) });
    case 'accept_proposal':
      if (!s.proposal) return refuse('O3.4.1', 'there is no draft plan to accept');
      return done({ ...s, menu: [...s.proposal.menu], proposal: null }, [`accepted the draft from ${s.proposal.from}`]);
    case 'reject_proposal':
      if (!s.proposal) return refuse('O3.4.1', 'there is no draft plan to reject');
      return done({ ...s, proposal: null });
    case 'add_box': {
      if (sheet.boxes.some((b) => b.id === cmd.box.id)) return refuse('G7.1.2', `box ${cmd.box.id} already exists`);
      const next = { ...sheet, boxes: gp.withReadingOrder([...sheet.boxes, cmd.box]) };
      return layoutRefusal(next, cmd.box.id) ?? done(withSheet(s, next));
    }
    case 'move_box': {
      if (!sheet.boxes.some((b) => b.id === cmd.boxId)) return refuse('G7.1.2', `no box ${cmd.boxId}`);
      const next = { ...sheet, boxes: gp.withReadingOrder(sheet.boxes.map((b) => (b.id === cmd.boxId ? { ...b, side: cmd.side, col: cmd.col, row: cmd.row, w: cmd.w, h: cmd.h } : b))) };
      const bad = layoutRefusal(next, cmd.boxId);
      if (bad) return bad;
      const changed = gp.keyChanges(gp.keyMap(sheet), gp.keyMap(next));
      return done(withSheet(s, next), changed.length ? [`keys changed for ${changed.join(', ')}: moving a box costs your own practice (G7.1.2)`] : []);
    }
    case 'remove_box':
      if (!sheet.boxes.some((b) => b.id === cmd.boxId)) return refuse('G7.1.2', `no box ${cmd.boxId}`);
      return done(withSheet(s, { ...sheet, boxes: gp.withReadingOrder(sheet.boxes.filter((b) => b.id !== cmd.boxId)), notes: sheet.notes.filter((n) => n.boxId !== cmd.boxId) }));
    case 'set_situation':
      return done(withSheet(s, { ...sheet, situations: [...sheet.situations.filter((x) => x.id !== cmd.situation.id), cmd.situation] }));
    case 'set_box_situation': {
      if (!sheet.boxes.some((b) => b.id === cmd.boxId)) return refuse('G7.1.2', `no box ${cmd.boxId}`);
      if (cmd.situationId !== null && !sheet.situations.some((x) => x.id === cmd.situationId)) return refuse('G7.2.1', `no situation rule ${cmd.situationId}`);
      return done(withSheet(s, { ...sheet, boxes: sheet.boxes.map((b) => (b.id === cmd.boxId ? { ...b, situationId: cmd.situationId, priority: cmd.priority ?? b.priority } : b)) }));
    }
    case 'add_entry': {
      const box = sheet.boxes.find((b) => b.id === cmd.boxId);
      if (!box) return refuse('G7.3.1', `no box ${cmd.boxId}`);
      if (box.entries.some((e) => e.id === cmd.entry.id)) return refuse('G7.3.1', `entry ${cmd.entry.id} already in ${box.title}`);
      const planned = s.menu.some((m) => gp.callKey(m.call) === gp.callKey(cmd.entry.call) || m.call.playId === cmd.entry.call.playId);
      return done(withSheet(s, gp.addEntry(sheet, cmd.boxId, cmd.entry, cmd.at)), planned ? [] : ['not in the plan: marked not practised this week (G7.3.1)']);
    }
    case 'remove_entry':
      return done(withSheet(s, gp.removeEntry(sheet, cmd.boxId, cmd.entryId)));
    case 'reorder_box':
      return done(withSheet(s, gp.reorderBox(sheet, cmd.boxId, cmd.entryIds)));
    case 'set_script':
      return done(withSheet(s, cmd.which === 'opening' ? { ...sheet, script: [...cmd.entries] } : { ...sheet, secondHalfScript: [...cmd.entries] }));
    case 'set_must_calls':
      return done(withSheet(s, { ...sheet, mustCalls: [...cmd.calls] }));
    case 'set_notes':
      return done(withSheet(s, { ...sheet, notes: [...cmd.notes] }));
    case 'fill_band': {
      if (!ctx.band) return refuse('G7.6.1', 'no wristband format is set for this team');
      const cells = gp.fillBand(sheet, ctx.band.format, cmd.chosen, ctx.band.spokenS, ctx.band.versionOf, ctx.band.week);
      return done(withSheet(s, { ...sheet, wristband: cells }), gp.bandProblems(cells));
    }
    case 'set_audibles':
      return done(withSheet(s, { ...sheet, audibleList: [...cmd.list], qbFreedomDefault: cmd.freedom ?? sheet.qbFreedomDefault }));
    case 'apply_template': {
      let t: gp.Sheet;
      try { t = gp.parseSheet(cmd.text, true); } catch (e) { return refuse('G7.1.1', (e as Error).message); }
      if (t.unit !== sheet.unit) return refuse('G7.1.1', `the template is for ${t.unit}, the sheet is for ${sheet.unit}`);
      return done(withSheet(s, { ...sheet, page: t.page, situations: t.situations, boxes: t.boxes }), ['layout and situations replaced; entries start empty']);
    }
    case 'transfer_entry': {
      const from = sheet.boxes.find((b) => b.id === cmd.fromBoxId);
      const to = sheet.boxes.find((b) => b.id === cmd.toBoxId);
      if (!from) return refuse('G7.3.1', `no box ${cmd.fromBoxId}`);
      if (!to) return refuse('G7.3.1', `no box ${cmd.toBoxId}`);
      const entry = from.entries.find((e) => e.id === cmd.entryId);
      if (!entry) return refuse('G7.3.1', `no entry ${cmd.entryId} in ${from.title}`);
      if (from.id !== to.id && to.entries.some((e) => e.id === entry.id)) return refuse('G7.3.1', `entry ${entry.id} already in ${to.title}`);
      return done(withSheet(s, gp.addEntry(gp.removeEntry(sheet, from.id, entry.id), to.id, entry, cmd.at)));
    }
    case 'start_from_sheet': {
      let t: gp.Sheet;
      try { t = gp.parseSheet(cmd.text, false); } catch (e) { return refuse('G7.1.1', (e as Error).message); }
      if (t.unit !== sheet.unit) return refuse('G7.1.1', `that sheet is for ${t.unit}, this sheet is for ${sheet.unit}`);
      const next: gp.Sheet = { ...t, gameId: sheet.gameId, wristband: [], lockedAt: null, version: 1 };
      const offPlan = next.boxes.flatMap((b) => b.entries).filter((e) => !s.menu.some((m) => m.call.playId === e.call.playId)).length;
      const notes = ['layout, entries, scripts, audibles and notes copied; refill the wristband'];
      if (offPlan) notes.push(`${offPlan} entr${offPlan === 1 ? 'y is' : 'ies are'} not in this week's plan: not practised this week (G7.3.1)`);
      return done(withSheet(s, next), notes);
    }
    case 'edit_fourth':
      if (!s.card) return refuse('G7.5.3', 'there is no head coach card for this game');
      return done({ ...s, card: gp.editFourth(s.card, cmd.distanceYd, cmd.yardsToGoalYd, cmd.call, ctx.at) });
    case 'edit_two_point':
      if (!s.card) return refuse('G7.5.3', 'there is no head coach card for this game');
      return done({ ...s, card: gp.editTwoPoint(s.card, cmd.scoreDiff, cmd.goForTwo, ctx.at) });
    case 'refresh_card_block':
      if (!s.card) return refuse('G7.5.3', 'there is no head coach card for this game');
      return done({ ...s, card: gp.refreshed(s.card, cmd.block) });
    case 'lock_sheet': {
      const review = ctx.review(sheet);
      const blocking = review.items.filter((x) => x.blocks);
      if (blocking.length) return refuse('G7.9.1', `cannot lock: ${blocking.map((b) => b.subject).join(', ')}`);
      const open = review.items.length;
      return done(withSheet(s, gp.lockSheet(sheet, review, ctx.at)), open ? [`locked with ${open} open review item(s)`] : []);
    }
    case 'export_sheet':
      return done(s, [], gp.serializeSheet(sheet));
  }
}
