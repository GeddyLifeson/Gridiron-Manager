// Overtime rules: the rule keys they read and their (empty) tuning file (WP-03).
// Keys under `overtime.regular.*` and `overtime.postseason.*` are read by the type of game, never by
// level. A key that belongs to the other format still exists in both rule-set files (B13.1.2).
import type { ParamFile, RuleKeyDef, RuleKeyManifest } from '@gm/schema';

const READER = 'officiating/overtime';
const num = (key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef => ({ key, type: 'number', unit, meaning, ownerLeaf, readBy: [READER] });
const flag = (key: string, meaning: string, ownerLeaf: string): RuleKeyDef => ({ key, type: 'boolean', meaning, ownerLeaf, readBy: [READER] });

export const OT_TIMED = 'timed_period';
export const OT_ALTERNATING = 'alternating_series_25';

export const GROUPS = ['regular', 'postseason'] as const;
export type Group = (typeof GROUPS)[number];
export const BY_GAME = ['period_length_s', 'max_periods', 'timeouts', 'periods_per_half', 'new_toss_after_periods', 'loser_chooses_at_period'] as const;
export type ByGame = (typeof BY_GAME)[number];
/** The dictionary (WP-01) already names the two period lengths; the other by-game keys take the grouped form. */
const DICTIONARY_NAMES: Readonly<Record<string, string>> = {
  'overtime.regular.period_length_s': 'overtime.period_length_s',
  'overtime.postseason.period_length_s': 'overtime.postseason_period_length_s',
};
export function gameKey(group: Group, name: ByGame): string { const k = `overtime.${group}.${name}`; return DICTIONARY_NAMES[k] ?? k; }

export const KEY = {
  format: 'overtime.format',
  intermission: 'overtime.intermission_s',
  periodBreak: 'overtime.period_break_s',
  twoMinuteWarning: 'overtime.two_minute_warning',
  seriesStart: 'overtime.series_start_yardline',
  twoPointRequiredFrom: 'overtime.two_point_required_from_period',
  tryOnlyFrom: 'overtime.two_point_plays_from_period',
  playClockStoppage: 'clock.play_clock_after_stoppage_s',
} as const;

const BY_GAME_DEFS: Record<ByGame, { unit: string; meaning: string; leaf: Record<Group, string> }> = {
  period_length_s: { unit: 's', meaning: 'Length of one overtime period. 0 where overtime has no game clock', leaf: { regular: 'B10.2.1', postseason: 'B10.3.1' } },
  max_periods: { unit: 'count', meaning: 'Overtime periods played at most; the game ends when the last one expires, tied or not. 0 means no limit', leaf: { regular: 'B10.2.1', postseason: 'B10.3.1' } },
  timeouts: { unit: 'count', meaning: 'Timeouts per team for each overtime half. None carry over', leaf: { regular: 'B10.2.1', postseason: 'B10.3.1' } },
  periods_per_half: { unit: 'count', meaning: 'Overtime periods that make a half: timeouts are renewed and a new kickoff or choice is made at the start of each', leaf: { regular: 'B10.5.1', postseason: 'B10.3.1' } },
  new_toss_after_periods: { unit: 'count', meaning: 'A new coin toss is held after this many overtime periods. 0 means never', leaf: { regular: 'B10.2.1', postseason: 'B10.3.1' } },
  loser_chooses_at_period: { unit: 'index', meaning: 'Overtime period, counted from the last toss, at whose start the loser of that toss has first choice. 0 means none', leaf: { regular: 'B10.2.1', postseason: 'B10.3.1' } },
};

export const RULE_KEYS: RuleKeyManifest = [
  { key: KEY.format, type: 'option', options: [OT_TIMED, OT_ALTERNATING], meaning: 'Overtime driver. timed_period: kickoff, both teams get an opportunity to possess, then sudden death (B10). alternating_series_25: a series each from a fixed yard line, no game clock (B13.7.1)', ownerLeaf: 'B10.1.1', readBy: [READER] },
  ...GROUPS.flatMap((g) => BY_GAME.map((n) => num(gameKey(g, n), BY_GAME_DEFS[n].unit, BY_GAME_DEFS[n].meaning, BY_GAME_DEFS[n].leaf[g]))),
  num(KEY.intermission, 's', 'Intermission before overtime begins', 'B10.1.1'),
  num(KEY.periodBreak, 's', 'Intermission between overtime periods', 'B10.3.1'),
  flag(KEY.twoMinuteWarning, 'A timed overtime period has a two-minute warning, and with it the two-minute fumble limit', 'B10.2.1'),
  num(KEY.seriesStart, 'yd', 'Yards from the goal line where each alternating series starts', 'B13.7.1'),
  num(KEY.twoPointRequiredFrom, 'index', 'From this overtime period a try by kick scores nothing (see officiating/kick). 0 means the rule does not exist', 'B13.7.1'),
  num(KEY.tryOnlyFrom, 'index', 'From this overtime period a series is one two-point play from the try spot. 0 means never', 'B13.7.1'),
  num(KEY.playClockStoppage, 's', 'Play clock at the start of an alternating series', 'B1.3.1'),
];

/** The overtime rules apply rules as written and have no tuning constant. */
export const PARAMS: ParamFile = { module: 'officiating.overtime', version: '1', params: [] };
