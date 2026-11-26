// Shared test fixtures: the repo's real content files bound to `WorldContent`, a trimmed world for fast
// runs, and TEST DOUBLES for the systems the loop is bound to in the real game. The doubles below are
// not part of the game: `testGamePort` is NOT a result model, it only gives the loop something to carry.
import { readFileSync } from 'node:fs';
import { seedFromHex, stream } from '@gm/engine-core';
import { cohorts } from '@gm/people';
import * as generation from '../src/generation/index.ts';
import * as loop from '../src/loop/index.ts';

export { generation, loop };

// The names helpers live in football-content's data folder and its entry point does not export them yet
// (CR-G81-1). Until it does, this fixture loads the file by path, the same way it reads the JSON beside it.
const lib: generation.RawContent['lib'] = await import(new URL('../../football-content/data/names/lib.ts', import.meta.url).href);

const json = (rel: string): any => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

export const RAW: generation.RawContent = {
  proLeague: json('../../football-content/data/world/pro-league.json'),
  college: json('../../football-content/data/world/college.json'),
  locations: json('../../football-content/data/world/reference-locations.json'),
  blocked: json('../../football-content/data/world/blocked-terms.json'),
  firstNames: json('../../football-content/data/names/first-names.json'),
  surnames: json('../../football-content/data/names/surnames.json'),
  guard: json('../../football-content/data/names/real-name-guard.json'),
  hometowns: json('../../football-content/data/names/hometowns.json'),
  lib,
};

const values = (rel: string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const v of json(rel).values as { key: string; value: unknown }[]) if (typeof v.value === 'number') m.set(v.key, v.value);
  return m;
};
const schedule = json('../../league/src/schedule/config.json');
/** League rules plus the rule set, and the schedule module's own games-per-club row until G-10 carries the key. */
function lookup(leagueFile: string, ruleSetFile: string, seasonGames: number | undefined): generation.RuleLookup {
  const league = values(leagueFile), rules = values(ruleSetFile);
  return (k) => league.get(k) ?? rules.get(k) ?? (k === 'schedule.regular_season_games' ? seasonGames : undefined);
}
export const PRO_LOOKUP = lookup('../../rules-data/data/league/proleague_2026.json', '../../rules-data/data/pro_2026.json', schedule.pro.structure.gamesPerClub);
export const COLLEGE_GAMES: number | undefined = schedule.college.gamesByLevel.college_top;
export const COLLEGE_LOOKUP = lookup('../../rules-data/data/league/collegeleague_2026.json', '../../rules-data/data/college_2026.json', COLLEGE_GAMES);

export const CONTENT: generation.WorldContent = generation.defaultContent(RAW, {
  pro: generation.levelNumbers(PRO_LOOKUP), college: generation.levelNumbers(COLLEGE_LOOKUP),
  recruitTrackedPerSignee: cohorts.param('recruitTrackedPerSignee'), seasonGamesByLevelId: schedule.college.gamesByLevel,
});
export const NAMES = generation.makeNameSource(RAW);

/** A cut of the real content: the first `clubs` clubs and the first college conference. Same shapes, fewer teams. */
export function trimmed(clubs = 8, schools = 6): generation.WorldContent {
  const keepClubs = CONTENT.pro.league.clubs.slice(0, clubs);
  const clubIds = new Set(keepClubs.map((c) => c.id));
  const conf = CONTENT.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, schools));
  return {
    ...CONTENT,
    pro: {
      league: { ...CONTENT.pro.league, clubs: keepClubs },
      stadiums: CONTENT.pro.stadiums.filter((s) => clubIds.has(s.clubId)),
      rivalries: CONTENT.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)),
    },
    college: {
      ...CONTENT.college,
      conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [],
      schools: CONTENT.college.schools.filter((s) => schoolIds.has(s.id)),
      rivalries: CONTENT.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)),
    },
    collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
  };
}

export function setup(over: Partial<generation.SetupRecord> = {}): generation.SetupRecord {
  return generation.createSetup({
    seedHex: '00000000000000a7', size: 'small', historySeasons: 30, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
    eraProgression: false, firstSeasonYear: 1996, ...over,
  });
}

// ---------- test doubles ----------

const WEEKS = 5;
/** TEST DOUBLE schedule: a short rotation inside each competition, then one title game between its two best records. */
export const testSchedule: loop.SchedulePort = {
  weeksInSeason: () => WEEKS + 1,
  gamesOn: (world, week) => {
    const out: loop.ScheduledGame[] = [];
    let gameId = week * 1000 + 1;
    for (const comp of world.competitions) {
      const ids = comp.teamIds;
      if (week < WEEKS) {
        const n = ids.length, half = Math.floor(n / 2);
        for (let i = 0; i < half; i++) {
          const a = ids[(i + week) % n]!, b = ids[(n - 1 - i + week) % n]!;
          if (a !== b) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: a, awayTeamId: b, kind: 'regular', title: false });
        }
      } else {
        const wins = new Map<number, number>(ids.map((id) => [id, 0]));
        for (const g of world.results) {
          if (g.competitionId !== comp.id || g.homePoints === g.awayPoints) continue;
          const w = g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId;
          wins.set(w, (wins.get(w) ?? 0) + 1);
        }
        const top = [...ids].sort((a, b) => wins.get(b)! - wins.get(a)! || a - b);
        out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: top[0]!, awayTeamId: top[1]!, kind: 'postseason', title: true });
      }
    }
    return out;
  },
};

/**
 * TEST DOUBLE for the game port. NOT the engine and NOT a result model: seeded numbers so the loop has
 * something to store. `favour` makes one team win every game, for the validator's failure case.
 */
export function testGamePort(favour: number | null = null): loop.GamePort {
  return (req) => {
    const s = stream(seedFromHex(req.seedHex), 'test.game', []);
    let home = s.int(3, 38), away = s.int(3, 38);
    if (home === away) home += 1;
    if (favour === req.game.homeTeamId) home = away + 7;
    if (favour === req.game.awayTeamId) away = home + 7;
    return { homePoints: home, awayPoints: away, passPlays: s.int(28, 40), runPlays: s.int(20, 32) };
  };
}

/**
 * TEST DOUBLE for the K7 moves step: now and then a head coach is let go and an assistant from some
 * staff takes the chair, and the old coach leaves football. Enough for tenures, trees and exits to exist.
 */
export function testMoves(changeChance = 0.22): loop.StepHandler {
  return (ctx) => {
    const { world } = ctx;
    if (world.week !== 0) return { changes: 0 };
    let changes = 0;
    const jobs = [...world.jobs.values()].sort((a, b) => a.id - b.id);
    for (const head of jobs.filter((j) => j.positionId === 'pos:head_coach')) {
      const s = ctx.open('test.moves', [head.teamId]);
      if (!s.chance(changeChance) || head.holderPersonId === null) continue;
      const pool = jobs.filter((j) => j.positionId !== 'pos:head_coach' && j.holderPersonId !== null && world.jobs.get(j.id)!.holderPersonId !== null);
      const from = world.jobs.get(pool[s.int(0, pool.length - 1)]!.id)!;
      const promoted = from.holderPersonId!;
      ctx.markOutOfFootball(head.holderPersonId);
      world.jobs.set(from.id, { ...from, holderPersonId: null, holderSince: null, vacantSince: world.date });
      world.jobs.set(head.id, { ...head, holderPersonId: promoted, holderSince: world.date, vacantSince: null });
      changes++;
    }
    return { changes };
  };
}

export function testSystems(over: Partial<loop.WorldSystems> = {}, favour: number | null = null): loop.WorldSystems {
  return loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGamePort(favour)), moves: testMoves(), leaving: loop.leavingStep(), ...over }, 'test: not bound');
}

export function miniWorld(over: Partial<generation.SetupRecord> = {}, seedStep = 0): loop.LiveWorld {
  return loop.createWorld({ setup: setup(over), content: trimmed(), names: NAMES, seedStep });
}
