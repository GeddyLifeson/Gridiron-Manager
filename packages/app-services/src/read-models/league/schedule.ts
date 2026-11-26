// League schedule read model (C2.2 full schedule, C2.2.2 week tags, T3.1 college season schedule). Every
// game of the season by week with results, plus one team's rows with opponent, site, rest days, the week
// tag from the league's own C2.2.2 bands, and each opponent's record as seen so far.
import { schedule } from '@gm/league';
import type { ObservedWorld } from '../../observer/index.ts';
import { recordsFrom, resultFor, seasonGames, teamRefs, withTeams } from './shared.ts';
import type { ScheduleGame, ScheduleView, ScheduleWeek, TeamScheduleRow, WeekTag } from './types.ts';

function weeksOf(games: readonly ScheduleGame[], clubs: readonly number[]): ScheduleWeek[] {
  const byWeek = new Map<number, ScheduleGame[]>();
  for (const g of games) byWeek.set(g.week, [...(byWeek.get(g.week) ?? []), g]);
  return [...byWeek.keys()].sort((a, b) => a - b).map((week) => {
    const list = byWeek.get(week)!;
    const regular = list.some((g) => g.phase === 'regular');
    const playing = new Set(list.flatMap((g) => g.teamIds));
    return { week, games: list, byes: regular ? clubs.filter((c) => !playing.has(c)) : [] };
  });
}

/** One team's rows: a row per regular-season week (bye rows included), then its other games in week order. */
export function teamRows(games: readonly ScheduleGame[], teamId: number): TeamScheduleRow[] {
  const records = recordsFrom(games);
  const mine = games.filter((g) => g.teamIds.includes(teamId));
  const regularWeeks = games.filter((g) => g.phase === 'regular').map((g) => g.week);
  const first = regularWeeks.length ? Math.min(...regularWeeks) : 0, last = regularWeeks.length ? Math.max(...regularWeeks) : -1;
  const out: TeamScheduleRow[] = [];
  let prev: ScheduleGame | null = null;
  const row = (g: ScheduleGame): TeamScheduleRow => {
    const side = g.teamIds[0] === teamId ? 0 : 1;
    const opp = g.teamIds[side === 0 ? 1 : 0]!;
    const rest = prev && prev.kickoff.seasonYear === g.kickoff.seasonYear ? g.kickoff.dayIndex - prev.kickoff.dayIndex : null;
    const tag: WeekTag = rest === null ? 'normal' : schedule.tagForDays(rest);
    prev = g;
    return { week: g.week, game: g, opponentId: opp, site: g.neutralSite ? 'neutral' : side === 0 ? 'home' : 'away', tag, restDays: rest, result: resultFor(g, teamId), opponentRecord: records.get(opp) ?? null };
  };
  for (const g of mine.filter((x) => x.phase === 'preseason')) out.push(row(g));
  prev = null;
  for (let w = first; w <= last; w++) {
    const g = mine.find((x) => x.phase === 'regular' && x.week === w);
    if (g) out.push(row(g));
    else out.push({ week: w, game: null, opponentId: null, site: null, tag: 'bye', restDays: null, result: null, opponentRecord: null });
  }
  for (const g of mine.filter((x) => x.phase === 'postseason')) out.push(row(g));
  return out;
}

export function buildSchedule(world: ObservedWorld, competitionId: number, seasonYear: number, teamId: number | null = null): ScheduleView {
  const base = teamRefs(world, competitionId);
  const clubs = Object.values(base).map((t) => t.teamId).sort((a, b) => a - b);
  const games = seasonGames(world, competitionId, seasonYear);
  return {
    competitionId, seasonYear, teams: withTeams(world, base, games.flatMap((g) => g.teamIds)),
    weeks: weeksOf(games, clubs), teamId, teamRows: teamId === null ? [] : teamRows(games, teamId),
  };
}
