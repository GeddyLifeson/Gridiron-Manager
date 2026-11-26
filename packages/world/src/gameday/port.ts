// The game port's roster feed: for each game request, both clubs' game-day teams from world people.
// The staff's grades (turnover gradeContext, D6.4.2: one look per club and player per season) are made once
// per week; players with an open D11 case that keeps them out (world/health `isOut`) are not dressed.
import type { SimTeam } from '@gm/schema';
import { healthOf } from '../health/binding.ts';
import type { GameRequest, LiveWorld } from '../loop/types.ts';
import { gradeContext, rosteredSet, type GradeContext } from '../turnover/binding.ts';
import { worldTeam } from './team.ts';

export interface WorldTeamsOptions {
  /** Health out list; by default the D11 health state (world/health `isOut`: a known case not cleared). */
  readonly isOut?: (world: LiveWorld, personId: number) => boolean;
}

/** People the D11 state keeps out this week: world/health `isOut` for everyone at once. */
export function outThisWeek(world: LiveWorld): Set<number> {
  const out = new Set<number>();
  for (const c of healthOf(world).cases) if (c.shown.known && c.shown.state === 'not_cleared') out.add(c.personId);
  return out;
}

/**
 * `TeamsOf` for the week pool (headless realWeekPort): both clubs' teams for a request, or null when either
 * club cannot field eleven (the game then plays placeholder rosters and reports no lines or injuries).
 */
export function worldTeamsOf(o: WorldTeamsOptions = {}): (req: GameRequest) => readonly [SimTeam, SimTeam] | null {
  let key = '', grades: GradeContext | null = null, out = new Set<number>();
  return (req) => {
    const world = req.world;
    // Grades and the out list are made once per weekly pass: no game of the week changes them.
    const k = `${world.date.seasonYear}|${world.week}|${world.passes}`;
    if (k !== key || !grades) { key = k; grades = gradeContext(world, rosteredSet(world)); out = o.isOut ? new Set() : outThisWeek(world); }
    const g = grades, wk = out;
    const opts = { gradeOf: (teamId: number, personId: number) => g.grade(teamId, personId), isOut: o.isOut ? (id: number) => o.isOut!(world, id) : (id: number) => wk.has(id) };
    const home = worldTeam(world, req.game.homeTeamId, 0, opts);
    const away = worldTeam(world, req.game.awayTeamId, 1, opts);
    return home && away ? [home, away] : null;
  };
}
