// Item 7 draft room screen: renders in the shell frame for team.draft; the clock shows and has no pause; the
// board strikes taken players and shows only assigned grades (MA-48); actions follow the power arrangement
// (L5.2.1): pick with final say, mention/recommend/insist without it, nothing while delegated.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { clockText, draftRoomRoute, DraftRoomScreen, drTextIds, dt, DRAFT_ROOM_SCREEN_ID, type DraftRoomUi, type Tab } from '../../../src/screens/draft-room/index.ts';

function view(over: Partial<DraftRoomUi> = {}): DraftRoomUi {
  return {
    clubId: 2, year: 2027, authority: { field: 'final_say_draft', authority: 'decide', holder: 'head_coach' },
    clock: { overall: 2, round: 1, inRound: 2, kind: 'regular', clubId: 2, clubName: 'Bellport', userOnClock: true, secondsLeft: 425, limitSec: 480, day: 1 },
    waitingForDay: null, complete: false, userExpired: false,
    board: [
      { rank: 1, personId: 1003, name: 'Prospect 1003', position: 'OT', school: 'State', grade: { state: 'graded', text: '6.3 (fair look), area scout, graded 12 looks', label: '6.3', confidence: 'fair look', bandText: '5.9 to 6.7', grader: 'area scout', n: 12, asOf: { seasonYear: 2027, dayIndex: 40 } }, potential: { text: 'I think there is more in him.', evaluator: 'area scout' }, consensusRank: 4, taken: { overall: 1, clubId: 1, clubName: 'Ashford' } },
      { rank: 2, personId: 1000, name: 'Prospect 1000', position: 'CB', school: null, grade: { state: 'graded', text: '6.0 (fair look), area scout, graded 12 looks', label: '6.0', confidence: 'fair look', bandText: '5.6 to 6.4', grader: 'area scout', n: 12, asOf: { seasonYear: 2027, dayIndex: 40 } }, potential: null, consensusRank: 1, taken: null },
      { rank: 3, personId: 1004, name: 'Prospect 1004', position: 'WR', school: null, grade: { state: 'unwatched' }, potential: null, consensusRank: 5, taken: null },
    ],
    lean: [{ personId: 1000, name: 'Prospect 1000', position: 'CB' }, { personId: 1004, name: 'Prospect 1004', position: 'WR' }],
    picks: [{ overall: 1, round: 1, inRound: 1, clubId: 1, clubName: 'Ashford', personId: 1003, name: 'Prospect 1003', position: 'OT', late: false, mine: false }],
    held: [{ pickId: '2027-1-2', year: 2027, round: 1, overall: 2, kind: 'regular', status: 'open', fromClubName: null, locked: false }, { pickId: '2028-1-2', year: 2028, round: 1, overall: null, kind: 'regular', status: 'open', fromClubName: null, locked: false }],
    needs: [{ position: 'OT', word: 'high', frame: 'now', coachAsked: true }],
    offers: [{ id: 'o1', withClubId: 3, withClubName: 'Carver', give: [{ pickId: '2027-1-2', year: 2027, round: 1, overall: 2 }], get: [{ pickId: '2027-1-3', year: 2027, round: 1, overall: 3 }, { pickId: '2028-2-3', year: 2028, round: 2, overall: null }], giveTotal: 2900, getTotal: 4200, personnelLean: 'take', beforeClockEnds: true }],
    ticker: [{ seq: 3, atSec: 55, kind: 'pick', clubName: 'Ashford', overall: 1, personName: 'Prospect 1003', withClubName: null }],
    log: [], stance: null, insistsMade: 0, nextInsist: 'full',
    ...over,
  };
}

const html = (v: DraftRoomUi | null, tab: Tab = 'board', readOnly = false) =>
  renderToStaticMarkup(createElement(DraftRoomScreen, { view: v, tab, readOnly, onTab: () => {}, onIntent: () => {} }));

describe('draft room screen (C7.3.1, M4.5.1, C7.5.1)', () => {
  it('is registered and its route entry renders in the shell frame', () => {
    expect(SCREENS.some((s) => s.id === DRAFT_ROOM_SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/team/draft', routes: { [DRAFT_ROOM_SCREEN_ID]: draftRoomRoute({ view: () => view(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${DRAFT_ROOM_SCREEN_ID}"`);
    expect(out).toContain('role="timer"');
  });

  it('shows the running clock and no pause control', () => {
    const out = html(view());
    expect(out).toContain(dt('dr.clock.left', { time: '7:05' }));
    expect(out).toContain(dt('dr.clock.you'));
    expect(out.toLowerCase()).not.toContain('pause');
    expect(clockText(59)).toBe('0:59');
  });

  it('strikes taken players and shows only assigned grades', () => {
    const out = html(view());
    expect(out).toContain('<s>OT Prospect 1003</s>');
    expect(out).toContain(dt('dr.board.taken', { club: 'Ashford', overall: 1 }));
    expect(out).toContain('graded 12 looks');
    expect(out).toContain(`data-grade="unwatched">${dt('dr.board.unwatched')}`);
  });

  it('with final say on the clock: a pick button for each available player, none for taken ones', () => {
    const out = html(view());
    expect(out).toContain(dt('dr.board.pick', { name: 'Prospect 1000' }));
    expect(out).not.toContain(dt('dr.board.pick', { name: 'Prospect 1003' }));
    expect(out).toContain(dt('dr.authority.decide'));
  });

  it('without final say: voice buttons, the general manager speaks, no pick button', () => {
    const out = html(view({ authority: { field: 'final_say_draft', authority: 'advise', holder: 'general_manager' } }));
    expect(out).toContain(dt('dr.board.insist', { name: 'Prospect 1000' }));
    expect(out).not.toContain(dt('dr.board.pick', { name: 'Prospect 1000' }));
    expect(out).toContain(dt('dr.authority.advise.general_manager'));
    expect(out).toContain(dt('dr.lean.back'));
    expect(out).toContain(dt('dr.insist.full', { count: 0 }));
  });

  it('delegated and read-only seats get no action buttons', () => {
    expect(html(view({ authority: { field: 'final_say_draft', authority: 'delegated', holder: 'head_coach' } }))).not.toContain(dt('dr.board.pick', { name: 'Prospect 1000' }));
    expect(html(view(), 'board', true)).not.toContain('<button type="button">Pick');
  });

  it('offer cards show both chart totals and the clock warning; buttons follow authority', () => {
    const out = html(view(), 'offers');
    expect(out).toContain(dt('dr.offers.totals', { give: 2900, get: 4200 }));
    expect(out).toContain(dt('dr.offers.get', { picks: '#3, 2028 R2' }));
    expect(out).toContain(dt('dr.offers.clock'));
    expect(out).toContain(dt('dr.offers.take'));
    expect(html(view({ authority: { field: 'final_say_draft', authority: 'advise', holder: 'owner' } }), 'offers')).toContain(dt('dr.offers.askTake'));
  });

  it('the picks tab lists held picks and picks so far; needs and wire are words', () => {
    const out = html(view(), 'picks');
    expect(out).toContain(dt('dr.held.future', { year: 2028, round: 1 }));
    expect(out).toContain(dt('dr.picks.line', { overall: 1, club: 'Ashford', name: 'Prospect 1003', position: 'OT' }));
    expect(out).toContain(dt('dr.needs.high'));
    expect(out).toContain(dt('dr.ticker.pick', { club: 'Ashford', person: 'Prospect 1003', overall: 1 }));
  });

  it('potential is words with who wrote them, never a number', () => {
    expect(html(view())).toContain(dt('dr.board.potentialBy', { text: 'I think there is more in him.', evaluator: 'area scout' }));
  });

  it('every string id used by the screen exists', () => {
    expect(drTextIds().length).toBeGreaterThan(50);
    expect(html(view(), 'board')).not.toMatch(/dr\.[a-z]+\.[a-z_.]+/);
    expect(html(view({ authority: { field: 'final_say_draft', authority: 'advise', holder: 'general_manager' } }), 'picks')).not.toMatch(/>dr\.[a-z]/);
  });
});
