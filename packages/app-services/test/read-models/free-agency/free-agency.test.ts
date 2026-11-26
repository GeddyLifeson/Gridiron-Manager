// Item 7 free agency: the view (market list with observed grades only, rights, agent ask and read, phase,
// cap room and roster spots; own players with tenders and tags) and the commands (L5.2.1 authority; offers
// within cap, roster and rights; tenders and tags through the league modules; the head coach's call is
// warned and logged when illegal, held by a hostile agent until money is close).
import { describe, expect, it } from 'vitest';
import { buildFreeAgencyView, marketPhase, agentRead, agentBlocks } from '../../../src/read-models/free-agency/index.ts';
import { callPlayer, makeOffer, tag, tender } from '../../../src/commands/free-agency/index.ts';
import { $, ask, BEFORE, CLUB, DATES, fa, input, OPEN, power, WINDOW } from './fixture.ts';
import type { market } from '@gm/league';

const offerFor = (clubId: number): market.Offer => ({ clubId, madeAt: OPEN, guaranteedCents: $(5_000_000), stateTaxPct: 0, terms: { role: 0.4, winning: 0.5, relationships: 0.5, scheme: 0.5, location: 0.5 }, oldClubTreatment: null });
const weights: market.Weights = { money: 0.5, role: 0.3, winning: 0.05, relationships: 0.05, scheme: 0.05, location: 0.05 };

describe('free agency view', () => {
  it('reads the phase from the market dates', () => {
    expect(marketPhase(BEFORE, DATES)).toBe('before_window');
    expect(marketPhase(WINDOW, DATES)).toBe('negotiating_window');
    expect(marketPhase(OPEN, DATES)).toBe('open');
    expect(buildFreeAgencyView(input({ now: WINDOW })).mayExecute).toBe(false);
    expect(buildFreeAgencyView(input()).mayExecute).toBe(true);
  });

  it('lists other clubs\' unsigned free agents with rights, and keeps own players apart', () => {
    const v = buildFreeAgencyView(input());
    expect(v.market.map((r) => r.personId)).toEqual([501, 502, 503]);
    expect(v.own.map((r) => r.personId)).toEqual([601, 602]);
    expect(v.market.find((r) => r.personId === 501)).toMatchObject({ cls: 'unrestricted', rights: 'any_club', canSign: true, offerSheet: false, priorClubName: 'Carver' });
    expect(v.market.find((r) => r.personId === 503)).toMatchObject({ cls: 'restricted', rights: 'any_club' });
  });

  it('MA-48: grades are the staff\'s, unwatched shows none; no player weights reach the view', () => {
    const v = buildFreeAgencyView(input());
    expect(v.market[0]!.grade).toMatchObject({ state: 'graded', grader: 'pro scout', n: 30 });
    expect(v.market[1]!.grade).toEqual({ state: 'unwatched' });
    expect(JSON.stringify(v)).not.toContain('weights');
  });

  it('shows cap room after offers and the agent\'s read of each offer', () => {
    const v = buildFreeAgencyView(input({ offers: [{ personId: 501, years: 3, apyCents: $(10_000_000), guaranteedCents: $(15_000_000), status: 'open' }] }));
    expect(v.committedCents).toBe($(10_000_000));
    expect(v.roomAfterOffersCents).toBe($(20_000_000));
    expect(v.market[0]).toMatchObject({ agentRead: 'close', offer: { status: 'open' } });
    expect([agentRead($(10_000_000), ask(10_000_000).apyCents), agentRead($(8_500_000), ask(10_000_000).apyCents), agentRead($(1_000_000), ask(10_000_000).apyCents)]).toEqual(['close', 'talking', 'far_apart']);
  });

  it('the call: legal once he is a free agent; a hostile agent holds it until money is close', () => {
    const v = buildFreeAgencyView(input());
    expect(v.market[0]!.call).toMatchObject({ legal: true, blockedByAgent: false });
    expect(v.market[1]!.call.blockedByAgent).toBe(true);
    expect([agentBlocks('hostile', 'close'), agentBlocks('wary', 'talking'), agentBlocks('wary', null), agentBlocks('neutral', null)]).toEqual([false, false, true, false]);
  });

  it('in the window the head coach calling a pending free agent is tampering, shown not hidden', () => {
    const v = buildFreeAgencyView(input({ now: WINDOW }));
    expect(v.market[0]!.call).toMatchObject({ legal: false, reason: 'head coach in negotiating-window contact' });
  });

  it('own players: tender options come from the market module, tags from the cap module', () => {
    const v = buildFreeAgencyView(input({ now: { day: DATES.leagueYearStart.day - 1, minute: 600 } }));
    const rfa = v.own.find((r) => r.personId === 601)!;
    expect(rfa.cls).toBe('restricted');
    expect(rfa.tenders.find((t) => t.level === 'second_round')).toMatchObject({ ok: true });
    expect(rfa.tenders.find((t) => t.level === 'second_round')!.salaryCents).toBeGreaterThan(0);
    const ufa = v.own.find((r) => r.personId === 602)!;
    expect(ufa.tenders.find((t) => t.level === 'ufa')).toMatchObject({ ok: false });
    expect(ufa.tags.every((t) => typeof t.ok === 'boolean')).toBe(true);
    expect(buildFreeAgencyView(input({ tags: { day: 0, leagueYearStartDay: DATES.leagueYearStart.day, tagsUsed: 1 } })).own[0]!.tags[0]).toMatchObject({ ok: false });
  });

  it('reads the power arrangement for contracts', () => {
    expect(buildFreeAgencyView(input()).authority).toEqual({ field: 'final_say_contracts', authority: 'decide', holder: 'head_coach' });
    expect(buildFreeAgencyView(input({ power: power('general_manager') })).authority.authority).toBe('advise');
  });
});

describe('free agency commands', () => {
  const terms = { personId: 501, years: 3, apyCents: $(9_000_000), guaranteedCents: $(12_000_000) };

  it('with final say an offer is filed; without it it is a request; delegated refuses', () => {
    expect(makeOffer(input(), terms)).toMatchObject({ ok: true, kind: 'filed', act: { kind: 'offer', offerSheet: false }, executesLater: false });
    expect(makeOffer(input({ power: power('owner') }), terms)).toMatchObject({ ok: true, kind: 'request', request: { holder: 'owner' } });
    expect(makeOffer(input({ power: power('head_coach', ['final_say_contracts']) }), terms)).toMatchObject({ ok: false, rule: 'L5.2.1' });
  });

  it('an offer must fit under the cap with the other offers, and a roster spot', () => {
    expect(makeOffer(input({ capRoomCents: $(5_000_000) }), terms)).toMatchObject({ ok: false, rule: 'C6' });
    const others = [{ personId: 503, years: 2, apyCents: $(25_000_000), guaranteedCents: 0, status: 'open' as const }];
    expect(makeOffer(input({ offers: others }), terms)).toMatchObject({ ok: false, rule: 'C6' });
    expect(makeOffer(input({ rosterCount: 90 }), terms)).toMatchObject({ ok: false, rule: 'C5.1.1' });
  });

  it('respects the window and rights: nothing before the window; in it, agreed but executed later', () => {
    expect(makeOffer(input({ now: BEFORE }), terms)).toMatchObject({ ok: false, rule: 'C8.2.1' });
    expect(makeOffer(input({ now: WINDOW }), terms)).toMatchObject({ ok: true, kind: 'filed', executesLater: true });
    expect(makeOffer(input(), { ...terms, personId: 504 })).toMatchObject({ ok: false, rule: 'C8.1.1' });
    expect(makeOffer(input(), { ...terms, personId: 601 })).toMatchObject({ ok: false, rule: 'C8.1.1' });
    expect(makeOffer(input(), { ...terms, guaranteedCents: terms.apyCents * 4 })).toMatchObject({ ok: false, rule: 'C6' });
  });

  it('tenders go through the market module; tags through the cap module', () => {
    const before = input({ now: { day: DATES.leagueYearStart.day - 1, minute: 600 } });
    const t = tender(before, 601, 'second_round');
    expect(t).toMatchObject({ ok: true, kind: 'filed', act: { kind: 'tender', tender: { level: 'second_round', personId: 601, clubId: CLUB } } });
    expect(tender(before, 601, 'erfa')).toMatchObject({ ok: false, rule: 'C8.1.1' });
    expect(tag(input({ tags: { day: 0, leagueYearStartDay: DATES.leagueYearStart.day, tagsUsed: 1 } }), 602, 'transition')).toMatchObject({ ok: false, rule: 'C6.4.3' });
    expect(tag(input(), 501, 'transition')).toMatchObject({ ok: false, rule: 'C6.4.3' });
  });

  it('the call: a matching pitch moves the offer\'s terms; the agent may hold it; tampering is logged, not refused', () => {
    const c = callPlayer(input(), { personId: 501, pitch: { emphasis: 'role', specificPromise: true, filmFit: null }, offer: offerFor(CLUB), weights });
    expect(c).toMatchObject({ ok: true, legal: true, breakable: null });
    if (c.ok) expect(c.offer!.terms.role).toBeGreaterThan(0.4);
    const miss = callPlayer(input(), { personId: 501, pitch: { emphasis: 'location', specificPromise: false, filmFit: null }, offer: offerFor(CLUB), weights });
    if (miss.ok) expect(miss.offer!.terms).toEqual(offerFor(CLUB).terms);
    expect(callPlayer(input(), { personId: 502, pitch: { emphasis: 'role', specificPromise: false, filmFit: null }, offer: null, weights })).toMatchObject({ ok: false, rule: 'L7' });
    const tamper = callPlayer(input({ now: WINDOW }), { personId: 501, pitch: { emphasis: 'role', specificPromise: false, filmFit: null }, offer: null, weights });
    expect(tamper).toMatchObject({ ok: true, legal: false, breakable: { rule: 'C11.6.2', clubId: CLUB, personId: 501 } });
  });

  it('a fresh player not listed is refused', () => {
    expect(makeOffer(input({ players: [fa(1)] }), { ...terms, personId: 999 })).toMatchObject({ ok: false, rule: 'C8.1.1' });
  });
});
