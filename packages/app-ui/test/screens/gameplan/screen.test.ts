// G-68 screens: the game plan builder and call sheet render inside the shell frame for their registry ids,
// every action is a button or form field (Q1.5.2), locked controls name their holder (G3.4.3), readiness is
// the staff's estimate (MA-48), and view options live in the address (O1.1.3).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import {
  CallSheetScreen, GamePlanScreen, callSheetRoute, gamePlanRoute, gpTextIds, gt, optionsFromView, lookText, PLAN_SCREEN_ID, SHEET_SCREEN_ID,
  PLAN_TABS, SHEET_TABS, type GameplanOptions, type GameplanView,
} from '../../../src/screens/gameplan/index.ts';

const lock = (allowed: boolean, heldBy: string | null = null) => ({ allowed, heldBy, suggest: false });
const entry = (id: string, over: Partial<GameplanView['sheet']['boxes'][number]['entries'][number]> = {}) => ({
  id, call: `Gun Trips Right ${id}`, playId: id, key: 'Q1', readinessEstimate: 0.8, timesCalled: 3, notInPlan: false, broken: false, overLimit: false, note: null, rank: null, bandNumber: null, ...over,
});

function view(over: Partial<GameplanView> = {}): GameplanView {
  return {
    teamId: 7, unit: 'offense',
    locks: { build: lock(true), approve: lock(false, 'head_coach'), card: lock(false, 'head_coach') },
    plan: {
      looks: [{ bucket: 'first_10', look: 'two_high', count: 18, n: 30, rate: 0.6, lo: 0.48, hi: 0.71 }, { bucket: 'third_short', look: 'zero', count: 2, n: 4, rate: null, lo: null, hi: null }],
      looksStale: false, callerChanged: true,
      situations: [{ id: 'first_10', label: 'First and 10', entries: [
        { entryId: 'm1', playId: 'Stick', call: 'Gun Trips Right Stick', readinessEstimate: 0.82, repsAssigned: 5, targetReps: 6, isNew: false, broken: false },
        { entryId: 'm2', playId: 'Mesh', call: 'Gun Doubles Mesh', readinessEstimate: null, repsAssigned: 0, targetReps: 4, isNew: true, broken: false },
      ] }],
      selected: 'first_10',
      book: [{ playId: 'Smash', call: 'Gun Trips Right Smash', section: 'dropback', status: 'installed', inPlan: false }],
      summary: { total: 2, newThisWeek: 1, unitsUsed: 3, capacity: 30, repsAssigned: 5, repsAvailable: 60, runPass: { run: 0, pass: 2, other: 0 } },
      matchups: [{ id: 'x', ours: 'Slot', theirs: 'Nickel', rule: 'target' }],
      approval: { state: 'submitted', at: 3, by: null, notes: null },
      proposal: { id: 'p1', from: 'coordinator', entries: 3, added: ['m9'], removed: [] },
      warnings: [{ leaf: 'G6.2.2', code: 'install.new_count', subject: 'week', text: '9 new plays', severity: 'warning' }],
    },
    sheet: {
      unit: 'offense', gameId: 'g1', version: 1, lockedAt: null, page: { orientation: 'landscape', cols: 24, rows: 16 },
      situations: [{ id: 'first_10', label: 'First and 10' }],
      boxes: [{ id: 'first_10', title: 'First and 10', side: 0, col: 0, row: 0, w: 6, h: 4, situationId: 'first_10', category: null, colour: '#888', key: 'Q', priority: 10,
        expectedSnaps: 20.5, expectedSource: 'league', expectedGames: 544, depthMark: null, entries: [entry('Stick'), entry('Gone', { key: 'Q2', broken: true }), entry('Off', { key: 'Q3', notInPlan: true })] }],
      layoutProblems: [], coverage: [{ down: 1, distance: '1', zone: 'red zone', boxId: 'first_10' }, { down: 1, distance: '16+', zone: 'red zone', boxId: null }],
      unmatchedStates: 12, shadowedStates: 3,
      catalogue: [{ id: 'goal_line', label: 'Goal line', status: 'missing', tier: 1, expectedSnaps: 2.1, severity: 'warning' }],
      density: { entriesBySide: [3, 0], bandBySide: ['clear', 'clear'], smallestTextPt: 9.5, overflow: [] },
      size: { unique: 3, repsAvailable: 60, overReps: false }, tooLongKeys: [], warnings: [],
    },
    script: { mode: 'all', opening: [{ id: 's1', call: 'Gun Trips Right Stick', purpose: 'show_formation', purposeText: null, watchingFor: 'their slot defender' }], secondHalf: [],
      variety: { personnel: { '11': 1 }, formation: { trips: 1 }, runPass: { pass: 1 }, direction: { none: 1 } }, reveals: [], mustCalls: [{ id: 'mc', call: 'Gun Doubles Mesh', target: 'at_least:2' }], notes: [], warnings: [] },
    wristband: { cells: [{ label: '11', call: 'Gun Trips Right Stick' }], problems: [], audibles: [{ name: 'Alert', call: 'Gun Doubles Mesh' }], relay: 'radio', qbFreedom: 'package', warnings: [] },
    card: { fourth: [{ distanceYd: 1, yardsToGoalYd: 40, call: 'go', edited: true }], twoPoint: [{ scoreDiff: -2, goForTwo: true, edited: false }], kneel: [{ opponentTimeouts: 0, kneels: 3, secondsKilled: 117 }],
      fieldGoalLine: { withWind: 37, intoWind: 30 }, inBoundsPlayS: 6, timeoutRules: [], crewTendencies: [], trickHistory: [], depthCard: [], standingInstructions: [], edits: [{ block: 'fourth', cell: '1@40', from: 'punt', to: 'go', at: 4 }], stale: ['fourth'] },
    review: { items: [{ code: 'broken_entry', subject: 'first_10/Gone', text: 'Gone is missing or retired', blocks: true }, { code: 'empty_box', subject: 'x', text: 'x is empty', blocks: false }], canLock: false, locked: false },
    print: { paper: 'letter', keyHints: true, widthIn: 11, heightIn: 8.5, boxes: [{ id: 'first_10', side: 0, xIn: 0, yIn: 0, wIn: 2.75, hIn: 2.13, textPt: 9.5, lines: ['First and 10', 'Q1 Gun Trips Right Stick'], overflow: false }], overflow: 0 },
    ...over,
  };
}

const plan = (v: GameplanView | null, tab: (typeof PLAN_TABS)[number], readOnly = false) =>
  renderToStaticMarkup(createElement(GamePlanScreen, { view: v, tab, readOnly, onTab: () => {}, onSelectSituation: () => {}, onIntent: () => {} }));
const sheet = (v: GameplanView | null, tab: (typeof SHEET_TABS)[number], readOnly = false) =>
  renderToStaticMarkup(createElement(CallSheetScreen, { view: v, tab, readOnly, onTab: () => {}, onIntent: () => {} }));
const esc = (x: string) => x.replace(/'/g, '&#x27;');

describe('game plan builder screen (O3.4.1)', () => {
  it('is registered and its route renders in the shell frame with options from the address', () => {
    expect(SCREENS.some((s) => s.id === PLAN_SCREEN_ID)).toBe(true);
    let asked: GameplanOptions | null = null;
    const host = { view: (_u: string, o: GameplanOptions) => { asked = o; return view(); }, dispatch: () => {} };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/football/game-plan?tab=plan&situation=first_10', routes: { [PLAN_SCREEN_ID]: gamePlanRoute(host) } }));
    expect(out).toContain(`data-screen="${PLAN_SCREEN_ID}"`);
    expect(asked).toEqual({ situation: 'first_10', paper: 'letter', keyHints: true });
  });
  it('shows three columns: looks with counts, the plan with staff estimates, and the fitting book', () => {
    const out = plan(view(), 'plan');
    expect(out).toContain(esc(lookText(view().plan.looks[0]!)));
    expect(out).toContain('2 of 4');
    expect(out).toContain('82%');
    expect(out).toContain(gt('gp.noEstimate'));
    expect(out).toContain(gt('gp.action.add', { call: 'Gun Trips Right Smash' }));
    expect(out).toContain(gt('gp.summary.total', { n: 2 }));
    expect(out).toContain(gt('gp.looks.callerChanged'));
  });
  it('a draft plan shows as a proposal to accept or reject', () => {
    const out = plan(view(), 'plan');
    expect(out).toContain('data-proposal="p1"');
    expect(out).toContain(gt('gp.proposal.accept'));
  });
  it('a locked control names its holder; read-only hides actions', () => {
    const out = plan(view(), 'review');
    expect(out).toContain(gt('gp.lock.heldBy', { holder: gt('gp.holder.head_coach') }));
    expect(plan(view(), 'plan', true)).not.toContain('<button type="button">Remove');
  });
  it('matchup rules are a table of selects', () => {
    const out = plan(view(), 'matchups');
    expect(out).toContain('data-matchup="x"');
    expect(out).toContain(esc(gt('gp.matchups.ruleFor', { ours: 'Slot', theirs: 'Nickel' })));
  });
  it('empty view', () => expect(plan(null, 'plan')).toContain(gt('gp.none')));
});

describe('call sheet screen (O3.4.2, G7, O3.4.3)', () => {
  it('is registered; print paper and key hints come from the address', () => {
    expect(SCREENS.some((s) => s.id === SHEET_SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/football/call-sheet?tab=print&paper=legal&keys=0', routes: { [SHEET_SCREEN_ID]: callSheetRoute({ view: () => view(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${SHEET_SCREEN_ID}"`);
    expect(optionsFromView({ paper: 'legal', keys: '0' })).toEqual({ situation: null, paper: 'legal', keyHints: false });
  });
  it('lays boxes on the sheet grid with keys, estimates, call counts and marks', () => {
    const out = sheet(view(), 'layout');
    expect(out).toContain('data-box="first_10"');
    expect(out).toContain('left:0%');
    expect(out).toContain('<kbd>Q1</kbd>');
    expect(out).toContain(gt('gp.entry.called', { n: 3 }));
    expect(out).toContain('data-broken="true"');
    expect(out).toContain('data-off-plan="true"');
    expect(out).toContain(esc(gt('gp.box.expected', { snaps: 20.5, source: gt('gp.source.league'), games: 544 })));
  });
  it('the coverage map marks cells that match no box', () => {
    const out = sheet(view(), 'coverage');
    expect(out).toContain('data-gap="true"');
    expect(out).toContain('data-row="goal_line"');
  });
  it('scripts, wristband and card', () => {
    expect(sheet(view(), 'script')).toContain(esc(gt('gp.script.watching', { what: 'their slot defender' })));
    expect(sheet(view(), 'wristband')).toContain('data-cell="11"');
    const card = sheet(view(), 'card');
    expect(card).toContain('data-edited="true"');
    expect(card).toContain(gt('gp.card.stale'));
    expect(card).not.toContain('<select');
    expect(sheet(view({ locks: { build: lock(true), approve: lock(true), card: lock(true) } }), 'card')).toContain('<select');
  });
  it('the pre-lock review blocks only on missing plays', () => {
    const out = sheet(view(), 'review');
    expect(out).toContain('data-blocks="true"');
    expect(out).toContain('disabled=""');
    expect(out).toContain(esc(gt('gp.lockReview.blocked')));
  });
  it('print preview', () => {
    const out = sheet(view(), 'print');
    expect(out).toContain('data-print-box="first_10"');
    expect(out).toContain('Q1 Gun Trips Right Stick');
  });
  it('every string id the screens use exists', () => {
    const ids = new Set(gpTextIds());
    for (const t of PLAN_TABS) expect(ids.has(`gp.tab.${t}`)).toBe(true);
    for (const t of SHEET_TABS) expect(ids.has(`gp.tab.${t}`)).toBe(true);
    for (const html of [plan(view(), 'plan'), plan(view(), 'matchups'), plan(view(), 'review'), ...SHEET_TABS.map((t) => sheet(view(), t))]) expect(html).not.toMatch(/>gp\.[a-z]/);
  });
});
