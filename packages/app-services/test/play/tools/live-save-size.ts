// Real save size of the live world (P5.4.1, MA-75 target about 600 MB at season 30). Plays a small world's career
// year season after season (the seat's games delegated, the world's own games through the TEST DOUBLE below),
// and at the listed seasons writes the career year into a fresh .gmsave exactly as WorldService does, once with
// the compressing codec and once raw, and prints the file sizes.
//
//   npx tsx packages/app-services/test/play/tools/live-save-size.ts [--seasons=30] [--at=1,5,10,20,30] [--seed=HEX] [--fast=1]
//
// --fast=1 runs the world's weeks and season point with the career year's own systems but skips the seat's season
// session (its games are the real engine, about 20 minutes a season on a cloud box). The world tables, which are
// what the save size is made of, grow the same way; the saved season part is the first season's.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import initSqlJs from 'sql.js';
import { SqlJsDriver, snapshot } from '@gm/store';
import { generation, loop, season as seasons, turnover } from '@gm/world';
import { CareerYear, writeCareerYear } from '../../../src/play/index.ts';
import { appWorldContent } from '../../../src/newgame/content.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEASONS = Number(arg('seasons', '30'));
const AT = new Set(arg('at', '1,5,10,15,20,25,30').split(',').map(Number));
const ROOT = resolvePath(import.meta.dirname, '../../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
/** TEST DOUBLE for the world's own games (not a result model): a fixed small score so the loop has rows. */
const doubleGames: loop.GamePort = (req) => ({ homePoints: 10 + (req.game.homeTeamId % 7), awayPoints: 7 + (req.game.awayTeamId % 9), passPlays: 30, runPlays: 25 });

const app = appWorldContent();
const setup = generation.createSetup({
  seedHex: arg('seed', '00000000c0ffee30'), size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
  eraProgression: false, firstSeasonYear: 2026,
});
const world = loop.createWorld({ setup, content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
const seat = world.teams.find((t) => turnover.levelOfTeam(world, t.id) === 'pro')!.id;
const y = CareerYear.start({ world, content: CONTENT, seatTeamId: seat, games: doubleGames });
const SQL = await initSqlJs();

async function saveBytes(codec: snapshot.BlobCodec): Promise<number> {
  const d = await SqlJsDriver.open(SQL);
  await writeCareerYear(d, y, codec);
  return (await d.exportBytes!()).length;
}

for (let n = 1; n <= SEASONS; n++) {
  const t = performance.now();
  let summary: loop.SeasonSummary;
  if (arg('fast', '0') === '1') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inner = y as any as { systems: loop.WorldSystems; schedule: loop.SchedulePort };
    while (world.week < inner.schedule.weeksInSeason(world)) loop.runWeek(world, inner.systems);
    summary = loop.runSeasonPoint(world, inner.systems, { weeksInSeason: inner.schedule.weeksInSeason(world) });
  } else {
    while (y.delegateWeek());
    summary = y.runOffseason();
  }
  const ms = Math.round(performance.now() - t);
  const row: Record<string, unknown> = { season: n, year: summary.seasonYear, ms, people: world.people.size, status: summary.people, logRows: world.log.size, heapMB: Math.round(process.memoryUsage().heapUsed / 1e6) };
  if (AT.has(n)) {
    row.saveMB = +((await saveBytes(snapshot.defaultCodec())) / 1e6).toFixed(1);
    row.rawSaveMB = +((await saveBytes(snapshot.RAW_CODEC)) / 1e6).toFixed(1);
  }
  console.log(JSON.stringify(row));
}
