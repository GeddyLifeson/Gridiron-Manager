// Practice, the staff's eye and the user's recruiting, driven on the same live world as the offseason stage
// (stages/career-year.ts hooks), so no season is played twice. Each season the user plans the first week's
// practice himself (the staff week runs the rest); after each week the practice report, the reps on the
// seat roster and the staff's observations are checked; in a college career a film look, an offer and a call
// are queued once a class is open and must be taken on the next recruiting day. Every failed check is a
// finding in its area (practice, evaluations, recruiting).
import { play } from '@gm/app-services';
import { practice as pr, recruiting as lrec } from '@gm/league';
import { recruiting as wrec } from '@gm/world';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';
import type { CareerYearHooks } from './career-year.ts';

/** A user practice: the staff week plus a live one-on-one period he leads himself, in full pads. */
export function userPlan(day: number): play.PracticePlan {
  const me: pr.PeriodLeader = { staffId: 'user', role: 'head_coach', user: true };
  const periods = [...play.STAFF_WEEK.periods, pr.newPeriod(play.STAFF_WEEK.periods.length + 1, 'one_on_one_wr_db', me, { minutes: 10, tempo: 'live', groups: ['WR', 'CB'] })];
  return { practice: { id: `user-${day}`, blockId: `user-${day}`, blockMinutes: 150, day, pads: 'full', periods, environment: pr.NO_ENVIRONMENT, headCoachPresent: true }, scripts: {} };
}

export function deskHooks(rec: Recorder): CareerYearHooks {
  let planned = false, userWeeks = 0, staffWeeks = 0, practices = 0, gamesSeen = 0, weeksSinceQueue = -1;
  let target: number | null = null;
  return {
    seasonStart(y) {
      const checks = y.practice.plan([userPlan(wrec.dayOfWorld(y.world.date))]);
      const c = checks[0];
      if (!c?.ok) rec.add('invalid', 'practice', 'practice.plan_refused', `The user practice plan was refused: ${[...(c?.problems ?? []).map((p) => p.plain), ...(c?.findings ?? []).map((f) => f.plain)].join('; ')}`, OWNERS.practice);
      planned = y.practice.planned.length > 0;
    },
    week(y) {
      const seat = y.seatTeamId;
      const ran = y.lastWeek.practices;
      if (ran.length === 0) rec.add('invalid', 'practice', 'practice.not_run', 'A week advanced with no practice run.', OWNERS.practice);
      for (const r of ran) {
        practices++;
        if (r.by === 'user') userWeeks++; else staffWeeks++;
        if (planned && r.by !== 'user') rec.add('invalid', 'practice', 'practice.user_plan_ignored', 'The week ran the staff practice although the user had planned one.', OWNERS.practice);
        if (r.report.repsCompleted === 0) rec.add('invalid', 'practice', 'practice.no_reps', 'A practice report shows no completed reps.', OWNERS.practice);
        const roster = new Set((y.world.rosters.get(seat) ?? []).map(String));
        if (Object.keys(r.reps).some((id) => !roster.has(id))) rec.add('invalid', 'practice', 'practice.reps_off_roster', 'Practice reps went to players not on the seat roster.', OWNERS.practice);
      }
      planned = false;
      gamesSeen += y.lastWeek.gamesSeen;
      if (ran.length > 0 && y.scouting.playersSeen === 0) rec.add('invalid', 'evaluations', 'scouting.no_observations', 'Practice gave the staff no observations of its players.', OWNERS.evaluations);
      if (y.level !== 'college') return;
      if (target !== null && weeksSinceQueue >= 0) {
        weeksSinceQueue++;
        if (y.recruiting.queued.length === 0) {
          const r = wrec.recruitingOf(y.world);
          if ((lrec.gradeOf(r.state, seat, target).looks.full_film ?? 0) === 0) rec.add('invalid', 'recruiting', 'recruiting.look_lost', 'The user\'s film look left no grade on his board.', OWNERS.recruiting);
          if (!lrec.activeOffer(r.state, target, seat)) rec.add('invalid', 'recruiting', 'recruiting.offer_lost', 'The user\'s offer is not on the prospect\'s list.', OWNERS.recruiting);
          weeksSinceQueue = -1;
        } else if (weeksSinceQueue > 3) {
          rec.add('invalid', 'recruiting', 'recruiting.acts_never_taken', 'Queued recruiting acts were not taken within three weeks.', OWNERS.recruiting);
          weeksSinceQueue = -1;
        }
      }
      if (target === null) {
        const r = wrec.recruitingOf(y.world);
        const open = Object.values(r.state.prospects).find((p) => r.classes.includes(p.classYear) && r.state.status[p.personId]?.status === 'open');
        if (open) {
          target = open.personId;
          y.recruiting.queueAct({ type: 'look', kind: 'full_film', prospectId: target });
          y.recruiting.queueAct({ type: 'offer', prospectId: target, committable: false });
          y.recruiting.queueAct({ type: 'act', kind: 'call', prospectId: target });
          weeksSinceQueue = 0;
        }
      }
    },
    seasonEnd(y, n) {
      if (n === 0 && staffWeeks === 0) rec.add('invalid', 'practice', 'practice.no_staff_week', 'No week ran the staff practice when the user left it alone.', OWNERS.practice);
      if (gamesSeen === 0) rec.add('invalid', 'evaluations', 'scouting.no_game_looks', 'The seat played no game the staff saw on film.', OWNERS.evaluations);
      if (y.level === 'college' && target === null) rec.add('invalid', 'recruiting', 'recruiting.no_open_class', 'No recruiting class opened during the season.', OWNERS.recruiting);
    },
    summary() {
      return `${practices} practices (${userWeeks} planned by the user), ${gamesSeen} seat games on film, ${target === null ? 'no recruiting acts' : 'recruiting acts queued'}`;
    },
  };
}
