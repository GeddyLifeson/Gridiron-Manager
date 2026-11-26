// Schedule records (C2.6.2) to season fixtures. The schedule generators name teams by world-data key;
// standings and the engine use numeric ids. Game ids follow kickoff order (week, day, then schedule id),
// so they are stable for a given schedule.
import type { schedule } from '@gm/league';
import type { Fixture, TeamId } from './types.ts';

export function fixturesFromSchedule(games: readonly schedule.ScheduledGame[], idOf: (key: string) => TeamId, firstGameId = 1): Fixture[] {
  const ordered = games.filter((g) => g.phase === 'regular')
    .sort((a, b) => a.week - b.week || a.dayOffset - b.dayOffset || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ordered.map((g, i) => ({
    gameId: firstGameId + i, week: g.week, phase: 'regular', home: idOf(g.home), away: idOf(g.away),
    neutralSite: g.neutral, conferenceGame: g.conferenceGame, dayIndex: g.dayIndex, kickoffMinute: g.kickoffEtMinutes, postKey: null,
  }));
}
