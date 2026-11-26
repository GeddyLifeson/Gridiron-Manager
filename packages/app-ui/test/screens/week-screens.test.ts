// Week screens (item 9): meetings (H4), travel (H8), documents (H9) and the media screen's press
// conference (O4.5.2, H7.2.1). Models are built by hand in the read models' shapes (app-ui reads only
// app-services' public entry). Every control is a button, so each screen works by keyboard alone.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MeetingsScreen, meetingsRoute, TravelScreen, travelRoute, DocumentsScreen, documentsRoute,
  type MeetingsScreenView, type TravelScreenView, type DocumentsScreenView,
} from '../../src/screens/week/index.ts';
import { PressConference, pressRoute, type PressScreenView } from '../../src/screens/media/index.ts';

const meeting = (over: Partial<MeetingsScreenView['days'][number]['meetings'][number]> = {}) => ({
  blockId: 'm1', type: 'team', start: '08:00', minutes: 60, leader: 'head_coach', attendees: ['team'], editable: true, done: false,
  defaultAgenda: false, planned: 70, left: -10, itemKinds: ['theme', 'corrections', 'break'], tone: null, tones: [], report: null,
  agenda: [
    { n: 1, kind: 'theme', label: 'Ball security', minutes: 10, runMinutes: 10, warnings: [] },
    { n: 2, kind: 'corrections', label: 'Last game', minutes: 60, runMinutes: 70, warnings: ['long_stretch'] },
  ],
  ...over,
});
const meetings: MeetingsScreenView = {
  weekId: 'w1', longStretchMinutes: 40,
  days: [
    { date: '2026-09-07', label: 'G-6', totalMinutes: 250, capMinutes: 240, overCap: true, meetings: [meeting(), meeting({ blockId: 'm2', type: 'unit', leader: 'off_coordinator', editable: false, defaultAgenda: true, agenda: [], planned: 45, left: 0 })] },
    { date: '2026-09-12', label: 'G-1', totalMinutes: 30, capMinutes: 240, overCap: false, meetings: [meeting({ blockId: 'nb', type: 'night_before', tones: ['calm', 'urgent', 'confident', 'challenging'], tone: 'calm', itemKinds: ['keys'], agenda: [], planned: 0, left: 30, report: 'Locked in; one question about the wind.' })] },
    { date: '2026-09-08', label: 'G-5', totalMinutes: 0, capMinutes: 240, overCap: false, meetings: [] },
  ],
};

describe('meetings screen (H4)', () => {
  const sent: unknown[] = [];
  const html = renderToStaticMarkup(createElement(MeetingsScreen, { model: meetings, onCommand: (c) => sent.push(c) }));
  it('shows each meeting with its type, and whether the user leads it or reviews the leader\'s plan', () => {
    expect(html).toContain('Team meeting');
    expect(html).toContain('Unit meeting');
    expect(html).toContain('You lead');
    expect(html).toContain('Leader&#x27;s plan for review');
    expect(html).toContain('Runs the leader&#x27;s default agenda');
  });
  it('marks long stretches, overruns and the day total against the cap, with no attention value', () => {
    expect(html).toContain('long stretch without a break');
    expect(html).toContain('over the block by 10');
    expect(html).toContain('Player meeting time today: 250 of 240 minutes');
    expect(html).toContain('No meetings this day.');
    expect(html.toLowerCase()).not.toContain('attention');
  });
  it('the night-before meeting offers the four tones and shows the leader\'s report', () => {
    expect(html).toContain('Tone of your message');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Challenging');
    expect(html).toContain('one question about the wind');
  });
  it('add buttons appear only where the user leads', () => {
    expect(html.match(/data-kind="theme"/g)?.length).toBe(1);
  });
  it('the route renders only with a model', () => {
    expect(meetingsRoute(() => meetings).render({} as never)).not.toBeNull();
    expect(meetingsRoute(() => null).render({} as never)).toBeNull();
  });
});

const travel: TravelScreenView = {
  weekId: 'w2', home: false, gameId: 'g2', thursdayOnlyStandard: false, altitude: true,
  options: [
    { plan: 'standard', isDefault: false, chosen: false, mode: 'air', departs: '2026-09-12 13:00', arrives: '2026-09-12 19:30', returns: '2026-09-13 17:30', nightsAway: 1, practicesLost: 0, practiceMinutesLost: 0, meetingMinutesLost: 0, blocksMoved: 2, bodyKickoff: '10:00', earlyBodyTime: true },
    { plan: 'early', isDefault: true, chosen: true, mode: 'air', departs: '2026-09-11 17:30', arrives: '2026-09-12 00:00', returns: '2026-09-13 17:30', nightsAway: 2, practicesLost: 1, practiceMinutesLost: 90, meetingMinutesLost: 30, blocksMoved: 3, bodyKickoff: '10:00', earlyBodyTime: true },
  ],
  travelDay: { date: '2026-09-11', blocks: [{ id: 't1', type: 'travel', start: '17:30', minutes: 390, location: 'transit' }] },
};

describe('travel screen (H8)', () => {
  const html = renderToStaticMarkup(createElement(TravelScreen, { model: travel }));
  it('lists each plan with what it changes, the body time of kickoff and the altitude flag', () => {
    expect(html.match(/data-plan=/g)?.length).toBe(2);
    expect(html).toContain('Practices lost: 1 (90 minutes). Meeting time lost: 30 minutes.');
    expect(html).toContain('Nights away: 2');
    expect(html).toContain('Kickoff is at 10:00 body time');
    expect(html).toContain('High altitude site');
    expect(html).toContain('(default)');
    expect(html).toContain('Travel day 2026-09-11');
  });
  it('a home week says so; the route renders only with a model', () => {
    expect(renderToStaticMarkup(createElement(TravelScreen, { model: { ...travel, home: true, options: [], travelDay: null } }))).toContain('Home game');
    expect(travelRoute(() => null).render({} as never)).toBeNull();
  });
});

const docs: DocumentsScreenView = {
  weekId: 'w1', detail: 'all', hidden: 0,
  rows: [
    { id: 'd1', type: 'players_packet', leaf: 'H4.4.3', state: 'in_review', author: 'position_coaches', reviewer: 'head_coach', due: '2026-09-09 08:00', recipients: ['players'], playersSee: true, late: true, sentBack: false, version: 1, hours: 32, actions: ['review', 'approve', 'send_back'] },
    { id: 'd2', type: 'call_sheet', leaf: 'G7', state: 'draft', author: 'play_caller', reviewer: null, due: '2026-09-12 18:00', recipients: ['callers', 'quarterbacks'], playersSee: false, late: false, sentBack: true, version: 2, hours: 4, actions: ['assign', 'write', 'review'] },
  ],
  workload: [{ author: 'position_coaches', assigned: 32, available: 20, over: true }, { author: 'play_caller', assigned: 4, available: null, over: false }],
};

describe('documents screen (H9)', () => {
  const html = renderToStaticMarkup(createElement(DocumentsScreen, { model: docs }));
  it('lists state, author, due time, recipients and actions', () => {
    expect(html).toContain('players packet');
    expect(html).toContain('in review');
    expect(html).toContain('2026-09-09 08:00');
    expect(html).toContain('callers, quarterbacks');
    expect(html).toContain('Send back');
    expect(html).toContain('Write it yourself');
    expect(html).toContain('late');
    expect(html).toContain('sent back');
    expect(html).toContain('call sheet v2');
  });
  it('shows workload bars and flags an author over capacity', () => {
    expect(html).toContain('32 of 20 hours');
    expect(html).toContain('over capacity');
    expect(html).toContain('4 hours assigned');
  });
  it('the exceptions view says how many are hidden; the route renders only with a model', () => {
    expect(renderToStaticMarkup(createElement(DocumentsScreen, { model: { ...docs, detail: 'exceptions', hidden: 9 } }))).toContain('9 on time and not shown');
    expect(documentsRoute(() => null).render({} as never)).toBeNull();
  });
});

const pressModel: PressScreenView = {
  sessions: [{ blockId: 's1', session: 'day_after', date: '2026-09-14', start: '12:00', minutes: 20, done: true }, { blockId: 's2', session: 'mid_week', date: '2026-09-16', start: '12:00', minutes: 15, done: false }],
  live: {
    kind: 'midweek', speaker: 'head_coach', asked: 3, target: 15, timeLimitSeconds: 30, done: false, headline: null,
    current: { n: 3, text: 'Why did you go for it on fourth and two?', outlet: 'analytics', followUp: true },
    choices: [{ id: 'take_blame', violation: false }, { id: 'blame_unit_or_staff', violation: false }, { id: 'bland', violation: false }],
    history: [{ n: 1, text: 'Who starts at quarterback?', outlet: 'local_paper', choice: 'answer_straight', timedOut: false }, { n: 2, text: 'How is Smith?', outlet: 'national', choice: 'refer_to_report', timedOut: true }],
  },
};

describe('press conference (O4.5.2, H7.2.1)', () => {
  const html = renderToStaticMarkup(createElement(PressConference, { model: pressModel, clock: false }));
  it('lists this week\'s sessions with times', () => {
    expect(html).toContain('2026-09-16 12:00 Midweek (15m)');
    expect(html).toContain('Day after the game');
  });
  it('shows the question, who asks it, progress, the time limit and stance answers with no numbers', () => {
    expect(html).toContain('Why did you go for it on fourth and two?');
    expect(html).toContain('Question 3 of 15');
    expect(html).toContain('Analytics writer');
    expect(html).toContain('follow-up');
    expect(html).toContain('30 seconds to answer');
    expect(html).toContain('Take the blame yourself');
    expect(html).toContain('Say nothing useful');
    expect(html).toContain('Standard coach-speak for the rest');
    const answers = [...html.matchAll(/data-choice="[^"]+"[^>]*>([^<]*)</g)].map((x) => x[1]!);
    expect(answers.length).toBe(3);
    for (const a of answers) expect(a).not.toMatch(/\d/);
  });
  it('shows what was asked and answered, including a timed-out answer', () => {
    expect(html).toContain('Refer to the injury report, time ran out');
  });
  it('marks an answer that breaks an association rule', () => {
    const live = { ...pressModel.live!, choices: [{ id: 'bland', violation: false }, { id: 'name_recruit', violation: true }] };
    expect(renderToStaticMarkup(createElement(PressConference, { model: { ...pressModel, live }, clock: false }))).toContain('breaks an association rule');
  });
  it('after the session shows the headline; between sessions says so', () => {
    const done = { ...pressModel.live!, current: null, choices: [], done: true, headline: { choice: 'shot_at_opponent', topicId: 'opponent_preview' } };
    const h2 = renderToStaticMarkup(createElement(PressConference, { model: { ...pressModel, live: done }, clock: false }));
    expect(h2).toContain('The headline: coach fires at the opponent on opponent preview');
    expect(h2).toContain('The session is over.');
    expect(renderToStaticMarkup(createElement(PressConference, { model: { ...pressModel, live: null } }))).toContain('No session in the room');
    expect(pressRoute(() => null).render({} as never)).toBeNull();
  });
});
