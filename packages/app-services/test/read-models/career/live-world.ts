// A small running save for the career-host tests: the repo's real world content (a cut of eight clubs and six
// schools), generated through @gm/world, run with TEST DOUBLES for the schedule and the game port. The doubles
// are NOT a result model and NOT the engine: seeded scores so the loop keeps staff lists and team records.
import { readFileSync } from 'node:fs';
import { seedFromHex, stream } from '@gm/engine-core';
import { cohorts } from '@gm/people';
import { generation, loop } from '@gm/world';

const json = (rel: string): any => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
// The names helpers are not on football-content's entry point yet (CR-G81-1); the world fixture loads them the same way.
const libUrl = new URL('../../../../football-content/data/names/lib.ts', import.meta.url).href;
const lib: generation.RawContent['lib'] = await import(libUrl);

const RAW: generation.RawContent = {
  proLeague: json('../../../../football-content/data/world/pro-league.json'),
  college: json('../../../../football-content/data/world/college.json'),
  locations: json('../../../../football-content/data/world/reference-locations.json'),
  blocked: json('../../../../football-content/data/world/blocked-terms.json'),
  firstNames: json('../../../../football-content/data/names/first-names.json'),
  surnames: json('../../../../football-content/data/names/surnames.json'),
  guard: json('../../../../football-content/data/names/real-name-guard.json'),
  hometowns: json('../../../../football-content/data/names/hometowns.json'),
  lib,
};
const values = (rel: string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const v of json(rel).values as { key: string; value: unknown }[]) if (typeof v.value === 'number') m.set(v.key, v.value);
  return m;
};
const schedule = json('../../../../league/src/schedule/config.json');
function lookup(leagueFile: string, ruleSetFile: string, seasonGames: number | undefined): generation.RuleLookup {
  const league = values(leagueFile), rules = values(ruleSetFile);
  return (k) => league.get(k) ?? rules.get(k) ?? (k === 'schedule.regular_season_games' ? seasonGames : undefined);
}
const CONTENT: generation.WorldContent = generation.defaultContent(RAW, {
  pro: generation.levelNumbers(lookup('../../../../rules-data/data/league/proleague_2026.json', '../../../../rules-data/data/pro_2026.json', schedule.pro.structure.gamesPerClub)),
  college: generation.levelNumbers(lookup('../../../../rules-data/data/league/collegeleague_2026.json', '../../../../rules-data/data/college_2026.json', schedule.college.gamesByLevel.college_top)),
  recruitTrackedPerSignee: cohorts.param('recruitTrackedPerSignee'), seasonGamesByLevelId: schedule.college.gamesByLevel,
});

function trimmed(): generation.WorldContent {
  const clubs = CONTENT.pro.league.clubs.slice(0, 8);
  const clubIds = new Set(clubs.map((c) => c.id));
  const conf = CONTENT.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, 6));
  return {
    ...CONTENT,
    pro: { league: { ...CONTENT.pro.league, clubs }, stadiums: CONTENT.pro.stadiums.filter((s) => clubIds.has(s.clubId)), rivalries: CONTENT.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)) },
    college: {
      ...CONTENT.college, conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [],
      schools: CONTENT.college.schools.filter((s) => schoolIds.has(s.id)),
      rivalries: CONTENT.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)),
    },
    collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
  };
}

const WEEKS = 5;
/** TEST DOUBLE schedule: a short rotation inside each competition. */
const testSchedule: loop.SchedulePort = {
  weeksInSeason: () => WEEKS,
  gamesOn: (world, week) => {
    const out: loop.ScheduledGame[] = [];
    let gameId = week * 1000 + 1;
    for (const comp of world.competitions) {
      const ids = loop.activeTeamIds(world, comp.teamIds);
      const n = ids.length, half = Math.floor(n / 2);
      for (let i = 0; i < half; i++) {
        const a = ids[(i + week) % n]!, b = ids[(n - 1 - i + week) % n]!;
        if (a !== b) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: a, awayTeamId: b, kind: 'regular', title: false });
      }
    }
    return out;
  },
};
/** TEST DOUBLE game port: seeded scores, not a result model. */
const testGame: loop.GamePort = (req) => {
  const s = stream(seedFromHex(req.seedHex), 'test.game', []);
  let home = s.int(3, 38); const away = s.int(3, 38);
  if (home === away) home += 1;
  return { homePoints: home, awayPoints: away, passPlays: s.int(28, 40), runPlays: s.int(20, 32) };
};

export function newWorld(): loop.LiveWorld {
  const setup = generation.createSetup({
    seedHex: '00000000000000a7', size: 'small', historySeasons: 30, packs: [], careerCurveDial: null, rulebookEra: 'era:2026', eraProgression: false, firstSeasonYear: 1996,
  });
  return loop.createWorld({ setup, content: trimmed(), names: generation.makeNameSource(RAW), seedStep: 0 });
}

/** The world after `seasons` seasons, with the user in a staff seat of rung 3 to 6 (below head coach). */
export function runningSave(seasons = 2): { w: loop.LiveWorld; user: number } {
  const w = newWorld();
  const job = [...w.jobs.values()].sort((a, b) => a.id - b.id).find((j) => j.holderPersonId !== null && j.rung >= 3 && j.rung <= 6)!;
  w.userPersonId = job.holderPersonId!;
  const sys = loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGame), leaving: loop.leavingStep() }, 'test: not bound');
  for (let i = 0; i < seasons; i++) loop.runSeason(w, sys, testSchedule);
  return { w, user: job.holderPersonId! };
}
