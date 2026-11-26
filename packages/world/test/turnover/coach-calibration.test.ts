// Coach firing-rate calibration on the FULL world (GM_COACH_CALIBRATION=<seasons>). TEST DOUBLE games: each
// team's strength is its roster's mean true attribute, standardised within its level and scaled to the
// stakeholders' own synthetic league (5.5 points of strength spread, 13 points of game noise,
// front-office/test/stakeholders/league-sim.ts), so the result shows whether the world loop reproduces the
// rates the hazard scales were fitted to. Postseason fields come from the league rule keys
// (`playoff.field_size`, college `bowl.eligibility_wins`). The real engine does not read world rosters yet.
import { describe, expect, it } from 'vitest';
import { seedFromHex, stream } from '@gm/engine-core';
import { CONTENT, COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const SEASONS = Number(process.env.GM_COACH_CALIBRATION ?? 0);
const STRENGTH_SD = 5.5, GAME_SD = 13, HOME = 2;
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function strengths(w: loop.LiveWorld): Map<number, number> {
  const raw = new Map<number, number>();
  for (const [teamId, ids] of w.rosters) {
    let s = 0, n = 0;
    for (const id of ids) {
      const a = Object.values(w.people.get(id)?.playing?.attributes ?? {});
      if (a.length) { s += a.reduce((x, y) => x + y, 0) / a.length; n++; }
    }
    raw.set(teamId, n ? s / n : 0);
  }
  const out = new Map<number, number>();
  for (const lvl of ['pro', 'college'] as const) {
    const ids = [...raw.keys()].filter((id) => turnover.levelOfTeam(w, id) === lvl);
    const m = ids.reduce((a, id) => a + raw.get(id)!, 0) / ids.length;
    const sd = Math.sqrt(ids.reduce((a, id) => a + (raw.get(id)! - m) ** 2, 0) / ids.length) || 1;
    for (const id of ids) out.set(id, STRENGTH_SD * (raw.get(id)! - m) / sd);
  }
  return out;
}

function calibrationSchedule(): loop.SchedulePort {
  const regularWeeks = (lvl: 'pro' | 'college') => CONTENT.levels[lvl].seasonGames;
  const maxRegular = Math.max(regularWeeks('pro'), regularWeeks('college'));
  return {
    weeksInSeason: () => maxRegular + 5,
    gamesOn: (world, week) => {
      const out: loop.ScheduledGame[] = [];
      let gameId = week * 10000 + 1;
      for (const comp of world.competitions) {
        const lvl = comp.level as 'pro' | 'college';
        const ids = loop.activeTeamIds(world, comp.teamIds);
        if (week < regularWeeks(lvl)) {
          const s = stream(world.seed, 'test.calibration.pairs', [world.date.seasonYear, comp.id, week]);
          const order = [...ids];
          for (let i = order.length - 1; i > 0; i--) { const j = s.int(0, i); [order[i], order[j]] = [order[j]!, order[i]!]; }
          for (let i = 0; i + 1 < order.length; i += 2) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: order[i]!, awayTeamId: order[i + 1]!, kind: 'regular', title: false });
          continue;
        }
        if (week < maxRegular) continue;
        const round = week - maxRegular;
        const wins = new Map<number, number>(ids.map((id) => [id, 0]));
        const alive = new Set(ids);
        for (const g of world.results) {
          if (g.competitionId !== comp.id || g.homePoints === g.awayPoints) continue;
          const [w, l] = g.homePoints > g.awayPoints ? [g.homeTeamId, g.awayTeamId] : [g.awayTeamId, g.homeTeamId];
          if (g.kind === 'regular') wins.set(w, (wins.get(w) ?? 0) + 1); else alive.delete(l);
        }
        const field = rule(lvl, 'playoff.field_size') ?? 2;
        const seeded = [...ids].sort((a, b) => wins.get(b)! - wins.get(a)! || a - b);
        const bracket = seeded.slice(0, field);
        // Survivors: replay the earlier rounds (odd counts give the best seed a bye).
        let still = [...bracket];
        for (let r = 0; r < round; r++) {
          const games = world.results.filter((g) => g.competitionId === comp.id && g.kind === 'postseason' && g.week === maxRegular + r);
          const played = new Set(games.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
          still = still.filter((id) => !played.has(id) || alive.has(id));
        }
        if (still.length >= 2) {
          const pairs = [...still];
          if (pairs.length % 2 === 1) pairs.shift();
          for (let i = 0; i < pairs.length / 2; i++) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: pairs[i]!, awayTeamId: pairs[pairs.length - 1 - i]!, kind: 'postseason', title: pairs.length === 2 });
        }
        if (lvl === 'college' && round === 0) {
          const bowls = seeded.slice(field).filter((id) => wins.get(id)! >= (rule('college', 'bowl.eligibility_wins') ?? 6));
          for (let i = 0; i + 1 < bowls.length; i += 2) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: bowls[i]!, awayTeamId: bowls[i + 1]!, kind: 'postseason', title: false });
        }
      }
      return out;
    },
  };
}

function strengthPort(): loop.GamePort {
  let year = -1;
  let str = new Map<number, number>();
  return (req) => {
    if (req.seasonYear !== year) { year = req.seasonYear; str = strengths(req.world); }
    const s = stream(seedFromHex(req.seedHex), 'test.calibration.game', []);
    const margin = (str.get(req.game.homeTeamId) ?? 0) - (str.get(req.game.awayTeamId) ?? 0) + HOME + GAME_SD * s.normal();
    const base = 17 + 3 * s.normal();
    let home = Math.max(0, Math.round(base + margin / 2)), away = Math.max(0, Math.round(base - margin / 2));
    if (home === away) home++;
    return { homePoints: home, awayPoints: away, passPlays: 35, runPlays: 27 };
  };
}

describe.skipIf(!SEASONS)(`coach firing rates on the full world over ${SEASONS} seasons`, () => {
  it('reports head coach firing rates by level', () => {
    const t0 = Date.now();
    // The default roster policy: gmPolicy adds about 10 minutes an offseason on the full world, and coach firings
    // read records, which roster strength drives either way. GM_COACH_CALIBRATION_GM=1 binds the front office.
    const binding: turnover.TurnoverBinding = { content: CONTENT, rule, ...(process.env.GM_COACH_CALIBRATION_GM ? { policy: turnover.gmPolicy() } : {}) };
    const w = loop.createWorld({ setup: setup({}), content: CONTENT, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES] });
    const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
    const col = w.teams.length - pro;
    const schedule = calibrationSchedule();
    const sys = loop.systemsFrom({
      games: loop.gamesStep(schedule, strengthPort()), leaving: loop.leavingStep(),
      cohorts: loop.cohortStep({
        scale: (x) => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: turnover.coachEntrants(x), retiredWouldBeCoaches: 0 }),
        names: NAMES, positionMix: CONTENT.levels.pro.rosterMix, homeRegion: () => 'region',
      }),
      development: turnover.developmentStep(binding), moves: countInSeason(turnover.movesStep(binding, turnover.rosterMovesStep(binding))),
    }, 'test: not bound');
    // An in-season firing names an interim head coach at once (E4.3.3); a head chair that turns interim
    // inside a week's moves step is counted as one. Main-review firings name no interim.
    const inSeasonFired = { pro: 0, college: 0 };
    const interimHeads = (x: typeof w) => new Set([...x.jobs.values()].filter((j) => j.positionId === 'pos:head_coach' && j.holding === 'interim').map((j) => j.id));
    function countInSeason(h: loop.StepHandler): loop.StepHandler {
      return (ctx) => {
        const before = interimHeads(ctx.world);
        const out = h(ctx);
        for (const id of interimHeads(ctx.world)) if (!before.has(id)) inSeasonFired[turnover.levelOfTeam(ctx.world, ctx.world.jobs.get(id)!.teamId)]++;
        return out;
      };
    }
    const perSeason: { pro: number[]; college: number[] } = { pro: [], college: [] };
    // Player-to-coach pipeline (F-pipeline-0001): first-time chair holders by level and what they played.
    const everHeld = new Set<number>();
    for (const j of w.jobs.values()) if (j.holderPersonId !== null) everHeld.add(j.holderPersonId);
    const entrants = { pro: { all: 0, formerPro: 0, formerCollege: 0 }, college: { all: 0, formerPro: 0, formerCollege: 0 } };
    for (let i = 0; i < SEASONS; i++) {
      loop.runSeason(w, sys, schedule);
      for (const j of [...w.jobs.values()].sort((a, b) => a.id - b.id)) {
        const id = j.holderPersonId;
        if (id === null || everHeld.has(id)) continue;
        everHeld.add(id);
        const e = entrants[turnover.levelOfTeam(w, j.teamId)];
        const played = turnover.levelPlayed(w.people.get(id)!);
        e.all++;
        if (played === 'pro') e.formerPro++; else if (played === 'college') e.formerCollege++;
      }
      const waiting = turnover.waitingFormerPlayers(w, w.date.seasonYear + 1);
      const outPlayers = [...w.outOfFootballSince].filter(([id]) => w.people.get(id)?.playing);
      process.stderr.write(`waiting ${waiting.length}; out-of-football players ${outPlayers.length}; by level ${JSON.stringify(outPlayers.reduce((a: Record<string, number>, [id]) => { const k = String(turnover.levelPlayed(w.people.get(id)!)); a[k] = (a[k] ?? 0) + 1; return a; }, {}))}; ages ${JSON.stringify(outPlayers.slice(0, 5).map(([id]) => w.date.seasonYear - w.people.get(id)!.birthDate.seasonYear))}\n`);
      process.stderr.write(`pipeline after season ${i + 1}: ${JSON.stringify(entrants)}; pro chairs now held by former pro players ${JSON.stringify(turnover.formerProShare(w, (t) => turnover.levelOfTeam(w, t), 'pro', 0))}\n`);
      const fired = (lvl: 'pro' | 'college') => turnover.coachOpenings(w).filter((r) => r.level === lvl && r.reason === 'fired' && r.rung === 9).reduce((a, r) => a + r.count, 0);
      process.stderr.write(`season ${i + 1} done at ${Math.round((Date.now() - t0) / 1000)} s; head coaches fired so far: pro ${fired('pro')} (${inSeasonFired.pro} in season), college ${fired('college')} (${inSeasonFired.college} in season)\n`);
    }
    const rows = turnover.coachOpenings(w);
    const seasons = [...new Set(rows.map((r) => r.season))].sort();
    for (const lvl of ['pro', 'college'] as const) for (const s of seasons) perSeason[lvl].push(rows.filter((r) => r.season === s && r.level === lvl && r.reason === 'fired' && r.rung === 9).reduce((a, r) => a + r.count, 0));
    const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
    const report = {
      seconds: Math.round((Date.now() - t0) / 1000), seasons: SEASONS, proTeams: pro, collegeTeams: col,
      pro_firings_per_season: perSeason.pro, pro_mean: +mean(perSeason.pro).toFixed(2), pro_per_team: +(mean(perSeason.pro) / pro).toFixed(3),
      college_firings_per_season: perSeason.college, college_mean: +mean(perSeason.college).toFixed(2), college_per_team: +(mean(perSeason.college) / col).toFixed(3),
      pro_in_season_share: +(inSeasonFired.pro / Math.max(1, sum(perSeason.pro))).toFixed(3),
      college_in_season_share: +(inSeasonFired.college / Math.max(1, sum(perSeason.college))).toFixed(3),
      pro_entrants_former_pro_share: +(entrants.pro.formerPro / Math.max(1, entrants.pro.all)).toFixed(3),
      college_entrants_former_world_player_share: +((entrants.college.formerPro + entrants.college.formerCollege) / Math.max(1, entrants.college.all)).toFixed(3),
      entrants,
    };
    process.stderr.write(`\ncoach calibration: ${JSON.stringify(report)}\n`);
    expect(report.pro_mean).toBeGreaterThan(0);
  }, 7_200_000);
});
