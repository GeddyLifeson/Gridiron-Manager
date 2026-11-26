// The office Today read model from the season (G-72 UiHome). The week's blocks, inbox and hours arrive with
// the week loop (H1, E7); until then the day shows the next game and one way to advance to it.
import type { UiHome } from '../screens/home/view.ts';
import type { SeasonToday } from './port.ts';

/** Minutes in a coaching week before the week loop sets them (E7 is not wired yet): none spent, none counted. */
const NO_WEEK_MINUTES = 0;
/** Kickoff minute shown for the game-day advance target (1 PM). Display only, until the schedule carries kickoff times. */
const KICKOFF_MINUTE = 13 * 60;

export function homeFromSeason(s: SeasonToday, personId = 0): UiHome {
  const date = { seasonYear: s.seasonYear, dayIndex: s.dayIndex };
  const g = s.nextGame;
  const gameDay = g !== null && g.daysToGame === 0;
  const gameDate = g ? { seasonYear: s.seasonYear, dayIndex: s.dayIndex + g.daysToGame } : null;
  return {
    personId,
    today: {
      date, phaseKey: s.stageLabel, dayLabelKey: s.lastResult, daysToGame: g ? g.daysToGame : null,
      opponent: g ? { teamId: g.opponentId, name: g.opponent } : null,
      mode: gameDay ? 'game_day' : 'empty', blocks: [],
      nextEvent: g && !gameDay ? { date: gameDate!, labelKey: g.home ? `vs ${g.opponent}` : `at ${g.opponent}` } : null,
      minutesLeftThisWeek: NO_WEEK_MINUTES, energyKey: null,
    },
    inbox: [],
    advance: g && !gameDay ? [{ target: 'game_day', to: { date: gameDate!, minute: KICKOFF_MINUTE }, blockedBy: [], runsWithout: [] }] : [],
  };
}

export const recordText = (r: SeasonToday['record']): string => (r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`);
