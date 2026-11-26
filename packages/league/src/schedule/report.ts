// C2.6.1 Strength of schedule and rest reports. Definitions only: strength of schedule is the
// combined winning percentage of the opponents (a division opponent counts twice because it is
// played twice), ties count half a win (C3.1.1). Travel is the round trip for every game away from home.
import type { ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { distanceKm, half } from './util.ts';
import { weekTypes } from './week-types.ts';

export interface Record3 { readonly wins: number; readonly losses: number; readonly ties: number }
export interface Place { readonly latitude: number; readonly longitude: number }

export interface ScheduleReport {
  readonly team: TeamId;
  readonly strengthOfSchedule: number;
  readonly shortWeeks: number;
  readonly travelKm: number;
  readonly offByeOpponents: number;
  /** First week of the hardest run of four games and its mean opponent strength. */
  readonly hardestStretch: { readonly startWeek: number; readonly strength: number } | null;
  /** Per game: own days of rest minus the opponent's (C2.2.2 counts). Null where either side has none. */
  readonly restDifference: readonly { readonly week: number; readonly diff: number | null }[];
}

export function winPct(r: Record3 | undefined): number {
  if (!r) return 0;
  const g = r.wins + r.losses + r.ties;
  return g === 0 ? 0 : (r.wins + half(r.ties)) / g;
}

export function scheduleReport(
  team: TeamId,
  games: readonly ScheduledGame[],
  records: Readonly<Record<TeamId, Record3>>,
  places: Readonly<Record<string, Place>>,
  homeVenue: string,
  weeks: number,
  power?: Readonly<Record<TeamId, number>>,
  cfg: ScheduleConfig = DEFAULT_CONFIG,
): ScheduleReport {
  const mine = games.filter((g) => g.phase === 'regular' && (g.home === team || g.away === team)).sort((a, b) => a.week - b.week);
  const opp = (g: ScheduledGame) => (g.home === team ? g.away : g.home);
  let w = 0;
  let l = 0;
  let t = 0;
  for (const g of mine) { const r = records[opp(g)]; if (r) { w += r.wins; l += r.losses; t += r.ties; } }
  const sos = winPct({ wins: w, losses: l, ties: t });
  const allTeams = [...new Set(games.flatMap((g) => [g.home, g.away]))];
  const types = weekTypes(games, allTeams, weeks, cfg);
  const typeOf = (x: TeamId, wk: number) => types.find((r) => r.team === x && r.week === wk);
  const shortWeeks = types.filter((r) => r.team === team && (r.tag === 'short' || r.tag === 'short_mild')).length;
  const home = places[homeVenue];
  let travelKm = 0;
  for (const g of mine) {
    if (g.home === team && !g.neutral) continue;
    const p = places[g.venueId];
    if (home && p) travelKm += distanceKm(home.latitude, home.longitude, p.latitude, p.longitude, cfg) * (1 + 1);
  }
  const byeWeekOf = (x: TeamId) => types.find((r) => r.team === x && r.tag === 'bye')?.week ?? -1;
  const ownBye = byeWeekOf(team);
  const offByeOpponents = mine.filter((g) => byeWeekOf(opp(g)) === g.week - 1 && ownBye !== g.week - 1).length;
  const strength = (x: TeamId) => power?.[x] ?? winPct(records[x]);
  let hardestStretch: ScheduleReport['hardestStretch'] = null;
  const run = cfg.report.stretchGames;
  for (let i = 0; i + run <= mine.length; i++) {
    const s = mine.slice(i, i + run).reduce((a, g) => a + strength(opp(g)), 0) / run;
    if (!hardestStretch || s > hardestStretch.strength) hardestStretch = { startWeek: mine[i]!.week, strength: s };
  }
  const restDifference = mine.map((g) => {
    const a = typeOf(team, g.week)?.restDays ?? null;
    const b = typeOf(opp(g), g.week)?.restDays ?? null;
    return { week: g.week, diff: a === null || b === null ? null : a - b };
  });
  return { team, strengthOfSchedule: sos, shortWeeks, travelKm, offByeOpponents, hardestStretch, restDifference };
}
