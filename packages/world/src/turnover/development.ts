// The season-point development pass (D7, D8; X12.1.1 `development`). Every active player in the world,
// rostered or in a pool, takes one development year through G-20's `developYear`, entering next season
// at his D1.1.1 age. Variation is uncapped (D7.4.2 ruling). Service and eligibility counters advance
// for the season just played (D1.1.2: they never decrease).
import { DMATH, stream } from '@gm/engine-core';
import { development } from '@gm/league';
import type { PersonRecord, PlayingBlock } from '@gm/schema';
import type { StepHandler } from '../loop/types.ts';
import { ageIn, gradeContext, levelOfTeam, positionTargets, rosteredSet, specOf, type RuleRead, type TurnoverBinding } from './binding.ts';
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
        if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
      }
      for (const [pos, list] of byPos) {
        const keep = Math.ceil((targets[pos] ?? 0) * param('role.starterShareOfMix'));
        [...list].sort((x, y) => grades.grade(teamId, y) - grades.grade(teamId, x) || x - y).slice(0, keep).forEach((id) => starters.add(id));
      }
    }
    let developed = 0, counted = 0;
    for (const id of [...world.people.keys()].sort((x, y) => x - y)) {
      const p = world.people.get(id)!;
      if (!p.playing || world.status.get(id) !== 'active' || world.outOfFootballSince.has(id)) continue;
      let playing = p.playing;
      const teamId = teamOf.get(id);
      if (teamId !== undefined) { playing = advanceCounters(playing, season, hasEligibility(b.rule, levelOfTeam(world, teamId)), p.birthDate.seasonYear, starters.has(id)); counted++; }
      const who: development.PersonForDevelopment = { position: playing.position, ageYears: ageIn(p, season + 1), playing, facets: p.traitBlock.facets };
      const plan = development.defaultYearPlan(n, starters.has(id) ? 'starter' : 'backup');
      playing = development.developYear(n, DMATH, who, plan, (k) => stream(world.seed, STREAM_DEVELOPMENT, [id, season, k]));
      const next: PersonRecord = { ...p, playing };
      world.people.set(id, next);
      developed++;
    }
    return { developed, counted };
  };
}
