// Play designer session and read model (G-90 screen; O3.1.1 to O3.1.4, O3.7.1, O3.7.2): every command
// is one undo step, keyboard drawing builds a play without a pointer, publishing follows O3.1.3, the
// bench refuses in game and charges hours, and a reopened play renders identically.
import { describe, it, expect } from 'vitest';
import { openSession, send, playOf, designerView, PARAMS, type DesignerCommand, type DesignerState, type DesignerEffect, type PlayLike } from '../../src/play-designer/index.ts';
import * as editor from '../../src/editor/index.ts';
import { play, ports } from './fixtures.ts';

type Cmd = DesignerCommand<Parameters<ReturnType<typeof ports>['reduce']>[1]>;
function run(s: DesignerState<PlayLike>, cmds: Cmd[], P = ports()): { s: DesignerState<PlayLike>; effects: DesignerEffect<PlayLike>[] } {
  const effects: DesignerEffect<PlayLike>[] = [];
  for (const c of cmds) { const r = send(s, c, P); s = r.state; effects.push(...r.effects); }
  return { s, effects };
}
const slot = (s: DesignerState<PlayLike>, role: string) => playOf(s).slots.find((x) => x.role === role)!;

describe('play designer session', () => {
  it('drags snap to football positions and each drag is one undo step with an autosave', () => {
    const { s, effects } = run(openSession(play()), [{ type: 'drag', role: 'Z', raw: [-0.2, 12.4], free: false }]);
    expect(slot(s, 'Z').at).toEqual([0, 12]);
    expect(slot(s, 'Z').onLine).toBe(true);
    expect(s.selected).toBe('Z');
    expect(s.draft.past).toHaveLength(1);
    expect(effects).toEqual([{ kind: 'autosave', draftId: 'p1', json: s.draft.json }]);
    const back = run(s, [{ type: 'undo' }]).s;
    expect(back.draft.json).toBe(openSession(play()).draft.json);
  });

  it('Alt holds off snapping (O3.1.2)', () => {
    const { s } = run(openSession(play()), [{ type: 'drag', role: 'Z', raw: [-1.3, 12.4], free: true }]);
    expect(slot(s, 'Z').at).toEqual([-1.3, 12.4]);
  });

  it('builds a route with the keyboard alone and names it (O3.1.2 acceptance 2)', () => {
    const { s } = run(openSession(play()), [
      { type: 'select_letter', letter: 'x' },
      { type: 'nudge', dDepth: 0, dLateral: 1, free: false },
      { type: 'draw_begin', target: 'path' },
      { type: 'draw_leg_length', yd: 12 },
      { type: 'draw_leg', dir: 0, kind: 'cut' },
      { type: 'draw_end', behavior: null, free: false },
    ]);
    const x = slot(s, 'X');
    expect(x.at).toEqual([0, -17]);
    expect(x.assignment.path.map((q) => q.at)).toEqual([[12, -17]]);
    expect(x.assignment.behavior).toBe('route');
    expect(s.draft.past).toHaveLength(2);
    const v = designerView(s, ports());
    expect(v.properties?.routeName).toBe('go');
    expect(v.canvas.markers.find((m) => m.role === 'X')?.routeName).toBe('go');
  });

  it('Tab steps through players in slot order and wraps', () => {
    let s = openSession(play());
    s = run(s, [{ type: 'select_next', step: -1 }]).s;
    expect(s.selected).toBe('F');
    s = run(s, [{ type: 'select_next', step: 1 }]).s;
    expect(s.selected).toBe('LT');
  });

  it('toggling a player off the line and a motion are single steps', () => {
    const { s } = run(openSession(play()), [
      { type: 'select', role: 'Y' }, { type: 'toggle_line' },
      { type: 'select', role: 'H' }, { type: 'draw_begin', target: 'motion' }, { type: 'draw_point', raw: [-1, 3.2], kind: 'through' }, { type: 'draw_end', behavior: null, free: false },
    ]);
    expect(slot(s, 'Y').onLine).toBe(false);
    expect(slot(s, 'Y').at[0]).toBe(-1);
    expect(playOf(s).presnap).toHaveLength(1);
    expect(playOf(s).presnap[0]).toMatchObject({ kind: 'motion', role: 'H', stops: true });
    expect(designerView(s, ports()).canvas.motions).toEqual([{ index: 0, role: 'H', path: [[-1, 3]] }]);
    expect(s.draft.past).toHaveLength(2);
  });

  it('mirror flips every mark across the ball and back exactly', () => {
    const s0 = run(openSession(play()), [{ type: 'select', role: 'Z' }, { type: 'draw_begin', target: 'path' }, { type: 'draw_point', raw: [10, 15], kind: 'cut' }, { type: 'draw_point', raw: [10, 20], kind: 'cut' }, { type: 'draw_end', behavior: null, free: false }]).s;
    const once = run(s0, [{ type: 'mirror' }]).s;
    expect(slot(once, 'Z').at).toEqual([-1, -15]);
    expect(slot(once, 'Z').assignment.path.map((q) => q.at)).toEqual([[10, -15], [10, -20]]);
    expect(run(once, [{ type: 'mirror' }]).s.draft.json).toBe(s0.draft.json);
  });

  it('choosing a part applies its definition', () => {
    const { s } = run(openSession(play()), [{ type: 'choose_part', kind: 'formation', id: 'flip_x' }]);
    expect(slot(s, 'X').letter).toBe('W');
    expect(run(s, [{ type: 'select_letter', letter: 'w' }]).s.selected).toBe('X');
  });

  it('only unsound messages are dismissed, and only with a typed reason (O3.1.3)', () => {
    let s = openSession(play());
    s = run(s, [{ type: 'dismiss', code: 'no_assignment', role: 'X', reason: '  ' }]).s;
    expect(s.error).toBe('designer.dismiss.needs_reason');
    s = run(s, [{ type: 'dismiss', code: 'no_assignment', role: 'X', reason: 'decoy, stays home' }]).s;
    expect(s.error).toBeNull();
    const v = designerView(s, ports());
    expect(v.messages.find((m) => m.code === 'no_assignment' && m.roles[0] === 'X')?.dismissed).toBe(true);
    expect(v.notes).toContain('decoy, stays home');
    // An illegal message is not dismissed.
    s = run(s, [{ type: 'select', role: 'Y' }, { type: 'toggle_line' }]).s;
    s = run(s, [{ type: 'dismiss', code: 'fewer_than_seven_on_line', role: 'Y', reason: 'trust me' }]).s;
    expect(s.error).toBe('designer.dismiss.not_unsound');
  });

  it('publishes a legal play, asks once for an illegal one, refuses one the engine cannot run (O3.1.3, O3.7.1)', () => {
    let { s, effects } = run(openSession(play()), [{ type: 'publish', confirmIllegal: false }]);
    expect(s.lastPublish).toEqual({ version: 1, illegalAsDrawn: false, newTeaching: [] });
    expect(effects.find((e) => e.kind === 'published')).toMatchObject({ version: 1, label: 'Week 3, Tuesday' });
    expect(editor.isDirty(s.draft)).toBe(false);

    s = run(s, [{ type: 'select', role: 'Y' }, { type: 'toggle_line' }, { type: 'publish', confirmIllegal: false }]).s;
    expect(s.confirm?.map((m) => m.code)).toEqual(['fewer_than_seven_on_line']);
    expect(s.draft.versions).toHaveLength(1);
    ({ s, effects } = run(s, [{ type: 'publish', confirmIllegal: true }]));
    expect(s.lastPublish).toMatchObject({ version: 2, illegalAsDrawn: true });
    expect(playOf(s).ruleFailures).toEqual([{ ruleId: 'formation.min_on_line', role: null }]);

    const dup = run(s, [{ type: 'edit', edit: { type: 'dup_role' } }, { type: 'publish', confirmIllegal: true }]).s;
    expect(dup.refused?.map((m) => m.code)).toEqual(['duplicate_slot']);
    expect(dup.draft.versions).toHaveLength(2);

    const restored = run(dup, [{ type: 'restore_version', n: 1 }]).s;
    expect(slot(restored, 'Y').onLine).toBe(true);
    expect(restored.draft.base).toBe(1);
  });

  it('a play saved and reopened renders identically (O3.1.1 acceptance 2)', () => {
    const s = run(openSession(play()), [{ type: 'drag', role: 'Z', raw: [-3, 9], free: false }, { type: 'select', role: 'Z' }, { type: 'draw_begin', target: 'path' }, { type: 'draw_leg', dir: 1, kind: 'cut' }, { type: 'draw_end', behavior: null, free: false }]).s;
    const reopened = openSession(editor.valueOf(s.draft) as PlayLike, s.draft.versions);
    const strip = (v: ReturnType<typeof designerView>) => ({ ...v, editor: null });
    expect(strip(designerView({ ...reopened, selected: 'Z' }, ports()))).toEqual(strip(designerView(s, ports())));
  });

  it('the Against look draws grey markers and never edits the play', () => {
    const s = run(openSession(play()), [{ type: 'tab', tab: 'against' }, { type: 'look', id: 'cover2' }]).s;
    const v = designerView(s, ports());
    expect(v.canvas.look?.markers).toHaveLength(2);
    expect(s.draft.past).toHaveLength(0);
    expect(run(s, [{ type: 'look', id: 'nope' }]).s.look).toBeNull();
  });

  it('the bench runs, charges its hours, and refuses during a game (O3.1.4, O3.7.2)', () => {
    let { s, effects } = run(openSession(play()), [{ type: 'bench_form', patch: { defenseIds: ['cover2'], runs: 200 } }, { type: 'bench_run' }]);
    expect(s.bench.report?.runsDone).toBe(200);
    expect(effects).toEqual([{ kind: 'charge_hours', actionClass: 'bench_session', hours: 0.5 }]);
    ({ s, effects } = run(openSession(play()), [{ type: 'bench_run' }], ports({ inGame: true })));
    expect(s.bench.report?.refusedBecause).toBe('in_game');
    expect(effects).toEqual([]);
    expect(designerView(s, ports({ inGame: true })).bench.inGame).toBe(true);
    expect(designerView(openSession(play()), ports({ bench: false })).bench.available).toBe(false);
  });

  it('hands the task to a named assistant only', () => {
    expect(run(openSession(play()), [{ type: 'delegate', assistantId: 'a1' }]).effects).toEqual([{ kind: 'delegate', assistantId: 'a1', playId: 'p1' }]);
    expect(run(openSession(play()), [{ type: 'delegate', assistantId: 'zz' }]).effects).toEqual([]);
  });

  it('the view lists parts in spoken order and carries the O3.1 starting values', () => {
    const v = designerView(openSession(play()), ports());
    expect(v.parts.map((p) => p.kind)).toEqual(['personnel', 'formation', 'motion', 'protection', 'concept', 'tags', 'qb']);
    expect(v.parts[1]!.value).toBe('Doubles right');
    expect([v.canvas.behindYd, v.canvas.pastYd, v.debounceMs, v.hours.warnAboveH]).toEqual([10, 25, 150, 0.5]);
    expect(v.messages[0]!.level).toBe('unsound');
    expect(PARAMS.module).toBe('app-services.play-designer');
  });

  it('200 edits stay undoable (O3.7.1)', () => {
    let s = openSession(play());
    for (let i = 1; i <= 210; i++) s = run(s, [{ type: 'drag', role: 'Z', raw: [-1, 10 + (i % 7)], free: false }]).s;
    expect(s.draft.past.length).toBe(200);
  });
});
