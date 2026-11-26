// The career year driven end to end (PR 279 CareerYear with its desks): a small world from the app's content,
// a college seat so recruiting runs for the user's own program, a season played week by week with the staff
// on the console, the user's own practice plan in the first week, recruiting acts queued once a class is open,
// the staff's eye checked after practices and games, a save round trip mid-season, and the offseason (the
// world's season point). Each check that fails is a finding in its area: practice, evaluations, recruiting,
// offseason or save. Slow (a full season on the real game for every world game), so it runs once per career.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { play, newgame } from '@gm/app-services';
import { practice as pr, recruiting as lrec } from '@gm/league';
import { generation, loop, recruiting as wrec, season as seasons, turnover } from '@gm/world';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

function leagueContent(): seasons.LeagueContent {
  return {
    proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
    college: read('packages', 'football-content', 'data', 'world', 'college.json'),
    proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
    collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
  };
}

export interface CareerYearOptions {
  /** The world's own games: the real game (default) or a stand-in for quick runs. */
  readonly games?: loop.GamePort;
  readonly level?: 'pro' | 'college';
}

/** A user practice: the staff week plus a live one-on-one period he leads himself, in full pads. */
function userPlan(day: number): play.PracticePlan {
  const me: pr.PeriodLeader = { staffId: 'user', role: 'head_coach', user: true };
  const periods = [...play.STAFF_WEEK.periods, pr.newPeriod(play.STAFF_WEEK.periods.length + 1, 'one_on_one_wr_db', me, { minutes: 10, tempo: 'live', groups: ['WR', 'CB'] })];
  return { practice: { id: `user-${day}`, blockId: `user-${day}`, blockMinutes: 150, day, pads: 'full', periods, environment: pr.NO_ENVIRONMENT, headCoachPresent: true }, scripts: {} };
}

export function careerYearStage(rec: Recorder, seedHex: string, o: CareerYearOptions = {}): string {
  const level = o.level ?? 'college';
  const app = newgame.appWorldContent();
  const setup = generation.createSetup({
    seedHex, size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026', eraProgression: false, firstSeasonYear: 2026,
  });
  const world = loop.createWorld({ setup, content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const seat = world.teams.find((t) => turnover.levelOfTeam(world, t.id) === level)?.id;
  if (seat === undefined) { rec.add('invalid', 'offseason', 'career_year.no_seat', `The small world has no ${level} team.`, OWNERS.worldLoop); return 'no seat'; }
  const content = leagueContent();
  const games = o.games;
  let y = play.CareerYear.start({ world, content, seatTeamId: seat, ...(games ? { games } : {}) });

  // Practice: the user's plan is checked and kept, then run on the seat roster at the week's advance.
  const checks = y.practice.plan([userPlan(wrec.dayOfWorld(world.date))]);
  if (!checks[0]?.ok) rec.add('invalid', 'practice', 'practice.plan_refused', `The user practice plan was refused: ${[...(checks[0]?.problems ?? []).map((p) => p.message), ...(checks[0]?.findings ?? []).map((f) => f.plain)].join('; ')}`, OWNERS.practice);
  y.delegateWeek();
  const first = y.lastWeek.practices[0];
  if (!first) rec.add('invalid', 'practice', 'practice.not_run', 'The week advanced with no practice run.', OWNERS.practice);
  else {
    if (first.by !== 'user') rec.add('invalid', 'practice', 'practice.user_plan_ignored', 'The week ran the staff practice although the user had planned one.', OWNERS.practice);
    if (first.report.repsCompleted === 0) rec.add('invalid', 'practice', 'practice.no_reps', 'The practice report shows no completed reps.', OWNERS.practice);
    const roster = new Set((world.rosters.get(seat) ?? []).map(String));
    if (Object.keys(first.reps).some((id) => !roster.has(id))) rec.add('invalid', 'practice', 'practice.reps_off_roster', 'Practice reps went to players not on the seat roster.', OWNERS.practice);
  }
  if (y.scouting.playersSeen === 0) rec.add('invalid', 'evaluations', 'scouting.no_observations', 'Practice gave the staff no observations of its players.', OWNERS.evaluations);

  // Recruiting (college): queue a look, an offer and a call once a class is open, and see them taken.
  let target: number | null = null;
  let weeks = 1, gamesSeen = 0, staffWeeks = 0, saved = false;
  const half = Math.floor(y.schedule.weeksInSeason(world) / 2);
  for (;;) {
    if (level === 'college' && target === null) {
      const r = wrec.recruitingOf(y.world);
      const open = Object.values(r.state.prospects).find((p) => r.classes.includes(p.classYear) && r.state.status[p.personId]?.status === 'open');
      if (open) {
        target = open.personId;
        y.recruiting.queueAct({ type: 'look', kind: 'full_film', prospectId: target });
        y.recruiting.queueAct({ type: 'offer', prospectId: target, committable: false });
        y.recruiting.queueAct({ type: 'act', kind: 'call', prospectId: target });
      }
    }
    const more = y.delegateWeek();
    weeks++;
    gamesSeen += y.lastWeek.gamesSeen;
    if (y.lastWeek.practices[0]?.by === 'staff') staffWeeks++;
    if (!saved && weeks >= half) {
      // Save round trip mid-season: the same world hash and the same desks.
      const before = y.view().worldHash;
      const back = play.CareerYear.restore({ content, ...(games ? { games } : {}) }, JSON.parse(JSON.stringify(y.save())) as play.CareerYearSave);
      if (back.view().worldHash !== before) rec.add('invalid', 'save', 'career_year.save_hash', 'A career year restored from its save has a different world hash.', OWNERS.saves);
      if (JSON.stringify(back.scouting.save()) !== JSON.stringify(y.scouting.save())) rec.add('invalid', 'save', 'career_year.save_scouting', 'The staff belief store changed through a save.', OWNERS.saves);
      if (back.practice.history.length !== y.practice.history.length) rec.add('invalid', 'save', 'career_year.save_practice', 'The practice history changed through a save.', OWNERS.saves);
      y = back;
      saved = true;
    }
    if (!more) break;
    if (weeks > 80) { rec.add('stuck', 'offseason', 'career_year.season_never_ends', 'The career season ran 80 weeks without ending.', OWNERS.worldLoop); return 'stuck'; }
  }
  if (gamesSeen === 0) rec.add('invalid', 'evaluations', 'scouting.no_game_looks', 'The seat played no game the staff saw on film.', OWNERS.evaluations);
  if (staffWeeks === 0) rec.add('invalid', 'practice', 'practice.no_staff_week', 'No week ran the staff practice when the user left it alone.', OWNERS.practice);

  let recruitNote = 'pro: no recruiting';
  if (level === 'college') {
    const r = wrec.recruitingOf(y.world);
    if (target === null) rec.add('invalid', 'recruiting', 'recruiting.no_open_class', 'No recruiting class opened during the season.', OWNERS.recruiting);
    else {
      const taken = y.recruiting.record.filter((a) => a.outcome === 'taken').length;
      if (y.recruiting.queued.length > 0) rec.add('invalid', 'recruiting', 'recruiting.acts_never_taken', 'Queued recruiting acts were never taken.', OWNERS.recruiting);
      if ((lrec.gradeOf(r.state, seat, target).looks.full_film ?? 0) === 0) rec.add('invalid', 'recruiting', 'recruiting.look_lost', 'The user\'s film look left no grade on his board.', OWNERS.recruiting);
      if (!lrec.activeOffer(r.state, target, seat)) rec.add('invalid', 'recruiting', 'recruiting.offer_lost', 'The user\'s offer is not on the prospect\'s list.', OWNERS.recruiting);
      recruitNote = `${taken} of ${y.recruiting.record.length} recruiting acts taken`;
    }
  }

  const people0 = y.world.people.size;
  const year = y.world.date.seasonYear;
  const sum = y.runOffseason();
  if (y.world.date.seasonYear !== year + 1) rec.add('invalid', 'offseason', 'career_year.year_not_advanced', 'The offseason did not move the world to the next season.', OWNERS.worldLoop);
  if (y.world.people.size <= people0) rec.add('invalid', 'offseason', 'career_year.no_new_class', 'The season point brought in no new people.', OWNERS.worldLoop);
  if (!(seat in sum.records)) rec.add('invalid', 'offseason', 'career_year.seat_record_missing', 'The season summary has no record for the seat team.', OWNERS.worldLoop);
  return `${level} career year: ${weeks} weeks, ${y.practice.history.length} practices, ${y.scouting.playersSeen} players seen in ${y.scouting.sessionCount} sessions, ${gamesSeen} seat games on film, ${recruitNote}, offseason to ${y.world.date.seasonYear}`;
}
