// G-72 people and office screens: render from read-model data, show estimates and words only, every action
// a keyboard-reachable button, and every route id a registry screen.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CoachCardScreen, LockerRoomScreen, OwnerScreen, PlayerCardScreen, RosterScreen, StaffScreen, peopleRoutes, toPath, ppTextIds, pt, PEOPLE_SCREEN_IDS,
  CARD_TABS, type UiCard, type UiCoachCard, type UiLockerRoom, type UiOwner, type UiRoster, type UiStaff,
} from '../../src/screens/people/index.ts';
import { TodayScreen, AdvancePanel, InboxList, homeRoutes, HOME_SCREEN_IDS, ofTextIds, type UiHome } from '../../src/screens/home/index.ts';
import { screenById } from '../../src/shell/index.ts';

const d = (dayIndex: number) => ({ seasonYear: 2030, dayIndex });
const noop = () => {};

const card: UiCard = {
  personId: 101, clubId: 3, ownPlayer: true,
  header: { name: 'First101 Last101', jersey: 1, position: 'QB', altPositions: [], age: 21, heightIn: 74, weightLb: 215, experience: 0, status: 'active', contract: { years: 1, throughYear: 2030, thisYearCents: 90000000 }, designed: false, imported: false },
  grades: [
    { state: 'graded', attribute: 'arm_strength', text: '7.1 (thin look), your staff, graded 6 looks', label: '7.1', confidence: 'thin look', bandText: '6.4 to 7.8', grader: 'your staff', n: 6, asOf: d(9) },
    { state: 'unwatched', attribute: 'accuracy_deep', text: 'not watched' },
  ],
  gradesNoteKey: 'card.grades.collegeAndCampOnly',
  measured: [{ key: 'fortyS', value: 4.62, unit: 's' }],
  knowledge: [{ conceptId: 'core:mesh', word: 'learning', lastPractised: d(9), mentalErrors: [], readyThisWeek: true }],
  health: {
    current: [{ injuryId: 1, typeId: 'core:hamstring', bodyRegion: 'leg', designation: 'questionable', returnDays: [7, 21], status: 'active', occurred: d(5) }], history: [],
    medical: { clearance: 'cleared_with_limits', limits: ['limit.no_contact'], reinjuryRiskKey: 'risk.moderate', loadBandKey: 'load.high' },
  },
  person: {
    rolePromisedKey: 'role.starter', roleGivenKey: 'role.backup', morale: { textKey: 'morale.unsettled', trend: 'down', reasons: [{ textKey: 'reason.lost_role', eventId: 500 }] },
    trust: null, respect: null, openPromises: [{ promiseId: 4, subjectKey: 'promise.start', due: d(30) }], personality: [], standingKey: 'standing.follower', meetings: [], offField: [],
  },
  notes: [{ date: d(9), textKey: 'note.footwork', byStaffId: 9 }],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (el: (p: any) => unknown, props: Record<string, unknown>) => renderToStaticMarkup(createElement(el as never, props as never));

describe('player card screen (O4.1)', () => {
  it('renders every tab; an unwatched attribute shows no number (MA-48)', () => {
    for (const tab of CARD_TABS) expect(render(PlayerCardScreen, { view: card, tab, readOnly: false, onTab: noop, onIntent: noop })).toContain('First101 Last101');
    const g = render(PlayerCardScreen, { view: card, tab: 'grades', readOnly: false, onTab: noop, onIntent: noop });
    expect(g).toContain('7.1 (thin look), your staff');
    expect(g).toMatch(/data-grade="accuracy_deep" data-state="unwatched"><th scope="row">accuracy_deep<\/th><td>not evaluated<\/td>/);
    expect(g).toContain('College and camp evaluation only.');
    expect(g).toContain('fortyS: 4.62 s');
  });
  it('health tab: clearance is a fact with no control; the return range has two bounds (O4.1.4)', () => {
    const h = render(PlayerCardScreen, { view: card, tab: 'health', readOnly: false, onTab: noop, onIntent: noop });
    expect(h).toContain('cleared with limits (set by the medical staff)');
    expect(h).toContain('back in 7 to 21 days');
    expect(h).not.toMatch(/<input|<select/);
  });
  it('person tab shows reads in words with the reasons the coach saw', () => {
    const p = render(PlayerCardScreen, { view: card, tab: 'person', readOnly: false, onTab: noop, onIntent: noop });
    expect(p).toContain('morale.unsettled (falling)');
    expect(p).toContain('data-event="500"');
    expect(p).toContain('Schedule a meeting');
  });
  it('the header shows the contract line and the imported or designed mark', () => {
    const h = render(PlayerCardScreen, { view: { ...card, header: { ...card.header, imported: true } }, tab: 'overview', readOnly: true, onTab: noop, onIntent: noop });
    expect(h).toContain('1-year contract through 2030');
    expect(h).toContain('data-mark="imported"');
  });
});

describe('roster, staff, coach card, locker room and owner screens (O4.2.1 to O4.5.1)', () => {
  it('roster counters show count against limit', () => {
    const r: UiRoster = {
      clubId: 3, lists: ['active', 'practice_squad'], rows: [{ personId: 101, name: 'A B', position: 'QB', list: 'active', jersey: 1, age: 21, experience: 0, designation: null }],
      limits: [{ list: 'active', limit: 53, count: 54, over: true }, { list: 'practice_squad', limit: 16, count: 0, over: false }],
      subtotals: [{ position: 'QB', count: 1, planned: 3 }], requests: [{ requestId: 1, moveKey: 'move.sign', personId: 9, state: 'refused', reasonKey: 'reason.cap' }],
    };
    const h = render(RosterScreen, { view: r, onIntent: noop });
    expect(h).toContain('active: 54 of 53 (over the limit)');
    expect(h).toContain('QB: 1 (plan 3)');
    expect(h).toContain('move.sign: refused · reason.cap');
  });
  it('staff chart nests seats under who they report to; a vacant seat says who covers it', () => {
    const s: UiStaff = { clubId: 3, seats: [
      { jobId: 20, catalogueId: 'core:pro_hc', rung: 9, reportsToJobId: null, holderPersonId: 1, holderName: 'Coach1 Last1', holding: 'permanent', coveringPersonId: null, coverCostKey: null },
      { jobId: 21, catalogueId: 'core:pro_qb_coach', rung: 5, reportsToJobId: 20, holderPersonId: null, holderName: null, holding: 'permanent', coveringPersonId: 2, coverCostKey: null },
    ] };
    const h = render(StaffScreen, { view: s, onIntent: noop });
    expect(h).toMatch(/data-seat="20">.*<ul><li data-seat="21">/);
    expect(h).toContain('Vacant, covered by #2');
  });
  it('coach card shows the record with its sample, or no book', () => {
    const c: UiCoachCard = {
      personId: 2, name: 'Coach2 Last2', catalogueId: 'core:pro_qb_coach', positionGroupTaught: 'QB', systems: [{ familyId: 'core:west_coast', seasons: 2 }], background: [],
      record: [{ key: 'fourth_down', eventIds: [902, 903], labelKey: null }], noBook: false, relationship: null, ambitionKeys: [], contract: null, proposals: [],
    };
    expect(render(CoachCardScreen, { view: c, readOnly: false, onIntent: noop })).toContain('fourth_down: 2 times');
    expect(render(CoachCardScreen, { view: { ...c, record: [], noBook: true }, readOnly: false, onIntent: noop })).toContain('No book on him yet.');
  });
  it('locker room shows each issue with its source and the lost-room banner', () => {
    const l: UiLockerRoom = {
      clubId: 3, groups: [{ kind: 'leaders', leaderId: 101, memberIds: [101] }], culture: null, buyIn: null,
      issues: [{ issueId: 1, kindKey: 'issue.role', personIds: [102], sourcePersonId: 2, sourceKey: 'source.position_coach', reportedOn: d(9), responseLinks: ['people.meeting'] }],
      lostRoom: { causeKeys: ['cause.promises'] },
    };
    const h = render(LockerRoomScreen, { view: l, onIntent: noop });
    expect(h).toContain('role="alert" data-lost-room');
    expect(h).toContain('source.position_coach (#2)');
  });
  it('owner view shows confidence in words and the general manager\'s stated reason', () => {
    const o: UiOwner = {
      clubId: 3, owner: { personId: 50, name: 'P50 L50', goalKeys: ['goal.playoffs'], confidence: { textKey: 'confidence.uneasy', trend: 'down', reasons: [] }, comments: [], nextMeeting: d(14) },
      gm: { personId: 2, name: 'G M', relationship: null, say: [{ moveKey: 'move.sign', holderKey: 'general_manager' }], requests: [{ requestId: 1, moveKey: 'move.sign', phaseKey: 'phase.in_season', state: 'refused', reasonKey: 'reason.cap' }], upcoming: [] },
    };
    const h = render(OwnerScreen, { view: o, readOnly: false, onIntent: noop });
    expect(h).toContain('confidence.uneasy (falling)');
    expect(h).toContain('His reason: reason.cap');
    expect(h).toContain('move.sign: the general manager');
  });
});

const home: UiHome = {
  personId: 1,
  today: {
    date: d(0), phaseKey: 'phase.regular_season', dayLabelKey: 'day.wednesday', daysToGame: 4, opponent: { teamId: 5, name: 'Town 5' }, mode: 'normal',
    blocks: [
      { blockId: 'b1', labelKey: 'block.staff', startMinute: 480, minutes: 60, runBy: 'coach', coachMinutes: 60, delegateName: null, delegateNoteKey: null, requiredByRule: false, screenId: null },
      { blockId: 'b3', labelKey: 'block.st', startMinute: 600, minutes: 45, runBy: 'delegate', coachMinutes: null, delegateName: 'Coach2 Last2', delegateNoteKey: 'record.ok', requiredByRule: false, screenId: 'week.schedule' },
    ],
    nextEvent: null, minutesLeftThisWeek: 3403, energyKey: 'energy.fresh',
  },
  inbox: [
    { itemId: 12, weight: 'must', senderId: 50, senderName: 'P50 L50', subjectKey: 'subject.owner', deadline: d(2), answerCommand: 'AnswerOwner', defaultCommand: null, links: [], unread: true, answerMinutes: 30, conflictsWith: [] },
    { itemId: 15, weight: 'note', senderId: null, senderName: null, subjectKey: 'subject.note', deadline: null, answerCommand: null, defaultCommand: null, links: [], unread: true, answerMinutes: null, conflictsWith: [] },
  ],
  advance: [
    { target: 'end_of_day', to: { date: d(0), minute: 1320 }, blockedBy: [], runsWithout: [{ blockId: 'b3', labelKey: 'block.st', date: d(0), byName: 'Coach2 Last2' }] },
    { target: 'game_day', to: { date: d(4), minute: 0 }, blockedBy: [12], runsWithout: [] },
  ],
};

describe('office screens (O1.2)', () => {
  it('today shows the blocks with hour cost or delegate, the inbox and the hours left', () => {
    const h = render(TodayScreen, { view: home, readOnly: false, onIntent: noop });
    expect(h).toContain('08:00 block.staff · you, 1 h 0 min');
    expect(h).toContain('run by Coach2 Last2: record.ok');
    expect(h).toContain('Hours left this week: 56 h 43 min');
    expect(h).toContain('4 days to Town 5');
    expect(h.indexOf('data-item="12"')).toBeLessThan(h.indexOf('data-item="15"'));
  });
  it('the inbox marks weight, cost and sender; the advance past a must item is disabled', () => {
    expect(render(InboxList, { view: home, readOnly: false, onIntent: noop })).toContain('[must]</span> subject.owner · from P50 L50 · due 2030 day 2 · answering costs 0 h 30 min');
    const a = render(AdvancePanel, { view: home, readOnly: false, onIntent: noop });
    expect(a).toMatch(/data-target="game_day"[^>]*><button type="button" disabled=""/);
    expect(a).toContain('Answer first: 12');
    expect(a).toContain('block.st (2030 day 0), Coach2 Last2');
  });
});

describe('routes and strings', () => {
  it('every route id is a registry screen and every string id resolves', () => {
    const host = { card: () => card, roster: () => null, staff: () => null, coach: () => null, lockerRoom: () => null, owner: () => null, dispatch: noop };
    for (const id of [...Object.keys(peopleRoutes(host)), ...Object.keys(homeRoutes({ view: () => home, dispatch: noop }))]) expect(screenById(id)?.id).toBe(id);
    expect(Object.values(PEOPLE_SCREEN_IDS).length + Object.values(HOME_SCREEN_IDS).length).toBe(9);
    for (const id of ppTextIds()) expect(pt(id)).not.toBe('');
    expect(ofTextIds().length).toBeGreaterThan(10);
    expect(toPath('team.health')).toBe('/team/health');
    expect(toPath('team.player')).toBeNull();
  });
  it('every action is a button or a labelled input (keyboard reachable, no click-only elements)', () => {
    const all = [
      ...CARD_TABS.map((tab) => render(PlayerCardScreen, { view: card, tab, readOnly: false, onTab: noop, onIntent: noop })),
      render(TodayScreen, { view: home, readOnly: false, onIntent: noop }), render(AdvancePanel, { view: home, readOnly: false, onIntent: noop }),
    ].join('');
    expect(all).not.toMatch(/<(div|span|li|td|tr)[^>]*onclick/i);
    expect((all.match(/<button/g) ?? []).length).toBeGreaterThan(10);
  });
});
