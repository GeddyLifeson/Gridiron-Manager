import { describe, expect, it } from 'vitest';
import { TierRow, type WorldTier } from '@gm/schema';
import { NAMES, loop, setup, testGamePort, testSchedule, testSystems, trimmed } from '../fixtures.ts';
import * as tiers from '../../src/tiers/index.ts';

function world(seedHex = '00000000000000a7'): loop.LiveWorld {
  return loop.createWorld({ setup: setup({ seedHex }), content: trimmed(), names: NAMES, eventTypes: tiers.TIER_EVENT_TYPES });
}
const inputs = (over: Partial<tiers.TierInputs> = {}): tiers.TierInputs => ({ ...tiers.NO_USER, ...over });
const comp = (w: loop.LiveWorld, level: 'pro' | 'college') => w.competitions.find((c) => c.level === level)!;
const headCoach = (w: loop.LiveWorld, teamId: number): number =>
  [...w.jobs.values()].find((j) => j.teamId === teamId && j.positionId === 'pos:head_coach')!.holderPersonId!;
const peopleText = (w: loop.LiveWorld): string => JSON.stringify([...w.people].sort((a, b) => a[0] - b[0]));

describe('what a tier may change (X13.1.2, P6.4.1, A3.1.1 row 20)', () => {
  it('runs every simulated system the same way at every tier', () => {
    expect(tiers.policyProblems()).toEqual([]);
    for (const s of tiers.SIM_SYSTEMS) expect(new Set(tiers.TIERS.map((t) => tiers.simCadence(s, t))).size).toBe(1);
  });
  it('refuses a policy that thins a system by tier', () => {
    const thin = (s: tiers.SimSystem, t: WorldTier): string => (s === 'injuries' && t === 3 ? 'drawn from rates' : tiers.simCadence(s, t));
    expect(tiers.policyProblems(thin).join(' ')).toContain('injuries');
  });
  it('refuses a tier that drops film for good or records a saved game at bench detail', () => {
    const bad = { ...tiers.RECORDING, 3: { ...tiers.RECORDING[3], trajectories: 'dropped' as const, playTier: 'Bench' as const } };
    expect(tiers.policyProblems(tiers.simCadence, bad).length).toBe(2);
  });
  it('keeps film for the user\'s games and leaves every other game re-simulable', () => {
    expect(tiers.recordingFor(1)).toMatchObject({ playTier: 'A', trajectories: 'stored', near: true });
    expect(tiers.recordingFor(2)).toMatchObject({ playTier: 'B', trajectories: 'regenerable', near: true });
    expect(tiers.recordingFor(3)).toMatchObject({ playTier: 'B', trajectories: 'regenerable', near: false });
  });
  it('a game is as near as its nearer team', () => {
    expect(tiers.gameTier(3, 1)).toBe(1);
    expect(tiers.gameTier(2, 3)).toBe(2);
    expect(tiers.gameTier(3, 3)).toBe(3);
  });
  it('runs distant games first only during a long advance, and never loses a game', () => {
    const games = [{ gameId: 1 }, { gameId: 2 }, { gameId: 3 }, { gameId: 4 }];
    const tierOf = (g: { gameId: number }): WorldTier => (g.gameId === 1 ? 1 : g.gameId === 2 ? 2 : 3);
    expect(tiers.executionOrder(games, tierOf, false).map((g) => g.gameId)).toEqual([1, 2, 3, 4]);
    expect(tiers.executionOrder(games, tierOf, true).map((g) => g.gameId)).toEqual([3, 4, 1, 2]);
  });
});

describe('membership (X13.1.1)', () => {
  it('puts nothing near when there is no user', () => {
    const m = tiers.computeMembership(world(), tiers.NO_USER);
    expect(m.teams.size).toBe(0);
    expect(m.people.size).toBe(0);
  });
  it('a pro job: his team is tier 1, the league tier 2, the college level tier 3', () => {
    const w = world();
    const pro = comp(w, 'pro'), col = comp(w, 'college');
    const mine = pro.teamIds[0]!;
    w.userPersonId = headCoach(w, mine);
    const m = tiers.computeMembership(w, inputs({ userTeamId: mine }));
    expect(m.teams.get(mine)).toEqual({ tier: 1, reason: 'user_team' });
    for (const id of pro.teamIds.slice(1)) expect(m.teams.get(id)).toEqual({ tier: 2, reason: 'competition' });
    for (const id of col.teamIds) expect(m.teams.has(id)).toBe(false);
    for (const id of tiers.teamMembers(w, mine)) expect(m.people.get(id)?.tier).toBe(1);
    for (const id of tiers.teamMembers(w, pro.teamIds[1]!)) expect(m.people.get(id)).toEqual({ tier: 2, reason: 'near_team' });
    for (const id of tiers.teamMembers(w, col.teamIds[0]!)) expect(m.people.has(id)).toBe(false);
  });
  it('a college job: the conference is near, and the pro level is far', () => {
    const w = world();
    const col = comp(w, 'college'), pro = comp(w, 'pro');
    const mine = col.teamIds[0]!;
    const m = tiers.computeMembership(w, inputs({ userTeamId: mine, scope: 'conference' }));
    const scope = tiers.competitionScope(w, mine, 'conference');
    expect(scope).toContain(mine);
    expect(tiers.competitionScope(w, mine, 'competition')).toEqual([...col.teamIds].sort((a, b) => a - b));
    for (const id of scope) expect(m.teams.get(id)?.tier).toBe(id === mine ? 1 : 2);
    for (const id of pro.teamIds) expect(m.teams.has(id)).toBe(false);
  });
  it('schedule, boards, edges, memory and the market slice each bring someone near (rules 1 and 2)', () => {
    const w = world();
    const pro = comp(w, 'pro'), col = comp(w, 'college');
    const mine = pro.teamIds[0]!;
    const user = headCoach(w, mine);
    w.userPersonId = user;
    const [c0, c1, c2, c3, c4] = col.teamIds as [number, number, number, number, number];
    const prospect = w.rosters.get(c0)![0]!, friend = headCoach(w, c1), rival = headCoach(w, c2), old = w.rosters.get(c3)![0]!;
    const playerTie = w.rosters.get(c3)![1]!, myPlayer = w.rosters.get(mine)![0]!;
    const m = tiers.computeMembership(w, inputs({
      userTeamId: mine, scheduleNextSeason: [c4], boardPersonIds: [prospect], marketPersonIds: [rival],
      edges: (id) => (id === user ? [{ otherId: friend, strength: 55 }, { otherId: old, strength: 5 }] : id === myPlayer ? [{ otherId: playerTie, strength: 80 }] : []),
      remembersUser: (id) => id === old,
    }));
    expect(m.teams.get(c4)).toEqual({ tier: 2, reason: 'schedule' });
    expect(m.teams.get(c0)).toEqual({ tier: 2, reason: 'watched_employee' });
    expect(m.people.get(prospect)?.tier).toBe(2);
    // The user is in his own building, so a strong tie of his is a tier 1 tie (rule 1).
    expect(m.people.get(friend)).toEqual({ tier: 1, reason: 'tier1_edge' });
    expect(m.people.get(rival)).toEqual({ tier: 2, reason: 'market' });
    expect(m.people.get(old)).toEqual({ tier: 2, reason: 'user_memory' });
    expect(m.people.get(playerTie)).toEqual({ tier: 1, reason: 'tier1_edge' });
    expect(m.teams.has(c1)).toBe(false);
  });
  it('a scouted opponent\'s personnel are tier 1 while H2 needs them', () => {
    const w = world();
    const pro = comp(w, 'pro'), col = comp(w, 'college');
    const m = tiers.computeMembership(w, inputs({ userTeamId: pro.teamIds[0]!, scoutedTeamIds: [col.teamIds[2]!] }));
    expect(m.teams.get(col.teamIds[2]!)).toEqual({ tier: 2, reason: 'scouted' });
    for (const id of tiers.teamMembers(w, col.teamIds[2]!)) expect(m.people.get(id)).toEqual({ tier: 1, reason: 'scouted' });
  });
  it('out of work: tier 1 is empty and tier 2 is his edges and the market slice', () => {
    const w = world();
    const pro = comp(w, 'pro');
    const user = headCoach(w, pro.teamIds[0]!), friend = headCoach(w, pro.teamIds[1]!), seat = headCoach(w, pro.teamIds[2]!);
    w.userPersonId = user;
    const m = tiers.computeMembership(w, inputs({ userTeamId: null, marketPersonIds: [seat], edges: (id) => (id === user ? [{ otherId: friend, strength: 90 }] : []) }));
    expect([...m.people.values()].filter((p) => p.tier === 1)).toEqual([]);
    expect([...m.people.keys()].sort((a, b) => a - b)).toEqual([friend, seat].sort((a, b) => a - b));
    expect(m.teams.size).toBe(0);
  });
  it('a scripted career with three job changes matches a hand-written table (acceptance)', () => {
    const w = world();
    const pro = comp(w, 'pro'), col = comp(w, 'college');
    const [colA, colB] = col.teamIds as [number, number];
    const [proA, proB] = pro.teamIds as [number, number];
    const sample = {
      colAPlayer: w.rosters.get(colA)![0]!, colACoach: headCoach(w, colA), colBPlayer: w.rosters.get(colB)![3]!,
      proAPlayer: w.rosters.get(proA)![0]!, proBCoach: headCoach(w, proB), proBPlayer: w.rosters.get(proB)![5]!,
    };
    const t = (m: tiers.Membership, id: number): WorldTier => m.people.get(id)?.tier ?? 3;
    const row = (userTeamId: number | null): number[] => {
      const m = tiers.computeMembership(w, inputs({ userTeamId }));
      return Object.values(sample).map((id) => t(m, id));
    };
    //                    colAPlayer colACoach colBPlayer proAPlayer proBCoach proBPlayer
    expect(row(colA)).toEqual([1, 1, 2, 3, 3, 3]);
    expect(row(colB)).toEqual([2, 2, 1, 3, 3, 3]);
    expect(row(proA)).toEqual([3, 3, 3, 1, 2, 2]);
    expect(row(proB)).toEqual([3, 3, 3, 2, 1, 1]);
    // 50 sampled people: each sits in exactly one tier, and it is the one his team earns.
    const m = tiers.computeMembership(w, inputs({ userTeamId: proA }));
    const teamOf = tiers.teamOfPeople(w);
    const ids = [...w.people.keys()].sort((a, b) => a - b).filter((_, i) => i % 17 === 0).slice(0, 50);
    expect(ids.length).toBe(50);
    for (const id of ids) {
      const team = teamOf.get(id);
      const want = team === proA ? 1 : team !== undefined && pro.teamIds.includes(team) ? 2 : 3;
      expect(t(m, id)).toBe(want);
    }
  });
});

describe('moving between tiers (X13.2)', () => {
  function career() {
    const w = world();
    const pro = comp(w, 'pro'), col = comp(w, 'college');
    const st = tiers.createTierState();
    return { w, pro, col, st, sys: testSystems() };
  }
  it('a team change waits for the next pass; a person change is immediate', () => {
    const { w, pro, st } = career();
    const mine = pro.teamIds[0]!;
    const r = tiers.recomputeTiers(w, st, inputs({ userTeamId: mine }), 'job_change');
    expect(r.changes.length).toBeGreaterThan(0);
    expect(w.tiers.size).toBe(0);
    expect(tiers.teamTier(w, mine)).toBe(1);
    expect(tiers.personTier(st, w.rosters.get(mine)![0]!)).toBe(1);
    const seen: WorldTier[] = [];
    loop.runWeek(w, testSystems({ news: (ctx) => { seen.push(ctx.tierOfTeam(mine)); return {}; } }));
    expect(seen).toEqual([1]);
    expect(w.tiers.get(mine)).toBe(1);
  });
  it('promotion changes no stored field of anyone (X13.2.1 acceptance)', () => {
    const { w, pro, col, st } = career();
    const before = peopleText(w), jobs = JSON.stringify([...w.jobs]), rosters = JSON.stringify([...w.rosters]);
    tiers.recomputeTiers(w, st, inputs({ userTeamId: pro.teamIds[0]!, scoutedTeamIds: [col.teamIds[0]!], boardPersonIds: w.rosters.get(col.teamIds[1]!)! }), 'job_change');
    expect(peopleText(w)).toBe(before);
    expect(JSON.stringify([...w.jobs])).toBe(jobs);
    expect(JSON.stringify([...w.rosters])).toBe(rosters);
  });
  it('gives each person the same tier whatever order the boards list them in', () => {
    const a = career(), b = career();
    const ids = [...a.w.people.keys()].sort((x, y) => x - y).filter((_, i) => i % 3 === 0);
    expect(ids.length).toBeGreaterThan(200);
    tiers.recomputeTiers(a.w, a.st, inputs({ userTeamId: a.pro.teamIds[0]!, boardPersonIds: ids }), 'board_add');
    tiers.recomputeTiers(b.w, b.st, inputs({ userTeamId: b.pro.teamIds[0]!, boardPersonIds: [...ids].reverse() }), 'board_add');
    expect([...a.st.people].sort((x, y) => x[0] - y[0])).toEqual([...b.st.people].sort((x, y) => x[0] - y[0]));
    expect(JSON.stringify(tiers.tierRows(a.w, a.st))).toBe(JSON.stringify(tiers.tierRows(b.w, b.st)));
  });
  it('demotes only at a week boundary (X13.2.2 rule 1)', () => {
    const { w, pro, col, st } = career();
    const mine = pro.teamIds[0]!, watched = w.rosters.get(col.teamIds[0]!)![0]!;
    tiers.recomputeTiers(w, st, inputs({ userTeamId: mine, boardPersonIds: [watched] }), 'board_add');
    expect(tiers.personTier(st, watched)).toBe(2);
    const mid = tiers.recomputeTiers(w, st, inputs({ userTeamId: mine }), 'hiring_day');
    expect(mid.deferred).toBeGreaterThan(0);
    expect(tiers.personTier(st, watched)).toBe(2);
    tiers.recomputeTiers(w, st, inputs({ userTeamId: mine }), 'week_boundary');
    expect(tiers.personTier(st, watched)).toBe(3);
    expect(tiers.teamTier(w, col.teamIds[0]!)).toBe(3);
  });
  it('holds a one-week opponent at the higher tier for two weeks (X13.2.2 rule 4)', () => {
    const { w, pro, col, st } = career();
    const mine = pro.teamIds[0]!, opp = col.teamIds[0]!, man = w.rosters.get(opp)![0]!;
    tiers.recomputeTiers(w, st, inputs({ userTeamId: mine, scoutedTeamIds: [opp] }), 'week_boundary');
    expect(tiers.personTier(st, man)).toBe(1);
    const gone = inputs({ userTeamId: mine });
    tiers.recomputeTiers(w, st, gone, 'week_boundary');
    expect(tiers.personTier(st, man)).toBe(1);
    tiers.recomputeTiers(w, st, gone, 'week_boundary');
    expect(tiers.personTier(st, man)).toBe(3);
    expect(tiers.teamTier(w, opp)).toBe(3);
  });
  it('never drops below tier 2 a person tied to the user or who remembers him (X13.2.2 rule 3)', () => {
    const { w, pro, col, st } = career();
    const teamA = pro.teamIds[0]!, teamB = col.teamIds[0]!;
    const user = headCoach(w, teamA);
    w.userPersonId = user;
    const tied = w.rosters.get(teamA)![0]!, remembers = w.rosters.get(teamA)![1]!, other = w.rosters.get(teamA)![2]!;
    const ports = { edges: (id: number) => (id === user ? [{ otherId: tied, strength: 70 }] : []), remembersUser: (id: number) => id === remembers };
    tiers.recomputeTiers(w, st, inputs({ userTeamId: teamA, ...ports }), 'season_start');
    expect([tied, remembers, other].map((id) => tiers.personTier(st, id))).toEqual([1, 1, 1]);
    // He takes a job at the other level: the old building falls away, the ties do not.
    for (let i = 0; i < 4; i++) tiers.recomputeTiers(w, st, inputs({ userTeamId: teamB, ...ports }), i === 0 ? 'job_change' : 'week_boundary');
    expect([tied, remembers, other].map((id) => tiers.personTier(st, id))).toEqual([2, 2, 3]);
    expect(tiers.teamTier(w, teamA)).toBe(3);
    expect(tiers.teamTier(w, teamB)).toBe(1);
  });
  it('promoted, demoted and promoted again, a person carries his state through', () => {
    const { w, pro, col, st } = career();
    const mine = pro.teamIds[0]!, man = w.rosters.get(col.teamIds[0]!)![0]!;
    const before = JSON.stringify(w.people.get(man));
    const on = inputs({ userTeamId: mine, boardPersonIds: [man] }), off = inputs({ userTeamId: mine });
    tiers.recomputeTiers(w, st, on, 'board_add');
    tiers.recomputeTiers(w, st, off, 'week_boundary');
    expect(tiers.personTier(st, man)).toBe(3);
    tiers.recomputeTiers(w, st, on, 'board_add');
    expect(tiers.personTier(st, man)).toBe(2);
    expect(JSON.stringify(w.people.get(man))).toBe(before);
  });
  it('logs moves as internal events and writes valid save rows', () => {
    const { w, pro, col, st } = career();
    const watched = w.rosters.get(col.teamIds[1]!)![0]!;
    const first = w.log.nextId;
    const r = tiers.recomputeTiers(w, st, inputs({ userTeamId: pro.teamIds[0]!, marketPersonIds: [watched] }), 'job_change');
    const rows = w.log.rows().filter((e) => e.id >= first);
    expect(rows.every((e) => e.type === tiers.TIER_CHANGED && e.witnesses.kind === 'none')).toBe(true);
    // One row per team, and one per person who moved for his own reason: not one per roster spot.
    expect(rows.filter((e) => e.payload.kind === 'team').length).toBe(pro.teamIds.length);
    expect(rows.filter((e) => e.payload.kind === 'person').map((e) => e.subjects[0]!.id)).toEqual([watched]);
    expect(r.changes.length).toBeGreaterThan(rows.length);
    const saved = tiers.tierRows(w, st);
    expect(saved.length).toBe(pro.teamIds.length + st.people.size);
    for (const row of saved) expect(TierRow.safeParse(row).success).toBe(true);
    expect(new Set(saved.map((x) => `${x.subjectKind}:${x.subjectId}`)).size).toBe(saved.length);
  });
});

describe('no visible seam (X13.4.1, P6.4.1, X13.3.2)', () => {
  const request = (w: loop.LiveWorld, n = 3): loop.GameRequest[] =>
    testSchedule.gamesOn(w, 0).slice(0, n).map((game) => ({ game, seasonYear: w.date.seasonYear, week: 0, seedHex: '00000000000000b1', ruleSetId: 'x', tier: 3, world: w }));
  it('passes a game port that gives one result at every tier, and catches one that does not', () => {
    const w = world();
    expect(tiers.gamePortSeamProblems(testGamePort(), request(w))).toEqual([]);
    const lighter: loop.GamePort = (req) => (req.tier === 3 ? { homePoints: 21, awayPoints: 17, passPlays: 30, runPlays: 30 } : testGamePort()(req));
    expect(tiers.gamePortSeamProblems(lighter, request(w)).length).toBe(3);
  });
  it('re-simulating a distant game from its stored inputs reproduces the saved result', () => {
    const w = world();
    const req = request(w, 1)[0]!;
    const saved = testGamePort()(req);
    expect(tiers.resimProblems(testGamePort(), req, saved)).toEqual([]);
    expect(tiers.resimProblems(testGamePort(), req, { ...saved, homePoints: saved.homePoints + 1 }).length).toBe(1);
  });
  it('the user\'s games are requested at tier 1, his league at tier 2, the rest at tier 3, and every one goes to the engine port', () => {
    const w = world();
    const pro = comp(w, 'pro');
    const mine = pro.teamIds[0]!;
    tiers.recomputeTiers(w, tiers.createTierState(), inputs({ userTeamId: mine }), 'season_start');
    const seen = new Map<number, WorldTier>();
    const port = testGamePort();
    const sys = testSystems({ games: loop.gamesStep(testSchedule, (req) => { seen.set(req.game.gameId, req.tier); return port(req); }) });
    loop.runWeek(w, sys);
    const games = testSchedule.gamesOn(w, 0);
    expect(seen.size).toBe(games.length);
    for (const g of games) {
      const mineIn = g.homeTeamId === mine || g.awayTeamId === mine;
      expect(seen.get(g.gameId)).toBe(mineIn ? 1 : g.competitionId === pro.id ? 2 : 3);
    }
  });
  it('watching changes nothing: paired worlds, one with the watch and one without, end the same (rule 3)', () => {
    const seeds = ['00000000000000c1', '00000000000000c2', '00000000000000c3', '00000000000000c4'];
    const run = (seedHex: string, watched: boolean): loop.LiveWorld => {
      const w = world(seedHex);
      const pro = comp(w, 'pro'), col = comp(w, 'college');
      const st = tiers.createTierState();
      const sys = testSystems();
      const base = { userTeamId: pro.teamIds[0]! };
      const watch = { ...base, boardPersonIds: w.rosters.get(col.teamIds[0]!)!.slice(0, 5), scoutedTeamIds: [col.teamIds[1]!], scheduleNextSeason: [col.teamIds[2]!] };
      for (let s = 0; s < 2; s++) {
        const weeks = testSchedule.weeksInSeason(w);
        while (w.week < weeks) {
          tiers.recomputeTiers(w, st, inputs(watched ? watch : base), w.week === 0 ? 'season_start' : 'week_boundary');
          loop.runWeek(w, sys);
        }
        loop.runSeasonPoint(w, sys);
      }
      return w;
    };
    const r = tiers.pairedWatchTest(seeds, run);
    expect(r).toEqual({ pairs: 4, differing: [] });
    // The check is not blind: a different seed does give a different outcome, and the watch did move tiers.
    expect(tiers.outcomeHash(run(seeds[0]!, true))).not.toBe(tiers.outcomeHash(run(seeds[1]!, true)));
    expect(JSON.stringify([...run(seeds[0]!, true).tiers])).not.toBe(JSON.stringify([...run(seeds[0]!, false).tiers]));
  });
  it('catches a world where being watched does change the result', () => {
    const run = (seedHex: string, watched: boolean): loop.LiveWorld => {
      const w = world(seedHex);
      if (watched) w.tiers.set(w.teams[0]!.id, 1);
      const cheat: loop.GamePort = (req) => { const r = testGamePort()(req); return req.tier === 1 ? { ...r, homePoints: r.homePoints + 3 } : r; };
      loop.runWeek(w, testSystems({ games: loop.gamesStep(testSchedule, cheat) }));
      return w;
    };
    expect(tiers.pairedWatchTest(['00000000000000c1'], run).differing).toEqual(['00000000000000c1']);
  });
  it('reports league rates per tier and compares them against stated tolerances (rule 1)', () => {
    const g = (gameId: number, homePoints: number, awayPoints: number): loop.GameResult => ({
      gameId, competitionId: 1, seasonYear: 2026, week: 0, homeTeamId: 1, awayTeamId: 2, homePoints, awayPoints, passPlays: 30, runPlays: 30, kind: 'regular', title: false,
    });
    const rates = tiers.ratesByTier([g(1, 20, 20), g(2, 24, 20), g(3, 30, 30)], (x) => x.gameId as WorldTier);
    expect(rates.map((r) => r.pointsPerGame)).toEqual([40, 44, 60]);
    expect(rates.every((r) => r.passShare === 0.5)).toBe(true);
    expect(tiers.rateProblems(rates, { pointsPerGame: 5, passShare: 0.01 }).length).toBe(2);
    expect(tiers.rateProblems(rates, { pointsPerGame: 25, passShare: 0.01 })).toEqual([]);
  });
});

describe('deciding by measurement (X13.3.1)', () => {
  const triple = (v: number, off = 0.02): tiers.Triple => ({ harness: v, os: v * (1 + off), second: v * (1 - off) });
  const report = (config: tiers.TierConfig, weekMs: number, off = 0.02): tiers.TierReport => tiers.buildReport({
    config, buildHash: 'abc123', machine: 'reference', scale: { teams: 166, people: 20000 },
    triples: { leagueWeekMs: triple(weekMs, off), saveSizeMb: triple(400) },
  });
  const budgets: tiers.Budgets = { leagueWeekMs: 45000 };
  it('starts from everything recorded and thins recording only, one step at a time', () => {
    const ladder = tiers.configLadder();
    expect(ladder[0]).toEqual({ id: 'baseline', thinned: [] });
    expect(ladder.map((c) => c.thinned.length)).toEqual([0, 1, 2]);
    for (const c of ladder) expect(tiers.configProblems(c)).toEqual([]);
    expect(tiers.configProblems({ id: 'skip', thinned: ['play_events_outside_tier1'] }).length).toBe(1);
  });
  it('refuses every step that would lighten the simulation (A3.1.1 row 20)', () => {
    for (const step of Object.keys(tiers.RULED_OUT_STEPS)) {
      expect(tiers.configProblems({ id: 'x', thinned: [step] }).join(' ')).toContain('ruled out');
    }
    expect(Object.keys(tiers.RULED_OUT_STEPS)).toContain('full_engine_other_level');
  });
  it('accepts a number only when its three measurements agree (rule 4)', () => {
    expect(tiers.agrees(triple(1000, 0.02))).toBe(true);
    expect(tiers.agrees(triple(1000, 0.2))).toBe(false);
    expect(tiers.agrees({ harness: 1000, os: Number.NaN, second: 1000 })).toBe(false);
    expect(tiers.median3({ harness: 3, os: 1, second: 2 })).toBe(2);
    expect(tiers.spread({ harness: 90, os: 100, second: 110 })).toBeCloseTo(0.2);
  });
  it('ships the first configuration inside every budget and thins no further (rule 3)', () => {
    const [base, one, two] = tiers.configLadder() as [tiers.TierConfig, tiers.TierConfig, tiers.TierConfig];
    const pick = tiers.chooseShipping([report(two, 20000), report(one, 40000), report(base, 60000)], budgets);
    expect(pick.kind === 'ship' && pick.report.config.id).toBe('thin-1');
    const all = tiers.chooseShipping([report(base, 30000), report(one, 20000)], budgets);
    expect(all.kind === 'ship' && all.report.config.id).toBe('baseline');
  });
  it('does not ship on numbers that disagree, and never ships a ruled-out step', () => {
    const [base, one] = tiers.configLadder() as [tiers.TierConfig, tiers.TierConfig];
    const pick = tiers.chooseShipping([report(base, 30000, 0.3), report(one, 30000)], budgets);
    expect(pick.kind === 'ship' && pick.report.config.id).toBe('thin-1');
    const light = report({ id: 'light', thinned: ['fitted_result_model'] }, 1000);
    expect(tiers.reportProblems(light, budgets).join(' ')).toContain('ruled out');
    const only = tiers.chooseShipping([light, report(base, 90000)], budgets);
    expect(only.kind).toBe('escalate');
  });
  it('sends the two nearest options to Marlon when nothing meets the budgets, and cuts nothing', () => {
    const [base, one, two] = tiers.configLadder() as [tiers.TierConfig, tiers.TierConfig, tiers.TierConfig];
    const pick = tiers.chooseShipping([report(base, 90000), report(one, 70000), report(two, 60000)], budgets);
    expect(pick.kind).toBe('escalate');
    if (pick.kind === 'escalate') {
      expect(pick.nearest.map((r) => r.config.id)).toEqual(['thin-2', 'thin-1']);
      expect(pick.options).toEqual(['slower_week', 'smaller_world']);
    }
  });
  it('reports a missing number for a budgeted metric', () => {
    expect(tiers.reportProblems(report(tiers.configLadder()[0]!, 1000), { loadMs: 5000 })).toEqual(['loadMs: not measured']);
  });
  it('diffs a new report against the last, and says when a rerun is owed (rule 5)', () => {
    const base = tiers.configLadder()[0]!;
    const d = tiers.diffReports(report(base, 40000), report(base, 50000)).find((x) => x.metric === 'leagueWeekMs')!;
    expect(d.change).toBeCloseTo(0.25);
    expect(tiers.diffReports(report(base, 1), report(base, 1)).find((x) => x.metric === 'loadMs')).toEqual({ metric: 'loadMs', before: null, after: null, change: null });
    expect(tiers.needsRerun({ people: 20000, playMs: 12, budgetWeekMs: 45000 }, { people: 21000, playMs: 14, budgetWeekMs: 45000 })).toEqual(['playMs']);
    expect(tiers.needsRerun({ people: 20000 }, { people: 20000, teams: 166 })).toEqual(['teams']);
  });
  it('every constant is a starting value with its leaf', () => {
    expect(tiers.PARAMS.module).toBe('world.tiers');
    for (const p of tiers.PARAMS.params) { expect(p.leaf).toMatch(/^X13\./); expect(p.status).toBe('starting'); expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    expect(tiers.param('hold.weeks')).toBe(2);
    expect(() => tiers.param('nope')).toThrow();
  });
});
