// C3.1 records and standings, C3.1.3 division rank, C3.3.1 seeding, C3.3.2 clinching, C3.3.3 odds,
// T3.3.1 college conference standings.
import { describe, expect, it } from 'vitest';
import {
  Ledger, RULE_KEYS, PARAMS, ruleValueProblems, standingsRows, seasonTable, clinchStatus, playoffOdds, conferenceStandings,
  STARTING_CHAIN, type GameResult, type RemainingGame, type TeamId,
} from '../../src/standings/index.ts';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import { Games, PRO_RULES, fixedDraw, lcg, proLeague, seededDraw } from './fixture.ts';

const LEAGUE = proLeague();

/** A random full season: every club plays its division twice and 11 random others once. Deterministic. */
function randomSeason(seed: number, weeks = 17): { played: GameResult[]; all: RemainingGame[] } {
  const r = lcg(seed);
  const g = new Games();
  const all: RemainingGame[] = [];
  let week = 1;
  const clubs = LEAGUE.map((p) => p.id);
  for (let w = 0; w < weeks; w++) {
    const pool = [...clubs];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    for (let i = 0; i < pool.length; i += 2) {
      const a = pool[i]!, b = pool[i + 1]!;
      const pa = Math.floor(r.next() * 35), pb = Math.floor(r.next() * 35);
      g.add(a, b, pa, pb === pa && r.next() < 0.95 ? pb + 3 : pb, { week });
      all.push({ gameId: g.list[g.list.length - 1]!.gameId, week, teams: [a, b], neutralSite: false });
    }
    week++;
  }
  return { played: g.list, all };
}

describe('manifests', () => {
  it('rule keys and params are valid contract shapes and the fixture covers every key', () => {
    expect(RuleKeyManifest.safeParse(RULE_KEYS).success).toBe(true);
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    expect(ruleValueProblems(RULE_KEYS, PRO_RULES)).toEqual([]);
    expect(ruleValueProblems(RULE_KEYS, { ...PRO_RULES, 'tiebreak.restarts': 'sometimes' })).toHaveLength(1);
  });
});

describe('C3.1.1 game result record', () => {
  it('a 20-20 regular-season final is 0-0-1 for both clubs and .500', () => {
    const g = new Games().add(1, 2, 20, 20, { overtime: true });
    const rows = standingsRows(new Ledger(LEAGUE, g.list, PRO_RULES));
    for (const id of [1, 2]) {
      const row = rows.find((x) => x.teamId === id)!;
      expect(row.record).toEqual({ w: 0, l: 0, t: 1 });
      expect(row.pct).toBe(0.5);
    }
  });
  it('preseason and postseason results never enter the standings', () => {
    const g = new Games().add(1, 2, 20, 10, { phase: 'preseason' }).add(1, 2, 20, 10, { phase: 'postseason' });
    expect(new Ledger(LEAGUE, g.list, PRO_RULES).record(1)).toEqual({ w: 0, l: 0, t: 0 });
  });
});

describe('C3.1.2 standings columns (hand-checked)', () => {
  // Club 1: beats 2 (div) at home 24-10, loses at 5 (conf) 14-17, ties 17 (other conf) at home 20-20,
  // beats 3 (div) on the road 30-0. Club 2 also beats 18. Club 5 loses to 6. Club 3 beats 4.
  const g = new Games()
    .add(1, 2, 24, 10).add(5, 1, 17, 14).add(1, 17, 20, 20).add(3, 1, 0, 30)
    .add(2, 18, 21, 3).add(6, 5, 10, 7).add(3, 4, 13, 6);
  const row = standingsRows(new Ledger(LEAGUE, g.list, PRO_RULES)).find((x) => x.teamId === 1)!;
  it('record, percentage and points', () => {
    expect(row.record).toEqual({ w: 2, l: 1, t: 1 });
    expect(row.pct).toBe(2.5 / 4);
    expect([row.pointsFor, row.pointsAgainst, row.netPoints]).toEqual([88, 47, 41]);
  });
  it('home, road, division and conference splits', () => {
    expect(row.home).toEqual({ w: 1, l: 0, t: 1 });
    expect(row.road).toEqual({ w: 1, l: 1, t: 0 });
    expect(row.division).toEqual({ w: 2, l: 0, t: 0 });
    expect(row.conference).toEqual({ w: 2, l: 1, t: 0 });
  });
  it('streak and last five', () => {
    expect(row.streak).toEqual({ kind: 'W', length: 1 });
    expect(row.lastFive).toEqual({ w: 2, l: 1, t: 1 });
  });
  it('strength of victory and of schedule', () => {
    // Beaten: 2 (1-1), 3 (1-1) => 2-2 = .500. Played: 2, 5 (1-1), 17 (0-0-1), 3 => 3-3-1 = 3.5/7.
    expect(row.strengthOfVictory).toBe(0.5);
    expect(row.strengthOfSchedule).toBe(3.5 / 7);
  });
  it('a club with no wins has strength of victory 0', () => {
    const r4 = standingsRows(new Ledger(LEAGUE, g.list, PRO_RULES)).find((x) => x.teamId === 4)!;
    expect(r4.strengthOfVictory).toBe(0);
  });
});

describe('C3.1.3 final division rank and C3.3.1 seeding', () => {
  it('no two clubs in a division ever share a rank (20 random seasons)', () => {
    for (let s = 1; s <= 20; s++) {
      const t = seasonTable(LEAGUE, randomSeason(s).played, PRO_RULES, seededDraw(s));
      for (const d of t.divisions) expect(new Set(d.order).size).toBe(4);
    }
  });
  it('four division winners are seeds 1 to 4, three wild cards 5 to 7, winners above wild cards whatever the records', () => {
    for (let s = 1; s <= 20; s++) {
      const t = seasonTable(LEAGUE, randomSeason(s).played, PRO_RULES, seededDraw(s));
      for (const c of t.conferences) {
        expect(c.seeds).toHaveLength(7);
        expect(new Set(c.seeds.slice(0, 4))).toEqual(new Set(c.divisionWinners));
        for (const w of c.seeds.slice(4)) expect(c.divisionWinners).not.toContain(w);
        const pct = (id: TeamId) => t.ledger.pct(id);
        for (let i = 1; i < 4; i++) expect(pct(c.seeds[i - 1]!)).toBeGreaterThanOrEqual(pct(c.seeds[i]!));
        for (let i = 5; i < 7; i++) expect(pct(c.seeds[i - 1]!)).toBeGreaterThanOrEqual(pct(c.seeds[i]!));
        for (const r of c.rest) expect(pct(r)).toBeLessThanOrEqual(pct(c.seeds[6]!));
      }
    }
  });
  it('a division winner with a losing record still seeds in the top four (C3.3.1 edge case)', () => {
    const g = new Games();
    // Division 14 (13-16): 13 goes 1-2, everyone else in it loses all. Club 1 goes 3-0 but its division has 2 at 3-0 too.
    g.add(13, 14, 10, 0).add(17, 13, 10, 0).add(18, 13, 10, 0).add(19, 15, 10, 0).add(20, 16, 10, 0);
    for (const x of [1, 2, 5, 6, 9]) { g.add(x, 21, 10, 0).add(x, 22, 10, 0).add(x, 23, 10, 0); }
    const t = seasonTable(LEAGUE, g.list, PRO_RULES, fixedDraw());
    const c = t.conferences.find((x) => x.conferenceId === 1)!;
    expect(c.divisionWinners).toContain(13);
    expect(c.seeds.indexOf(13)).toBeLessThan(4);
  });
  it('is the same on repeated runs', () => {
    const season = randomSeason(7).played;
    expect(seasonTable(LEAGUE, season, PRO_RULES, seededDraw(3)).conferences).toEqual(seasonTable(LEAGUE, season, PRO_RULES, seededDraw(3)).conferences);
  });
});

/** A small league for clinching: one conference, two divisions of four, field of three (two winners and one wild card). */
const SMALL = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, conferenceId: 1, divisionId: id <= 4 ? 11 : 12 }));
const SMALL_RULES = { ...PRO_RULES, 'playoff.field_size': 3 };

function smallSeason(seed: number, playedWeeks: number, totalWeeks: number) {
  const r = lcg(seed);
  const played: GameResult[] = []; const remaining: RemainingGame[] = [];
  let id = 1;
  for (let w = 1; w <= totalWeeks; w++) {
    const pool = SMALL.map((p) => p.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    for (let i = 0; i < pool.length; i += 2) {
      const teams: [number, number] = [pool[i]!, pool[i + 1]!];
      if (w <= playedWeeks) {
        const a = Math.floor(r.next() * 30), b = Math.floor(r.next() * 30);
        played.push({ gameId: id, week: w, phase: 'regular', teams, points: [a, a === b ? b + 1 : b], touchdowns: [0, 0], overtime: false, forfeit: false, neutralSite: false });
      } else remaining.push({ gameId: id, week: w, teams, neutralSite: false });
      id++;
    }
  }
  return { played, remaining };
}

/** Brute force: every W/L outcome of the remaining games; does the club ever miss / ever make it? */
function bruteForce(played: GameResult[], remaining: RemainingGame[]) {
  const ever = new Map<TeamId, { miss: boolean; make: boolean }>(SMALL.map((p) => [p.id, { miss: false, make: false }]));
  const n = remaining.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const made = remaining.map((g, i) => ({ gameId: g.gameId, week: g.week, phase: 'regular' as const, teams: g.teams, points: ((mask >> i) & 1 ? [1, 0] : [0, 1]) as [number, number], touchdowns: [0, 0] as [number, number], overtime: false, forfeit: false, neutralSite: false }));
    // Real games would carry real scores: try two score patterns so points steps go both ways.
    for (const flip of [false, true]) {
      const results = [...played, ...made.map((m) => ({ ...m, points: flip ? ([m.points[0] * 40, m.points[1] * 40] as [number, number]) : m.points }))];
      for (const drawSeed of [1, 2]) {
        const t = seasonTable(SMALL, results, SMALL_RULES, seededDraw(drawSeed));
        const seeds = t.conferences[0]!.seeds;
        for (const p of SMALL) { const e = ever.get(p.id)!; if (seeds.includes(p.id)) e.make = true; else e.miss = true; }
      }
    }
  }
  return ever;
}

describe('C3.3.2 clinching and elimination', () => {
  it('never shows clinched for a club a brute-force check (8 clubs, 3 weeks left) shows can still miss', () => {
    for (let s = 1; s <= 6; s++) {
      const { played, remaining } = smallSeason(s, 4, 7);
      const brute = bruteForce(played, remaining);
      for (const budget of [1, 200000]) {
        const st = clinchStatus(SMALL, played, remaining, SMALL_RULES, seededDraw(1), { allowTies: false, nodeBudget: budget });
        for (const x of st) {
          const b = brute.get(x.teamId)!;
          if (x.clinchedPlayoffs) expect(b.miss, `club ${x.teamId} seed ${s} budget ${budget}`).toBe(false);
          if (x.eliminated) expect(b.make, `club ${x.teamId} seed ${s} budget ${budget}`).toBe(false);
        }
      }
    }
  });
  it('enumeration finds clinches that bounds alone cannot', () => {
    let enumerated = 0, bounded = 0;
    for (let s = 1; s <= 6; s++) {
      const { played, remaining } = smallSeason(s, 5, 7);
      enumerated += clinchStatus(SMALL, played, remaining, SMALL_RULES, seededDraw(1), { allowTies: false }).filter((x) => x.clinchedPlayoffs || x.eliminated).length;
      bounded += clinchStatus(SMALL, played, remaining, SMALL_RULES, seededDraw(1), { allowTies: false, nodeBudget: 1 }).filter((x) => x.clinchedPlayoffs || x.eliminated).length;
    }
    expect(enumerated).toBeGreaterThanOrEqual(bounded);
    expect(enumerated).toBeGreaterThan(0);
  });
  it('with no games left the flags match the final seeds exactly', () => {
    const { played } = smallSeason(3, 7, 7);
    const st = clinchStatus(SMALL, played, [], SMALL_RULES, seededDraw(1), { allowTies: true });
    const seeds = seasonTable(SMALL, played, SMALL_RULES, seededDraw(1)).conferences[0]!.seeds;
    for (const x of st) {
      expect(x.method).toBe('complete');
      expect(x.clinchedPlayoffs).toBe(seeds.includes(x.teamId));
      expect(x.eliminated).toBe(!seeds.includes(x.teamId));
      expect(x.clinchedTopSeed).toBe(seeds[0] === x.teamId);
    }
  });
  it('ties are enumerated when the level allows them', () => {
    const { played, remaining } = smallSeason(2, 6, 7);
    const st = clinchStatus(SMALL, played, remaining, SMALL_RULES, seededDraw(1), { allowTies: true });
    expect(st.every((x) => x.method === 'enumerated')).toBe(true);
  });
});

describe('C3.3.3 playoff odds', () => {
  const model = {
    winProbability: (a: TeamId, b: TeamId) => 1 / (1 + Math.exp(((b % 8) - (a % 8)) / 4)),
    tieProbability: () => 0,
  };
  it('a 32-club league with half a season left runs 2,000 simulations in under 2 s', () => {
    const { all } = randomSeason(11);
    const played = randomSeason(11).played.filter((g) => g.week <= 9);
    const remaining = all.filter((g) => g.week > 9);
    const t0 = performance.now();
    const odds = playoffOdds(LEAGUE, played, remaining, PRO_RULES, model, lcg(5), seededDraw(5));
    const ms = performance.now() - t0;
    expect(odds).toHaveLength(32);
    const perConf = odds.filter((o) => o.teamId <= 16).reduce((s, o) => s + o.playoffs, 0);
    expect(perConf).toBeCloseTo(7, 6);
    expect(ms).toBeLessThan(2000);
  });
  it('calibration: clubs given about 30% make it about 30% of the time (within 5 points)', () => {
    const buckets: { said: number; made: number }[] = [];
    for (let s = 1; s <= 120; s++) {
      const { played, remaining } = smallSeason(s, 4, 7);
      const odds = playoffOdds(SMALL, played, remaining, SMALL_RULES, model, lcg(s * 7), seededDraw(s), 200);
      // Play out the real rest of the season with the same model.
      const r = lcg(s * 13);
      const real = remaining.map((g) => ({ gameId: g.gameId, week: g.week, phase: 'regular' as const, teams: g.teams, points: (r.next() < model.winProbability(g.teams[0], g.teams[1]) ? [1, 0] : [0, 1]) as [number, number], touchdowns: [0, 0] as [number, number], overtime: false, forfeit: false, neutralSite: false, hypothetical: true }));
      const seeds = seasonTable(SMALL, [...played, ...real], SMALL_RULES, seededDraw(s)).conferences[0]!.seeds;
      for (const o of odds) if (o.playoffs >= 0.2 && o.playoffs <= 0.4) buckets.push({ said: o.playoffs, made: seeds.includes(o.teamId) ? 1 : 0 });
    }
    const said = buckets.reduce((a, b) => a + b.said, 0) / buckets.length;
    const made = buckets.reduce((a, b) => a + b.made, 0) / buckets.length;
    expect(buckets.length).toBeGreaterThan(50);
    expect(Math.abs(said - made)).toBeLessThan(0.05 + 1.96 * Math.sqrt(0.25 / buckets.length));
  });
});

describe('T3.3.1 college conference standings', () => {
  const COLLEGE_RULES = { ...PRO_RULES };
  const conf = { conferenceId: 7, teamIds: [101, 102, 103, 104, 105], chain: STARTING_CHAIN, titleMethod: 'title_game' as const };
  it('orders by conference win share; non-conference games count only overall', () => {
    const g = new Games().add(101, 102, 20, 10).add(101, 103, 20, 10).add(102, 103, 20, 10).add(104, 105, 20, 10).add(900, 101, 30, 0);
    const s = conferenceStandings(conf, g.list, COLLEGE_RULES, fixedDraw());
    expect(s.order[0]).toBe(101);
    expect(s.titleGame).toEqual([101, s.order[1]]);
    expect(s.champion).toBeNull();
  });
  it('a three-way tie with circular head to head falls to the next step for all three, and the log names it', () => {
    const g = new Games().add(101, 102, 20, 10).add(102, 103, 20, 10).add(103, 101, 20, 10) // circle
      .add(101, 104, 20, 10).add(102, 104, 20, 10).add(104, 103, 20, 10)
      .add(105, 101, 20, 10).add(105, 102, 20, 10).add(103, 105, 20, 10); // all three 2-2; common records level
    const s = conferenceStandings(conf, g.list, COLLEGE_RULES, fixedDraw());
    expect(s.log[0]).toMatchObject({ step: 'next_highest', advanced: 103 }); // 103 beat 105, the best team left on the ladder
    expect(s.log[1]).toMatchObject({ step: 'head_to_head', advanced: 101 }); // the chain restarts for the two left
    expect(s.order.slice(0, 4)).toEqual([105, 103, 101, 102]);
  });
  it('every conference has exactly one champion: standings method, and the title game winner', () => {
    const g = new Games().add(101, 102, 20, 10).add(103, 104, 20, 10);
    const st = conferenceStandings({ ...conf, titleMethod: 'standings' }, g.list, COLLEGE_RULES, fixedDraw([103]));
    expect(st.champion).toBe(103); // 101 and 103 level on everything: the draw decides
    expect(st.log.some((x) => x.step === 'random_draw')).toBe(true);
    const tg = conferenceStandings(conf, g.list, COLLEGE_RULES, fixedDraw([103]), 101);
    expect(tg.champion).toBe(101);
    expect(() => conferenceStandings(conf, g.list, COLLEGE_RULES, fixedDraw([103]), 105)).toThrow();
  });
  it('the next-highest team down the standings separates two teams', () => {
    // 101 and 102 never met (both 1-1); 101 beat 103, the highest team on the ladder, and 102 lost to it.
    const c = { ...conf, chain: ['head_to_head', 'next_highest', 'random_draw'] as const };
    const g = new Games().add(101, 103, 20, 10).add(103, 102, 20, 10).add(101, 104, 10, 20).add(102, 105, 20, 10).add(103, 104, 20, 10).add(103, 105, 20, 10).add(105, 104, 20, 10);
    const s = conferenceStandings({ ...c, chain: [...c.chain] }, g.list, COLLEGE_RULES, fixedDraw());
    expect(s.order[0]).toBe(103);
    expect(s.order.slice(1, 3)).toEqual([101, 102]);
    expect(s.log.find((x) => x.advanced === 101)?.step).toBe('next_highest');
  });
});
