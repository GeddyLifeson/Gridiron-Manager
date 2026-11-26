import { describe, expect, it } from 'vitest';
import {
  deciderFor, emergencyQbMayPlay, gameDayListLocked, markerStatus, moveButton, validateGameDayList, weeklyRosterMarkers,
  type LeagueRosters,
} from '../../src/roster/index.ts';
import { COLLEGE, PRO, ev, facts, inSeason, league, ok, setFacts, tx } from './helpers.ts';

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

describe('game-day active list (C5.2.1, H6.2)', () => {
  const base = (): LeagueRosters => {
    let s = inSeason(league({ clubs: 1, perClub: 53, spare: 4 }));
    s = setFacts(s, [...ids(1001, 8).map((id) => facts(id, { offensiveLineman: true })), ...ids(1009, 3).map((id) => facts(id, { quarterback: true }))]);
    return s;
  };

  it('48 with eight linemen is legal; 49 is refused; five inactive with 53', () => {
    const s = base();
    const v = validateGameDayList(s, { clubId: 1, actives: ids(1001, 48), emergencyQb: null }, PRO);
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.inactives).toHaveLength(5); expect(v.activeLimit).toBe(48); }
    expect(validateGameDayList(s, { clubId: 1, actives: ids(1001, 49), emergencyQb: null }, PRO).ok).toBe(false);
  });

  it('48 with seven linemen is refused; 47 with seven is legal', () => {
    const s = base();
    const seven = ids(1002, 48);
    const r = validateGameDayList(s, { clubId: 1, actives: seven, emergencyQb: null }, PRO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/7 offensive linemen; the limit is 47/);
    expect(validateGameDayList(s, { clubId: 1, actives: ids(1002, 47), emergencyQb: null }, PRO).ok).toBe(true);
  });

  it('no fewer than 44 when enough players are available; a non-roster player cannot dress', () => {
    const s = base();
    expect(validateGameDayList(s, { clubId: 1, actives: ids(1001, 43), emergencyQb: null }, PRO).ok).toBe(false);
    expect(validateGameDayList(s, { clubId: 1, actives: [...ids(1001, 47), 900001], emergencyQb: null }, PRO).ok).toBe(false);
  });

  it('two elevations make 55 candidates and seven inactive', () => {
    let s = base();
    s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900001 }));
    s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900002 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900002 }));
    const v = validateGameDayList(s, { clubId: 1, actives: [...ids(1001, 46), 900001, 900002], emergencyQb: null }, PRO);
    expect(v.ok && v.inactives.length).toBe(7);
  });

  it('emergency third quarterback: exactly two active quarterbacks, a roster quarterback, not on the active list', () => {
    const s = base();
    const actives = ids(1001, 10).concat(ids(1012, 38)); // QBs 1009, 1010 active; 1011 not
    expect(validateGameDayList(s, { clubId: 1, actives, emergencyQb: 1011 }, PRO).ok).toBe(true);
    expect(validateGameDayList(s, { clubId: 1, actives, emergencyQb: 1050 }, PRO).ok).toBe(false);
    const oneQb = ids(1001, 9).concat(ids(1012, 39));
    expect(validateGameDayList(s, { clubId: 1, actives: oneQb, emergencyQb: 1011 }, PRO).ok).toBe(false);
    expect(emergencyQbMayPlay(1, 2)).toBe(false);
    expect(emergencyQbMayPlay(2, 2)).toBe(true);
  });

  it('the list locks 90 minutes before kickoff', () => {
    expect(gameDayListLocked(91, PRO)).toBe(false);
    expect(gameDayListLocked(90, PRO)).toBe(true);
  });
});

describe('weekly roster cycle (H6.1.1)', () => {
  it('a Sunday week has every marker, with protections and last transactions at 4 p.m.', () => {
    const m = weeklyRosterMarkers({ kickoff: { dayIndex: 300, hour: 13 }, previousGameDay: 293, tradeDeadlineWeek: false }, PRO);
    const by = Object.fromEntries(m.map((x) => [x.type, x]));
    expect(Object.keys(by).sort()).toEqual(['elevations_revert', 'inactives', 'injury_review', 'last_transactions', 'protections', 'tryouts']);
    expect(by.protections!.deadline).toEqual({ dayIndex: 295, hour: 16 });
    expect(by.last_transactions!.deadline).toEqual({ dayIndex: 299, hour: 16 });
    expect(by.inactives!.deadline).toEqual({ dayIndex: 300, hour: 11 });
    expect(by.elevations_revert!.deadline).toEqual({ dayIndex: 301, hour: 16 });
  });

  it('a Thursday game after a Sunday game drops tryouts and keeps markers after the last game', () => {
    const m = weeklyRosterMarkers({ kickoff: { dayIndex: 304, hour: 20 }, previousGameDay: 300, tradeDeadlineWeek: true }, PRO);
    expect(m.some((x) => x.type === 'tryouts')).toBe(false);
    expect(m.some((x) => x.type === 'trade_deadline_meeting')).toBe(true);
    for (const x of m) expect(x.deadline.dayIndex).toBeGreaterThan(300);
  });

  it('markers turn amber 24 hours out and red at 2', () => {
    const marker = { type: 'last_transactions' as const, opensAt: { dayIndex: 10, hour: 0 }, deadline: { dayIndex: 12, hour: 16 } };
    expect(markerStatus(marker, { dayIndex: 9, hour: 0 })).toBe('not_open');
    expect(markerStatus(marker, { dayIndex: 10, hour: 16 })).toBe('open');
    expect(markerStatus(marker, { dayIndex: 11, hour: 17 })).toBe('amber');
    expect(markerStatus(marker, { dayIndex: 12, hour: 14 })).toBe('red');
    expect(markerStatus(marker, { dayIndex: 12, hour: 16 })).toBe('closed');
  });

  it('a level without practice squads or a game-day limit gets no such markers', () => {
    const m = weeklyRosterMarkers({ kickoff: { dayIndex: 300, hour: 12 }, previousGameDay: 293, tradeDeadlineWeek: false }, COLLEGE);
    expect(m.map((x) => x.type).sort()).toEqual(['injury_review', 'last_transactions', 'tryouts']);
  });
});

describe('who decides (H6.1.2)', () => {
  it('coach final say: every move is "Do it"', () => {
    expect(moveButton(deciderFor('claim', 'coach_final_say'))).toBe('do_it');
    expect(moveButton(deciderFor('trade', 'coach_final_say'))).toBe('do_it');
  });
  it('split and general-manager arrangements: game day and elevations are the coach\'s, personnel the holder\'s', () => {
    expect(deciderFor('game_day_list', 'gm_final_say')).toBe('coach');
    expect(deciderFor('elevate', 'split_to_owner')).toBe('coach');
    expect(deciderFor('release', 'split_to_owner')).toBe('gm');
    expect(deciderFor('place_reserve', 'owner_final_say')).toBe('owner');
    expect(moveButton(deciderFor('sign_free_agent', 'gm_final_say'))).toBe('ask');
  });
  it('a contract clause moves a single move type', () => {
    expect(deciderFor('release', 'gm_final_say', { release: 'coach' })).toBe('coach');
    expect(deciderFor('elevate', 'coach_final_say', { elevate: 'joint' })).toBe('joint');
  });
});

describe('college roster limit (T5.1)', () => {
  it('preseason 110, declaration 105: 106 non-exempt players are refused at the declaration date', () => {
    let s = league({ clubs: 1, perClub: 110, spare: 2, rules: COLLEGE });
    expect(tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 }, COLLEGE).ok).toBe(false);
    s = ok(tx(s, { type: 'cutdown', clubId: 1, moves: ids(1001, 5).map((id) => ({ type: 'release' as const, clubId: 1, personId: id })) }, COLLEGE));
    expect(ev(s, { type: 'roster_deadline', claimDeadline: s.now }, COLLEGE).ok).toBe(true);
    let s2 = league({ clubs: 1, perClub: 106, rules: COLLEGE });
    const r = ev(s2, { type: 'roster_deadline', claimDeadline: s2.now }, COLLEGE);
    expect(r.ok).toBe(false);
    s2 = setFacts(s2, [facts(1001, { countExempt: true })], COLLEGE);
    expect(ev(s2, { type: 'roster_deadline', claimDeadline: s2.now }, COLLEGE).ok).toBe(true);
  });

  it('a medical retirement leaves the count; one for a player who can play is allowed and reported (T5.1.2 rule 5)', () => {
    let s = league({ clubs: 1, perClub: 106, rules: COLLEGE });
    s = setFacts(s, [facts(1001, { medicallyCleared: false }), facts(1002, { medicallyCleared: true })], COLLEGE);
    const a = tx(s, { type: 'medical_retirement', clubId: 1, personId: 1001 }, COLLEGE);
    expect(a.ok && a.breakable.length).toBe(0);
    s = ok(a);
    expect(ev(s, { type: 'roster_deadline', claimDeadline: s.now }, COLLEGE).ok).toBe(true);
    const b = tx(s, { type: 'medical_retirement', clubId: 1, personId: 1002 }, COLLEGE);
    expect(b.ok && b.breakable[0]!.rule).toBe('T5.1.2');
  });

  it('pro-only filings are refused by the keys the college file leaves out', () => {
    const s = inSeason(league({ clubs: 2, perClub: 50, rules: COLLEGE }), COLLEGE);
    for (const t of [
      { type: 'sign_practice_squad' as const, clubId: 1, personId: 900001 },
      { type: 'place_reserve' as const, clubId: 1, personId: 1001, list: 'reserve_injured' as const },
      { type: 'trade' as const, clubId: 1, otherClubId: 2, give: [1001], get: [] },
    ]) expect(tx(s, t, COLLEGE).ok).toBe(false);
  });
});
