import { describe, expect, it } from 'vitest';
import { clubCounts, practiceSquadGroup } from '../../src/roster/index.ts';
import { PRO, ev, facts, inSeason, league, ok, play, setFacts, tx } from './helpers.ts';

const roster = (s: ReturnType<typeof league>, c: number) => clubCounts(s.clubs.find((x) => x.clubId === c)!, s.players, PRO).roster;

describe('lists and limits (C5.1.1)', () => {
  it('offseason limit 90: the 91st signing is refused with the rule named, a linked release makes it legal', () => {
    const s = league({ clubs: 1, perClub: 90 });
    const r = tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe('C5.1.1'); expect(r.code).toBe('limit'); expect(r.fix).toMatch(/linked/); }
    const s2 = ok(tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001, linked: [{ type: 'release', clubId: 1, personId: 1001 }] }));
    expect(roster(s2, 1)).toBe(90);
  });

  it('a refused linked move leaves nothing changed (atomic)', () => {
    const s = league({ clubs: 1, perClub: 90 });
    const r = tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001, linked: [{ type: 'release', clubId: 1, personId: 5555 }] });
    expect(r.ok).toBe(false);
    expect(roster(s, 1)).toBe(90);
  });

  it('a player on waivers cannot be signed as a free agent', () => {
    let s = league({ clubs: 2, perClub: 10 });
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    const r = tx(s, { type: 'sign_free_agent', clubId: 2, personId: 1001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fix).toMatch(/claim/);
  });

  it('every accepted club move puts at least one entry on the wire (C5.7.1 acceptance 2)', () => {
    const s = league({ clubs: 1, perClub: 10 });
    const r = tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 });
    expect(r.ok && r.wire.length).toBeGreaterThan(0);
  });
});

describe('cutdown (C5.6.1)', () => {
  it('the roster deadline is refused while a club is over 53, and time stops until it files', () => {
    const s = league({ clubs: 2, perClub: 60 });
    const r = ev(s, { type: 'roster_deadline', claimDeadline: { dayIndex: 201, hour: 13 } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe('C5.6.1'); expect(r.message).toMatch(/1, 2/); }
  });

  it('a reduction that leaves 54 is refused; one that reaches 53 is accepted', () => {
    const s = league({ clubs: 1, perClub: 60 });
    const six = [1, 2, 3, 4, 5, 6].map((i) => ({ type: 'release' as const, clubId: 1, personId: 1000 + i }));
    const bad = tx(s, { type: 'cutdown', clubId: 1, moves: six });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.rule).toBe('C5.6.1');
    const s2 = ok(tx(s, { type: 'cutdown', clubId: 1, moves: [...six, { type: 'release', clubId: 1, personId: 1007 }] }));
    expect(roster(s2, 1)).toBe(53);
    expect(s2.waivers.every((w) => w.atCutdown)).toBe(true);
  });

  it('players waived at the reduction share one claim deadline; practice squads form after claims', () => {
    let s = league({ clubs: 2, perClub: 55 });
    s = ok(tx(s, { type: 'cutdown', clubId: 1, moves: [{ type: 'release', clubId: 1, personId: 1001 }, { type: 'release', clubId: 1, personId: 1002 }] }));
    s = ok(tx(s, { type: 'cutdown', clubId: 2, moves: [{ type: 'release', clubId: 2, personId: 2001 }, { type: 'release', clubId: 2, personId: 2002 }] }));
    s = ok(ev(s, { type: 'roster_deadline', claimDeadline: { dayIndex: 202, hour: 13 } }));
    expect(new Set(s.waivers.map((w) => `${w.deadline.dayIndex}:${w.deadline.hour}`)).size).toBe(1);
    const early = tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900001 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.rule).toBe('C5.6.1');
    s = ok(ev(s, { type: 'advance_time', to: { dayIndex: 202, hour: 14 } }));
    expect(s.waivers).toHaveLength(0);
    expect(s.practiceSquadsOpen).toBe(true);
    ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900001 }));
  });

  it('after the deadline no move takes a club to 54', () => {
    const s = inSeason(league({ clubs: 1, perClub: 53 }));
    const r = tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 });
    expect(r.ok).toBe(false);
  });

  it('a second reduction is refused once the season has begun', () => {
    const s = inSeason(league({ clubs: 1, perClub: 53 }));
    expect(tx(s, { type: 'cutdown', clubId: 1, moves: [] }).ok).toBe(false);
  });
});

describe('practice squad size and eligibility (C5.3.1)', () => {
  const base = () => inSeason(league({ clubs: 2, perClub: 53, spare: 30 }));
  const signPs = (s: ReturnType<typeof base>, ids: number[]) => ids.reduce((acc, id) => ok(tx(acc, { type: 'sign_practice_squad', clubId: 1, personId: id })), s);

  it('groups: A no accrued season or one with fewer than 9 active games, B up to two, C any', () => {
    expect(practiceSquadGroup(facts(1), PRO)).toBe('A');
    expect(practiceSquadGroup(facts(1, { accruedSeasons: 1, activeGamesInLastAccruedSeason: 8 }), PRO)).toBe('A');
    expect(practiceSquadGroup(facts(1, { accruedSeasons: 1, activeGamesInLastAccruedSeason: 9 }), PRO)).toBe('B');
    expect(practiceSquadGroup(facts(1, { accruedSeasons: 2 }), PRO)).toBe('B');
    expect(practiceSquadGroup(facts(1, { accruedSeasons: 3 }), PRO)).toBe('C');
  });

  it('sixteen fit; the seventeenth needs the international slot; the eighteenth is refused', () => {
    let s = signPs(base(), Array.from({ length: 16 }, (_, i) => 900001 + i));
    expect(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900017 }).ok).toBe(false);
    s = setFacts(s, [facts(900017, { internationalPathway: true })]);
    s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900017 }));
    const r = tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900018 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.3.1');
  });

  it('a seventh group C veteran is refused (C5.3.1 acceptance)', () => {
    let s = base();
    s = setFacts(s, Array.from({ length: 7 }, (_, i) => facts(900001 + i, { accruedSeasons: 5, pensionCreditedSeasons: 5 })));
    s = signPs(s, [900001, 900002, 900003, 900004, 900005, 900006]);
    const r = tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900007 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe('C5.3.1'); expect(r.message).toMatch(/veterans/); }
  });

  it('a league whose rules carry no practice squad refuses the filing', () => {
    expect(tx(base(), { type: 'sign_practice_squad', clubId: 1, personId: 900001 }, { ...PRO, practiceSquad: null }).ok).toBe(false);
  });
});

describe('elevations (C5.3.2)', () => {
  const ready = () => {
    let s = inSeason(league({ clubs: 2, perClub: 53, spare: 10 }));
    for (const id of [900001, 900002, 900003, 900004]) s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: id }));
    return s;
  };

  it('two per game; a third is refused with the rule named', () => {
    let s = ready();
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900002 }));
    const r = tx(s, { type: 'elevate', clubId: 1, personId: 900003 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.3.2');
  });

  it('a fourth regular-season elevation of one player is refused; he reverts after each game', () => {
    let s = ready();
    for (let g = 0; g < 3; g++) {
      s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 }));
      s = play(s, 1);
      expect(s.clubs[0]!.entries.find((e) => e.personId === 900001)!.elevatedForGame).toBeNull();
    }
    const r = tx(s, { type: 'elevate', clubId: 1, personId: 900001 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe('C5.3.2'); expect(r.fix).toMatch(/sign/); }
  });

  it('postseason elevations have no per-player limit, but still two per game', () => {
    let s = ready();
    for (let g = 0; g < 3; g++) { s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 })); s = play(s, 1); }
    s = ok(ev(s, { type: 'end_week', leagueWeek: 18 }));
    s = ok(ev(s, { type: 'begin_postseason', clubIds: [1] }));
    for (let g = 0; g < 3; g++) { s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 })); s = play(s, 1); }
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900002 }));
    expect(tx(s, { type: 'elevate', clubId: 1, personId: 900003 }).ok).toBe(false);
  });

  it('emergency quarterback elevation: quarterbacks only, no season count, outside the two', () => {
    let s = ready();
    expect(tx(s, { type: 'elevate', clubId: 1, personId: 900003, emergencyQb: true }).ok).toBe(false);
    s = setFacts(s, [facts(900003, { quarterback: true })]);
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900001 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900002 }));
    s = ok(tx(s, { type: 'elevate', clubId: 1, personId: 900003, emergencyQb: true }));
    expect(s.clubs[0]!.entries.find((e) => e.personId === 900003)!.elevationsThisSeason).toBe(0);
  });

  it('only the club\'s own practice squad players, and only in the season', () => {
    const s = ready();
    expect(tx(s, { type: 'elevate', clubId: 2, personId: 900001 }).ok).toBe(false);
    expect(tx(s, { type: 'elevate', clubId: 1, personId: 1001 }).ok).toBe(false);
  });
});

describe('protections and signing off practice squads (C5.3.3)', () => {
  const ready = () => {
    let s = inSeason(league({ clubs: 2, perClub: 52, spare: 10 }));
    for (const id of [900001, 900002, 900003, 900004, 900005]) s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: id }));
    return s;
  };

  it('four protections a week; a fifth is refused', () => {
    let s = ok(tx(ready(), { type: 'protect', clubId: 1, personIds: [900001, 900002, 900003, 900004] }));
    const r = tx(s, { type: 'protect', clubId: 1, personIds: [900005] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.3.3');
    s = play(s, 1);
    ok(tx(s, { type: 'protect', clubId: 1, personIds: [900005] }));
  });

  it('a protected player cannot be signed away before his club\'s next game; after it he can', () => {
    let s = ok(tx(ready(), { type: 'protect', clubId: 1, personIds: [900001] }));
    const r = tx(s, { type: 'sign_from_practice_squad', clubId: 2, personId: 900001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.3.3');
    ok(tx(s, { type: 'sign_from_practice_squad', clubId: 1, personId: 900001, linked: [{ type: 'release', clubId: 1, personId: 1001 }] }));
    s = play(s, 1);
    const s2 = ok(tx(s, { type: 'sign_from_practice_squad', clubId: 2, personId: 900001 }));
    const e = s2.clubs[1]!.entries.find((x) => x.personId === 900001)!;
    expect(e.list).toBe('active');
    expect(e.payGuaranteedThroughGame).toBe(2);
  });

  it('a player may not sign with his club\'s next opponent inside six days of the game', () => {
    let s = ok(ev(ready(), { type: 'set_next_game', clubId: 1, opponentId: 2, dayIndex: 208 }));
    const r = tx(s, { type: 'sign_from_practice_squad', clubId: 2, personId: 900002 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('deadline');
    s = ok(ev(s, { type: 'set_next_game', clubId: 1, opponentId: 2, dayIndex: 220 }));
    ok(tx(s, { type: 'sign_from_practice_squad', clubId: 2, personId: 900002 }));
  });
});
