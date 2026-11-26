// Season to season on one live world (C4, X12.1, P5; playtest finding offseason.no_real_world). A world is
// built from the app's own content and the seat's season is played through the career year: the season
// session plays the seat's competition, the world plays everything else, the played games become the world's
// results, the offseason runs the world's season point (draft, free agency, development, aging, cohorts,
// leaving, the Hall of Fame) and the next season starts. Each season the career year is written into the
// .gmsave, the save is closed and reopened, and the restored world must hash the same. Once, mid-season, the
// restored copy and the original both play a week and must still agree.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newgame, play, WorldService } from '@gm/app-services';
import { generation, loop, season as seasons, turnover } from '@gm/world';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';
import type { SaveSession } from './save.ts';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

let contentCache: seasons.LeagueContent | null = null;
/** The four season files the host loads (season session README). */
export function leagueContent(): seasons.LeagueContent {
  contentCache ??= {
    proLeague: readJson('packages', 'football-content', 'data', 'world', 'pro-league.json'),
    college: readJson('packages', 'football-content', 'data', 'world', 'college.json'),
    proLeagueRules: readJson('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
    collegeLeagueRules: readJson('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
  };
  return contentCache;
}

export interface CareerYearRun { readonly year: play.CareerYear; readonly level: 'pro' | 'college' }

/** A small world from the app's content on the career seed, the seat on a team of the given level. */
export function startCareerYear(seedHex: string, level: 'pro' | 'college'): CareerYearRun {
  const app = newgame.appWorldContent();
  const setup = generation.createSetup({
    seedHex, size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026', eraProgression: false, firstSeasonYear: 2026,
  });
  const world = loop.createWorld({ setup, content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const seat = world.teams.find((t) => turnover.levelOfTeam(world, t.id) === level);
  if (!seat) throw new Error(`no ${level} team in the world`);
  return { year: play.CareerYear.start({ world, content: leagueContent(), seatTeamId: seat.id }), level };
}

/** No player is on two rosters, and every active team has one. */
function rosterProblems(w: loop.LiveWorld): string[] {
  const seen = new Map<number, number>();
  const out: string[] = [];
  for (const [team, ids] of w.rosters) {
    for (const id of ids) {
      const prev = seen.get(id);
      if (prev !== undefined && prev !== team) out.push(`person ${id} is on teams ${prev} and ${team}`);
      seen.set(id, team);
    }
  }
  return out.slice(0, 5);
}

async function reopen(rec: Recorder, s: SaveSession, y: play.CareerYear): Promise<{ s: SaveSession; y: play.CareerYear }> {
  const meta = await s.svc.saveCareerYear(y);
  await s.svc.close();
  const svc = await WorldService.load(s.platform, s.name);
  const back = await svc.loadCareerYear({ content: leagueContent() });
  const next = { ...s, svc };
  if (!back) { rec.add('invalid', 'save', 'live_world.missing', 'The reopened save holds no live world.', OWNERS.careerYear); return { s: next, y }; }
  if (back.view().worldHash !== meta.worldHash) rec.add('invalid', 'save', 'live_world.hash_changed', 'The reopened live world hashes differently from the one written.', OWNERS.careerYear);
  return { s: next, y: back };
}

/**
 * Plays `seasons` seasons and offseasons on one live world, through the save each season. Returns the stage
 * summary line. `save` is the career's open save; the returned session replaces it.
 */
export async function careerYears(rec: Recorder, save: SaveSession, run: CareerYearRun, seasonsToPlay: number): Promise<{ summary: string; save: SaveSession }> {
  let y = run.year;
  let s = save;
  const lines: string[] = [];
  for (let n = 0; n < seasonsToPlay; n++) {
    const w0 = y.world;
    const year = w0.date.seasonYear;
    if (y.season.options.seasonYear !== year) rec.add('invalid', 'offseason', 'season.year_mismatch', `The season session plays ${y.season.options.seasonYear} while the world is in ${year}.`, OWNERS.careerYear);

    // The first season: a mid-season save, then both copies play a week and must agree (save and restore keep the world).
    let weeks = n === 0 ? 0 : 1; // after the first season, the offseason already played week 0 (the roster cycle)
    if (n === 0) {
      for (let i = 0; i < 3 && y.delegateWeek(); i++) weeks++;
      const before = y.view().worldHash;
      const r = await reopen(rec, s, y);
      s = r.s;
      if (r.y !== y) {
        y.delegateWeek(); r.y.delegateWeek(); weeks++;
        if (r.y.view().worldHash !== y.view().worldHash) rec.add('invalid', 'save', 'live_world.diverged', 'A restored mid-season world played the next week differently from the original.', OWNERS.careerYear, { savedAt: before });
        y = r.y;
      }
    }
    while (y.delegateWeek()) weeks++;
    if (y.season.stage !== 'final') { rec.add('stuck', 'offseason', 'season.not_final', `The ${year} season stopped at stage ${y.season.stage}.`, OWNERS.careerYear); break; }

    const w = y.world;
    const seatRows = w.results.filter((r) => r.competitionId === y.seatCompetitionId).length;
    const played = y.season.state.games.length;
    const games = y.season.state.games;
    const carried = games.filter((g) => y.worldTeamOf(g.fixture.home) !== null && y.worldTeamOf(g.fixture.away) !== null).length;
    const seatId = y.season.seatTeamId;
    const seatLost = games.filter((g) => (g.fixture.home === seatId || g.fixture.away === seatId) && (y.worldTeamOf(g.fixture.home) === null || y.worldTeamOf(g.fixture.away) === null)).length;
    if (seatRows !== carried) rec.add('invalid', 'offseason', 'results.not_carried', `The world holds ${seatRows} results of the seat's competition; the season session played ${carried} between teams the world has.`, OWNERS.careerYear, { year });
    if (carried < played) rec.add('missing', 'offseason', 'results.team_not_in_world', `${played - carried} of ${played} season-session games had a team the world does not have (a small world holds fewer schools than the content), ${seatLost} of them the seat's, so the world's record of those teams is short.`, OWNERS.careerYear, { year, seatLost });
    const mine = y.season.summary().teams.find((t) => t.teamId === y.season.seatTeamId);

    const firstEvent = w.log.nextId;
    const people0 = w.people.size;
    const sum = y.runOffseason();
    // The roster cycle (K7 moves: retirements, the draft, free agency) runs on the next season's first weekly pass.
    y.delegateWeek();
    const since = (type: string) => w.log.ofType(type).filter((e) => e.id >= firstEvent).length;
    const drafted = since(turnover.PLAYER_DRAFTED), signed = since(turnover.PLAYER_SIGNED), retired = since(turnover.PLAYER_RETIRED);
    const newPeople = w.people.size - people0;
    const weekAfter = w.week;

    if (sum.seasonYear !== year) rec.add('invalid', 'offseason', 'summary.year', `The season point closed ${sum.seasonYear}, not ${year}.`, OWNERS.worldLoop);
    const line = sum.records[y.seatTeamId];
    if (seatLost === 0 && mine && line && (line.wins !== mine.wins || line.losses !== mine.losses || line.ties !== mine.ties)) {
      rec.add('invalid', 'offseason', 'record.mismatch', `The world records the seat ${line.wins}-${line.losses}-${line.ties}; the season session ${mine.wins}-${mine.losses}-${mine.ties}.`, OWNERS.careerYear, { year });
    }
    if (sum.champions[y.seatCompetitionId] === undefined) rec.add('invalid', 'offseason', 'champion.missing', `The seat's competition has no champion for ${year}.`, OWNERS.careerYear, { year });
    if (drafted === 0) rec.add('invalid', 'offseason', 'draft.none', `No player was drafted between the ${year} season point and the next season's first week.`, OWNERS.worldLoop, { year });
    if (signed === 0) rec.add('invalid', 'offseason', 'free_agency.none', `No player signed between the ${year} season point and the next season's first week.`, OWNERS.worldLoop, { year });
    if (newPeople <= 0) rec.add('invalid', 'offseason', 'cohort.none', `No new people came into the world after the ${year} season.`, OWNERS.worldLoop, { year });
    const unbound = loop.unboundSteps(y.systems).map((u) => u.step);
    for (const step of ['development', 'moves', 'cohorts', 'leaving'] as const) {
      if (unbound.includes(step)) rec.add('missing', 'offseason', `step.unbound:${step}`, `The career year runs the season point without the ${step} step.`, OWNERS.careerYear);
    }
    for (const p of rosterProblems(w)) rec.add('invalid', 'offseason', 'roster.duplicate', p, OWNERS.worldLoop, { year });
    if (w.date.seasonYear !== year + 1 || weekAfter !== 1 || y.season.options.seasonYear !== year + 1 || y.season.stage === 'final') {
      rec.add('stuck', 'offseason', 'next_season.not_started', `After the ${year} offseason the world is in ${w.date.seasonYear} and the season session in ${y.season.options.seasonYear} (${y.season.stage}).`, OWNERS.careerYear);
    }

    const r = await reopen(rec, s, y);
    s = r.s; y = r.y;
    lines.push(`${year}: ${weeks} weeks, ${played} seat-league games, ${mine ? `${mine.wins}-${mine.losses}-${mine.ties}` : 'no record'}, ${drafted} drafted, ${signed} signed, ${retired} retired, +${newPeople} people`);
  }
  return { summary: `${run.level} seat, ${lines.length} seasons on one live world: ${lines.join('; ')}`, save: s };
}
