// G-68 screens: the gameplan read model (O3.4.1 to O3.4.3 acceptance) and its commands.
import { describe, expect, it } from 'vitest';
import { gameplan as gp } from '@gm/football-content';
import { buildGameplanView, type GameplanInput } from '../../../src/read-models/gameplan/index.ts';
import { runGameplanCommand, type CommandContext, type GameplanState } from '../../../src/commands/gameplan/index.ts';
import { COORDINATOR, HEAD_COACH, POSITION_COACH, sourceFor, state, TEAM } from './fixture.ts';

function viewOf(s: GameplanState, holder = COORDINATOR, extra: Partial<GameplanInput> = {}) {
  const src = sourceFor(s, holder)(TEAM, 'offense')!;
  return buildGameplanView({ ...src, teamId: TEAM, unit: 'offense', selectedSituation: null, paper: 'letter', keyHints: true, ...extra });
}
function ctx(s: GameplanState, holder = COORDINATOR): CommandContext {
  const src = sourceFor(s, holder)(TEAM, 'offense')!;
  return {
    holder, unit: 'offense', at: 100, userId: 'u1',
    review: (sheet) => gp.reviewSheet({ sheet, book: src.book, table: src.table, practiced: () => true, readiness: () => 0.8, overLimit: () => false, needsDoubtful: () => null, repsAvailable: 60, qbDislikes: new Set() }),
  };
}
const ok = (r: ReturnType<typeof runGameplanCommand>) => { if (!r.ok) throw new Error(r.refusal); return r; };

describe('O3.4.1 game plan builder', () => {
  it('plan totals equal the sums of the listed entries', () => {
    const v = viewOf(state()).plan;
    const unique = new Map(v.situations.flatMap((s) => s.entries).map((e) => [e.entryId, e] as const));
    expect(v.summary.total).toBe(unique.size);
    expect(v.summary.repsAssigned).toBe([...unique.values()].reduce((a, e) => a + e.repsAssigned, 0));
    expect(v.summary.runPass.run + v.summary.runPass.pass + v.summary.runPass.other).toBe(unique.size);
    expect(v.situations.map((s) => s.id)).toEqual(['first_10', 'third_short']);
  });
  it('looks carry raw counts and sample, with a rate only above the counts-only line', () => {
    const v = viewOf(state()).plan;
    expect(v.looks[0]).toMatchObject({ count: 18, n: 30, rate: 0.6 });
    expect(v.looks[1]).toMatchObject({ count: 2, n: 4, rate: null });
  });
  it('readiness is the staff estimate, or null when the staff has none', () => {
    const v = viewOf(state()).plan;
    const e = v.situations[1]!.entries.find((x) => x.entryId === 'm3')!;
    expect(e.readinessEstimate).toBeNull();
    expect(v.situations[0]!.entries[0]!.readinessEstimate).toBe(0.82);
  });
  it('the book column shows plays that fit the selected situation', () => {
    const v = viewOf(state(), COORDINATOR, { selectedSituation: 'first_10' }).plan;
    expect(v.book.length).toBe(4);
    expect(v.book.filter((b) => b.inPlan).length).toBe(3);
    expect(viewOf(state(), COORDINATOR, { selectedSituation: 'goal_line' }).plan.book).toEqual([]);
  });
  it('a delegated draft arrives as a proposal and changes nothing until accepted', () => {
    const s0 = state();
    const s = { ...s0, proposal: { id: 'p1', from: 'coordinator', menu: [...s0.menu.slice(0, 1), { ...s0.menu[2]!, id: 'm9' }] } };
    const v = viewOf(s).plan;
    expect(v.proposal).toMatchObject({ entries: 2, added: ['m9'], removed: ['m2', 'm3'] });
    expect(v.summary.total).toBe(3);
    const after = ok(runGameplanCommand(s, ctx(s), { kind: 'accept_proposal' })).state;
    expect(after.menu.map((m) => m.id)).toEqual(['m1', 'm9']);
    expect(after.proposal).toBeNull();
    expect(ok(runGameplanCommand(s, ctx(s), { kind: 'reject_proposal' })).state.menu).toBe(s.menu);
  });
  it('removing a play keeps its reps and leaves it on the sheet with a warning', () => {
    const s = state();
    const r = ok(runGameplanCommand(s, ctx(s), { kind: 'remove_from_plan', entryId: 'm1' }));
    expect(r.notes.join(' ')).toContain('frees nothing');
    expect(r.notes.join(' ')).toContain('stays on the sheet');
    const box = viewOf(r.state).sheet.boxes.find((b) => b.id === 'first_10')!;
    expect(box.entries.find((e) => e.id === 'e1')!.notInPlan).toBe(true);
  });
  it('matchup rules are edited in a table', () => {
    const s = state();
    const a = ok(runGameplanCommand(s, ctx(s), { kind: 'set_matchup', rule: { id: 'x', ours: 'Slot', theirs: 'Nickel', rule: 'double' } })).state;
    expect(a.matchups).toEqual([{ id: 'x', ours: 'Slot', theirs: 'Nickel', rule: 'double' }]);
    expect(ok(runGameplanCommand(a, ctx(a), { kind: 'remove_matchup', id: 'x' })).state.matchups).toEqual([]);
  });
  it('approval: submit, then the head coach or the coordinator of the side approves (G6.6.1); a position coach cannot', () => {
    const s = state();
    const sub = ok(runGameplanCommand(s, ctx(s), { kind: 'submit_plan' })).state;
    expect(sub.approval).toEqual({ state: 'submitted', at: 100 });
    expect(runGameplanCommand(sub, ctx(sub, POSITION_COACH), { kind: 'approve_plan' }).ok).toBe(false);
    expect(ok(runGameplanCommand(sub, ctx(sub), { kind: 'approve_plan' })).state.approval).toMatchObject({ state: 'approved' });
    expect(ok(runGameplanCommand(sub, ctx(sub, HEAD_COACH), { kind: 'approve_plan' })).state.approval).toMatchObject({ state: 'approved', by: 'u1' });
    expect(runGameplanCommand(sub, ctx(sub, HEAD_COACH), { kind: 'send_back_plan', notes: ' ' }).ok).toBe(false);
  });
  it('a job without the build right is refused with its holder named', () => {
    const s = state();
    const r = runGameplanCommand(s, ctx(s, POSITION_COACH), { kind: 'add_to_plan', entry: { ...s.menu[0]!, id: 'm7' } });
    expect(r).toMatchObject({ ok: false, rule: 'G3.4.3' });
    expect(viewOf(s, POSITION_COACH).locks.build.allowed).toBe(false);
  });
});

describe('O3.4.2 call sheet editor', () => {
  it('the coverage map classifies every cell of 4 downs by 6 distances by 5 zones', () => {
    const c = viewOf(state()).sheet.coverage;
    expect(c.length).toBe(120);
    expect(new Set(c.map((x) => `${x.down}/${x.distance}/${x.zone}`)).size).toBe(120);
  });
  it('the sheet shown is the editor layout: same boxes, places and keys as the module', () => {
    const s = state();
    const v = viewOf(s).sheet;
    const keys = gp.keyMap(s.sheet);
    for (const b of s.sheet.boxes) {
      const vb = v.boxes.find((x) => x.id === b.id)!;
      expect([vb.side, vb.col, vb.row, vb.w, vb.h]).toEqual([b.side, b.col, b.row, b.w, b.h]);
      expect(vb.key).toBe(keys.boxes.get(b.id)!.join(''));
    }
  });
  it('entries show readiness estimate, times called in that situation and key hint', () => {
    const e = viewOf(state()).sheet.boxes.find((b) => b.id === 'first_10')!.entries[0]!;
    expect(e).toMatchObject({ readinessEstimate: 0.82, timesCalled: 9, notInPlan: false, broken: false });
    expect(e.key.length).toBeGreaterThanOrEqual(2);
  });
  it('boxes cannot overlap or leave the grid', () => {
    const s = state();
    const b = s.sheet.boxes[0]!, c = s.sheet.boxes[1]!;
    const over = runGameplanCommand(s, ctx(s), { kind: 'move_box', boxId: b.id, side: c.side, col: c.col, row: c.row, w: b.w, h: b.h });
    expect(over).toMatchObject({ ok: false, rule: 'O3.4.2' });
    expect(runGameplanCommand(s, ctx(s), { kind: 'move_box', boxId: b.id, side: b.side, col: 23, row: b.row, w: 4, h: b.h }).ok).toBe(false);
  });
  it('an off-plan entry is allowed and marked', () => {
    const s = state();
    const r = ok(runGameplanCommand(s, ctx(s), { kind: 'add_entry', boxId: 'third_short', entry: { id: 'e9', call: { playId: s.ids[4]!, tags: [] } } }));
    expect(r.notes[0]).toContain('not in the plan');
    expect(viewOf(r.state).sheet.boxes.find((b) => b.id === 'third_short')!.entries.find((e) => e.id === 'e9')!.notInPlan).toBe(true);
  });
  it('a retired play shows as a broken entry and blocks the lock', () => {
    const s0 = state();
    const s = { ...s0, sheet: gp.addEntry(s0.sheet, 'first_10', { id: 'gone', call: { playId: 'no_such_play', tags: [] } }) };
    const v = viewOf(s);
    expect(v.sheet.boxes.find((b) => b.id === 'first_10')!.entries.find((e) => e.id === 'gone')!.broken).toBe(true);
    expect(v.review.canLock).toBe(false);
    expect(runGameplanCommand(s, ctx(s), { kind: 'lock_sheet' })).toMatchObject({ ok: false, rule: 'G7.9.1' });
  });
  it('locks with open items, then refuses other edits', () => {
    const s = state();
    const r = ok(runGameplanCommand(s, ctx(s), { kind: 'lock_sheet' }));
    expect(r.state.sheet.lockedAt).toBe(100);
    expect(viewOf(r.state).review.locked).toBe(true);
    expect(runGameplanCommand(r.state, ctx(r.state), { kind: 'remove_entry', boxId: 'first_10', entryId: 'e1' })).toMatchObject({ ok: false, rule: 'G7.9.1' });
  });
  it('export round-trips through the sheet file format', () => {
    const s = state();
    const r = ok(runGameplanCommand(s, ctx(s), { kind: 'export_sheet' }));
    expect(gp.parseSheet(r.file!).boxes.length).toBe(s.sheet.boxes.length);
  });
});

describe('G7.4 scripts, G7.6 wristband, G7.5.3 card', () => {
  it('script rows and variety come from the module', () => {
    const v = viewOf(state()).script;
    expect(v.opening.map((r) => r.purpose)).toEqual(['show_formation', 'early_completion']);
    expect(v.opening[1]!.watchingFor).toBe('their slot defender');
    expect(Object.values(v.variety.runPass).reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('card edits are logged and flagged; only the head coach edits the card', () => {
    const s = state();
    expect(runGameplanCommand(s, ctx(s), { kind: 'edit_fourth', distanceYd: 5, yardsToGoalYd: 40, call: 'go' }).ok).toBe(false);
    const a = ok(runGameplanCommand(s, ctx(s, HEAD_COACH), { kind: 'edit_fourth', distanceYd: 5, yardsToGoalYd: 40, call: 'go' })).state;
    const card = viewOf(a, HEAD_COACH).card!;
    expect(card.fourth.find((c) => c.distanceYd === 5)).toMatchObject({ call: 'go', edited: true });
    expect(card.edits).toHaveLength(1);
  });
  it('the kneel-down table comes from the rule values when the staff has not built one', () => {
    const k = viewOf(state()).card!.kneel;
    expect(k.map((r) => r.opponentTimeouts)).toEqual([0, 1, 2, 3]);
    expect(k[0]!.secondsKilled).toBeGreaterThan(k[3]!.secondsKilled);
  });
});

describe('O3.4.3 print', () => {
  it('scales the same grid to letter and legal, with or without key hints', () => {
    const s = state();
    const letter = viewOf(s).print, legal = viewOf(s, COORDINATOR, { paper: 'legal', keyHints: false }).print;
    expect([letter.widthIn, letter.heightIn]).toEqual([11, 8.5]);
    expect([legal.widthIn, legal.heightIn]).toEqual([14, 8.5]);
    const lb = letter.boxes.find((b) => b.id === 'first_10')!, gb = legal.boxes.find((b) => b.id === 'first_10')!;
    const e0 = viewOf(s).sheet.boxes.find((b) => b.id === 'first_10')!.entries[0]!;
    expect(lb.lines[1]).toBe(`${e0.key} ${e0.call}`);
    expect(gb.lines[1]).toBe(viewOf(s).sheet.boxes.find((b) => b.id === 'first_10')!.entries[0]!.call);
    expect(letter.boxes.every((b) => b.textPt >= 7)).toBe(true);
  });
});
