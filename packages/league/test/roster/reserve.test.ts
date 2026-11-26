import { describe, expect, it } from 'vitest';
import { PRO, ev, facts, inSeason, league, ok, play, setFacts, tx } from './helpers.ts';
import type { LeagueRosters } from '../../src/roster/index.ts';

const entry = (s: LeagueRosters, c: number, id: number) => s.clubs.find((x) => x.clubId === c)!.entries.find((e) => e.personId === id)!;
const hurt = (s: LeagueRosters, ids: number[]) => setFacts(s, ids.map((id) => facts(id, { injured: true })));

describe('injured reserve (C5.4.1)', () => {
  it('off the 53, four club games minimum, byes not counted: placed after week 3, no return before club game 8', () => {
    let s = inSeason(league({ clubs: 1, perClub: 53, spare: 5 }));
    s = play(s, 1, 3);
    s = hurt(s, [1001]);
    s = ok(tx(s, { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
    s = ok(tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 }));
    s = play(s, 1, 3);
    const early = tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 });
    expect(early.ok).toBe(false);
    if (!early.ok) { expect(early.rule).toBe('C5.4.1'); expect(early.fix).toMatch(/1 more/); }
    s = play(s, 1);
    s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 }));
    // Activation needs a roster place: linked release.
    expect(tx(s, { type: 'activate', clubId: 1, personId: 1001 }).ok).toBe(false);
    s = ok(tx(s, { type: 'activate', clubId: 1, personId: 1001, linked: [{ type: 'release', clubId: 1, personId: 900001 }] }));
    expect(entry(s, 1, 1001).list).toBe('active');
    expect(s.clubs[0]!.gamesPlayed).toBe(7);
  });

  it('activation without an open window is refused', () => {
    let s = inSeason(league({ clubs: 1, perClub: 53 }));
    s = ok(tx(hurt(s, [1001]), { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
    s = play(s, 1, 4);
    const r = tx(s, { type: 'activate', clubId: 1, personId: 1001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fix).toMatch(/window/);
  });

  it('a window left past 21 days ends his season', () => {
    let s = inSeason(league({ clubs: 1, perClub: 53 }));
    s = ok(tx(hurt(s, [1001]), { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
    s = play(s, 1, 4);
    s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 }));
    s = ok(ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 22, hour: 10 } }));
    expect(entry(s, 1, 1001).reserve!.seasonEnding).toBe(true);
    expect(tx(s, { type: 'activate', clubId: 1, personId: 1001 }).ok).toBe(false);
  });

  it('a healthy player placed on injured reserve is allowed and reported as a breakable act (H6.5.1)', () => {
    const s = inSeason(league({ clubs: 1, perClub: 53 }));
    const r = tx(s, { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.breakable[0]!.rule).toBe('H6.5.1');
  });

  it('injured reserve before the roster deadline is for the season', () => {
    let s = league({ clubs: 1, perClub: 60 });
    s = ok(tx(hurt(s, [1001]), { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
    expect(entry(s, 1, 1001).reserve!.seasonEnding).toBe(true);
  });
});

describe('return designations (C5.4.2)', () => {
  const withIr = (n: number) => {
    let s = inSeason(league({ clubs: 1, perClub: 53, spare: 20 }));
    const ids = Array.from({ length: n }, (_, i) => 1001 + i);
    s = hurt(s, ids);
    for (const id of ids) s = ok(tx(s, { type: 'place_reserve', clubId: 1, personId: id, list: 'reserve_injured' }));
    return play(s, 1, 4);
  };

  it('eight in the regular season; a ninth is refused', () => {
    let s = withIr(9);
    for (let i = 0; i < 8; i++) s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 + i }));
    const r = tx(s, { type: 'open_return_window', clubId: 1, personId: 1009 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.rule).toBe('C5.4.2'); expect(r.code).toBe('limit'); }
  });

  it('a playoff club gets two more, to a maximum of ten', () => {
    let s = withIr(11);
    for (let i = 0; i < 8; i++) s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 + i }));
    s = ok(ev(s, { type: 'end_week', leagueWeek: 18 }));
    s = ok(ev(s, { type: 'begin_postseason', clubIds: [1] }));
    s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1009 }));
    s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1010 }));
    expect(tx(s, { type: 'open_return_window', clubId: 1, personId: 1011 }).ok).toBe(false);
  });

  it('a player may return at most twice in a season', () => {
    let s = withIr(1);
    for (let round = 0; round < 2; round++) {
      s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 }));
      s = ok(tx(s, { type: 'activate', clubId: 1, personId: 1001 }));
      s = ok(tx(hurt(s, [1001]), { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
      s = play(s, 1, 4);
    }
    const r = tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/returned 2 times/);
  });

  it('two players at the cutdown may be designated already; a third is refused, and outside the cutdown none', () => {
    let s = hurt(league({ clubs: 1, perClub: 56 }), [1001, 1002, 1003]);
    const place = (id: number) => ({ type: 'place_reserve' as const, clubId: 1, personId: id, list: 'reserve_injured' as const, designateToReturn: true });
    expect(tx(s, place(1001)).ok).toBe(false);
    expect(tx(s, { type: 'cutdown', clubId: 1, moves: [place(1001), place(1002), place(1003)] }).ok).toBe(false);
    s = ok(tx(s, { type: 'cutdown', clubId: 1, moves: [place(1001), place(1002), { type: 'release', clubId: 1, personId: 1003 }] }));
    expect(entry(s, 1, 1001).reserve!.seasonEnding).toBe(false);
    expect(s.clubs[0]!.designationsUsed).toBe(2);
  });
});

describe('PUP, NFI and suspended (C5.4.3)', () => {
  it('a player who practised in camp cannot go on PUP', () => {
    const s = hurt(league({ clubs: 1, perClub: 60 }), [1001]);
    const r = tx(s, { type: 'camp_designation', clubId: 1, personId: 1001, flag: 'pup' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.4.3');
  });

  it('active/PUP to reserve/PUP at the cutdown; window after game 2; activation from game 5', () => {
    let s = setFacts(league({ clubs: 1, perClub: 54, spare: 2 }), [facts(1001, { injured: true, practicedThisPreseason: false })]);
    expect(tx(s, { type: 'place_reserve', clubId: 1, personId: 1002, list: 'reserve_pup' }).ok).toBe(false);
    s = ok(tx(s, { type: 'camp_designation', clubId: 1, personId: 1001, flag: 'pup' }));
    s = ok(tx(s, { type: 'cutdown', clubId: 1, moves: [{ type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_pup' }] }));
    s = inSeason(s);
    s = play(s, 1);
    expect(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 }).ok).toBe(false);
    s = play(s, 1);
    s = ok(tx(s, { type: 'open_return_window', clubId: 1, personId: 1001 }));
    s = play(s, 1);
    expect(tx(s, { type: 'activate', clubId: 1, personId: 1001, linked: [{ type: 'release', clubId: 1, personId: 1002 }] }).ok).toBe(false);
    s = play(s, 1);
    s = ok(tx(s, { type: 'activate', clubId: 1, personId: 1001, linked: [{ type: 'release', clubId: 1, personId: 1002 }] }));
    expect(entry(s, 1, 1001).list).toBe('active');
  });

  it('a suspended player is off the 53 and returns when the games are served', () => {
    let s = inSeason(league({ clubs: 1, perClub: 53, spare: 2 }));
    s = ok(ev(s, { type: 'suspend', clubId: 1, personId: 1001, games: 2 }));
    s = ok(tx(s, { type: 'sign_free_agent', clubId: 1, personId: 900001 }));
    s = play(s, 1);
    expect(tx(s, { type: 'activate', clubId: 1, personId: 1001, linked: [{ type: 'release', clubId: 1, personId: 900001 }] }).ok).toBe(false);
    s = play(s, 1);
    ok(tx(s, { type: 'activate', clubId: 1, personId: 1001, linked: [{ type: 'release', clubId: 1, personId: 900001 }] }));
  });

  it('the new league year returns reserve players to the roster and empties practice squads', () => {
    let s = inSeason(league({ clubs: 1, perClub: 53, spare: 3 }));
    s = ok(tx(hurt(s, [1001]), { type: 'place_reserve', clubId: 1, personId: 1001, list: 'reserve_injured' }));
    s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900001 }));
    s = ok(ev(s, { type: 'new_league_year', seasonYear: 2027 }));
    expect(entry(s, 1, 1001).list).toBe('active');
    expect(s.clubs[0]!.entries.some((e) => e.personId === 900001)).toBe(false);
    expect(s.phase).toBe('offseason');
    expect(PRO.offseasonLimit).toBe(90);
  });
});
