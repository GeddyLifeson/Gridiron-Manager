// The recruiting week in the off-screen loop (T4, X12.1.1). It runs inside the `moves` slot, before the
// roster cycle, so a class that signs in February enrols through turnover the same week (RC-08); the loop's
// step order and pass hash keep their shape. Every college program the world holds recruits every week of
// the year; no program is skipped and no week is thinned (MA-66: tiers differ only in what is recorded).
import { recruiting } from '@gm/league';
import { param as genParam } from '../generation/params.ts';
import type { StepContext, StepDigest, StepHandler } from '../loop/types.ts';
import { ageIn, type PolicyContext, type RosterPolicy } from '../turnover/binding.ts';
import { POOL } from '../turnover/moves.ts';
import { groupOf, passBinding, recruitingLevels, recruitingOf, trueQuality, type RecruitingBinding } from './binding.ts';
import { cycleOpen, dayOfWorld, recruitingCalendarDays } from './calendar.ts';
import { param } from './params.ts';
import { recruitingCalendar } from './binding.ts';

/**
 * RC-09: circle members (parents, trainers, advisers) and high school coaches are not world people. They get
 * ids below zero, so they never meet a person id: a member from the prospect id and relation, a coach from
 * the region and school index.
 */
const RELATIONS: readonly recruiting.CircleRelation[] = ['self', 'parent', 'second_parent', 'hs_coach', 'trainer', 'adviser'];
export const circleIds: recruiting.CircleIds = {
  member: (prospectId, relation) => -(prospectId * RELATIONS.length + RELATIONS.indexOf(relation) + 1),
  highSchoolCoach: (region, i) => {
    let h = 0;
    for (const ch of region) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
    return -(1_000_000_000_000 + h * 10_000 + i);
  },
};

/** Ready bodies for a class: recruit-pool people who reach the first college age in the class year. */
function bodiesFor(ctx: StepContext, classYear: number): recruiting.ProspectBody[] {
  const { world } = ctx;
  const enrol = genParam('age.collegeFirstYear');
  const out: recruiting.ProspectBody[] = [];
  for (const id of world.pools.get(POOL.recruits) ?? []) {
    const p = world.people.get(id);
    if (!p?.playing || world.status.get(id) !== 'active' || ageIn(p, classYear) !== enrol) continue;
    const position = groupOf(p.playing.position);
    if (!position) continue;
    out.push({
      personId: id, origin: p.origin === 'user' ? 'generated' : p.origin, position, region: p.life?.homeRegion ?? '',
      heightIn: p.playing.heightIn, weightLb: p.playing.weightLb, trueQuality: trueQuality(p), fortyS: p.playing.tests.fortyS,
    });
  }
  return out.sort((a, b) => a.personId - b.personId);
}

/** Run every recruiting Wednesday up to the world date (and, on a season's first pass, through its February signing date). */
export function runRecruiting(ctx: StepContext, b: RecruitingBinding): StepDigest {
  const { world } = ctx;
  const levels = recruitingLevels(b.turnover);
  if (levels.length === 0) return { recruiting: false };
  const r = recruitingOf(world);
  const cal = recruitingCalendar(b);
  const season = world.date.seasonYear;
  let target = dayOfWorld(world.date);
  if (world.week === 0) target = Math.max(target, cal.februarySigning(season));
  const days = recruitingCalendarDays(r.throughDay, target);
  if (days.length === 0) return { recruiting_weeks: 0 };
  const pass = passBinding(ctx, b, levels);
  const programs = pass.programs();
  const user = b.user?.(world);
  const aiPrograms = user ? programs.filter((p) => !user.teamIds.includes(p.teamId)) : programs;
  const policy = b.policy?.(world);
  const grace = param('cycle.openGraceWeeks') * 7;
  let commits = 0, signings = 0, opened = 0, closed = 0;
  for (const day of days) {
    pass.setDay(day);
    // Open the class whose cycle has begun (RC-02, RC-03).
    for (const classYear of [season, season + 1, season + 2]) {
      if (r.seen.includes(classYear) || day < cycleOpen(classYear)) continue;
      if (day > cycleOpen(classYear) + grace) { r.seen.push(classYear); continue; }
      const bodies = bodiesFor(ctx, classYear);
      if (bodies.length === 0) continue;
      recruiting.classFromBodies(r.state, {
        classYear, programs: programs.length, topPrograms: programs.length,
        favourites: programs.map((p) => ({ teamId: p.teamId, weight: p.prestige })), advisersAllowed: param('class.advisersAllowed') !== 0,
      }, bodies, circleIds, pass.ctx.rng);
      r.classes.push(classYear); r.classes.sort((x, y) => x - y); r.seen.push(classYear);
      opened++;
    }
    for (const classYear of r.classes) {
      if (day > cal.februarySigning(classYear)) continue;
      pass.setClass(classYear);
      if (user) user.act({ state: r.state, ctx: pass.ctx, hook: pass.hook, classYear, day, programs });
      const s = recruiting.recruitingWeek(r.state, pass.ctx, pass.hook, {
        classYear, day, aiPrograms, people: pass.people, policy,
        ...(user ? { userTeamIds: user.teamIds, ...(user.decide ? { userDecide: user.decide } : {}) } : {}),
      });
      commits += s.commits; signings += s.signings;
    }
    r.throughDay = day;
    // A class closes once its February signing date has been run: its letters are kept until it enrols.
    for (const classYear of [...r.classes]) {
      if (day < cal.februarySigning(classYear)) continue;
      for (const p of Object.values(r.state.prospects)) {
        const st = r.state.status[p.personId];
        if (p.classYear === classYear && st?.status === 'signed' && st.teamId !== null) r.letters[p.personId] = st.teamId;
      }
      recruiting.dropClass(r.state, classYear, day - 7 * 53);
      r.classes = r.classes.filter((y) => y !== classYear);
      closed++;
    }
  }
  pass.done();
  r.seen = r.seen.filter((y) => y >= season - 1);
  return { recruiting_weeks: days.length, recruiting_open: r.classes.length, recruiting_opened: opened, recruiting_closed: closed, recruiting_commits: commits, recruiting_signings: signings, recruiting_letters: Object.keys(r.letters).length };
}

/** RC-08: letters signed through recruiting, as the turnover cycle's signing hook. A program over its limit loses the letter to the default fill. */
export function lettersPolicy(base: RosterPolicy | undefined): RosterPolicy {
  return {
    ...base,
    recruitSignings: (pc: PolicyContext) => {
      const r = recruitingOf(pc.world);
      const out = new Map<number, number>();
      for (const [id, teamId] of Object.entries(r.letters)) out.set(Number(id), teamId);
      return out;
    },
  };
}

/**
 * The `moves` slot with recruiting: the recruiting weeks first, then the roster cycle (`inner`), then
 * letters of people who have now enrolled or left are cleared.
 */
export function movesWithRecruiting(b: RecruitingBinding, inner: StepHandler): StepHandler {
  return (ctx) => {
    const d1 = runRecruiting(ctx, b);
    const d2 = inner(ctx) ?? {};
    const r = recruitingOf(ctx.world);
    if (ctx.world.week === 0) {
      const enrol = genParam('age.collegeFirstYear');
      for (const id of Object.keys(r.letters).map(Number)) {
        const p = ctx.world.people.get(id);
        if (!p || ageIn(p, ctx.world.date.seasonYear) >= enrol) delete r.letters[id];
      }
    }
    return { ...d2, ...d1 };
  };
}
