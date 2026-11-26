// In-week deadlines relative to a club's game (C4.5.1). Bye weeks have none.
import W from './data/weekly.json' with { type: 'json' };
import { addMinutes, parseTime, type Instant } from './date.ts';

export interface WeeklyDeadline { readonly id: string; readonly at: Instant; readonly leaf: string; readonly status: string }

export function weeklyDeadlines(kickoff: Instant, weekType: 'game' | 'bye'): WeeklyDeadline[] {
  if (weekType === 'bye') return [];
  const out: WeeklyDeadline[] = [];
  for (const d of W.practiceReportDaysBefore.value) {
    out.push({ id: 'practice_report', at: { day: kickoff.day - d, minute: parseTime(W.gameStatusTime.value) }, leaf: W.practiceReportDaysBefore.leaf, status: W.practiceReportDaysBefore.status });
  }
  out.push({ id: 'elevations', at: { day: kickoff.day - W.elevationDaysBefore.value, minute: parseTime(W.elevationTime.value) }, leaf: W.elevationDaysBefore.leaf, status: W.elevationDaysBefore.status });
  out.push({ id: 'game_status', at: { day: kickoff.day - W.gameStatusDaysBefore.value, minute: parseTime(W.gameStatusTime.value) }, leaf: W.gameStatusDaysBefore.leaf, status: W.gameStatusDaysBefore.status });
  out.push({ id: 'inactives', at: addMinutes(kickoff, -W.inactivesMinutesBeforeKickoff.value), leaf: W.inactivesMinutesBeforeKickoff.leaf, status: W.inactivesMinutesBeforeKickoff.status });
  return out;
}
