// Print and export screen (O3.4.3, G7.9.2): registered and rendered in the shell frame, pages at true paper
// size, the printed sheet uses the read model's print boxes in the same positions and entry order as the
// call sheet editor, the band, scripts, head coach card and plan pages print what the read model holds,
// page choice and paper live in the address, and the Classic paper colours come from the Classic tokens.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { CallSheetScreen, type GameplanView } from '../../../src/screens/gameplan/index.ts';
import { PrintScreen, printRoute, pr, prTextIds, SCREEN_ID, DOCS, docsFromView, docsToView, PAPER_TOKENS, type Doc, type PrintIntent } from '../../../src/screens/print/index.ts';
import { resolveEraColours } from '../../../src/presentation/era/index.ts';
import { tokenValue } from '../../../src/tokens/index.ts';

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


const esc = (x: string) => x.replace(/'/g, '&#x27;');
const html = (v: GameplanView | null, docs: readonly Doc[] = DOCS, onIntent: (i: PrintIntent) => void = () => {}) =>
  renderToStaticMarkup(createElement(PrintScreen, { view: v, unit: 'offense', docs, onUnit: () => {}, onIntent }));
const twoSided = (): GameplanView => {
  const v = view();
  return { ...v, print: { ...v.print, boxes: [
    { id: 'first_10', side: 0, xIn: 0, yIn: 0, wIn: 2.75, hIn: 2.13, textPt: 9.5, lines: ['First and 10', 'Q1 Gun Trips Right Stick', 'Q2 Gun Doubles Mesh'], overflow: false },
    { id: 'red_zone', side: 1, xIn: 5.5, yIn: 4.25, wIn: 2.75, hIn: 2.13, textPt: 7, lines: ['Red zone', 'R1 Gun Bunch Snag'], overflow: true },
  ], overflow: 1 } };
};

describe('print and export screen (O3.4.3)', () => {
  it('is registered and its route renders in the shell frame, reading paper, keys and pages from the address', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    let asked: unknown = null;
    const host = { view: (_u: string, o: unknown) => { asked = o; return view(); }, dispatch: () => {} };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/football/print?unit=offense&paper=legal&keys=0&docs=sheet,band', routes: { [SCREEN_ID]: printRoute(host) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(asked).toEqual({ situation: null, paper: 'legal', keyHints: false });
    expect(out).toContain('data-pages="3"');
  });
  it('pages are true paper size with a print stylesheet that sets the page and hides the shell', () => {
    const out = html(view());
    expect(out).toContain('width:11in;height:8.5in');
    expect(out).toContain('@page { size: 11in 8.5in; margin: 0; }');
    expect(out).toContain('.gm-hubs');
    expect(out.match(/class="pr-page"/g)?.length).toBe(6);
    expect(out).toContain(pr('pr.footer', { unit: pr('pr.unit.offense'), n: 6, of: 6 }));
  });
  it('acceptance: the printed sheet matches the on-screen grid in box positions and entry order', () => {
    const v = twoSided();
    const printed = html(v, ['sheet']);
    const editor = renderToStaticMarkup(createElement(CallSheetScreen, { view: v, tab: 'print', readOnly: false, onTab: () => {}, onIntent: () => {} }));
    const boxes = (s: string) => [...s.matchAll(/data-print-box="([^"]+)"[^>]*style="[^"]*left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/g)].map((m) => m.slice(1).join(','));
    expect(boxes(printed)).toEqual(boxes(editor));
    expect(boxes(printed)).toEqual(['first_10,0,0,25,25.05882352941176', 'red_zone,50,50,25,25.05882352941176']);
    expect(printed.indexOf('Q1 Gun Trips Right Stick')).toBeLessThan(printed.indexOf('Q2 Gun Doubles Mesh'));
    expect(printed).toContain('data-print-side="1"');
    expect(printed).toContain('data-overflow="true"');
    expect(printed).toContain(pr('pr.overflow', { n: 1 }));
  });
  it('box text never prints below the read model size (7 pt floor is the read model\'s, O3.4.3)', () => {
    const out = html(twoSided(), ['sheet']);
    const sizes = [...out.matchAll(/data-print-box="[^"]+"[^>]*font-size:([\d.]+)pt/g)].map((m) => Number(m[1]));
    expect(sizes).toEqual([9.5, 7]);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(7);
  });
  it('the band card lists every number with its call, the relay and audibles', () => {
    const out = html(view(), ['band']);
    expect(out).toContain('data-band="card"');
    expect(out).toContain('data-cell="11"');
    expect(out).toContain(pr('pr.band.note').replace(/'/g, '&#x27;'));
    expect(out).toContain('Alert');
  });
  it('the scripts print in designer order with purpose, watching-for and an empty result column', () => {
    const out = html(view(), ['script']);
    expect(out).toContain('data-script="opening"');
    expect(out).toContain('data-script-row="s1"');
    expect(out).toContain('their slot defender');
    expect(out).toContain(pr('pr.script.col.result'));
    expect(out).toContain(pr('pr.script.empty'));
  });
  it('the head coach card and the plan print their tables', () => {
    const card = html(view(), ['card']);
    expect(card).toContain('data-block="fourth"');
    expect(card).toContain('data-block="kneel"');
    const plan = html(view(), ['plan']);
    expect(plan).toContain('data-plan-situation="first_10"');
    expect(plan).toContain(pr('pr.plan.summary', { total: 2, new: 1 }));
  });
  it('page choice round-trips through the address; settings, print and export are intents', () => {
    expect(docsFromView({})).toEqual([...DOCS]);
    expect(docsFromView({ docs: 'band,nonsense,sheet' })).toEqual(['band', 'sheet']);
    expect(docsToView(['plan', 'sheet'])).toBe('sheet,plan');
    expect(docsFromView({ docs: '' })).toEqual([]);
    expect(html(view(), [])).toContain('data-pages="0"');
    const got: PrintIntent[] = [];
    let printed = 0;
    const host = { view: () => view(), dispatch: (_u: string, i: unknown) => { got.push(i as PrintIntent); }, print: () => { printed++; } };
    const route = printRoute(host);
    const el = route.render({ location: { path: '/football/print', view: {} }, readOnly: false, setView: () => {} } as never) as { props: { onIntent(i: PrintIntent): void } };
    el.props.onIntent({ kind: 'print' });
    el.props.onIntent({ kind: 'export_sheet' });
    expect(printed).toBe(1);
    expect(got).toEqual([{ kind: 'export_sheet' }]);
  });
  it('the paper colours are the Classic theme tokens; no view shows the empty line; every id exists', () => {
    const classic = resolveEraColours({ theme: 'classic' });
    const out = html(view(), ['band']);
    expect(out).toContain(`background:${tokenValue(classic, PAPER_TOKENS.paper)}`);
    expect(out).toContain(`background:${tokenValue(classic, PAPER_TOKENS.barAlt)}`);
    expect(html(null)).toContain(esc(pr('pr.empty')));
    for (const id of ['pr.doc.plan', 'pr.paper.tabloid', 'pr.unit.special_teams', 'pr.locked']) expect(prTextIds()).toContain(id);
  });
});
