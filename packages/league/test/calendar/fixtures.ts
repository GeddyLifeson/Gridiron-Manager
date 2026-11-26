// Fixture league-rules values: a copy of the G-10 keys the calendar reads, from PR 22
// (packages/rules-data/data/league/proleague_2026.json, fact rows F-league-*). Used until G-10 merges
// and the integrator wires @gm/rules-data league files to the calendar. Marked as a fixture, not a fact.
import type { RuleLookup } from '../../src/calendar/types.ts';
import { calendarLookup } from '../../src/calendar/keys.ts';

export const G10_FIXTURE: Readonly<Record<string, number>> = {
  'tag.window_opens_days_before': 22,
  'tag.window_closes_days_before': 8,
  'tag.multiyear_deadline_july_day': 15,
  'work.offseason_weeks': 9,
  'work.workouts_per_week': 4,
  'work.phase1_weeks': 2,
  'work.phase2_weeks': 3,
  'work.phase3_weeks': 4,
  'work.ota_days': 10,
  'work.ota_max_week_3_or_4': 4,
  'work.start_monday_of_april': 3,
  'work.minicamp_days': 3,
  'work.rookie_minicamp_days': 3,
  'work.camp_field_hours': 4,
  'work.padded_practice_hours': 2.5,
  'work.bye_days_off': 4,
  'trade.deadline_after_week': 9,
  'calendar.league_year_start_march_day': 11,
  'calendar.negotiating_window_start_march_day': 9,
  'calendar.tag_window_opens_feb_day': 17,
};

export const fixtureRules: RuleLookup = calendarLookup((k) => G10_FIXTURE[k]);
