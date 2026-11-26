// Rule keys of the personnel module (G-57). Camp work rules (M6.1.1, M6.2.4; C11.2.2; CBA 2020 Article 23
// Sections 5 to 7 and Article 35 Section 1) are league rule values, read here by key and nowhere else.
// Keys already in G-10's league files carry their fact rows there; keys marked NEW are requested from
// the integrator and G-10 (PR body), each with the bible leaf that states the value. One checker serves
// both levels: a rule is on when its key is in the level's file, never by testing the level (P1.3.3).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['league.personnel'];
const k = (key: string, type: 'number' | 'boolean', unit: string | undefined, meaning: string, ownerLeaf: string) =>
  ({ key, type, ...(unit ? { unit } : {}), meaning, ownerLeaf, readBy: READ_BY });

export const RULE_KEYS: RuleKeyManifest = [
  k('work.camp_padded_practices_max', 'number', 'count', 'Padded practices from the veterans\' report date to the end of camp.', 'C11.2.2'),
  k('work.camp_padded_streak_days', 'number', 'days', 'Longest run of consecutive padded-practice days in camp.', 'C11.2.2'),
  k('work.camp_padded_runs_max', 'number', 'count', 'Most runs of the longest padded streak in camp (NEW: M6.1.1 rule 4, 3, Rulebook only, CBA Art. 23 s. 7).', 'M6.1.1'),
  k('work.camp_padded_run_gap_days', 'number', 'days', 'Calendar days that must pass after a full padded run ends before another starts (NEW: M6.1.1 rule 4, 3, Rulebook only).', 'M6.1.1'),
  k('work.camp_acclimation_days', 'number', 'days', 'Days from report day with no pads: day 1 physicals plus the acclimation days (NEW: M6.1.1 rule 4, 5, Verified: CBA plus PFT 2020).', 'M6.1.1'),
  k('work.camp_day_off_after_acclimation', 'boolean', undefined, 'The day after acclimation is a mandatory day off (NEW: M6.1.1 rule 4, true, Rulebook only).', 'M6.1.1'),
  k('work.camp_days_off_min', 'number', 'days', 'Days off in camp.', 'C11.2.2'),
  k('work.camp_days_off_min_short_preseason', 'number', 'days', 'Days off in camp with the short preseason (NEW: M6.1.1 rule 4, 8, Rulebook only).', 'M6.1.1'),
  k('work.camp_short_preseason_games', 'number', 'games', 'Preseason games at or below which the short-preseason camp rules apply (NEW: M6.1.1 rule 4, 3, Rulebook only).', 'M6.1.1'),
  k('work.camp_days_off_after_last_game', 'number', 'days', 'Camp days off that must fall after the last preseason game with the short preseason (NEW: M6.1.1 rule 4, 4, Rulebook only).', 'M6.1.1'),
  k('work.camp_final_days_off_run', 'number', 'days', 'Consecutive days off at the end of camp with the short preseason (NEW: M6.1.1 rule 4, 3, Rulebook only).', 'M6.1.1'),
  k('work.camp_post_game_off_within_days', 'number', 'days', 'A day off must fall within this many days after each preseason game (NEW: M6.1.1 rule 4, 2, Rulebook only).', 'M6.1.1'),
  k('work.camp_post_game_off_exempt_gap_days', 'number', 'days', 'No post-game day off is owed when the next game is this many days away or fewer (NEW: M6.1.1 rule 4, 5, Rulebook only).', 'M6.1.1'),
  k('work.camp_day_off_every_days', 'number', 'days', 'At least one day off in every this many days until the first preseason game (NEW: M6.1.1 rule 4, 7, Verified: CBA plus PFT 2020).', 'M6.1.1'),
  k('work.camp_facility_hours_max', 'number', 'hours', 'Most hours a player may be required at the facility a day in camp (NEW: M6.1.1 rule 4, 11, Rulebook only).', 'M6.1.1'),
  k('work.camp_facility_hours_reduced', 'number', 'hours', 'The facility-hours limit after the reduction game (NEW: M6.1.1 rule 4, 10, Rulebook only).', 'M6.1.1'),
  k('work.camp_facility_reduced_after_game', 'number', 'games', 'Preseason games after which the reduced facility limit applies (NEW: M6.1.1 rule 4, 2, Rulebook only).', 'M6.1.1'),
  k('work.joint_practice_days_per_week_max', 'number', 'days', 'Joint practice days in one preseason week (NEW: M6.2.4 rule 1, 2, 1 of 3).', 'M6.2.4'),
  k('work.joint_practice_days_season_max', 'number', 'days', 'Joint practice days in a season with the short preseason (NEW: M6.2.4 rule 1, 4, 1 of 3).', 'M6.2.4'),
  k('work.preseason_practices_max', 'number', 'count', 'Preseason practice opportunities where the level counts them (NEW: M6.1.1 edge case, college 29, 2 of 3).', 'M6.1.1'),
  k('work.live_contact_days_max', 'number', 'days', 'Live-contact days allowed in any window after acclimation where the level limits them (NEW: M6.1.1 edge case, college 3, 1 of 3).', 'M6.1.1'),
  k('work.live_contact_window_days', 'number', 'days', 'The window for the live-contact limit (NEW: M6.1.1 edge case, college 7, 1 of 3).', 'M6.1.1'),
];

export interface CampRules {
  readonly padded: { readonly max: number; readonly streakMax: number; readonly runsMax: number; readonly runGapDays: number } | null;
  readonly acclimationDays: number | null;
  readonly dayOffAfterAcclimation: boolean;
  readonly daysOff: { readonly min: number; readonly minShortPreseason: number; readonly shortPreseasonGames: number; readonly afterLastGame: number; readonly finalRun: number } | null;
  readonly dayOffEveryDays: number | null;
  readonly postGameOff: { readonly withinDays: number; readonly exemptGapDays: number } | null;
  readonly facility: { readonly max: number; readonly reduced: number; readonly reducedAfterGame: number } | null;
  readonly joint: { readonly perWeek: number; readonly perSeason: number } | null;
  readonly practicesMax: number | null;
  readonly liveContact: { readonly max: number; readonly windowDays: number } | null;
  readonly keysRead: readonly string[];
}

/** Camp rules from a rule set. A group is on when its first key is present (no level test). */
export function campRules(rs: RuleSet): CampRules {
  const present = new Set(rs.keys());
  const read: string[] = [];
  const has = (key: string) => present.has(key);
  const num = (key: string) => { read.push(key); return rs.num(key); };
  const bool = (key: string) => { read.push(key); return rs.bool(key); };
  const r: Omit<CampRules, 'keysRead'> = {
    padded: has('work.camp_padded_practices_max') ? {
      max: num('work.camp_padded_practices_max'), streakMax: num('work.camp_padded_streak_days'),
      runsMax: num('work.camp_padded_runs_max'), runGapDays: num('work.camp_padded_run_gap_days'),
    } : null,
    acclimationDays: has('work.camp_acclimation_days') ? num('work.camp_acclimation_days') : null,
    dayOffAfterAcclimation: has('work.camp_day_off_after_acclimation') ? bool('work.camp_day_off_after_acclimation') : false,
    daysOff: has('work.camp_days_off_min') ? {
      min: num('work.camp_days_off_min'), minShortPreseason: num('work.camp_days_off_min_short_preseason'), shortPreseasonGames: num('work.camp_short_preseason_games'),
      afterLastGame: num('work.camp_days_off_after_last_game'), finalRun: num('work.camp_final_days_off_run'),
    } : null,
    dayOffEveryDays: has('work.camp_day_off_every_days') ? num('work.camp_day_off_every_days') : null,
    postGameOff: has('work.camp_post_game_off_within_days') ? { withinDays: num('work.camp_post_game_off_within_days'), exemptGapDays: num('work.camp_post_game_off_exempt_gap_days') } : null,
    facility: has('work.camp_facility_hours_max') ? {
      max: num('work.camp_facility_hours_max'), reduced: num('work.camp_facility_hours_reduced'), reducedAfterGame: num('work.camp_facility_reduced_after_game'),
    } : null,
    joint: has('work.joint_practice_days_per_week_max') ? { perWeek: num('work.joint_practice_days_per_week_max'), perSeason: num('work.joint_practice_days_season_max') } : null,
    practicesMax: has('work.preseason_practices_max') ? num('work.preseason_practices_max') : null,
    liveContact: has('work.live_contact_days_max') ? { max: num('work.live_contact_days_max'), windowDays: num('work.live_contact_window_days') } : null,
  };
  return Object.freeze({ ...r, keysRead: Object.freeze([...new Set(read)].sort()) });
}
