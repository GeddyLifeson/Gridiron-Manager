// Rule keys and tuning constants of the schedule module (plans/game-build-plan.md section 2).
// The keys are new: G-10 adds the league rule files and fact rows. Until then the values come from
// config.json beside this file, each block quoting its bible leaf and status. Names the bible gives
// (`schedule.bye_window`, `schedule.no_bye_weeks`, `schedule.flex`, `schedule.week18_saturday_games`,
// `schedule.international_games`) are kept, split into scalar keys where the rule set needs scalars.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';
import { DEFAULT_CONFIG } from './types.ts';

const MODULE = 'league.schedule';
const READ_BY = [MODULE];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'schedule.regular_season_games', type: 'number', unit: 'count', meaning: 'New. Regular-season games per club (17 pro, 12 college top subdivision).', ownerLeaf: 'C2.1.1', readBy: READ_BY },
  { key: 'schedule.weeks', type: 'number', unit: 'count', meaning: 'New. Regular-season weeks (18 pro; 14 college slots including the early week).', ownerLeaf: 'C2.2.1', readBy: READ_BY },
  { key: 'schedule.bye_window_first_week', type: 'number', unit: 'week', meaning: 'New. First week a bye may fall (C2.2.1 schedule.bye_window).', ownerLeaf: 'C2.2.1', readBy: READ_BY },
  { key: 'schedule.bye_window_last_week', type: 'number', unit: 'week', meaning: 'New. Last week a bye may fall (C2.2.1 schedule.bye_window).', ownerLeaf: 'C2.2.1', readBy: READ_BY },
  { key: 'schedule.no_bye_week', type: 'number', unit: 'week', meaning: 'New. Week with no byes (Thanksgiving week; C2.2.1 schedule.no_bye_weeks).', ownerLeaf: 'C2.2.1', readBy: READ_BY },
  { key: 'schedule.final_week_division_only', type: 'boolean', meaning: 'New. The final week holds only division games.', ownerLeaf: 'C2.2.1', readBy: READ_BY },
  { key: 'schedule.max_short_week_thursdays', type: 'number', unit: 'count', meaning: 'New. Short-week Thursday games per club per season.', ownerLeaf: 'C2.3.1', readBy: READ_BY },
  { key: 'schedule.flex_sunday_night_limited_max', type: 'number', unit: 'count', meaning: 'New. Sunday night flexes allowed in the early window (C2.3.3 schedule.flex).', ownerLeaf: 'C2.3.3', readBy: READ_BY },
  { key: 'schedule.flex_thursday_max', type: 'number', unit: 'count', meaning: 'New. Thursday night flexes per season (C2.3.3 schedule.flex).', ownerLeaf: 'C2.3.3', readBy: READ_BY },
  { key: 'schedule.flex_thursday_notice_days', type: 'number', unit: 'day', meaning: 'New. Notice for a Thursday flex (C2.3.3 schedule.flex).', ownerLeaf: 'C2.3.3', readBy: READ_BY },
  { key: 'schedule.week18_saturday_games', type: 'number', unit: 'count', meaning: 'New. Saturday games in the final week.', ownerLeaf: 'C2.3.3', readBy: READ_BY },
  { key: 'schedule.international_games', type: 'number', unit: 'count', meaning: 'New. Games at international sites per season.', ownerLeaf: 'C2.4.1', readBy: READ_BY },
  { key: 'schedule.preseason_games', type: 'number', unit: 'count', meaning: 'New. Preseason games per club.', ownerLeaf: 'C2.5.1', readBy: READ_BY },
  { key: 'schedule.conference_games', type: 'number', unit: 'count', meaning: 'New. Conference games per team, set per conference (T2.2.1 conference game count).', ownerLeaf: 'T3.1.1', readBy: READ_BY },
  { key: 'schedule.power_opponents_min', type: 'number', unit: 'count', meaning: 'New. Games against power opponents required by the conference (T3.1.2 rule 5).', ownerLeaf: 'T3.1.2', readBy: READ_BY },
  { key: 'schedule.playoff_qualifying_games_min', type: 'number', unit: 'count', meaning: 'New. Qualifying games for the playoff standard from 2027 (T3.1.1 rule 6).', ownerLeaf: 'T3.1.1', readBy: READ_BY },
];

const S = DEFAULT_CONFIG.pro.solver;
const A = DEFAULT_CONFIG.slots.attractiveness;
const p = (name: string, value: number, unit: string, leaf: string, constrainedBy: string): TuningParam => ({
  name: `schedule.${name}`, value, min: value, max: value, unit, belongsTo: MODULE, basis: 'assumption', leaf, constrainedBy, status: 'starting',
});

/** Tuning constants: values live in config.json (the league lint bans numeric literals in .ts). */
export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g13.1',
  params: [
    p('solver.road3Weight', S.road3Weight, 'ratio', 'C2.2.1', 'league schedule test "three-game road trips 2 to 4 clubs"'),
    p('solver.offByeWeight', S.offByeWeight, 'ratio', 'C2.2.1', 'league schedule test "off-bye opponents"'),
    p('solver.divisionLateWeight', S.divisionLateWeight, 'ratio', 'C2.2.1', 'league schedule test "division games late"'),
    p('slots.pickPower', A.pickPower, 'ratio', 'C2.3.1', 'league schedule test "prime-time spread over 100 seasons"'),
    p('slots.usagePenalty', A.usagePenalty, 'ratio', 'C2.3.1', 'league schedule test "prime-time spread over 100 seasons"'),
    p('international.byeEurope', DEFAULT_CONFIG.international.byeProbability.europe, 'ratio', 'C2.4.1', 'league schedule test "international bye choice"'),
    p('international.byeAmericas', DEFAULT_CONFIG.international.byeProbability.mexico, 'ratio', 'C2.4.1', 'league schedule test "international bye choice"'),
    p('college.powerHostsOtherShare', DEFAULT_CONFIG.college.powerHostsOtherShare, 'ratio', 'T3.1.2', 'league schedule test "college non-conference"'),
    p('college.lateNonConferenceShare', DEFAULT_CONFIG.college.weekPrefs.lateNonConferenceShare, 'ratio', 'T3.1.1', 'league schedule test "college weeks"'),
  ],
};
