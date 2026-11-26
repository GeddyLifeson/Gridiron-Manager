// The pro season in one call: C2.1.1 pairings, C2.4.1 international picks, C2.2.1 weeks, C2.3.1
// slots, C2.5.1 preseason. Flex (C2.3.3) runs later, week by week, from flex.ts.
import type { ProSchedule, ProSeasonInput } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { proPairings } from './pro-opponents.ts';
import { chooseInternational } from './pro-international.ts';
import { solveWeeks } from './pro-weeks.ts';
import { assignSlots } from './pro-slots.ts';
import { proPreseason } from './pro-preseason.ts';

export function generateProSeason(input: ProSeasonInput): ProSchedule {
  const cfg = input.config ?? DEFAULT_CONFIG;
  const rng = input.random;
  const pairings = proPairings(input.league, input.season, input.priorRank, cfg);
  const intl = chooseInternational(input.season, input.league, pairings, rng, cfg);
  const teams = input.league.conferences.flatMap((c) => c.divisions.flatMap((d) => d.clubIds));
  const venueOf = Object.fromEntries(input.clubs.map((c) => [c.id, c.venueId]));
  const weeks = solveWeeks({ season: input.season, teams, pairings, venueOf, intl }, rng, cfg);
  const slotInput = {
    season: input.season, pairings, weekOf: weeks.weekOf, clubs: input.clubs, intl,
    ...(input.priorWins ? { priorWins: input.priorWins } : {}),
    ...(input.stars ? { stars: input.stars } : {}),
    ...(input.week1SundayDayIndex !== undefined ? { week1SundayDayIndex: input.week1SundayDayIndex } : {}),
  };
  const slots = assignSlots(slotInput, rng, cfg);
  const pre = proPreseason(input.season, input.league, input.clubs, pairings, weeks.weekOf, rng, cfg);
  const log = [
    `weeks: ${weeks.restarts} restarts, ${weeks.iterations} iterations, consecutive cap ${weeks.maxConsecutiveUsed}`,
    ...slots.log,
  ];
  const byes = Object.entries(weeks.byeWeek).map(([team, week]) => ({ team, week }));
  return { season: input.season, pairings, games: slots.games, byes, preseason: pre.games, jointPracticeCandidates: pre.jointPracticeCandidates, log };
}
