// Item 7 free agency screen: renders in the shell frame for team.free_agency; shows the phase, cap room and
// roster; grades are the staff's (MA-48); offers and tenders follow the power arrangement (L5.2.1); an
// illegal call is shown with its warning; a hostile agent's block is shown in place of the call.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { FREE_AGENCY_SCREEN_ID, FreeAgencyScreen, freeAgencyRoute, ft, money, type FreeAgencyUi, type Tab, type UiMarketRow } from '../../../src/screens/free-agency/index.ts';

const row = (personId: number, over: Partial<UiMarketRow> = {}): UiMarketRow => ({
  personId, name: `Player ${personId}`, position: 'CB', age: 27, priorClubName: 'Carver', cls: 'unrestricted', rights: 'any_club', rightsReason: 'unrestricted (CBA Art. 9 s.1(a))',
  canSign: true, offerSheet: false, tenderLevel: null,
  grade: { state: 'graded', text: '6.4 (good look), pro scout, graded 30 looks', label: '6.4', confidence: 'good look', bandText: '6.1 to 6.7', grader: 'pro scout', n: 30, asOf: { seasonYear: 2026, dayIndex: 10 } },
  askYears: 3, askApyCents: { low: 800_000_000, mid: 1_000_000_000, high: 1_200_000_000 }, askGuaranteeCents: { low: 1_000_000_000, mid: 1_500_000_000, high: 2_000_000_000 },
  publicSuitors: 3, saysHeWants: 'role', agentName: 'R. Vance', agentStance: 'neutral', offer: null, agentRead: null,
  call: { legal: true, reason: 'free agent the club may sign', usesWindowCall: false, blockedByAgent: false }, ...over,
});

function view(over: Partial<FreeAgencyUi> = {}): FreeAgencyUi {
  return {
    clubId: 7, authority: { field: 'final_say_contracts', authority: 'decide', holder: 'head_coach' }, phase: 'open', firstWave: true, mayExecute: true,
    capRoomCents: 3_000_000_000, committedCents: 900_000_000, roomAfterOffersCents: 2_100_000_000, rosterCount: 70, rosterLimit: 90, windowCallsUsed: 0, windowCalls: 2,
    market: [
      row(501, { offer: { years: 3, apyCents: 900_000_000, guaranteedCents: 1_200_000_000, status: 'open' }, agentRead: 'talking' }),
      row(502, { grade: { state: 'unwatched' }, agentStance: 'hostile', agentName: 'K. Rhee', saysHeWants: null, call: { legal: true, reason: 'x', usesWindowCall: false, blockedByAgent: true } }),
      row(503, { cls: 'restricted', rights: 'offer_sheet', offerSheet: true, canSign: false }),
    ],
    own: [{
      personId: 601, name: 'Own Player', position: 'LB', age: 25, cls: 'restricted', grade: { state: 'unwatched' }, tender: null, askYears: 2, askApyCents: { low: 200_000_000, mid: 300_000_000, high: 400_000_000 },
      tenders: [{ level: 'second_round', salaryCents: 470_000_000, ok: true, reason: null }, { level: 'erfa', salaryCents: null, ok: false, reason: 'player 601 is not an exclusive rights player' }],
      tags: [{ kind: 'transition', ok: false, reason: 'league rule: outside the tag window' }],
    }],
    tagsUsed: 0, ...over,
  };
}

const html = (v: FreeAgencyUi | null, tab: Tab = 'market', readOnly = false) =>
  renderToStaticMarkup(createElement(FreeAgencyScreen, { view: v, tab, readOnly, onTab: () => {}, onIntent: () => {} }));
const esc = (x: string) => x.replace(/'/g, '&#x27;');

describe('free agency screen (M5, C8, L7)', () => {
  it('is registered and its route entry renders in the shell frame', () => {
    expect(SCREENS.some((s) => s.id === FREE_AGENCY_SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/team/free-agency', routes: { [FREE_AGENCY_SCREEN_ID]: freeAgencyRoute({ view: () => view(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${FREE_AGENCY_SCREEN_ID}"`);
    expect(out).toContain('data-counter="cap"');
  });

  it('shows the phase, cap room after offers, roster and window calls', () => {
    const out = html(view());
    expect(out).toContain(ft('fa.phase.open'));
    expect(out).toContain(ft('fa.cap.after', { after: '$21.0M' }));
    expect(out).toContain(ft('fa.roster', { count: 70, limit: 90 }));
    expect(out).toContain(ft('fa.calls', { used: 0, calls: 2 }));
    expect(money(50_000_000)).toBe('$500K');
  });

  it('grades are the staff\'s, unwatched shows none; the ask and the agent\'s read show', () => {
    const out = html(view());
    expect(out).toContain('graded 30 looks');
    expect(out).toContain(`data-grade="unwatched">${ft('fa.grade.unwatched')}`);
    expect(out).toContain(ft('fa.ask.line', { years: 3, low: '$8.0M', high: '$12.0M' }));
    expect(out).toContain(esc(ft('fa.read.talking')));
    expect(out).toContain(ft('fa.rights.offerSheet'));
  });

  it('with final say: make offer buttons; without: ask to offer; delegated: none', () => {
    expect(html(view())).toContain(ft('fa.offer.make', { name: 'Player 501' }));
    const advise = html(view({ authority: { field: 'final_say_contracts', authority: 'advise', holder: 'general_manager' } }));
    expect(advise).toContain(ft('fa.offer.ask', { name: 'Player 501' }));
    expect(advise).toContain(ft('fa.authority.advise.general_manager'));
    expect(html(view({ authority: { field: 'final_say_contracts', authority: 'delegated', holder: 'head_coach' } }))).not.toContain(ft('fa.offer.make', { name: 'Player 501' }));
    expect(html(view({ phase: 'before_window' }))).not.toContain(ft('fa.offer.make', { name: 'Player 501' }));
  });

  it('the call: pitch choices, the agent\'s block, and an illegal call shown with its warning', () => {
    const out = html(view());
    expect(out).toContain(ft('fa.call.pitch', { emphasis: ft('fa.want.role') }));
    expect(out).toContain(ft('fa.call.blocked'));
    const illegal = html(view({ market: [row(501, { call: { legal: false, reason: 'head coach in negotiating-window contact', usesWindowCall: false, blockedByAgent: false } })] }));
    expect(illegal).toContain(ft('fa.call.illegal', { reason: 'head coach in negotiating-window contact' }));
    expect(illegal).toContain(ft('fa.call.button', { name: 'Player 501' }));
  });

  it('own players: legal tenders are buttons with salary; others say why; tags likewise', () => {
    const out = html(view(), 'own');
    expect(out).toContain(ft('fa.own.tender', { level: ft('fa.level.second_round'), salary: '$4.7M' }));
    expect(out).toContain(ft('fa.own.tenderNo', { level: ft('fa.level.erfa'), reason: 'player 601 is not an exclusive rights player' }));
    expect(out).toContain(ft('fa.own.tagNo', { kind: ft('fa.tag.transition'), reason: 'league rule: outside the tag window' }));
    expect(html(view({ authority: { field: 'final_say_contracts', authority: 'advise', holder: 'owner' } }), 'own')).toContain(ft('fa.own.askTender', { level: ft('fa.level.second_round'), salary: '$4.7M' }));
  });

  it('read-only shows no actions, and no string id leaks', () => {
    const ro = html(view(), 'market', true);
    expect(ro).not.toContain(ft('fa.offer.make', { name: 'Player 501' }));
    expect(ro).not.toContain(ft('fa.call.button', { name: 'Player 501' }));
    expect(html(view())).not.toMatch(/>fa\.[a-z]/);
    expect(html(view(), 'own')).not.toMatch(/fa\.[a-z_]+\.[a-z_]+/);
  });
});
