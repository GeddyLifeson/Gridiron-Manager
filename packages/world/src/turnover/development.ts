// The season-point development pass (D7, D8; X12.1.1 `development`). Every active player in the world,
// rostered or in a pool, takes one development year through G-20's `developYear`, entering next season
// at his D1.1.1 age. Variation is uncapped (D7.4.2 ruling). Service and eligibility counters advance
// for the season just played (D1.1.2: they never decrease).
import { DMATH, stream } from '@gm/engine-core';
import { development } from '@gm/league';
import type { PlayingBlock } from '@gm/schema';
import type { StepHandler } from '../loop/types.ts';
import { ageIn, gradeContext, levelOfTeam, positionTargets, rosteredSet, specOf, type DevelopmentJob, type RuleRead, type TurnoverBinding } from './binding.ts';
import { param as genParam } from '../generation/params.ts';
import { param, RULE_KEY } from './params.ts';

export const STREAM_DEVELOPMENT = 'world.development';

/** D1.1.2 counters after one season on a roster. A league with college eligibility keys counts competition; one without counts pro service. */
export function advanceCounters(p: PlayingBlock, seasonYear: number, eligibilityLeague: boolean, birthYear: number, starter = true): PlayingBlock {
  const e = p.eligibility;
  if (eligibilityLeague) {
    // A founding player has no clock on record: it started at the first college age, and every season since counted.
    const start = e.college.clockStartYear ?? Math.min(seasonYear, birthYear + genParam('age.collegeFirstYear'));
    // T5 redshirt: a first-season player who did not start keeps the season (once). Game counts need the
    // statistics step (X3.4.1, unbound), so "did not start" stands in for "played at most the redshirt games".
    const redshirt = !starter && !e.college.redshirtUsed && seasonYear === start && e.college.seasonsOfCompetitionUsed === 0;
    const used = Math.max(e.college.seasonsOfCompetitionUsed, seasonYear - start - (e.college.redshirtUsed ? 1 : 0)) + (redshirt ? 0 : 1);
    return { ...p, eligibility: { ...e, college: { seasonsOfCompetitionUsed: used, clockStartYear: start, redshirtUsed: e.college.redshirtUsed || redshirt } } };
  }
  return { ...p, eligibility: { ...e, pro: { seasonsOnRoster: e.pro.seasonsOnRoster + 1, accruedSeasons: e.pro.accruedSeasons + 1, creditedSeasons: e.pro.creditedSeasons + 1 } } };
}

export function hasEligibility(rule: RuleRead, level: ReturnType<typeof levelOfTeam>): boolean {
  return rule(level, RULE_KEY.seasonsOfCompetition) !== undefined;
}

/** One development year from its job: the function a batch port must reproduce exactly (G-20 `developYear`). */
export function developmentJobResult(n: development.DevNumbers, job: DevelopmentJob): PlayingBlock {
  const who: development.PersonForDevelopment = { position: job.position, ageYears: job.ageYears, playing: job.playing, facets: job.facets };
  return development.developYear(n, DMATH, who, development.defaultYearPlan(n, job.role), (k) => stream(job.seed, STREAM_DEVELOPMENT, [job.personId, job.season, k]));
}

export function developmentStep(b: TurnoverBinding): StepHandler {
  const n = development.devNumbers();
  return (ctx) => {
    const { world } = ctx;
    const season = world.date.seasonYear;
    const rostered = rosteredSet(world);
    const grades = gradeContext(world, rostered);
    // D7.7.1 role: the top share of each position's mix count on a roster are starters.
    const starters = new Set<number>();
    const teamOf = new Map<number, number>();
    for (const [teamId, ids] of [...world.rosters].sort((a, c) => a[0] - c[0])) {
      const targets = positionTargets(specOf(b, world, teamId));
      const byPos = new Map<string, number[]>();
      for (const id of ids) {
        teamOf.set(id, teamId);
        const pos = world.people.get(id)?.playing?.position;
        if (pos) { const l = byPos.get(pos); if (l) l.push(id); else byPos.set(pos, [id]); }
      }
      for (const [pos, list] of byPos) {
        const keep = Math.ceil((targets[pos] ?? 0) * param('role.starterShareOfMix'));
        [...list].sort((x, y) => grades.grade(teamId, y) - grades.grade(teamId, x) || x - y).slice(0, keep).forEach((id) => starters.add(id));
      }
    }
    let counted = 0;
    const jobs: DevelopmentJob[] = [];
    const seed = { hi: world.seed.hi, lo: world.seed.lo };
    for (const id of [...world.people.keys()].sort((x, y) => x - y)) {
      // Status first: inactive and dead people are kept cold (loop/people-table.ts) and need not be read.
      if (world.status.get(id) !== 'active' || world.outOfFootballSince.has(id)) continue;
      const p = world.people.get(id)!;
      if (!p.playing) continue;
      let playing = p.playing;
      const teamId = teamOf.get(id);
      if (teamId !== undefined) { playing = advanceCounters(playing, season, hasEligibility(b.rule, levelOfTeam(world, teamId)), p.birthDate.seasonYear, starters.has(id)); counted++; }
      jobs.push({ personId: id, season, seed, position: playing.position, ageYears: ageIn(p, season + 1), playing, facets: p.traitBlock.facets, role: starters.has(id) ? 'starter' : 'backup' });
    }
    // Each year depends only on its own job, so a batch port (worker threads) gives the same blocks; they are
    // applied in person id order.
    const blocks = b.developBatch ? b.developBatch(jobs) : jobs.map((j) => developmentJobResult(n, j));
    if (blocks.length !== jobs.length) throw new Error(`development batch returned ${blocks.length} blocks for ${jobs.length} jobs`);
    for (let i = 0; i < jobs.length; i++) {
      const id = jobs[i]!.personId;
      world.people.set(id, { ...world.people.get(id)!, playing: blocks[i]! });
    }
    return { developed: jobs.length, counted };
  };
}
