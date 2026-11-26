// Self-scout (G8) and the opponent scouting report (H2) from the season's film: every game is charted as it is
// played (week-loop film), so the seat's own rows and the next opponent's rows are the season's real plays.
// No league baseline is kept yet, so the predictability index is not shown (G8.2.1: no index without it), and
// no staff charting estimate feeds the G8.1.2 exposure list.
import { scoutingReports, type play } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { ScoutingScreenId, ScoutingView } from '../../screens/scouting/index.ts';

const isWindow = (w: string): w is scoutingReports.WindowId => (scoutingReports.WINDOW_IDS as readonly string[]).includes(w);

/** One screen's view: the seat (self-scout) or the seat's next opponent (scouting report); null with no opponent. */
export function scoutingView(sp: play.SeasonPlay, screenId: ScoutingScreenId, window: string): ScoutingView | null {
  const self = screenId === 'football.self_scout';
  const teamId = self ? sp.seatTeamId : sp.nextSeatGame()?.opponentId ?? null;
  if (teamId === null) return null;
  const season = sp.options.seasonYear;
  const q = scoutingReports.DEFAULT_QUERY.offense;
  return scoutingReports.buildTendencyView({
    subject: self ? 'self' : 'opponent', teamId, teamName: sp.nameOf(teamId),
    plays: sp.film.teamRows(teamId, {}), window: isWindow(window) ? window : 'last3', season,
    cuts: q.cuts, measure: q.measure,
  }) as unknown as ScoutingView;
}

export function scoutingSources(sp: play.SeasonPlay): Pick<RouteSources, 'scouting'> {
  return { scouting: (id, window) => scoutingView(sp, id, window) };
}
