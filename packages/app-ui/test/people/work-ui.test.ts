// Delegation (O4.3.2), meetings with the staff one-on-one (O4.4.2), decision log (N3) and glossary with
// term links (A4, N5.2.1): render from read-model data, words and counts only, keyboard-reachable actions,
// and every route id a registry screen.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DelegationScreen, MeetingScreen, PEOPLE_WORK_SCREEN_IDS, peopleWorkRoutes, workTextIds, wt,
  type DelegationIntent, type MeetingIntent, type UiDelegation, type UiMeeting, type UiStaffOneOnOne,
} from '../../src/screens/people/index.ts';
import { DECISION_LOG_SCREEN_ID, DecisionLogScreen, dt as dtLine, decisionFilterFromView, decisionLogRoutes, dlTextIds, viewFromDecisionFilter, type UiDecisionLog } from '../../src/screens/decision-log/index.ts';
import {
  GLOSSARY_SCREEN_ID, GlossaryScreen, TermLinkProvider, TermText, filterFromView, glTextIds, glossaryPath, glossaryRoutes, viewFromFilter, type TermLinker, type UiGlossary,
} from '../../src/screens/glossary/index.ts';
import { resolve, screenById } from '../../src/shell/index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (el: (p: any) => unknown, props: Record<string, unknown>) => renderToStaticMarkup(createElement(el as never, props as never));
const noop = () => {};
const d = (dayIndex: number) => ({ seasonYear: 2030, dayIndex });

const delegation: UiDelegation = {
  readOnly: false,
  rows: [
    { taskId: 'gameplan.offense', side: 'offense', holderId: 10, holderName: 'Oscar Coord', autonomy: 'proposes', isDefault: false, defaultOwnerId: 10, coachHours: 1, hoursSaved: 3, reviewStep: true,
      record: { products: 11, held: 9, replaced: 1, eventIds: [5] }, candidates: [{ personId: 10, name: 'Oscar Coord' }], blockedKey: null },
    { taskId: 'room.qb', side: 'offense', holderId: 12, holderName: 'Quinn Coach', autonomy: 'decides', isDefault: true, defaultOwnerId: 12, coachHours: 0, hoursSaved: 2, reviewStep: false,
      record: null, candidates: [{ personId: 12, name: 'Quinn Coach' }], blockedKey: null },
    { taskId: 'strength.program', side: 'none', holderId: null, holderName: null, autonomy: 'keeps', isDefault: true, defaultOwnerId: null, coachHours: 0, hoursSaved: 0, reviewStep: false,
      record: null, candidates: [], blockedKey: 'dg.blocked.noQualified' },
  ],
  staff: [{ personId: 10, name: 'Oscar Coord', titleKey: 'job.oc', available: true, loadHours: 40, capacityHours: 70, delegatedHours: 4, overloaded: false },
    { personId: 12, name: 'Quinn Coach', titleKey: 'job.qb', available: true, loadHours: 58, capacityHours: 60, delegatedHours: 2, overloaded: true }],
  statements: [{ personId: 10, textKey: 'staff.say.wants_more', eventId: 77, wants: 'more' }],
  totals: { budgetHours: 84, fixedHours: 60, taskHours: 1, projectedHours: 61, overBudget: false, savedHours: 5 },
  presets: ['ceo', 'offense_caller', 'defense_caller', 'do_everything'],
};

describe('delegation screen (O4.3.2)', () => {
  it('shows owner, mode, hours saved, the record as products, presets and the projected week', () => {
    const html = render(DelegationScreen, { view: delegation, onIntent: noop });
    expect(html).toContain('data-task="gameplan.offense"');
    expect(html).toContain(wt('dg.record', { held: 9, products: 11, replaced: 1 }));
    expect(html).toContain(wt('dg.blocked.noQualified'));
    expect(html).toContain(wt('dg.preset.ceo'));
    expect(html).toContain(wt('dg.totals', { projected: 61, budget: 84, fixed: 60, tasks: 1, saved: 5 }));
    expect(html).toContain(wt('dg.staff.over'));
    expect(html).toContain('staff.say.wants_more');
    expect(html).not.toMatch(/candor|ego|loyalty|work ?habits/i);
  });
  it('below head coach it is read only, with no presets and disabled controls', () => {
    const html = render(DelegationScreen, { view: { ...delegation, readOnly: true }, onIntent: noop });
    expect(html).toContain(wt('dg.readOnly'));
    expect(html).not.toContain('data-preset=');
    expect(html).toContain('disabled=""');
  });
});

const meeting: UiMeeting = {
  subject: { personId: 200, name: 'Will Receiver', roleKey: 'role.backup', mood: { textKey: 'mood.frustrated', reasons: [{ textKey: 'reason.snaps_down', eventId: 9 }], trend: 'down' },
    lastTalk: null, imported: false, openPromises: [{ promiseId: 1, toPersonId: 200, toName: 'Will Receiver', type: 'start', madeOn: d(10), due: d(40), status: 'open', overdue: true, madeByAssistant: false, beyondAuthority: false }] },
  subjects: [{ typeId: 'role_definition', textKey: 'players.talk.role_definition', major: false, responses: [
    { responseId: 'role_definition:direct', typeId: 'role_definition', approach: 'direct', stance: 'honest', sayKey: 'players.talk.role_definition.say.direct', minutes: 15, promiseType: null, lieRisk: false, beyondAuthority: false },
    { responseId: 'role_definition:promise:start', typeId: 'role_definition', approach: 'direct', stance: 'promise', sayKey: 'players.talk.role_definition.say.promise.start', minutes: 15, promiseType: 'start', lieRisk: true, beyondAuthority: false },
  ] }],
  tracker: [{ promiseId: 1, toPersonId: 200, toName: 'Will Receiver', type: 'start', madeOn: d(10), due: d(40), status: 'open', overdue: true, madeByAssistant: false, beyondAuthority: false }],
  honesty: { kept: 2, broken: 1, caughtOut: 0, contradictedInPublic: 0, eventIds: [1, 2, 3] },
  mayPromise: true,
};
const staffTalk: UiStaffOneOnOne = {
  staffId: 10, name: 'Oscar Coord', titleKey: 'job.oc', hours: 0.5,
  learned: [{ typeKey: 'dt.fourth_down', bucketKey: 'bucket.short_opp', chosenKey: 'opt.go', times: 7, of: 9, decisionIds: ['a'] }],
  suggestions: [{ index: 0, typeKey: 'dt.fourth_down', bucketKey: 'bucket.short_opp', habitKey: 'opt.go', pickKey: 'opt.field_goal', times: 7, of: 9, decisionIds: ['a'] }],
  sheetSuggestions: [{ boxId: 'box.third_medium', callKey: 'call.mesh', removedWeeks: 3 }],
};

describe('meeting screen (O4.4.2) and staff one-on-one', () => {
  it('player talk: what he knows going in, responses with stances, the lie-risk flag; mood in words', () => {
    const html = render(MeetingScreen, { view: meeting, staffTalk: null, tab: 'player', readOnly: false, onTab: noop, onIntent: noop });
    expect(html).toContain('mood.frustrated');
    expect(html).toContain('reason.snaps_down');
    expect(html).toContain(wt('mt.lieRisk'));
    expect(html).toContain('data-stance="honest"');
    expect(html).toContain(wt('mt.tracker.overdue'));
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/); // no control nested in a control
  });
  it('promises tab: the whole tracker and honesty as events, never a value', () => {
    const html = render(MeetingScreen, { view: meeting, staffTalk: null, tab: 'promises', readOnly: false, onTab: noop, onIntent: noop });
    expect(html).toContain(wt('mt.honesty.row', { kept: 2, broken: 1, caught: 0, public: 0 }));
    expect(html).not.toMatch(/coach_?word/i);
  });
  it('staff one-on-one: what he learned, his suggestions with answers, sheet suggestions', () => {
    const html = render(MeetingScreen, { view: meeting, staffTalk, staffList: [{ personId: 10, name: 'Oscar Coord' }], tab: 'staff', readOnly: false, onTab: noop, onIntent: noop });
    expect(html).toContain(wt('mt.staff.learned.row', { type: 'dt.fourth_down', bucket: 'bucket.short_opp', chosen: 'opt.go', times: 7, of: 9 }));
    expect(html).toContain(wt('mt.staff.suggest.row', { type: 'dt.fourth_down', bucket: 'bucket.short_opp', habit: 'opt.go', times: 7, of: 9, pick: 'opt.field_goal' }));
    for (const a of ['accepted', 'overruled_with_reason', 'overruled_without_reason']) expect(html).toContain(`data-answer="${a}"`);
    expect(html).toContain(wt('mt.staff.sheet.row', { call: 'call.mesh', box: 'box.third_medium', weeks: 3 }));
    expect(html).toContain(wt('mt.staff.cost', { name: 'Oscar Coord', title: 'job.oc', hours: 0.5 }));
  });
  it('routes: registry screens; the address picks the person, the staff member and the tab', () => {
    const intents: (DelegationIntent | MeetingIntent)[] = [];
    let seenPerson: number | null = -1; let seenStaff: number | null = -1;
    const routes = peopleWorkRoutes({
      delegation: () => delegation, meeting: (p) => { seenPerson = p; return meeting; }, staffTalk: (s) => { seenStaff = s; return s === null ? null : staffTalk; }, dispatch: (i) => intents.push(i),
    });
    for (const id of Object.values(PEOPLE_WORK_SCREEN_IDS)) expect(screenById(id)).toBeTruthy();
    const loc = resolve('/people/meeting?staff=10')!;
    const html = renderToStaticMarkup(routes[PEOPLE_WORK_SCREEN_IDS.meeting]!.render({ screen: screenById(loc.screenId)!, location: loc, readOnly: false, navigate: noop, setView: noop }) as never);
    expect(seenPerson).toBeNull();
    expect(seenStaff).toBe(10);
    expect(html).toContain('data-tab="staff"');
  });
});

const log: UiDecisionLog = {
  rows: [
    { id: 'b', worldDate: '2030-10-05', gameId: 7, playIndex: 30, period: 4, clockTenths: 1234, type: 'fourth_down', scope: 'game', owner: 'I5', actor: 'user', actorId: 1, credited: 1, basis: 'own_decision', viaId: null,
      chosen: 'go', chosenLabelKey: 'opt.go', notMade: false, information: [{ source: 'scouting.tendencies', viewed: false }], secondsToDecide: 8.5,
      model: { kind: 'game_management', best: 'punt', bestLabelKey: 'opt.punt', cost: 0.05, margin: 0.01, class: 'clearly_wrong', lacks: ['injured kicker'], sparse: true,
        options: [{ optionId: 'go', labelKey: 'opt.go', value: 0.4, low: 0.38, high: 0.42, sparse: false }, { optionId: 'punt', labelKey: 'opt.punt', value: 0.45, low: 0.4, high: 0.5, sparse: true }] },
      outcome: { result: { converted: false }, luck: null }, supersededBy: [], supersedes: null },
    { id: 'c', worldDate: '2030-10-05', gameId: 7, playIndex: 5, period: 1, clockTenths: 8000, type: 'offensive_play_call', scope: 'game', owner: 'I2', actor: 'staff', actorId: 10, credited: 10, basis: 'delegated', viaId: null,
      chosen: 'mesh', chosenLabelKey: 'call.mesh', notMade: false, information: [], secondsToDecide: 4,
      model: { kind: 'play_call', foresight: 0.12, foresightSample: 140, predictability: 0.6 }, outcome: null, supersededBy: [], supersedes: null },
  ],
  total: 2, types: ['offensive_play_call', 'fourth_down'], games: [7],
  summary: { clearlyRight: 0, tossUp: 0, clearlyWrong: 1, costTotal: 0.05, pendingModel: 0 },
};

describe('decision log screen (N3)', () => {
  const filter = decisionFilterFromView({});
  it('shows each decision with the model\'s view at the time, its range, what it lacks and the outcome', () => {
    const html = render(DecisionLogScreen, { view: log, filter, onFilter: noop });
    expect(html).toContain('data-class="clearly_wrong"');
    expect(html).toContain(dtLine('dl.model.cost', { cost: '5.0%', margin: '1.0%' }));
    expect(html).toContain('injured kicker');
    expect(html).toContain('scouting.tendencies (not opened)');
    expect(html).toContain('data-model="play_call"');
    expect(html).toContain('converted false');
    // A single play call is never classed (N3.3.2).
    expect(html.split('data-decision="c"')[1]!).not.toContain('data-class=');
  });
  it('the filter round-trips through the address', () => {
    const f = { scope: 'game' as const, type: 'fourth_down', gameId: 7, who: 'mine' as const, clearlyWrongOnly: true };
    expect(decisionFilterFromView(viewFromDecisionFilter(f))).toEqual(f);
    expect(screenById(DECISION_LOG_SCREEN_ID)).toBeTruthy();
    expect(Object.keys(decisionLogRoutes({ decisionLog: () => log }))).toEqual([DECISION_LOG_SCREEN_ID]);
  });
  it('empty log says so', () => {
    expect(render(DecisionLogScreen, { view: null, filter, onFilter: noop })).toContain('No decisions logged yet.');
  });
});

const glossary: UiGlossary = {
  level: 'pro', total: 2, domains: ['defense'], statusCounts: { Verified: 1, '1 of 3': 1 },
  rows: [{ id: 'term.blitz', term: 'blitz', domain: 'defense', level: 'both', status: 'Verified', definition: 'Rushing more than the usual four.' },
    { id: 'term.mug', term: 'mug', domain: 'defense', level: 'both', status: '1 of 3', definition: 'Linebackers walked up in the A gaps.' }],
  selected: { id: 'term.mug', term: 'mug', aliases: ['mugged look'], variants: [], definition: 'Linebackers walked up showing a blitz.', domain: 'defense', subdomain: 'pressure', level: 'both',
    ownerLeaf: 'A4.5.4', factRow: 'F-glossary-0100', status: '1 of 3', sources: [{ citation: 'A coaching clinic text', locator: 'https://example.invalid', dateRead: '2026-11-26', howRead: 'web page', primary: false }],
    otherLevel: null, lesson: 'lesson.pressure', diagram: null },
};
const linker: TermLinker = {
  link: (text) => {
    const i = text.indexOf('blitz');
    return i < 0 ? [{ kind: 'text', text }] : [{ kind: 'text', text: text.slice(0, i) }, { kind: 'term', text: 'blitz', id: 'term.blitz', matched: 'term' }, { kind: 'text', text: text.slice(i + 5) }];
  },
  card: (id) => (id === 'term.blitz' ? { id, term: 'blitz', definition: 'Rushing more than the usual four.', aliases: [], lesson: null, status: 'Verified', otherLevelNote: null } : null),
  open: noop,
};

describe('glossary screen (A4) and term links (N5.2.1)', () => {
  const filter = filterFromView({});
  it('lists terms with status, flags anything short of Verified, and shows the card with its sources', () => {
    const html = render(GlossaryScreen, { view: glossary, filter, onFilter: noop, onSelect: noop, onTeach: noop });
    expect(html).toContain('data-term-row="term.blitz"');
    expect(html).toContain('(1 of 3)');
    expect(html).toContain('Not yet triple verified.');
    expect(html).toContain('A coaching clinic text, read 2026-11-26 (web page)');
    expect(html).toContain('Teach me this');
    expect(render(GlossaryScreen, { view: glossary, filter, onFilter: noop, onSelect: noop })).not.toContain('Teach me this'); // hidden without a lesson opener
  });
  it('text links its terms under a provider and stays plain without one', () => {
    const plain = renderToStaticMarkup(createElement(TermText, { text: 'Show blitz, then drop.' }));
    expect(plain).toBe('Show blitz, then drop.');
    const linked = renderToStaticMarkup(createElement(TermLinkProvider, { linker, children: createElement(TermText, { text: 'Show blitz, then drop.' }) }));
    expect(linked).toContain('data-term="term.blitz"');
    expect(linked).toContain('<button type="button" class="gm-term-link"');
    expect(linked.replace(/<[^>]+>/g, '')).toBe('Show blitz, then drop.');
    // The glossary card's own definition links its terms too.
    const card = renderToStaticMarkup(createElement(TermLinkProvider, { linker, children: createElement(GlossaryScreen, { view: glossary, filter, onFilter: noop, onSelect: noop }) }));
    expect(card).toContain('data-term="term.blitz"');
  });
  it('filter and term live in the address; the glossary path resolves to the registry screen', () => {
    const f = { query: 'mug', domain: 'defense', levelOnly: false, flaggedOnly: true };
    expect(filterFromView(viewFromFilter(f, 'term.mug'))).toEqual(f);
    const loc = resolve(glossaryPath('term.mug'))!;
    expect(loc.screenId).toBe(GLOSSARY_SCREEN_ID);
    expect(loc.view.term).toBe('term.mug');
    expect(Object.keys(glossaryRoutes({ glossary: () => glossary, level: () => 'pro' }))).toEqual([GLOSSARY_SCREEN_ID]);
  });
});

describe('text ids', () => {
  it('every string id is unique across the new screens and non-empty', () => {
    const ids = [...workTextIds(), ...dlTextIds(), ...glTextIds()];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
