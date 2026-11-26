import { describe, expect, it } from 'vitest';
import { cohorts } from '@gm/people';
import type { PersonRecord } from '@gm/schema';
import { CONTENT, NAMES, RAW, generation, loop, miniWorld, setup, testGamePort, testSchedule, testSystems, trimmed } from '../fixtures.ts';

function ran(seasons: number, over: Partial<loop.WorldSystems> = {}, opts: loop.PassOptions = {}, seedHex?: string): loop.LiveWorld {
  const w = miniWorld(seedHex ? { seedHex } : {});
  const sys = testSystems(over);
  for (let i = 0; i < seasons; i++) loop.runSeason(w, sys, testSchedule, opts);
  return w;
}
const logText = (w: loop.LiveWorld): string => JSON.stringify(w.log.rows());

describe('the fixed order (X12.1.1)', () => {
  it('has the lifecycle step, then the ten X12.1.1 weekly steps with compliance after moves (CO-01), and the season-point steps in the written order', () => {
    expect(loop.WEEKLY_ORDER).toEqual(['lifecycle', 'games', 'health', 'statistics', 'notability', 'memory', 'edges', 'needs', 'moves', 'compliance', 'labels', 'news']);
    expect(loop.SEASON_POINT_ORDER).toEqual(['leaving', 'hall', 'cohorts', 'development', 'culture', 'compaction']);
  });
  it('two runs of ten seasons from one seed give identical logs and hashes (acceptance)', () => {
    const a = ran(10), b = ran(10);
    expect(a.passHash).toBe(b.passHash);
    expect(logText(a)).toBe(logText(b));
    expect(loop.worldHash(a)).toBe(loop.worldHash(b));
    expect(a.passes).toBe(10 * (testSchedule.weeksInSeason(a) + 1));
    expect(a.date.seasonYear).toBe(setup().firstSeasonYear + 10);
  });
  it('another seed gives another world', () => {
    expect(loop.worldHash(ran(2, {}, {}, '00000000000000a8'))).not.toBe(loop.worldHash(ran(2)));
  });
  it('running the steps in another order changes the hash (acceptance)', () => {
    const order = [...loop.WEEKLY_ORDER];
    [order[0], order[7]] = [order[7]!, order[0]!];
    const w = miniWorld(), sys = testSystems();
    const v = miniWorld();
    for (let i = 0; i < 3; i++) { loop.runWeek(w, sys); loop.runWeek(v, sys, { order }); }
    expect(v.passHash).not.toBe(w.passHash);
  });
  it('a tier change made inside a pass takes effect at the start of the next pass', () => {
    const seen: number[] = [];
    const w = miniWorld();
    const team = w.teams[0]!.id;
    const sys = testSystems({
      health: (ctx) => { ctx.world.pendingTiers.set(team, 1); return {}; },
      news: (ctx) => { seen.push(ctx.tierOfTeam(team)); return {}; },
    });
    loop.runWeek(w, sys);
    loop.runWeek(w, sys);
    expect(seen[0]).not.toBe(1);
    expect(seen[1]).toBe(1);
  });
  it('reports every step whose owning system is not bound', () => {
    const sys = testSystems();
    const names = loop.unboundSteps(sys).map((u) => u.step);
    expect(names).not.toContain('games');
    expect(names).not.toContain('leaving');
    expect(names).toContain('health');
    expect(loop.unboundSteps(loop.systemsFrom({})).length).toBe(loop.WEEKLY_ORDER.length + loop.SEASON_POINT_ORDER.length);
  });
  it('every game of a far team still goes through the game port, with no lighter request (A3 row 20)', () => {
    const tiers = new Set<number>();
    let calls = 0;
    const inner = testGamePort();
    const w = miniWorld();
    const sys = testSystems({ games: loop.gamesStep(testSchedule, (req) => { calls++; tiers.add(req.tier); expect(Object.keys(req).sort()).toEqual(['game', 'ruleSetId', 'seasonYear', 'seedHex', 'tier', 'week', 'world']); return inner(req); }) });
    loop.runSeason(w, sys, testSchedule);
    expect(calls).toBe(loop.gamesInSeason(miniWorld(), testSchedule) );
    expect(calls).toBe(w.seasons[0]!.games);
    expect(tiers.size).toBe(1);
  });
});

describe('leaving football (X12.1.3)', () => {
  it('the age table rises, stays low before 75, and is never 0 or 1 above the starting age', () => {
    expect(loop.deathTableProblems()).toEqual([]);
    expect(loop.yearlyDeathChance(loop.param('death.minAge'))).toBe(0);
    expect(loop.yearlyDeathChance(40)).toBe(0);
    expect(loop.yearlyDeathChance(66)).toBeGreaterThan(0);
    expect(loop.yearlyDeathChance(119)).toBeLessThan(1);
  });
  it('a 60-season soak: only retired generated people die, with years of life and no cause', () => {
    const w = miniWorld();
    const sys = testSystems();
    // An imported retiree and the user, both old and out of football: neither may ever die.
    const model = [...w.people.values()][0]!;
    const old = (id: number, origin: PersonRecord['origin']): PersonRecord => ({ ...model, id, origin, birthDate: { seasonYear: setup().firstSeasonYear - 80, dayIndex: 10 } });
    const importedId = 9_000_001, userId = 9_000_002;
    w.people.set(importedId, old(importedId, 'imported')); w.status.set(importedId, 'active'); w.outOfFootballSince.set(importedId, w.date.seasonYear);
    w.people.set(userId, old(userId, 'user')); w.status.set(userId, 'active'); w.outOfFootballSince.set(userId, w.date.seasonYear); w.userPersonId = userId;
    for (let i = 0; i < 60; i++) loop.runSeason(w, sys, testSchedule);
    const deaths = w.log.ofType(loop.DIED);
    expect(deaths.length).toBeGreaterThan(0);
    const employed = loop.employedIds(w);
    for (const e of deaths) {
      const id = e.subjects[0]!.id;
      const p = w.people.get(id)!;
      expect(p.origin).toBe('generated');
      expect(Object.keys(e.payload).sort()).toEqual(['birth_year', 'year']);
      expect(p.diedYear).toBe(e.payload.year);
      expect(employed.has(id)).toBe(false);
      expect((e.payload.year as number) - (e.payload.birth_year as number)).toBeGreaterThan(loop.param('death.minAge'));
    }
    expect(w.status.get(importedId)).not.toBe('deceased');
    expect(w.people.get(importedId)!.diedYear).toBeNull();
    expect(w.status.get(userId)).not.toBe('deceased');
    // Nobody holding a seat is inactive or deceased.
    for (const id of employed) expect(w.status.get(id)).toBe('active');
    expect(w.log.ofType(loop.WENT_INACTIVE).length).toBeGreaterThan(0);
  }, 120_000);
  it('a strong edge to someone near keeps a person active; an inactive person returns when hired', () => {
    const w = miniWorld();
    const sys = testSystems({ leaving: loop.leavingStep({ strongEdgeNear: () => true }) });
    for (let i = 0; i < 6; i++) loop.runSeason(w, sys, testSchedule);
    expect(w.outOfFootballSince.size).toBeGreaterThan(0);
    expect(w.log.ofType(loop.WENT_INACTIVE)).toHaveLength(0);
    const v = ran(6);
    const inactive = [...v.status].find(([, s]) => s === 'inactive')![0];
    expect(loop.searchable(v, inactive)).toBe(false);
    expect(loop.searchable(v, inactive, true)).toBe(true);
    let did = false;
    const hire = testSystems({ moves: (ctx) => { if (!did) { did = loop.reactivate(ctx, inactive, 'hired'); } return {}; } });
    loop.runWeek(v, hire);
    expect(did).toBe(true);
    expect(v.status.get(inactive)).toBe('active');
    expect(v.outOfFootballSince.has(inactive)).toBe(false);
    expect(v.log.ofType(loop.RETURNED_ACTIVE)).toHaveLength(1);
  });
});

describe('stop points and time control (X12.3.1)', () => {
  function withUser(): { w: loop.LiveWorld; userId: number; dutyId: string } {
    const w = miniWorld();
    const job = [...w.jobs.values()].sort((a, b) => a.id - b.id).find((j) => j.dutyIds.length > 0 && j.holderPersonId !== null)!;
    w.userPersonId = job.holderPersonId!;
    return { w, userId: job.holderPersonId!, dutyId: job.dutyIds[0]! };
  }
  const item = (id: number, over: Partial<loop.PendingItem>): loop.PendingItem => ({
    id, kind: 'offer', addresseePersonId: null, dutyId: null, stopOn: { seasonYear: setup().firstSeasonYear, dayIndex: 9 },
    dueOn: { seasonYear: setup().firstSeasonYear, dayIndex: 11 }, defaultResolution: 'the offer lapses', resolved: false, ...over,
  });
  it('day mode and week mode over the same span give identical logs (acceptance)', () => {
    const a = withUser().w, b = withUser().w;
    const sys = testSystems();
    for (let i = 0; i < 21; i++) loop.advance(a, sys, testSchedule, [], 'day');
    for (let i = 0; i < 3; i++) loop.advance(b, sys, testSchedule, [], 'week');
    expect(a.passHash).toBe(b.passHash);
    expect(JSON.stringify(a.log.rows())).toBe(JSON.stringify(b.log.rows()));
    expect(a.week).toBe(3);
  });
  it('stops only for an item linked to the user by duty or addressee', () => {
    const { w, userId, dutyId } = withUser();
    const pending = [item(1, { addresseePersonId: 123456789 }), item(2, { dutyId: 'duty:nobody_has_this' }), item(3, { addresseePersonId: userId, stopOn: { seasonYear: setup().firstSeasonYear, dayIndex: 9 } }), item(4, { kind: 'duty', dutyId, stopOn: { seasonYear: setup().firstSeasonYear, dayIndex: 16 }, dueOn: { seasonYear: setup().firstSeasonYear, dayIndex: 30 } })];
    const r = loop.advance(w, testSystems(), testSchedule, pending, 'next_stop');
    expect(r.stoppedFor).toEqual({ itemId: 3, kind: 'offer', on: pending[2]!.stopOn });
    expect(r.daysAdvanced).toBe(9);
    const stops = loop.stopsThrough(w, pending, { seasonYear: setup().firstSeasonYear, dayIndex: 400 });
    expect(stops.map((s) => s.itemId)).toEqual([3, 4]);
    expect(loop.stopProblems(w, stops, pending)).toEqual([]);
    expect(loop.stopProblems(w, [{ itemId: 1, kind: 'offer', on: pending[0]!.stopOn }], pending)).toHaveLength(1);
    pending[2]!.resolved = true;
    const next = loop.advance(w, testSystems(), testSchedule, pending, 'next_stop');
    expect(next.stoppedFor?.itemId).toBe(4);
    // A world with no user never stops.
    const free = miniWorld();
    expect(loop.stopsThrough(free, pending, { seasonYear: 9999, dayIndex: 0 })).toEqual([]);
  });
  it('a deadline he lets pass resolves by its default and is logged as his', () => {
    const { w, userId } = withUser();
    const pending = [item(7, { addresseePersonId: userId })];
    const sys = testSystems();
    let lapsed: number[] = [];
    for (let i = 0; i < 14; i++) lapsed = lapsed.concat(loop.advance(w, sys, testSchedule, pending, 'day').lapsed);
    expect(lapsed).toEqual([7]);
    expect(pending[0]!.resolved).toBe(true);
    const rows = w.log.ofType(loop.DEADLINE_LAPSED);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('user');
    expect(rows[0]!.actors[0]!.personId).toBe(userId);
    expect(rows[0]!.payload.resolution).toBe('the offer lapses');
  });
});

describe('the history run (X10.3)', () => {
  it('runs the same passes as live play, every event marked history_run, then says it ended', () => {
    const w = miniWorld({ historySeasons: 10 });
    const seen: number[] = [];
    const report = loop.runHistory(w, testSystems(), { seasons: 10, schedule: testSchedule, onSeason: (_s, done) => { seen.push(done); } });
    expect(report).toMatchObject({ seasonsRun: 10, stoppedEarly: false });
    expect(report.unbound.length).toBeGreaterThan(0);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const rows = w.log.rows();
    expect(rows.slice(1).every((e) => e.source === 'history_run')).toBe(true);
    expect(rows[rows.length - 1]!.type).toBe(loop.HISTORY_RUN_ENDED);
    expect(loop.historyRunScan(w)).toEqual([]);
    expect(w.seasons).toHaveLength(10);
    for (const s of w.seasons) expect(Object.keys(s.champions)).toHaveLength(w.competitions.length);
    // The same passes as live play: a live run of the same seed ends on the same pass hash.
    const live = miniWorld({ historySeasons: 10 });
    for (let i = 0; i < 10; i++) loop.runSeason(live, testSystems(), testSchedule, { source: 'history_run' });
    expect(live.passHash).toBe(w.passHash);
  });
  it('refuses to start when an imported person is already in the world', () => {
    const w = miniWorld();
    const model = [...w.people.values()][0]!;
    w.people.set(9_000_001, { ...model, id: 9_000_001, origin: 'imported' });
    expect(() => loop.runHistory(w, testSystems(), { seasons: 1, schedule: testSchedule })).toThrow(/imported/);
  });
  it('stopped at season 12 of 30, the world is valid and continues identically', () => {
    const w = miniWorld({ historySeasons: 30 });
    const sys = testSystems();
    const r = loop.runHistory(w, sys, { seasons: 30, schedule: testSchedule, onSeason: (_s, done) => (done === 12 ? 'stop' : 'continue') });
    expect(r).toMatchObject({ seasonsRun: 12, stoppedEarly: true });
    expect(w.date).toEqual({ seasonYear: setup().firstSeasonYear + 12, dayIndex: 0 });
    expect(w.week).toBe(0);
    expect(generation.structureProblems(w as unknown as generation.BuiltStructures)).toEqual([]);
    expect(loop.validateHistory(w).failures.filter((f) => !/champions in seasons|tenure/.test(f))).toEqual([]);
    loop.runSeason(w, sys, testSchedule);
    expect(w.seasons).toHaveLength(13);
  });
  it('history length 0 starts on founding day with nothing to validate', () => {
    const w = miniWorld({ historySeasons: 0 });
    const r = loop.runHistory(w, testSystems(), { seasons: 0, schedule: testSchedule });
    expect(r.seasonsRun).toBe(0);
    expect(w.log.rows()).toHaveLength(1);
    const v = loop.validateHistory(w);
    expect(v.pass).toBe(true);
    expect(v.notChecked[0]).toMatch(/nothing to validate/);
  });
  it('the validator passes an ordinary run, reports what it could not check, and applies given bands', () => {
    const w = miniWorld({ historySeasons: 10 });
    loop.runHistory(w, testSystems(), { seasons: 10, schedule: testSchedule });
    const v = loop.validateHistory(w);
    expect(v.failures).toEqual([]);
    expect(v.notChecked.length).toBeGreaterThanOrEqual(4);
    const tight = loop.validateHistory(w, { pointsPerTeamGame: [60, 70], passRate: [0.9, 0.95], headCoachTenureMean: [40, 50], legalityProblems: () => ['roster rule broken'] });
    expect(tight.pass).toBe(false);
    expect(tight.failures.join(' ')).toMatch(/points per team game.*pass rate|pass rate/);
    expect(tight.failures).toContain('roster rule broken');
    expect(tight.failures.some((f) => /tenure/.test(f))).toBe(true);
    const ok = loop.validateHistory(w, { pointsPerTeamGame: [10, 30], passRate: [0.4, 0.7] });
    expect(ok.failures).toEqual([]);
  });
  it('a dynasty fails validation; the run is redone once with seed plus 1 and the step is recorded (acceptance)', () => {
    const tries: number[] = [];
    const built = loop.buildWithHistory((step) => {
      tries.push(step);
      const world = miniWorld({ historySeasons: 10 }, step);
      // The first try is rigged so one team wins every title.
      const favour = step === 0 ? world.competitions[0]!.teamIds[0]! : null;
      return { world, systems: testSystems({}, favour), plan: { seasons: 10, schedule: testSchedule } };
    });
    expect(tries).toEqual([0, 1]);
    expect(built.seedStep).toBe(1);
    expect(built.world.seedStep).toBe(1);
    expect(built.firstTryFailures.join(' ')).toMatch(/different champions|holds 10 of 10 titles/);
    expect(built.validation.pass).toBe(true);
    expect(built.failedTwice).toBe(false);
    expect(built.world.log.ofType(loop.HISTORY_RUN_ENDED)[0]!.payload.seed_step).toBe(1);
    expect(loop.worldHash(miniWorld({}, 1))).not.toBe(loop.worldHash(miniWorld({}, 0)));
    // Both tries fail: the caller is told.
    const twice = loop.buildWithHistory((step) => {
      const world = miniWorld({ historySeasons: 10 }, step);
      return { world, systems: testSystems({}, world.competitions[0]!.teamIds[0]!), plan: { seasons: 10, schedule: testSchedule } };
    });
    expect(twice.failedTwice).toBe(true);
    expect(twice.seedStep).toBe(1);
  });
  it('tenures and coaching trees are read from the staff seasons the loop keeps', () => {
    const ss = (seasonYear: number, headCoachId: number, staffIds: number[]): loop.StaffSeason => ({ seasonYear, teamId: 1, headCoachId, staffIds });
    const rows = [ss(1, 10, [11]), ss(2, 10, [11]), ss(3, 11, [12]), ss(4, 12, [13]), ss(5, 12, [13])];
    expect(loop.headCoachTenures(rows)).toEqual([2, 1]);
    expect(loop.coachingTreeDepth(rows)).toBe(3);
    expect(loop.coachingTreeDepth([ss(1, 10, [11])])).toBe(1);
  });
  it('the time budget arithmetic matches the X10.3.3 example', () => {
    // 30 seasons in 600 seconds: 20 seconds a season. At about 4,000 games a season that is 5 ms a game.
    expect(loop.gameMsForTarget(4000)).toBeCloseTo(5, 6);
    expect(loop.historySeconds({ seasons: 30, gamesPerSeason: 4000, gameMs: 5, seasonMs: 0 })).toBeCloseTo(600, 6);
    expect(loop.historySeconds({ seasons: 30, gamesPerSeason: 4000, gameMs: 4, seasonMs: 2000 })).toBeCloseTo(540, 6);
    expect(loop.scaledEstimate(600, 9, 6)).toBeCloseTo(900, 6);
    expect(loop.estimateWithinTolerance(100, 125)).toBe(true);
    expect(loop.estimateWithinTolerance(100, 140)).toBe(false);
    expect(loop.gamesInSeason(miniWorld(), testSchedule)).toBeGreaterThan(0);
  });
});

describe('placing imported people and the user (X10.4)', () => {
  function world10(): loop.LiveWorld {
    const w = miniWorld({ historySeasons: 10 });
    loop.runHistory(w, testSystems(), { seasons: 10, schedule: testSchedule });
    return w;
  }
  const ports = (w: loop.LiveWorld, limit: number): generation.PlacementPorts => ({
    rosterLimit: (teamId) => Math.max(limit, w.rosters.get(teamId)!.length), playerValue: (id) => id % 97, groupOf: (p) => String(p.playing?.position ?? 'none'),
  });
  it('places staff before players, displaces the lowest-valued generated player, and logs every release', () => {
    const w = world10();
    const team = w.teams[0]!;
    const roster = w.rosters.get(team.id)!;
    const limit = roster.length;
    const model = w.people.get(roster[0]!)!;
    const group = String(model.playing?.position ?? 'none');
    const same = roster.filter((id) => String(w.people.get(id)!.playing?.position ?? 'none') === group);
    const expectedOut = [...same].sort((a, b) => (a % 97) - (b % 97) || a - b)[0]!;
    const imp = (id: number, from: PersonRecord): PersonRecord => ({ ...from, id, origin: 'imported', name: { ...from.name, first: `Zq${id}`, last: 'Importedson' } });
    const headJob = [...w.jobs.values()].find((j) => j.teamId === team.id && j.positionId === 'pos:head_coach')!;
    const oldHead = headJob.holderPersonId!;
    const rowsBefore = w.log.rows().length;
    const report = generation.placeImported(w, [
      { person: imp(9_000_010, model), kind: 'player', teamId: team.id },
      { person: imp(9_000_011, w.people.get(oldHead)!), kind: 'head_coach', teamId: team.id, jobId: headJob.id },
      { person: imp(9_000_012, model), kind: 'player', teamId: null },
      { person: imp(9_000_013, w.people.get(team.ownerPersonId ?? team.athleticDirectorPersonId!)!), kind: 'boss', teamId: team.id, bossChair: team.ownerPersonId !== null ? 'ownerPersonId' : 'athleticDirectorPersonId' },
    ], ports(w, limit));
    expect(report.problems).toEqual([]);
    expect(report.placed).toBe(3);
    expect(report.toFreePools).toEqual([9_000_012]);
    expect(report.displaced).toContain(expectedOut);
    expect(report.displaced).toContain(oldHead);
    expect(report.displaced).toHaveLength(3);
    expect(w.rosters.get(team.id)!.length).toBe(limit);
    expect(w.rosters.get(team.id)).toContain(9_000_010);
    expect(w.jobs.get(headJob.id)!.holderPersonId).toBe(9_000_011);
    const added = w.log.rows().slice(rowsBefore);
    expect(added.every((e) => e.source === 'import')).toBe(true);
    expect(added.filter((e) => e.type === loop.IMPORT_PLACED).map((e) => e.payload.kind)).toEqual(['boss', 'head_coach', 'player']);
    expect(added.filter((e) => e.type === loop.RELEASED)).toHaveLength(3);
    expect(loop.historyRunScan(w)).toEqual([]);
    expect(w.pools.get(generation.FREE_AGENT_POOL)).toEqual(expect.arrayContaining([expectedOut, 9_000_012]));
  });
  it('reports a generated person who shares a full name with an imported one, and a non-imported record', () => {
    const w = world10();
    const g = [...w.people.values()][5]!;
    const twin: PersonRecord = { ...g, id: 9_000_020, origin: 'imported' };
    expect(generation.nameCollisions(w, [twin])).toContain(g.id);
    const r = generation.placeImported(w, [{ person: twin, kind: 'player', teamId: null }, { person: { ...g, id: 9_000_021 }, kind: 'player', teamId: null }], ports(w, 999));
    expect(r.problems.join(' ')).toMatch(/shares a full name/);
    expect(r.problems.join(' ')).toMatch(/not an imported person/);
  });
  it('the user gets edges to people who were really there, plain facts before the world began, and no label', () => {
    const w = world10();
    const first = setup().firstSeasonYear;
    const team = w.teams[3]!;
    const model = [...w.people.values()][0]!;
    const user: PersonRecord = { ...model, id: 9_000_030, origin: 'user', name: { ...model.name, first: 'Test', last: 'Userperson' } };
    const labelsBefore = JSON.stringify(user.history);
    const placed = generation.placeUser(w, user, [
      { kind: 'played', seasonYear: first + 4, teamId: team.id },
      { kind: 'played', seasonYear: first - 6, teamId: team.id },
      { kind: 'studied', seasonYear: first - 8, teamId: null },
    ]);
    expect(w.userPersonId).toBe(user.id);
    expect(placed.eventIds).toHaveLength(3);
    expect(placed.edges.length).toBeGreaterThan(0);
    const there = new Set(w.rosterSeasons.get(`${first + 4}:${team.id}`));
    for (const e of placed.edges) {
      expect(e.seasonYear).toBe(first + 4);
      if (e.kind === 'teammate') expect(there.has(e.otherId)).toBe(true);
      expect(w.people.get(e.otherId)!.origin).toBe('generated');
    }
    expect(placed.edges.some((e) => e.kind === 'coached')).toBe(true);
    const rows = w.log.ofType(loop.USER_BACKGROUND);
    expect(rows.map((e) => e.payload.in_world)).toEqual([false, false, true]);
    expect(rows.every((e) => e.source === 'user')).toBe(true);
    expect(JSON.stringify(w.people.get(user.id)!.history)).toBe(labelsBefore);
    expect(() => generation.placeUser(w, { ...user, id: 9_000_031 }, [])).toThrow(/already has its user/);
    expect(() => generation.placeUser(miniWorld(), model, [])).toThrow(/origin user/);
  });
});

describe('the cohort step (X11 at the season point)', () => {
  it('adds new generated people each season, the same for the same seed', () => {
    const make = (): loop.LiveWorld => {
      const w = miniWorld();
      const sys = testSystems({
        cohorts: loop.cohortStep({
          scale: (world) => ({ topCollegeTeams: world.competitions.filter((c) => c.level !== 'pro').reduce((a, c) => a + c.teamIds.length, 0), draftedCount: 16, openEntryChairs: 4, retiredWouldBeCoaches: 1, presetShare: 0.05 }),
          names: NAMES, positionMix: trimmed().levels.pro.rosterMix, homeRegion: generation.makeHomeRegionSource(RAW),
        }),
      });
      for (let i = 0; i < 2; i++) loop.runSeason(w, sys, testSchedule);
      return w;
    };
    const a = make(), b = make();
    const before = miniWorld().people.size;
    expect(a.people.size).toBeGreaterThan(before);
    expect(a.log.ofType(cohorts.COHORT_ENTERED).length).toBeGreaterThan(0);
    for (const kind of loop.GENERATED_COHORTS) expect(a.pools.has(kind), kind).toBe(true);
    expect(loop.worldHash(a)).toBe(loop.worldHash(b));
    const ids = [...a.people.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.seasons[1]!.pools).toMatchObject(Object.fromEntries(loop.GENERATED_COHORTS.map((k) => [k, a.pools.get(k)!.length])));
    void CONTENT;
  });
});
