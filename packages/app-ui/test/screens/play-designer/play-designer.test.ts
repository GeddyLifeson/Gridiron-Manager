// Play designer screen (G-90; O3.1): every tab renders from the read model, validator messages carry
// level, citation and roles, publish confirmation and refusal show, keyboard-only drawing maps keys to
// commands, and the route entry fills the registered football.play_designer screen in the shell.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import {
  PlayDesignerScreen, playDesignerRoute, keyCommands, designerTextIds, pt, messageText, PLAY_DESIGNER_SCREEN_ID, DESIGNER_TABS,
  type DesignerViewData, type DesignerTab, type DesignerCommand, type MessageView,
} from '../../../src/screens/play-designer/index.ts';

const msg = (level: MessageView['level'], code: string, roles: string[], dismissed = false): MessageView => ({
  level, code, roles, citation: level === 'illegal' ? 'formation.min_on_line' : 'G1.5.3', leaf: 'B4.6.1', foul: level === 'illegal' ? 'illegal_formation' : null,
  messageKey: `designer.${code}`, dismissed, detail: '', step: null,
});

const view: DesignerViewData = {
  playId: 'p1', tab: 'draw', hash: 'middle',
  canvas: {
    behindYd: 10, pastYd: 25, lines: { sidelines: [-26.67, 26.67], hashes: [-3.08, 3.08], numbers: [-15.6, 15.6] },
    markers: [
      { role: 'C', letter: 'C', at: [0, 0], onLine: true, selected: false, highlighted: false, lineman: true, path: [], behavior: 'pass_block', routeName: null },
      { role: 'H', letter: 'H', at: [-1, -10], onLine: false, selected: false, highlighted: false, lineman: false, path: [], behavior: '', routeName: null },
      { role: 'X', letter: 'X', at: [0, -17], onLine: true, selected: true, highlighted: true, lineman: false, path: [[12, -17]], behavior: 'route', routeName: 'go' },
    ],
    drawing: null, look: { id: 'c2', markers: [{ label: 'S', at: [12, 10] }] }, motions: [{ index: 0, role: 'H', path: [[-1, 3]] }],
  },
  parts: [
    { kind: 'personnel', value: '11', options: [] }, { kind: 'formation', value: 'Doubles right', options: [{ id: 'trips', label: 'Trips right' }] },
    { kind: 'motion', value: '', options: [] }, { kind: 'protection', value: '', options: [] }, { kind: 'concept', value: '', options: [] },
    { kind: 'tags', value: '', options: [] }, { kind: 'qb', value: 'dropback, progression', options: [] },
  ],
  properties: {
    role: 'X', letter: 'X', at: [0, -17], onLine: true, readout: 'plus 2 outside the numbers, on the line', stance: 'two_point',
    reportsEligible: false, extraTackle: false, behavior: 'route', behaviors: ['route', 'pass_block'], routeName: 'go', pathPoints: 1,
    rules: ['vs press: fade release'], keys: ['corner'], concept: 'verticals', coachingPoint: 'stack him',
  },
  messages: [msg('illegal', 'fewer_than_seven_on_line', ['Y']), msg('unsound', 'no_hot', ['Q']), msg('note', 'call_length', [], false), msg('unsound', 'same_spot', ['X', 'Z'], true)],
  counts: { refused: 0, illegal: 1, unsound: 1, note: 1 },
  debounceMs: 150, missingPositions: [], looks: [{ id: 'c2', label: 'Two high' }],
  rules: {
    kind: 'dropback_pass', personnel: '11', shotgun: true, runDirection: null, protection: '60',
    qb: { action: 'dropback', dropSteps: 5, readType: 'progression', progression: [{ role: 'X', eyesAtS: 1.2 }], throwAway: 'sideline' },
    intent: { role: 'base', beats: [], checkOutOf: [] }, status: 'draft',
    presnap: [{ index: 0, kind: 'motion', roles: ['H'] }], ruleFailures: [],
  },
  notes: 'base pass', dismissed: [{ code: 'same_spot', role: 'X', reason: 'rub on purpose' }],
  editor: { canUndo: true, canRedo: false, dirty: true, versions: [{ n: 1, label: 'Week 3, Tuesday' }], base: 1 },
  publish: { confirm: null, refused: null, last: null },
  hours: { usedThisWeekH: 2, leftThisWeekH: 10, warnAboveH: 0.5, owner: { kind: 'coach' }, assistants: [{ id: 'a1', name: 'Offensive coordinator' }] },
  bench: { available: true, inGame: false, defenses: [{ id: 'c2', label: 'Cover 2' }], form: { defenseIds: ['c2'], down: 1, distanceYd: 10, yardsToGoal: 75, hash: 'middle', runs: 200, seed: 1, knowledge: 'fully_installed' }, report: null },
  error: null,
};

const html = (tab: DesignerTab, v: DesignerViewData = view) => renderToStaticMarkup(createElement(PlayDesignerScreen, { view: { ...v, tab }, send: () => {} }));

describe('play designer screen', () => {
  it('lays out canvas, parts, properties, validator and the five tabs (O3.1.1)', () => {
    const out = html('draw');
    for (const t of DESIGNER_TABS) expect(out).toContain(`data-tab="${t}"`);
    for (const part of ['hours', 'parts', 'canvas', 'properties', 'validator', 'hash']) expect(out).toContain(`data-part="${part}"`);
    expect(out).toContain('data-marker="X"');
    expect(out).toContain('data-yard="0"');
    expect(out).toContain('data-hash="left"');
    expect(out).toContain('plus 2 outside the numbers, on the line');
    expect(out).toContain('Route shape: go');
    expect(out).toContain('data-motion="H"');
    expect(out).toContain('data-look-marker');
    expect(out.indexOf('data-part-kind="personnel"')).toBeLessThan(out.indexOf('data-part-kind="qb"'));
    expect(out).toContain('Unpublished changes');
  });

  it('validator shows levels in order with citations, a foul, a reason box only for unsound, and dismissed ones (O3.1.3)', () => {
    const out = html('draw');
    expect(out).toContain('data-level="illegal"');
    expect(out).toContain('Rule formation.min_on_line (B4.6.1)');
    expect(out).toContain('Officials may call: illegal_formation');
    expect(out).toContain('1 illegal, 1 unsound, 1 notes');
    expect((out.match(/Reason \(kept in the play&#x27;s notes\)/g) ?? []).length).toBe(1);
    expect(out).toContain('data-dismissed="true"');
    expect(out).toContain('Show again');
    expect(messageText(msg('note', 'call_length', []))).toBe('call length');
  });

  it('publish confirmation, refusal and result (O3.1.3)', () => {
    expect(html('draw', { ...view, publish: { confirm: [msg('illegal', 'fewer_than_seven_on_line', ['Y'])], refused: null, last: null } })).toContain('Publish illegal as drawn');
    expect(html('draw', { ...view, publish: { confirm: null, refused: [msg('refused', 'duplicate_slot', [])], last: null } })).toContain('The engine cannot run this play: duplicate slot.');
    expect(html('draw', { ...view, publish: { confirm: null, refused: null, last: { version: 2, illegalAsDrawn: true, newTeaching: ['X'] } } })).toContain('Published as version 2, marked illegal as drawn. New teaching for: X.');
  });

  it('rules, against, notes and missing positions', () => {
    const rules = html('rules');
    expect(rules).toContain('Quarterback: dropback, 5-step, progression');
    expect(rules).toContain('1. motion: H');
    expect(html('against')).toContain('They do not predict what the defense will do.');
    const notes = html('notes');
    expect(notes).toContain('rub on purpose');
    expect(html('draw', { ...view, missingPositions: ['TE'] })).toContain('Missing: TE.');
  });

  it('bench: form, report with sample size and intervals, partial, refused, in game (O3.1.4)', () => {
    expect(html('bench')).toContain('data-action="bench-run"');
    const report = {
      refusedBecause: null, runsRequested: 200, runsDone: 120, partial: true, seed: 7, hourCharge: { actionClass: 'bench_session', hours: 0.5 },
      overall: {
        opponent: 'all', runs: 120, yards: { n: 120, mean: 6.2, low: 5.1, high: 7.3 }, histogram: { minYd: -10, counts: [1, 4, 2] },
        completion: { count: 80, of: 110, rate: 0.727, low: 0.64, high: 0.8 }, pressure: { count: 0, of: 0, rate: null, low: null, high: null },
        turnovers: { count: 2, of: 120, rate: 0.017, low: 0.005, high: 0.06 }, targets: { X: 40 }, failures: [{ contest: 'press_release', count: 9 }], samples: [4],
      },
      byOpponent: [],
    };
    const out = html('bench', { ...view, bench: { ...view.bench, report } });
    expect(out).toContain('Cancelled: 120 of 200 runs.');
    expect(out).toContain('Yards: mean 6.2, 95% interval 5.1 to 7.3');
    expect(out).toContain('Completion: 73% (80 of 110), interval 64% to 80%');
    expect(out).toContain('Pressure: no attempts');
    expect(out).toContain('press release 9');
    expect(out).toContain('Run 5');
    expect(html('bench', { ...view, bench: { ...view.bench, report: { ...report, refusedBecause: 'not_graded_values', overall: null } } })).toContain('staff-graded and scouted values');
    expect(html('bench', { ...view, bench: { ...view.bench, inGame: true } })).toContain('unavailable during a game');
  });

  it('every text id the screen builds exists', () => {
    const ids = new Set(designerTextIds());
    for (const t of DESIGNER_TABS) expect(ids.has(`pd.tab.${t}`)).toBe(true);
    for (const l of ['refused', 'illegal', 'unsound', 'note']) expect(ids.has(`pd.level.${l}`)).toBe(true);
    for (const k of view.parts) expect(ids.has(`pd.part.${k.kind}`)).toBe(true);
    for (const r of ['in_game', 'not_graded_values', 'no_opponents']) expect(ids.has(`pd.bench.refused.${r}`)).toBe(true);
    expect(pt('designer.dismiss.needs_reason')).toBe('designer.dismiss.needs_reason');
  });
});

describe('keyboard-only drawing (O3.1.2 acceptance 2)', () => {
  const press = (keys: (string | { key: string; shift?: boolean; ctrl?: boolean; alt?: boolean })[], drawingFrom = -1) => {
    const out: DesignerCommand[] = [];
    let digits = '';
    keys.forEach((k, i) => {
      const r = keyCommands(typeof k === 'string' ? { key: k } : k, drawingFrom >= 0 && i >= drawingFrom, digits);
      digits = r.legDigits; out.push(...r.commands);
    });
    return out;
  };
  it('selects, moves, draws a 12-yard stem and a 45-degree break, and finishes', () => {
    expect(press(['x', 'ArrowRight', 'Enter', '1', '2', 'ArrowUp', '5', { key: 'ArrowUp', shift: true }, 'Enter'], 3)).toEqual([
      { type: 'select_letter', letter: 'x' }, { type: 'nudge', dDepth: 0, dLateral: 1, free: false }, { type: 'draw_begin', target: 'path' },
      { type: 'draw_leg_length', yd: 1 }, { type: 'draw_leg_length', yd: 12 }, { type: 'draw_leg', dir: 0, kind: 'cut' },
      { type: 'draw_leg_length', yd: 5 }, { type: 'draw_leg', dir: 1, kind: 'cut' }, { type: 'draw_end', behavior: null, free: false },
    ]);
  });
  it('undo, redo, flip, line toggle, motion, Tab and Alt', () => {
    expect(press([{ key: 'z', ctrl: true }, { key: 'Z', ctrl: true, shift: true }, { key: 'm', ctrl: true }, ' ', { key: 'Enter', shift: true }, { key: 'Tab', shift: true }, { key: 'ArrowDown', alt: true }])).toEqual([
      { type: 'undo' }, { type: 'redo' }, { type: 'mirror' }, { type: 'toggle_line' }, { type: 'draw_begin', target: 'motion' }, { type: 'select_next', step: -1 },
      { type: 'nudge', dDepth: -1, dLateral: 0, free: true },
    ]);
    expect(keyCommands({ key: 'Escape' }, true).commands).toEqual([{ type: 'draw_cancel' }]);
  });
});

describe('route entry', () => {
  it('fills the registered play designer screen in the shell', () => {
    const screen = SCREENS.find((s) => s.id === PLAY_DESIGNER_SCREEN_ID)!;
    expect(screen.route).toBe('/football/play-designer');
    const sent: DesignerCommand[] = [];
    const routes = { [PLAY_DESIGNER_SCREEN_ID]: playDesignerRoute({ view: () => view, send: (_p, c) => sent.push(c) }) };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: screen.route, routes }));
    expect(out).toContain('data-screen-body="play-designer"');
    expect(out).toContain('data-marker="X"');
  });
});
