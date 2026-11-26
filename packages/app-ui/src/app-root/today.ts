// The office Today read model from the season (G-72 UiHome). The day's blocks and the week's hours come from
// the seat's week loop (H1); the inbox and energy arrive with E7. Outside a game week the day shows the next game
// and one way to advance to it.
import type { UiHome } from '../screens/home/view.ts';
import type { SeasonToday, WeekToday } from './port.ts';

/** Minutes in a coaching week before the week loop sets them (E7 is not wired yet): none spent, none counted. */
const NO_WEEK_MINUTES = 0;
/** Kickoff minute shown for the game-day advance target (1 PM). Display only, until the schedule carries kickoff times. */
const KICKOFF_MINUTE = 13 * 60;

export function homeFromSeason(s: SeasonToday, personId = 0, week: WeekToday | null = null): UiHome {
  const date = { seasonYear: s.seasonYear, dayIndex: s.dayIndex };
  const g = s.nextGame;
  const gameDay = g !== null && g.daysToGame === 0;
  const gameDate = g ? { seasonYear: s.seasonYear, dayIndex: s.dayIndex + g.daysToGame } : null;
  const blocks = week && !gameDay ? week.blocks.map((b) => ({
    blockId: b.blockId, labelKey: b.label, startMinute: b.startMinute, minutes: b.minutes, runBy: b.mine ? 'coach' as const : 'delegate' as const,
    coachMinutes: b.mine ? b.minutes : null, delegateName: null, delegateNoteKey: null, requiredByRule: false, screenId: null,
  })) : [];
  const runsWithout = (week?.runsWithout ?? []).map((r) => ({ blockId: r.blockId, labelKey: r.label, date: { seasonYear: s.seasonYear, dayIndex: r.dayIndex }, byName: null }));
  const steps: UiHome['advance'][number][] = [];
  if (week && !gameDay) {
    steps.push({ target: 'next_block', to: null, blockedBy: [], runsWithout: [] });
    steps.push({ target: 'end_of_day', to: null, blockedBy: [], runsWithout: [] });
  }
  if (g && !gameDay) steps.push({ target: 'game_day', to: { date: gameDate!, minute: KICKOFF_MINUTE }, blockedBy: [], runsWithout });
  return {
    personId,
    today: {
      date, phaseKey: s.stageLabel, dayLabelKey: s.lastResult, daysToGame: g ? g.daysToGame : null,
      opponent: g ? { teamId: g.opponentId, name: g.opponent } : null,
      mode: gameDay ? 'game_day' : blocks.length ? 'normal' : 'empty', blocks,
      nextEvent: g && !gameDay ? { date: gameDate!, labelKey: g.home ? `vs ${g.opponent}` : `at ${g.opponent}` } : null,
      minutesLeftThisWeek: week ? week.minutesLeftThisWeek : NO_WEEK_MINUTES, energyKey: null,
    },
    inbox: [],
    advance: steps,
  };
}

export const recordText = (r: SeasonToday['record']): string => (r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`);
