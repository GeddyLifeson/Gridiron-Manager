import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iso, formatTime, instantValue, addMinutes } from '../../src/calendar/date.ts';
import { minimumSalary } from '../../src/cap/minimums.ts';
import { teamCapPosition } from '../../src/cap/charges.ts';
import {
  FALLBACK_KEYS, PARAMS, RULE_KEYS, acceptedTenderSalary, checkContact, compensationFor, freeAgentClass, inFirstWave, makeTender,
  marketLookup, marketRounds, marketRules, matchOfferSheet, mayExecuteContract, maySign, postAgreement, rightsAt, settleOfferSheet,
  signOfferSheet, signingFlags, tenderSalary, withdrawOfferSheet, withdrawTender,
  type ContactInput, type OfferSheetContext, type Refusal, type OfferSheetTerms, type Tender,
} from '../../src/market/index.ts';
import { $, at, DATES, MR, PRO_VALUES, RS, player, ruleSet } from './fixtures.ts';

const show = (i: { day: number; minute: number }) => `${iso(i.day)} ${formatTime(i.minute)}`;
function ok<T extends { readonly ok: true }>(r: T | Refusal): T { if (!r.ok) throw new Error(r.message); return r; }
const tender = (r: ReturnType<typeof makeTender>): Tender => { if (!r.ok) throw new Error(r.message); return r.tender; };

describe('rule keys', () => {
  it('every key the module reads is in the league file or the fallback rows', () => {
    const look = marketLookup(RS);
    for (const k of RULE_KEYS) expect(look(k.key), k.key).toBeTypeOf('number');
  });
  it('fallback rows agree with the league file where both define a key, and cite the CBA', () => {
    const file = new Map(PRO_VALUES.map((v) => [v.key, v.value]));
    for (const row of FALLBACK_KEYS) {
      if (file.has(row.key)) expect(file.get(row.key), row.key).toBe(row.value);
      expect(row.source).toMatch(/CBA 2020 Art\. \d+/);
      expect(row.status).toMatch(/Verified|of 3/);
    }
  });
  it('a league without fa.* keys has no classes and no trades', () => {
    const college = marketRules(ruleSet(PRO_VALUES, {}, PRO_VALUES.map((v) => v.key).filter((k) => k.startsWith('fa.') || k.startsWith('trade.'))), 2026);
    expect(college.classes).toBeNull();
    expect(college.tradeDeadlineAfterWeek).toBeNull();
    expect(freeAgentClass(2, college)).toBe('free');
  });
});

describe('market dates 2026', () => {
  it('reads every window from calendar anchors and keys', () => {
    expect(show(DATES.negotiatingOpen)).toBe('2026-03-09 12:00');
    expect(show(DATES.leagueYearStart)).toBe('2026-03-11 16:00');
    expect(show(DATES.offerSheetDeadline)).toBe('2026-04-17 23:59');
    expect(show(DATES.ufaTenderBy)).toBe('2026-04-27 23:59');
    expect(show(DATES.ufaRightsRevert)).toBe('2026-07-22 16:00');
    expect(show(DATES.tradeDeadline)).toBe('2026-11-10 16:00');
    expect(show(DATES.unsignedRightsEnd)).toBe('2026-11-17 16:00');
  });
});

describe('free agent classes (C8.1.1)', () => {
  it('status by accrued seasons', () => {
    expect([0, 1, 2].map((n) => freeAgentClass(n, MR))).toEqual(['exclusive_rights', 'exclusive_rights', 'exclusive_rights']);
    expect(freeAgentClass(3, MR)).toBe('restricted');
    expect(freeAgentClass(4, MR)).toBe('unrestricted');
    expect(freeAgentClass(11, MR)).toBe('unrestricted');
    expect(signingFlags('unrestricted')).toEqual(['ufa_signee']);
    expect(signingFlags('restricted')).toEqual([]);
  });
  it('tender salaries: table amount, 110 percent floor on the upper levels only', () => {
    const low = player({ priorParagraph5Cents: $(1_000_000) });
    const high = player({ priorParagraph5Cents: $(5_000_000) });
    expect(tenderSalary('rofr', high, MR, RS)).toBe($(3_520_000));
    expect(tenderSalary('original_round', low, MR, RS)).toBe($(3_674_000));
    expect(tenderSalary('original_round', high, MR, RS)).toBe($(5_500_000));
    expect(tenderSalary('second_round', high, MR, RS)).toBe($(5_767_000));
    expect(tenderSalary('first_round', high, MR, RS)).toBe($(8_046_000));
    expect(tenderSalary('first_round_waived', high, MR, RS)).toBe($(8_546_000));
    expect(tenderSalary('erfa', player({ accruedSeasons: 2, creditedSeasons: 2 }), MR, RS)).toBe(minimumSalary(RS, 2026, 2));
    expect(tenderSalary('june1', low, MR, RS)).toBe($(3_520_000));
    expect(tenderSalary('june1', high, MR, RS)).toBe($(5_500_000));
    expect(tenderSalary('june15', high, MR, RS)).toBe($(5_500_000));
  });
  it('UFA tender is 110 percent of prior-year salary, or of P5 on an untouched rookie contract', () => {
    const vet = player({ accruedSeasons: 6, priorYearSalaryCents: $(4_000_000), priorParagraph5Cents: $(3_000_000) });
    expect(tenderSalary('ufa', vet, MR, RS)).toBe($(4_400_000));
    expect(tenderSalary('ufa', { ...vet, expiringIsRookieContract: true }, MR, RS)).toBe($(3_300_000));
  });
  it('a player on an upper tender may take 110 percent of prior P5 instead (CBA Art. 9 s.2(g))', () => {
    const p = player({ priorParagraph5Cents: $(1_000_000) });
    const t = tender(makeTender('second_round', p, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
    expect(acceptedTenderSalary(t, p, MR, true)).toBe($(1_100_000));
    expect(acceptedTenderSalary(t, p, MR, false)).toBe($(5_767_000));
  });
});

describe('tender windows', () => {
  const rfa = player();
  it('qualifying offers are due by the league year start', () => {
    expect(makeTender('second_round', rfa, 1, DATES.leagueYearStart, DATES, MR, RS, null, false).ok).toBe(true);
    const late = makeTender('second_round', rfa, 1, addMinutes(DATES.leagueYearStart, 1), DATES, MR, RS, null, false);
    expect(late.ok).toBe(false);
    expect(makeTender('second_round', rfa, 2, DATES.leagueYearStart, DATES, MR, RS, null, false).ok).toBe(false);
    expect(makeTender('ufa', rfa, 1, at('2026-04-01'), DATES, MR, RS, null, false).ok).toBe(false);
  });
  it('the exclusive rights tender is due before the league year', () => {
    const e = player({ accruedSeasons: 1, creditedSeasons: 1 });
    expect(makeTender('erfa', e, 1, at('2026-03-01'), DATES, MR, RS, null, false).ok).toBe(true);
    expect(makeTender('erfa', e, 1, DATES.leagueYearStart, DATES, MR, RS, null, false).ok).toBe(false);
  });
  it('the UFA tender runs from the opening to the Monday after the draft', () => {
    const u = player({ accruedSeasons: 5 });
    expect(makeTender('ufa', u, 1, at('2026-03-01'), DATES, MR, RS, null, false).ok).toBe(false);
    expect(makeTender('ufa', u, 1, at('2026-04-27', '23:00'), DATES, MR, RS, null, false).ok).toBe(true);
    expect(makeTender('ufa', u, 1, at('2026-04-28', '09:00'), DATES, MR, RS, null, false).ok).toBe(false);
    expect(makeTender('ufa', u, 1, at('2026-04-01'), DATES, MR, RS, null, true).ok).toBe(false);
  });
  it('June 1 and June 15 tenders (CBA Art. 9 s.2(f)(i))', () => {
    const p = player({ priorParagraph5Cents: $(1_000_000) });
    const rofr = tender(makeTender('rofr', p, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
    expect(makeTender('june1', p, 1, at('2026-05-20'), DATES, MR, RS, rofr, false).ok).toBe(true);
    expect(makeTender('june1', p, 1, at('2026-04-10'), DATES, MR, RS, rofr, false).ok).toBe(false);
    expect(makeTender('june15', p, 1, at('2026-06-15'), DATES, MR, RS, rofr, false).ok).toBe(false);
    const second = tender(makeTender('second_round', p, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
    expect(makeTender('june15', p, 1, at('2026-06-14'), DATES, MR, RS, second, false).ok).toBe(false);
    const j15 = tender(makeTender('june15', p, 1, at('2026-06-15'), DATES, MR, RS, second, false));
    expect(j15.salaryCents).toBe($(1_100_000));
    // Prior P5 so high the qualifying offer equals the floor: nothing to lower.
    const rich = player({ priorParagraph5Cents: $(6_000_000) });
    const richQo = tender(makeTender('second_round', rich, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
    expect(makeTender('june15', rich, 1, at('2026-06-15'), DATES, MR, RS, richQo, false).ok).toBe(false);
  });
});

describe('compensation', () => {
  const t = (p: ReturnType<typeof player>, level: Parameters<typeof makeTender>[0]) => tender(makeTender(level, p, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
  it('by level, with the undrafted original-round case', () => {
    const r3 = player({ draftRound: 3 });
    expect(compensationFor(t(r3, 'original_round'), r3, [], MR).round).toBe(3);
    expect(compensationFor(t(r3, 'rofr'), r3, [], MR).round).toBeNull();
    expect(compensationFor(t(r3, 'second_round'), r3, [], MR).round).toBe(2);
    expect(compensationFor(t(r3, 'first_round'), r3, [], MR).round).toBe(1);
    const w = compensationFor(t(r3, 'first_round_waived'), r3, [], MR);
    expect([w.round, w.waivesTagLimits]).toEqual([1, true]);
    const udfa = player({ draftRound: null });
    const c = compensationFor(t(udfa, 'original_round'), udfa, [], MR);
    expect(c.round).toBeNull();
    expect(c.reason).toMatch(/undrafted/);
  });
  it('upgraded tender: a lower pick at the first-round level drops a first-rounder on a lower tender to a second (CBA Art. 9 s.2(c)(i))', () => {
    const first = player({ personId: 1, draftRound: 1 });
    const fourth = player({ personId: 2, draftRound: 4 });
    const tf = t(first, 'original_round');
    const tu = t(fourth, 'first_round');
    expect(compensationFor(tf, first, [{ tender: tf, draftRound: 1 }], MR).round).toBe(1);
    expect(compensationFor(tf, first, [{ tender: tf, draftRound: 1 }, { tender: tu, draftRound: 4 }], MR).round).toBe(2);
    const second = player({ personId: 3, draftRound: 2 });
    const ts = t(second, 'original_round');
    const tu2 = t(fourth, 'second_round');
    expect(compensationFor(ts, second, [{ tender: ts, draftRound: 2 }, { tender: tu2, draftRound: 4 }], MR).round).toBe(3);
  });
});

describe('who may sign him', () => {
  it('restricted with a qualifying offer: offer sheets in the signing period, then prior club only, then nobody', () => {
    const p = player();
    const qo = tender(makeTender('original_round', p, 1, at('2026-03-05'), DATES, MR, RS, null, false));
    expect(rightsAt(p, qo, at('2026-03-10'), DATES, MR).rights).toBe('under_contract');
    expect(rightsAt(p, qo, DATES.leagueYearStart, DATES, MR).rights).toBe('offer_sheet');
    expect(rightsAt(p, qo, at('2026-04-17', '20:00'), DATES, MR).rights).toBe('offer_sheet');
    expect(rightsAt(p, qo, at('2026-04-18'), DATES, MR).rights).toBe('prior_club_only');
    expect(rightsAt(p, qo, DATES.unsignedRightsEnd, DATES, MR).rights).toBe('no_club');
    expect(rightsAt(p, withdrawTender(qo, at('2026-05-01')), at('2026-05-02'), DATES, MR).rights).toBe('any_club');
    expect(maySign(p, qo, 2, at('2026-04-01'), DATES, MR)).toBe(false);
    expect(maySign(p, qo, 1, at('2026-04-01'), DATES, MR)).toBe(true);
    expect(rightsAt(p, null, DATES.leagueYearStart, DATES, MR).rights).toBe('any_club');
  });
  it('unrestricted with a UFA tender: free until July 22, then prior club only, then sits out', () => {
    const p = player({ accruedSeasons: 7 });
    const ut = tender(makeTender('ufa', p, 1, at('2026-04-20'), DATES, MR, RS, null, false));
    expect(rightsAt(p, ut, at('2026-07-22', '15:59'), DATES, MR).rights).toBe('any_club');
    expect(rightsAt(p, ut, at('2026-07-22', '16:00'), DATES, MR).rights).toBe('prior_club_only');
    expect(rightsAt(p, ut, at('2026-11-17', '16:00'), DATES, MR).rights).toBe('no_club');
    expect(rightsAt(p, null, at('2026-08-01'), DATES, MR).rights).toBe('any_club');
  });
  it('exclusive rights: tendered stays with the club, untendered is free', () => {
    const p = player({ accruedSeasons: 2 });
    const t = tender(makeTender('erfa', p, 1, at('2026-03-01'), DATES, MR, RS, null, false));
    expect(rightsAt(p, t, at('2026-04-01'), DATES, MR).rights).toBe('prior_club_only');
    expect(rightsAt(p, null, at('2026-04-01'), DATES, MR).rights).toBe('any_club');
  });
});

describe('offer sheets (CBA Art. 9 s.3)', () => {
  const p = player({ draftRound: 2 });
  const qo = tender(makeTender('original_round', p, 1, DATES.leagueYearStart, DATES, MR, RS, null, false));
  const terms: OfferSheetTerms = { salaryCents: $(20_000_000), ltbeClubIncentivesCents: $(1_000_000), bindsOldClubDifferently: false, includesPropertyOrInvestments: false };
  const ctx = (over: Partial<OfferSheetContext> = {}): OfferSheetContext => ({
    player: p, tender: qo, priorClubTenders: [{ tender: qo, draftRound: 2 }], outstanding: null, newClubHoldsPick: () => true, dates: DATES, mr: MR, ...over,
  });
  it('five days to match; compensation in this year\'s draft', () => {
    const s = ok(signOfferSheet(2, terms, at('2026-04-01', '10:00'), ctx())).sheet;
    expect(show(s.matchDeadline)).toBe('2026-04-06 10:00');
    expect([s.compensation.round, s.compensationSeason]).toEqual([2, 2026]);
    expect(matchOfferSheet(s, at('2026-04-06', '10:01'), MR).ok).toBe(false);
    expect(settleOfferSheet(s, at('2026-04-05'), false).ok).toBe(false);
    const done = ok(settleOfferSheet(s, at('2026-04-06', '10:00'), false));
    expect(done.signsWithClubId).toBe(2);
    expect(done.compensation).toEqual({ round: 2, season: 2026, fromClubId: 2, toClubId: 1 });
    expect(done.noSalaryCutThroughFirstSeason).toBe(true);
  });
  it('a match keeps him and blocks a trade back to the offering club for a year', () => {
    const s = ok(signOfferSheet(2, terms, at('2026-04-01'), ctx())).sheet;
    const m = ok(matchOfferSheet(s, at('2026-04-03'), MR));
    expect(m.signsWithClubId).toBe(1);
    expect(show(m.tradeBackBlock!.until)).toBe('2027-04-03 12:00');
  });
  it('one sheet at a time; no poison pills, property or excess incentives; the pick must be held', () => {
    const s = ok(signOfferSheet(2, terms, at('2026-04-01'), ctx())).sheet;
    expect(signOfferSheet(3, terms, at('2026-04-02'), ctx({ outstanding: s })).ok).toBe(false);
    expect(withdrawOfferSheet(s, true)).toMatchObject({ withdrawn: true });
    expect(signOfferSheet(3, terms, at('2026-04-02'), ctx({ outstanding: { ...s, withdrawn: true } })).ok).toBe(true);
    expect(withdrawOfferSheet(s, false)).toMatchObject({ ok: false });
    expect(signOfferSheet(2, { ...terms, bindsOldClubDifferently: true }, at('2026-04-01'), ctx()).ok).toBe(false);
    expect(signOfferSheet(2, { ...terms, includesPropertyOrInvestments: true }, at('2026-04-01'), ctx()).ok).toBe(false);
    expect(signOfferSheet(2, { ...terms, ltbeClubIncentivesCents: $(3_000_001) }, at('2026-04-01'), ctx()).ok).toBe(false);
    expect(signOfferSheet(2, { ...terms, ltbeClubIncentivesCents: $(3_000_000) }, at('2026-04-01'), ctx()).ok).toBe(true);
    expect(signOfferSheet(2, terms, at('2026-04-01'), ctx({ newClubHoldsPick: () => false })).ok).toBe(false);
  });
  it('closed before the opening and after the offer sheet date; never with the prior club or an untendered player', () => {
    expect(signOfferSheet(2, terms, at('2026-03-10'), ctx()).ok).toBe(false);
    expect(signOfferSheet(2, terms, at('2026-04-18'), ctx()).ok).toBe(false);
    expect(signOfferSheet(1, terms, at('2026-04-01'), ctx()).ok).toBe(false);
    expect(signOfferSheet(2, terms, at('2026-04-01'), ctx({ tender: null })).ok).toBe(false);
  });
  it('late sheets: the match is cut off the day before the draft and the pick moves to next year (CBA Art. 9 s.2(j), s.3(b))', () => {
    const late = { ...DATES, offerSheetDeadline: at('2026-04-22', '23:59') };
    const s = ok(signOfferSheet(2, terms, at('2026-04-22', '09:00'), ctx({ dates: late }))).sheet;
    expect(show(s.matchDeadline)).toBe('2026-04-22 23:59');
    expect(s.compensationSeason).toBe(2027);
    const early = ok(signOfferSheet(2, terms, at('2026-04-21', '09:00'), ctx({ dates: late }))).sheet;
    expect(early.compensationSeason).toBe(2026);
  });
});

describe('negotiating window and opening (C8.2.1)', () => {
  const c = (over: Partial<ContactInput>): ContactInput => ({ clubId: 2, personId: 77, actor: 'front_office', kind: 'agent_talks', target: 'pending_ufa', callsUsed: 0, ...over });
  const inWindow = at('2026-03-10');
  it('front office may talk to agents in the window; the head coach may not', () => {
    expect(checkContact(c({}), inWindow, DATES, MR)).toMatchObject({ legal: true, breakable: null });
    const hc = checkContact(c({ actor: 'head_coach' }), inWindow, DATES, MR);
    expect(hc.legal).toBe(false);
    expect(hc.breakable).toMatchObject({ rule: 'C11.6.2', clubId: 2, personId: 77 });
    expect(checkContact(c({ actor: 'coaching_staff' }), inWindow, DATES, MR).legal).toBe(false);
  });
  it('window calls up to the key, then tampering', () => {
    expect(checkContact(c({ kind: 'player_call', callsUsed: 4 }), inWindow, DATES, MR)).toMatchObject({ legal: true, usesWindowCall: true });
    expect(checkContact(c({ kind: 'player_call', callsUsed: 5 }), inWindow, DATES, MR).legal).toBe(false);
  });
  it('outside the window, or with a player under contract, contact is breakable, never refused', () => {
    expect(checkContact(c({}), at('2026-03-08'), DATES, MR).breakable).not.toBeNull();
    expect(checkContact(c({ target: 'under_contract_elsewhere' }), inWindow, DATES, MR).breakable).not.toBeNull();
    expect(checkContact(c({ target: 'free_agent', actor: 'head_coach' }), at('2026-03-20'), DATES, MR).legal).toBe(true);
    expect(checkContact(c({ target: 'own_player', actor: 'head_coach' }), at('2026-01-20'), DATES, MR).legal).toBe(true);
  });
  it('no contract is executed before the league year opens', () => {
    expect(mayExecuteContract(addMinutes(DATES.leagueYearStart, -1), DATES).ok).toBe(false);
    expect(mayExecuteContract(DATES.leagueYearStart, DATES).ok).toBe(true);
  });
  it('market rounds', () => {
    const rounds = marketRounds(DATES, at('2026-03-20'));
    expect(show(rounds[0]!)).toBe('2026-03-09 12:00');
    expect(show(rounds[1]!)).toBe('2026-03-09 16:00');
    const daily = rounds.filter((r) => instantValue(r) > instantValue(at('2026-03-15', '00:00')));
    expect(daily.map(show)).toEqual(['2026-03-15 12:00', '2026-03-16 12:00', '2026-03-17 12:00', '2026-03-18 12:00', '2026-03-19 12:00', '2026-03-20 12:00']);
    for (let i = 1; i < rounds.length; i++) expect(instantValue(rounds[i]!)).toBeGreaterThan(instantValue(rounds[i - 1]!));
    expect(inFirstWave(at('2026-03-13'), DATES)).toBe(true);
    expect(inFirstWave(at('2026-03-14', '16:00'), DATES)).toBe(false);
  });
  it('window agreement backout and the cap check at the opening', () => {
    const cap = teamCapPosition({ leagueYear: 2026, phase: 'offseason', contracts: [], other: [{ label: 'x', amountCents: $(300_000_000), kind: 'dead' }], adjustmentCents: 0 }, RS);
    const a = { personId: 9, clubId: 1, agreedAt: inWindow, chargeCents: $(1_000_000) };
    expect(postAgreement(a, cap, inWindow, DATES, 0.01).kind).toBe('backed_out');
    expect(postAgreement(a, cap, inWindow, DATES, 0.5)).toEqual({ kind: 'posted', at: DATES.leagueYearStart });
    expect(postAgreement({ ...a, chargeCents: $(2_000_000) }, cap, inWindow, DATES, 0.5)).toEqual({ kind: 'waits_for_room', shortCents: $(800_000) });
  });
});

describe('parameters', () => {
  it('every parameter names a test in this suite that constrains it (J6.8.1)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = ['free-agency.test.ts', 'market-trade.test.ts'].map((f) => readFileSync(join(here, f), 'utf8')).join('\n');
    for (const p of PARAMS.params) {
      const m = /Test "([^"]+)"/.exec(p.constrainedBy);
      expect(m, p.name).not.toBeNull();
      expect(src.includes(`it('${m![1]}`), `${p.name} -> ${m![1]}`).toBe(true);
    }
  });
});
