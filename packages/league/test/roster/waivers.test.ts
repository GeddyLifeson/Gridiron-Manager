import { describe, expect, it } from 'vitest';
import { claimDeadline, waiverOrder, type LeagueRosters } from '../../src/roster/index.ts';
import { COLLEGE, PRO, ev, facts, inSeason, league, ok, play, setFacts, tx } from './helpers.ts';

const vet = (id: number) => facts(id, { accruedSeasons: 6, pensionCreditedSeasons: 6 });
const owner = (s: LeagueRosters, id: number) => s.clubs.find((c) => c.entries.some((e) => e.personId === id))?.clubId ?? null;

describe('waivers and claims (C5.5.1)', () => {
  it('fewer than four seasons: waivers; vested: free agent until the trade deadline, waivers after it', () => {
    let s = inSeason(league({ clubs: 3, perClub: 53 }));
    s = setFacts(s, [vet(1002), vet(1003)]);
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    expect(s.waivers.map((w) => w.personId)).toEqual([1001]);
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1002 }));
    expect(s.waivers.some((w) => w.personId === 1002)).toBe(false);
    expect(ev(s, { type: 'pass_trade_deadline' }).ok).toBe(false);
    s = ok(ev(s, { type: 'end_week', leagueWeek: 9 }));
    s = ok(ev(s, { type: 'pass_trade_deadline' }));
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1003 }));
    expect(s.waivers.some((w) => w.personId === 1003)).toBe(true);
  });

  it('the vested measure is a key: accrued seasons can differ from pension-credited seasons', () => {
    let s = inSeason(league({ clubs: 2, perClub: 53 }));
    s = setFacts(s, [facts(1001, { accruedSeasons: 4, pensionCreditedSeasons: 3 })]);
    expect(ok(tx(s, { type: 'release', clubId: 1, personId: 1001 })).waivers).toHaveLength(1);
    const accrued = { ...PRO, waivers: { ...PRO.waivers!, vestedMeasure: 'accrued' as const } };
    expect(ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }, accrued)).waivers).toHaveLength(0);
  });

  it('with two claims the club with the worse record gets the player (C5.5.1 acceptance)', () => {
    let s = inSeason(league({ clubs: 3, perClub: 52 }));
    s = ok(ev(s, { type: 'set_waiver_order', priorSeason: [2, 3, 1], standings: [3, 2, 1] }));
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    s = ok(tx(s, { type: 'claim', clubId: 2, personId: 1001 }));
    s = ok(tx(s, { type: 'claim', clubId: 3, personId: 1001 }));
    const r = ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 2, hour: 0 } });
    expect(owner(ok(r), 1001)).toBe(2);
  });

  it('after week 3 priority follows current standings', () => {
    let s = inSeason(league({ clubs: 3, perClub: 52 }));
    s = ok(ev(s, { type: 'set_waiver_order', priorSeason: [2, 3, 1], standings: [3, 2, 1] }));
    s = ok(ev(s, { type: 'end_week', leagueWeek: 2 }));
    expect(waiverOrder(s, PRO)).toEqual([2, 3, 1]);
    s = ok(ev(s, { type: 'end_week', leagueWeek: 3 }));
    expect(waiverOrder(s, PRO)).toEqual([3, 2, 1]);
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    s = ok(tx(s, { type: 'claim', clubId: 2, personId: 1001 }));
    s = ok(tx(s, { type: 'claim', clubId: 3, personId: 1001 }));
    expect(owner(ok(ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 2, hour: 0 } })), 1001)).toBe(3);
  });

  it('a successful claim does not move a club down the order', () => {
    let s = inSeason(league({ clubs: 2, perClub: 51 }));
    s = ok(ev(s, { type: 'set_waiver_order', priorSeason: [2, 1] }));
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    s = ok(tx(s, { type: 'claim', clubId: 2, personId: 1001 }));
    s = ok(ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 2, hour: 0 } }));
    expect(waiverOrder(s, PRO)).toEqual([2, 1]);
  });

  it('a club at 53 must link a release; if its claim loses, the release is not made', () => {
    let s = inSeason(league({ clubs: 3, perClub: 53 }));
    s = ok(ev(s, { type: 'set_waiver_order', priorSeason: [2, 3, 1] }));
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    expect(tx(s, { type: 'claim', clubId: 3, personId: 1001 }).ok).toBe(false);
    s = ok(tx(s, { type: 'claim', clubId: 3, personId: 1001, linked: [{ type: 'release', clubId: 3, personId: 3001 }] }));
    expect(owner(s, 3001)).toBe(3);
    s = ok(tx(s, { type: 'claim', clubId: 2, personId: 1001, linked: [{ type: 'release', clubId: 2, personId: 2001 }] }));
    s = ok(ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 2, hour: 0 } }));
    expect(owner(s, 1001)).toBe(2);
    expect(owner(s, 3001)).toBe(3);
    expect(s.waivers.some((w) => w.personId === 2001)).toBe(true);
  });

  it('the waiving club cannot claim, a claim after the period is refused, unclaimed players become free agents', () => {
    let s = inSeason(league({ clubs: 2, perClub: 52 }));
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    expect(tx(s, { type: 'claim', clubId: 1, personId: 1001 }).ok).toBe(false);
    s = ok(ev(s, { type: 'advance_time', to: { dayIndex: s.now.dayIndex + 3, hour: 0 } }));
    expect(tx(s, { type: 'claim', clubId: 2, personId: 1001 }).ok).toBe(false);
    ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 1001 }));
  });

  it('claim period: 24 hours from the 4 p.m. deadline of the day the move counts for', () => {
    expect(claimDeadline({ dayIndex: 10, hour: 9 }, 24, PRO)).toEqual({ dayIndex: 11, hour: 16 });
    expect(claimDeadline({ dayIndex: 10, hour: 17 }, 24, PRO)).toEqual({ dayIndex: 12, hour: 16 });
    let s = league({ clubs: 2, perClub: 60 });
    s = ok(tx(s, { type: 'release', clubId: 1, personId: 1001 }));
    expect(s.waivers[0]!.deadline).toEqual({ dayIndex: 203, hour: 16 });
  });

  it('a league without waivers cuts players straight off, with aid kept per its key (T5.1.2)', () => {
    const s = league({ clubs: 1, perClub: 10, rules: COLLEGE });
    const r = tx(s, { type: 'release', clubId: 1, personId: 1001 }, COLLEGE);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.state.waivers).toHaveLength(0); expect(r.wire[0]!.kind).toBe('cut'); expect(r.wire[0]!.detail.aidKept).toBe(true); }
  });
});

describe('trade deadline (C5.5.2)', () => {
  it('trades move players both ways and are refused after the deadline', () => {
    let s = inSeason(league({ clubs: 2, perClub: 53 }));
    s = ok(tx(s, { type: 'trade', clubId: 1, otherClubId: 2, give: [1001], get: [2001] }));
    expect(owner(s, 1001)).toBe(2);
    expect(owner(s, 2001)).toBe(1);
    expect(tx(s, { type: 'trade', clubId: 1, otherClubId: 2, give: [1002], get: [] }).ok).toBe(false);
    s = ok(ev(s, { type: 'end_week', leagueWeek: 9 }));
    s = ok(ev(s, { type: 'pass_trade_deadline' }));
    const r = tx(s, { type: 'trade', clubId: 1, otherClubId: 2, give: [1002], get: [2002] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('C5.5.2');
    s = play(s, 1);
    s = ok(ev(s, { type: 'new_league_year', seasonYear: 2027 }));
    ok(tx(s, { type: 'trade', clubId: 1, otherClubId: 2, give: [1002], get: [2002] }));
  });

  it('practice squad players are not traded', () => {
    let s = inSeason(league({ clubs: 2, perClub: 52, spare: 2 }));
    s = ok(tx(s, { type: 'sign_practice_squad', clubId: 1, personId: 900001 }));
    expect(tx(s, { type: 'trade', clubId: 1, otherClubId: 2, give: [900001], get: [] }).ok).toBe(false);
  });
});
