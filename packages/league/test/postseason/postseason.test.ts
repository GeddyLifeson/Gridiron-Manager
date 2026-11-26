// C3.4 bracket (pro), T3.5 college field and bracket under both formats, C3.5 draft order, T3.4
// rankings, T3.6 bowls, T3.8 ceremonial dates.
// FIXTURE rule values, not facts. Sources for G-10's fact rows:
//   pro bracket (7, 1 bye, reseed, higher seed hosts through the conference final, neutral final):
//     research/audit-r-schedule-tiebreak-playoffs.md section 4 (Verified).
//   college 2026 (12, 4 byes by ranking, 5-8 host round one, quarterfinals on at bowls) and 2027 (24, 8 byes,
//     9-16 host round one, 1-8 host round two, 19 at-large from the top 25): bible T3.5.1 table and
//     research/audit-r-schedule-patterns.md (2026 Verified, 2027 Verified).
//   bowl eligibility 6 wins (2 of 3), one lower-subdivision win (starting rule), 5-win short fill (Unverified): T3.6.1.
//   ranking: one lower-subdivision win credited from 2027 (2 of 3), 10-game standard: T3.4.1.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  RULE_KEYS, PARAMS, createBracket, recordWinner, pendingGames, roundLost, formatFromRules, designatedHomeGroup,
  draftOrder, selectCollegeField, committeeRanking, resumes, poll, selectBowls, ceremonialDates, type Bracket, type BracketFormat,
} from '../../src/postseason/index.ts';
import { ruleValueProblems, seasonTable, type GameResult, type TeamId } from '../../src/standings/index.ts';
import { Games, PRO_RULES, fixedDraw, lcg, proLeague, seededDraw } from '../standings/fixture.ts';

const PRO_POST = {
  ...PRO_RULES,
  'playoff.grouping': 'conference', 'playoff.byes': 1, 'playoff.reseed': true, 'playoff.campus_rounds': 3,
  'cfp.power_champions_auto': false, 'cfp.other_auto_bids': 0, 'cfp.independent_auto_rank': 0, 'cfp.at_large_pool_rank': 0,
  'ranking.lower_division_wins_credited': 0, 'ranking.schedule_standard_games': 0,
  'bowl.eligibility_wins': 6, 'bowl.lower_division_wins_counted': 1, 'bowl.fill_min_wins': 5, 'ceremony.home_dates': false,
};
const CFP_2026 = {
  ...PRO_POST, 'playoff.grouping': 'national', 'playoff.field_size': 12, 'playoff.byes': 4, 'playoff.reseed': false, 'playoff.campus_rounds': 1,
  'cfp.power_champions_auto': true, 'cfp.other_auto_bids': 1, 'cfp.independent_auto_rank': 12, 'cfp.at_large_pool_rank': 0,
  'ranking.lower_division_wins_credited': 0, 'ranking.schedule_standard_games': 0, 'ceremony.home_dates': true,
};
const CFP_2027 = {
  ...CFP_2026, 'playoff.field_size': 24, 'playoff.byes': 8, 'playoff.campus_rounds': 2,
  'cfp.independent_auto_rank': 0, 'cfp.at_large_pool_rank': 25,
  'ranking.lower_division_wins_credited': 1, 'ranking.schedule_standard_games': 10,
};

const seq = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

/** Plays a bracket to the end; `pick` chooses each winner. */
function playOut(b: Bracket, pick: (teams: readonly [TeamId, TeamId], key: string) => TeamId): Bracket {
  let cur = b;
  for (let guard = 0; guard < 100 && cur.champion === null; guard++) {
    const p = pendingGames(cur);
    if (!p.length) throw new Error('bracket stalled');
    for (const g of p) cur = recordWinner(cur, g.key, pick(g.teams, g.key));
  }
  return cur;
}

describe('manifests', () => {
  it('rule keys and params are valid contract shapes and each fixture covers every key', () => {
    expect(RuleKeyManifest.safeParse(RULE_KEYS).success).toBe(true);
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    for (const r of [PRO_POST, CFP_2026, CFP_2027]) expect(ruleValueProblems(RULE_KEYS, r)).toEqual([]);
  });
});

describe('C3.4.1 pro bracket', () => {
  const fmt = formatFromRules(PRO_POST);
  const groups = [{ groupId: 1, seeds: seq(1, 7) }, { groupId: 2, seeds: seq(17, 7) }];
  it('wild-card round: seed 1 has a bye; 2 hosts 7, 3 hosts 6, 4 hosts 5', () => {
    const b = createBracket(fmt, groups);
    const afc = b.games.filter((g) => g.group === 1);
    expect(afc.map((g) => [g.teams, g.host])).toEqual([[[2, 7], 2], [[3, 6], 3], [[4, 5], 4]]);
    expect(b.games.some((g) => g.teams.includes(1))).toBe(false);
  });
  it('divisional round is reseeded: seed 1 hosts the lowest remaining seed', () => {
    let b = createBracket(fmt, groups);
    // Upsets: 7 beats 2, 6 beats 3, 4 beats 5 => remaining 1, 4, 6, 7.
    for (const [k, w] of [['1:1:2', 7], ['1:1:3', 6], ['1:1:4', 4]] as const) b = recordWinner(b, k, w);
    const div = b.games.filter((g) => g.group === 1 && g.round === 2);
    expect(div.map((g) => [g.teams, g.host])).toEqual([[[1, 7], 1], [[4, 6], 4]]);
  });
  it('conference final at the higher seed, league final at a neutral site, champion set; no ties', () => {
    const b = playOut(createBracket(fmt, groups), (t) => Math.max(...t));
    const conf = b.games.filter((g) => g.round === 3);
    for (const g of conf) expect(g.host).toBe(g.teams[0]);
    const final = b.games.find((g) => g.round === 4)!;
    expect(final.host).toBeNull();
    expect(b.champion).toBe(final.winner);
    expect(() => recordWinner(createBracket(fmt, groups), '1:1:2', 3)).toThrow();
  });
  it('1,000 simulated postseasons: the top seed never plays in the wild-card round and always faces the lowest surviving seed', () => {
    fc.assert(fc.property(fc.array(fc.boolean(), { minLength: 13, maxLength: 13 }), (flips) => {
      let i = 0;
      const b = playOut(createBracket(fmt, groups), (t) => (flips[i++ % flips.length] ? t[0] : t[1]));
      for (const grp of groups) {
        const top = grp.seeds[0]!;
        expect(b.games.some((g) => g.round === 1 && g.teams.includes(top))).toBe(false);
        const div = b.games.filter((g) => g.group === grp.groupId && g.round === 2);
        const survivors = div.flatMap((g) => [...g.seeds]);
        const topGame = div.find((g) => g.teams.includes(top))!;
        expect(topGame.seeds[1]).toBe(Math.max(...survivors));
      }
    }), { numRuns: 1000 });
  });
  it('the designated home team of the final alternates by conference each year', () => {
    expect(designatedHomeGroup([1, 2], 2026)).not.toBe(designatedHomeGroup([1, 2], 2027));
  });
});

describe('T3.5.1 college bracket: both formats fill with the right count and hosts', () => {
  it('2026: 12 teams, top 4 byes, 5-8 host 9-12 on campus, quarterfinals on are neutral, fixed bracket', () => {
    const f = formatFromRules(CFP_2026);
    const b0 = createBracket(f, [{ groupId: 0, seeds: seq(1, 12) }]);
    expect(b0.games.map((g) => [g.seeds, g.host])).toEqual([[[5, 12], 5], [[6, 11], 6], [[7, 10], 7], [[8, 9], 8]]);
    // Upsets everywhere in round one: 12, 11, 10, 9 win. Fixed bracket: 1 meets the 8/9 winner (9), not the lowest seed.
    let b = b0;
    for (const g of pendingGames(b)) b = recordWinner(b, g.key, g.teams[1]);
    const qf = b.games.filter((g) => g.round === 2);
    expect(qf.map((g) => [g.seeds, g.host])).toEqual([[[1, 9], null], [[2, 10], null], [[3, 11], null], [[4, 12], null]]);
    b = playOut(b, (t) => Math.min(...t));
    expect(b.games).toHaveLength(11);
    expect(b.games.filter((g) => g.round === 4)).toHaveLength(1);
    expect(b.champion).toBe(1);
  });
  it('2027: 24 teams, 9-16 host 17-24, seeds 1-8 host round two, quarterfinals on neutral', () => {
    const f = formatFromRules(CFP_2027);
    let b = createBracket(f, [{ groupId: 0, seeds: seq(1, 24) }]);
    expect(b.games).toHaveLength(8);
    for (const g of b.games) { expect(g.seeds[0]).toBeGreaterThanOrEqual(9); expect(g.seeds[0]).toBeLessThanOrEqual(16); expect(g.host).toBe(g.teams[0]); expect(g.seeds[0] + g.seeds[1]).toBe(33); }
    for (const g of pendingGames(b)) b = recordWinner(b, g.key, g.teams[1]);
    const r2 = b.games.filter((g) => g.round === 2);
    expect(r2).toHaveLength(8);
    for (const g of r2) { expect(g.seeds[0]).toBeLessThanOrEqual(8); expect(g.host).toBe(g.teams[0]); }
    b = playOut(b, (t) => Math.min(...t));
    expect(b.games).toHaveLength(23);
    for (const g of b.games.filter((x) => x.round >= 3)) expect(g.host).toBeNull();
  });
  it('format switches on the save year: the same code reads either year file', () => {
    expect(formatFromRules(CFP_2026).fieldSize).toBe(12);
    expect(formatFromRules(CFP_2027).fieldSize).toBe(24);
    expect(() => formatFromRules({ ...CFP_2026, 'playoff.byes': 3 })).toThrow();
  });
});

describe('T3.5.1 college field selection', () => {
  // 40 teams ranked 1..40 by id. Power conferences 1-4 (champions 3, 6, 15, 20). Others 5-10 (best is 13, champion 30).
  const ranking = seq(1, 40);
  const confs = [
    { conferenceId: 1, power: true, champion: 3, teamIds: [1, 3, 21] },
    { conferenceId: 2, power: true, champion: 6, teamIds: [2, 6, 22] },
    { conferenceId: 3, power: true, champion: 15, teamIds: [4, 15, 23] },
    { conferenceId: 4, power: true, champion: 20, teamIds: [5, 20, 24] },
    { conferenceId: 5, power: false, champion: 30, teamIds: [13, 30] },
    { conferenceId: 6, power: false, champion: 31, teamIds: [31, 32] },
  ];
  it('2026: four power champions, the best-ranked team of the others (champion or not), at-large to 12, seeded by ranking', () => {
    const f = selectCollegeField({ ranking, conferences: confs, independents: [] }, CFP_2026);
    expect(f.seeds).toHaveLength(12);
    expect(f.reason.get(13)).toBe('other_best');
    expect(f.reason.get(30)).toBeUndefined();
    for (const c of [3, 6, 15, 20]) expect(f.reason.get(c)).toBe('power_champion');
    expect(f.seeds).toEqual([...f.seeds].sort((a, b) => a - b));
    expect(f.seeds.slice(0, 4)).toEqual([1, 2, 3, 4]); // byes to the four highest-ranked, champions or not
  });
  it('2026: a power-level independent ranked in the top 12 is in', () => {
    const f = selectCollegeField({ ranking, conferences: confs, independents: [11] }, CFP_2026);
    expect(f.reason.get(11)).toBe('independent');
  });
  it('2027: the best team of the other six ranked outside the top 24 still gets in and the last at-large drops', () => {
    const late = confs.map((c) => (c.conferenceId === 5 ? { ...c, teamIds: [33, 34], champion: 33 } : c.conferenceId === 6 ? { ...c, teamIds: [35], champion: 35 } : c));
    const f = selectCollegeField({ ranking, conferences: late, independents: [] }, CFP_2027);
    expect(f.seeds).toHaveLength(24);
    expect(f.seeds).toContain(33);
    expect(f.seeds[23]).toBe(33);
    expect(f.atLarge).toHaveLength(19);
    expect(f.seeds).not.toContain(24); // the last at-large that would have made it
  });
});

describe('C3.5.1 draft order hand-off', () => {
  const LEAGUE = proLeague();
  function season(seed: number): GameResult[] {
    const r = lcg(seed); const g = new Games();
    for (let w = 1; w <= 17; w++) {
      const pool = LEAGUE.map((p) => p.id);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
      for (let i = 0; i < 32; i += 2) { const a = Math.floor(r.next() * 35); g.add(pool[i]!, pool[i + 1]!, a, (a + 1 + Math.floor(r.next() * 20)) % 36, { week: w }); }
    }
    return g.list;
  }
  it('32 distinct clubs; 1-18 out of the playoffs, 19-24 wild-card losers, 25-28 divisional, 29-30 conference, 31 runner-up, 32 champion', () => {
    for (let s = 1; s <= 10; s++) {
      const results = season(s);
      const t = seasonTable(LEAGUE, results, PRO_POST, seededDraw(s));
      const b = playOut(createBracket(formatFromRules(PRO_POST), t.conferences.map((c) => ({ groupId: c.conferenceId, seeds: c.seeds }))), (x) => x[(s + x[0]) % 2]!);
      const order = draftOrder(LEAGUE, results, PRO_POST, seededDraw(s), roundLost(b), b.champion!, t.divisionOrder);
      expect(new Set(order.slots.map((x) => x.teamId)).size).toBe(32);
      expect(order.slots[31]!.teamId).toBe(b.champion);
      const tiers = order.slots.map((x) => x.tier);
      expect(tiers.filter((x) => x === 0)).toHaveLength(18);
      expect(tiers.slice(18, 24).every((x) => x === 1)).toBe(true);
      expect(tiers.slice(24, 28).every((x) => x === 2)).toBe(true);
      expect(tiers.slice(28, 30).every((x) => x === 3)).toBe(true);
      expect(tiers[30]).toBe(4);
      // Inside a tier: worse record first.
      for (let i = 1; i < 32; i++) if (tiers[i] === tiers[i - 1]) expect(t.ledger.pct(order.slots[i]!.teamId)).toBeGreaterThanOrEqual(t.ledger.pct(order.slots[i - 1]!.teamId));
    }
  });
  it('equal records: lower strength of schedule picks earlier', () => {
    // Clubs 1 and 17 (different conferences) both 0-1; 1 lost to a 0-1 club... set so 17's opponent is stronger.
    const g = new Games().add(2, 1, 20, 10).add(18, 17, 20, 10).add(18, 19, 20, 10).add(3, 2, 20, 10);
    const order = draftOrder(LEAGUE, g.list, PRO_POST, fixedDraw(), new Map([[2, 1], [18, 1]]), 3);
    const pos = (id: TeamId) => order.slots.findIndex((x) => x.teamId === id);
    // 1's opponent 2 is 1-1 (.5); 17's opponent 18 is 2-0 (1.0): 1 has the lower strength of schedule.
    expect(pos(1)).toBeLessThan(pos(17));
  });
  it('then the interconference steps, the club that loses the tie picking first; coin toss last', () => {
    const g = new Games().add(1, 17, 20, 10); // 1 beat 17 head to head: 17 picks first
    const order = draftOrder(LEAGUE, g.list, PRO_POST, fixedDraw(), new Map(), 32);
    const pos = (id: TeamId) => order.slots.findIndex((x) => x.teamId === id);
    expect(pos(17)).toBeLessThan(pos(1));
  });
});

describe('T3.4.1 rankings', () => {
  const teams = seq(201, 8);
  function results(): GameResult[] {
    const g = new Games();
    // 201 unbeaten power champion; 202 one loss to 201; others mixed; 208 lost to everyone.
    for (const o of [202, 203, 204, 205, 206]) g.add(201, o, 28, 14);
    g.add(202, 203, 24, 17).add(202, 204, 31, 10).add(203, 205, 20, 17).add(204, 206, 21, 14).add(205, 206, 17, 14);
    for (const o of [201, 202, 203, 204, 205, 206, 207]) g.add(o, 208, 35, 0);
    g.add(207, 206, 14, 10);
    return g.list;
  }
  const input = { teamIds: teams, results: results(), champions: [201] };
  it('with noise off the ranking is a pure function of results', () => {
    expect(committeeRanking(input, CFP_2026, null).order).toEqual(committeeRanking(input, CFP_2026, null).order);
  });
  it('an unbeaten champion with a strong resume ranks at the top (fixture season)', () => {
    expect(committeeRanking(input, CFP_2026, null).order.indexOf(201)).toBeLessThan(4);
    for (let s = 1; s <= 50; s++) expect(committeeRanking(input, CFP_2026, lcg(s)).order.indexOf(201)).toBeLessThan(4);
  });
  it('there is no top-4 floor for an unbeaten power champion: a weak schedule can rank it below one-loss teams', () => {
    // Real case: the 2023 final ranking put 13-0 ACC champion Florida State fifth and out of the four-team
    // field (NPR 2023-12-03, Axios 2023-12-05, CBS Sports 2023-12-03). The bible's old acceptance line
    // ("never outside the top 4") is dropped (fix sent to the integrator).
    const g = new Games();
    const strong = [401, 402, 403, 404, 405];
    strong.forEach((t, i) => g.add(t, strong[(i + 1) % 5]!, 24, 17)); // a cycle: each strong team 1-1 among them
    const mid = [421, 422, 423, 424, 425, 426];
    for (const t of strong) for (const m of mid) g.add(t, m, 31, 20);
    const low = [431, 432, 433, 434, 435, 436];
    for (const m of mid) for (const l of low) g.add(m, l, 30, 10);
    const weak = [411, 412, 413, 414, 415, 416];
    for (const w of weak) g.add(400, w, 28, 21); // unbeaten champion 400 against teams that win nothing
    const r = committeeRanking({ teamIds: [400, ...strong, ...mid, ...low, ...weak], results: g.list, champions: [400] }, CFP_2026, null);
    expect(r.resumes.find((x) => x.teamId === 400)!.record).toEqual({ w: 6, l: 0, t: 0 });
    expect(r.order.indexOf(400)).toBeGreaterThanOrEqual(4);
  });
  it('margin above the cap earns nothing', () => {
    const a = new Games().add(201, 202, 49, 0).list, b = new Games().add(201, 202, 21, 0).list;
    const sa = resumes({ ...input, results: a }, CFP_2026).find((r) => r.teamId === 201)!.score;
    const sb = resumes({ ...input, results: b }, CFP_2026).find((r) => r.teamId === 201)!.score;
    expect(sa).toBe(sb);
  });
  it('from 2027 a second win over a lower-subdivision team adds nothing, and a short schedule is penalised', () => {
    const g = new Games().add(201, 900, 40, 0).add(201, 901, 40, 0).list;
    const one = new Games().add(201, 900, 40, 0).list;
    const s26 = (r: GameResult[]) => resumes({ ...input, results: r }, CFP_2026).find((x) => x.teamId === 201)!.score;
    const s27 = (r: GameResult[]) => resumes({ ...input, results: r }, CFP_2027).find((x) => x.teamId === 201)!.score;
    expect(s26(g)).toBeGreaterThan(s26(one));
    expect(s27(g)).toBe(s27(one));
    expect(s27(one)).toBeLessThan(s26(one)); // one top-subdivision game against a 10-game standard
  });
  it('head to head swaps teams inside the close band', () => {
    // 203 and 204 close; 204 beat 203.
    const g = new Games().add(204, 203, 17, 14).add(203, 205, 20, 10).add(204, 206, 20, 10).add(203, 207, 20, 10);
    const r = committeeRanking({ teamIds: [203, 204, 205, 206, 207], results: g.list, champions: [] }, CFP_2026, null);
    expect(r.order.indexOf(204)).toBeLessThan(r.order.indexOf(203));
  });
  it('polls: preseason position fades over the fade weeks; voters fill ballots', () => {
    const pre = new Map(teams.map((t) => [t, t === 208 ? 100 : 0]));
    const week0 = poll({ ...input, week: 0, previous: null, preseason: pre, voters: 10 }, CFP_2026, lcg(1));
    const week8 = poll({ ...input, week: 8, previous: null, preseason: pre, voters: 10 }, CFP_2026, lcg(1));
    expect(week0.order[0]).toBe(208);
    expect(week8.order.indexOf(208)).toBe(teams.length - 1);
  });
});

describe('T3.6.1 bowls', () => {
  const teams = seq(301, 12).map((id, i) => ({ teamId: id, conferenceId: i < 6 ? 1 : 2, conferenceRank: (i % 6) + 1, academicScore: id }));
  function withWins(wins: Record<number, number>, lowerWins: Record<number, number> = {}): GameResult[] {
    const g = new Games();
    for (const t of teams) {
      for (let k = 0; k < (wins[t.teamId] ?? 0); k++) g.add(t.teamId, 990 - k, 1, 0); // filler top-subdivision opponents 980-990
    }
    // Opponents 800 and up are not in the team list: lower subdivision.
    for (const [t, n] of Object.entries(lowerWins)) for (let k = 0; k < n; k++) g.add(Number(t), 800 + k, 1, 0);
    return g.list;
  }
  const allTeams = [...teams, ...seq(980, 11).map((id) => ({ teamId: id, conferenceId: null, conferenceRank: 99, academicScore: 0 }))];
  const bowls = [
    { bowlId: 1, order: 1, slots: [{ conferenceId: 1, priority: 1 }, { conferenceId: 2, priority: 1 }] as const },
    { bowlId: 2, order: 2, slots: [{ conferenceId: 1, priority: 2 }, null] as const },
    { bowlId: 3, order: 3, slots: [null, null] as const },
  ];
  it('eligible at 6 wins; one lower-subdivision win counts', () => {
    const results = withWins({ 301: 6, 302: 5 }, { 302: 2 });
    const sel = selectBowls({ teams: allTeams, results, ranking: [], playoffTeams: [], bowls }, CFP_2026);
    expect(sel.eligible).toContain(301);
    expect(sel.eligible).toContain(302); // 5 + 1 of its 2 lower-subdivision wins
  });
  it('tie-ins by conference standing, then at-large by ranking; playoff teams never go to these bowls; nobody under 5 wins', () => {
    const w: Record<number, number> = {};
    for (const t of teams) w[t.teamId] = 7;
    w[301] = 10; w[312] = 4;
    const results = withWins(w);
    const sel = selectBowls({ teams: allTeams, results, ranking: [307, 303, 308], playoffTeams: [301], bowls }, CFP_2026);
    const g1 = sel.games.find((g) => g.bowlId === 1)!;
    expect(g1.teams).toEqual([302, 307]); // conference 1's best non-playoff team, conference 2's best
    const g2 = sel.games.find((g) => g.bowlId === 2)!;
    expect(g2.teams[0]).toBe(303);
    expect(g2.teams[1]).toBe(308); // at-large by ranking
    expect(sel.games.flatMap((g) => g.teams)).not.toContain(301);
    expect(sel.games.flatMap((g) => g.teams)).not.toContain(312);
  });
  it('when eligible teams run short, 5-win teams fill by academic measure; berths = 2 per bowl', () => {
    const results = withWins({ 301: 6, 302: 6, 303: 6, 304: 5, 305: 5, 306: 5, 307: 4 });
    const sel = selectBowls({ teams: allTeams, results, ranking: [], playoffTeams: [], bowls }, CFP_2026);
    expect(sel.games).toHaveLength(3);
    expect(sel.shortFill).toEqual([306, 305, 304]);
    expect(sel.games.flatMap((g) => g.teams)).not.toContain(307);
  });
});

describe('T3.8.1 ceremonial home games', () => {
  const homes = [
    { gameId: 1, week: 1, opponent: 50, conferenceGame: false, opponentStrengthEstimate: 0.2 },
    { gameId: 2, week: 4, opponent: 51, conferenceGame: true, opponentStrengthEstimate: 0.1 },
    { gameId: 3, week: 6, opponent: 52, conferenceGame: false, opponentStrengthEstimate: 0.5 },
    { gameId: 4, week: 11, opponent: 53, conferenceGame: true, opponentStrengthEstimate: 0.9 },
  ];
  it('senior day is the last home game; homecoming is the weakest non-conference visitor', () => {
    expect(ceremonialDates(homes, CFP_2026)).toEqual({ homecomingGameId: 1, seniorDayGameId: 4 });
  });
  it('both dates appear on every college schedule with a home game available', () => {
    expect(ceremonialDates([homes[0]!], CFP_2026)).toEqual({ homecomingGameId: 1, seniorDayGameId: 1 });
  });
  it('the pro level has no equivalent', () => {
    expect(ceremonialDates(homes, PRO_POST)).toBeNull();
  });
});

describe('bracket format validation', () => {
  it('rejects shapes that cannot fill', () => {
    const bad: BracketFormat = { grouping: 'national', fieldSize: 10, byes: 1, reseed: false, campusRounds: 1 };
    expect(() => createBracket(bad, [{ groupId: 0, seeds: seq(1, 10) }])).toThrow();
  });
});
