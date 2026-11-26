// C5.7.1 acceptance 1: 100,000 random proposed transactions never produce an invalid RosterState.
// C5.1.1 acceptance 1: no sequence of legal moves leaves a club over 53 outside game-day elevations.
import { describe, expect, it } from 'vitest';
import { applyEvent, applyTransaction, validateRosters, type LeagueRosters, type RosterEvent, type Transaction } from '../../src/roster/index.ts';
import { PRO, facts, league, ok, setFacts } from './helpers.ts';

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

describe('transaction fuzz (C5.7.1)', () => {
  it('100,000 random proposals keep every invariant, and every accepted move reaches the wire', () => {
    const rand = rng(20261126);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
    const clubs = [1, 2, 3];
    let s: LeagueRosters = league({ clubs: 3, perClub: 58, spare: 60 });
    s = setFacts(s, Object.values(s.players).map((p) => facts(p.personId, {
      accruedSeasons: Math.floor(rand() * 8), pensionCreditedSeasons: Math.floor(rand() * 8),
      activeGamesInLastAccruedSeason: Math.floor(rand() * 17), offensiveLineman: rand() < 0.2, quarterback: rand() < 0.06,
      practicedThisPreseason: rand() < 0.8, internationalPathway: rand() < 0.05, injured: rand() < 0.3, nonFootballInjury: rand() < 0.05,
    })));
    const people = Object.keys(s.players).map(Number);
    let accepted = 0, refused = 0, events = 0;
    const phases = new Set<string>();
    const types = new Set<string>();
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const c = pick(clubs), p = pick(people);
      const roll = rand();
      let res;
      if (roll < 0.08) {
        const e: RosterEvent = pick<RosterEvent>([
          { type: 'advance_time', to: { dayIndex: s.now.dayIndex + Math.floor(rand() * 3), hour: Math.floor(rand() * 24) } },
          { type: 'game_played', clubId: c },
          { type: 'end_week', leagueWeek: s.leagueWeek + 1 },
          { type: 'pass_trade_deadline' },
          { type: 'roster_deadline', claimDeadline: { dayIndex: s.now.dayIndex + 1, hour: 13 } },
          { type: 'begin_postseason', clubIds: [c] },
          { type: 'suspend', clubId: c, personId: p, games: 1 + Math.floor(rand() * 4) },
          { type: 'set_next_game', clubId: c, opponentId: pick(clubs), dayIndex: s.now.dayIndex + Math.floor(rand() * 9) },
          ...(rand() < 0.02 ? [{ type: 'new_league_year' as const, seasonYear: s.seasonYear + 1 }] : []),
        ]);
        res = applyEvent(s, e, PRO);
        if (res.ok) events += 1;
      } else {
        const t: Transaction = pick<Transaction>([
          { type: 'sign_free_agent', clubId: c, personId: p },
          { type: 'sign_free_agent', clubId: c, personId: p, linked: [{ type: 'release', clubId: c, personId: pick(people) }] },
          { type: 'sign_practice_squad', clubId: c, personId: p },
          { type: 'sign_from_practice_squad', clubId: c, personId: p },
          { type: 'elevate', clubId: c, personId: p, emergencyQb: rand() < 0.2 },
          { type: 'release', clubId: c, personId: p },
          { type: 'claim', clubId: c, personId: p, linked: rand() < 0.5 ? [{ type: 'release', clubId: c, personId: pick(people) }] : [] },
          { type: 'place_reserve', clubId: c, personId: p, list: pick(['reserve_injured', 'reserve_pup', 'reserve_nfi'] as const), designateToReturn: rand() < 0.1 },
          { type: 'camp_designation', clubId: c, personId: p, flag: pick(['pup', 'nfi'] as const) },
          { type: 'open_return_window', clubId: c, personId: p },
          { type: 'activate', clubId: c, personId: p },
          { type: 'protect', clubId: c, personIds: [p, pick(people)] },
          { type: 'trade', clubId: c, otherClubId: pick(clubs), give: [p], get: [pick(people)] },
          { type: 'cutdown', clubId: c, moves: Array.from({ length: Math.floor(rand() * 8) }, () => ({ type: 'release' as const, clubId: c, personId: pick(people) })) },
        ]);
        res = applyTransaction(s, t, PRO);
        if (res.ok) { accepted += 1; types.add(t.type); expect(res.wire.length).toBeGreaterThan(0); }
        else refused += 1;
      }
      if (res.ok) {
        const problems = validateRosters(res.state, PRO);
        if (problems.length) throw new Error(`step ${i}: ${JSON.stringify(res.state.phase)} ${problems.join('; ')}`);
        s = res.state;
        phases.add(s.phase);
      }
    }
    expect([...phases].sort()).toEqual(['offseason', 'postseason', 'regular']);
    expect(types.size).toBeGreaterThanOrEqual(12);
    expect(accepted + refused + events).toBeGreaterThan(N * 0.9);
    expect(accepted).toBeGreaterThan(1000);
    expect(refused).toBeGreaterThan(1000);
    expect(ok({ ok: true, state: s, wire: [], breakable: [] })).toBe(s);
  }, 600_000);
});
