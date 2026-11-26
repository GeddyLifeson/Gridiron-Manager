// Week test fixtures. League-rules values come from the G-10 files in @gm/rules-data (fact rows
// F-league-*, F-college-*); keys G-10 lacks come from the week's own rows (data/week-keys.json).
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RandomStream } from '@gm/schema';
import PRO from '../../../rules-data/data/league/proleague_2026.json' with { type: 'json' };
import COLLEGE from '../../../rules-data/data/league/collegeleague_2026.json' with { type: 'json' };
import { dayNumber, type Instant } from '../../src/calendar/date.ts';
import { calendarLookup, lookupFromValues } from '../../src/calendar/keys.ts';
import type { RuleLookup } from '../../src/calendar/types.ts';
import { WorkRuleChecker, type HeldActivity, type WorkContext } from '../../src/calendar/work-rules.ts';
import { buildWeek, defaultSet, weekLookup, type LimitEnv, type Week, type WeekInput, type EditEnv } from '../../src/week/index.ts';

export const proLeague: RuleLookup = calendarLookup(lookupFromValues(PRO.values));
export const collegeLeague: RuleLookup = lookupFromValues(COLLEGE.values);
export const proRules = weekLookup(proLeague, 'pro');
export const collegeRules = weekLookup(collegeLeague, 'college');
export const checker = new WorkRuleChecker(proLeague);

/** 2026-09-13 is a Sunday (week 1 of a regular season in the fixture). */
export const SUN = dayNumber({ y: 2026, m: 9, d: 13 });
export const at = (day: number, hh: number, mm = 0): Instant => ({ day, minute: hh * 60 + mm });

export function rs(seasonWeek: number, extra: Partial<WorkContext> = {}): (day: number) => WorkContext {
  return () => ({ season: 2026, phaseId: 'regular_season', seasonWeek, gameDays: [], ...extra });
}

export function proEnv(seasonWeek = 1, held: HeldActivity[] = [], extra: Partial<LimitEnv> = {}): EditEnv {
  return { rules: proRules, checker, ctxFor: rs(seasonWeek), held, rung: 'head_coach', ...extra };
}
export function collegeEnv(extra: Partial<LimitEnv> = {}): EditEnv {
  return { rules: collegeRules, rung: 'head_coach', ...extra };
}

export function proWeek(over: Partial<WeekInput> = {}): Week {
  return buildWeek({
    teamId: 1, weekId: 'w1', previousGameDay: SUN - 7, kickoff: at(SUN, 13), home: true, bye: false, playoff: false,
    set: defaultSet(proRules), countable: false, ...over,
  });
}
export function collegeWeek(over: Partial<WeekInput> = {}): Week {
  const sat = SUN - 1;
  return buildWeek({
    teamId: 2, weekId: 'c1', previousGameDay: sat - 7, kickoff: at(sat, 15, 30), home: true, bye: false, playoff: false,
    set: defaultSet(collegeRules), countable: true, ...over,
  });
}

export function rng(n = 1): RandomStream { return stream(seedFromNumber(n), 'between', ['week-test', n]); }
