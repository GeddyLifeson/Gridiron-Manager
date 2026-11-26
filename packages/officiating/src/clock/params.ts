// Rule keys and tuning constants of the clock module (plans/engine-build-plan.md, section 2).
// Keys marked "new" in `meaning` are not in the phase 0 dictionary: WP-01 adds them with fact rows.
// Where the bible names a key (B13.1.1, B13.1.2) that name is used.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['officiating.clock'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'clock.periods', type: 'number', unit: 'count', meaning: 'Periods in regulation.', ownerLeaf: 'B1.1.1', readBy: READ_BY },
  { key: 'clock.periods_per_half', type: 'number', unit: 'count', meaning: 'New. Periods in each half (B1.1.1 rule 1).', ownerLeaf: 'B1.1.1', readBy: READ_BY },
  { key: 'clock.period_length_s', type: 'number', unit: 's', meaning: 'Length of a regulation period.', ownerLeaf: 'B1.1.1', readBy: READ_BY },
  { key: 'clock.period_break_s', type: 'number', unit: 's', meaning: 'New. Break between the two periods of a half (B1.1.1 rule 5, quarter_break_s).', ownerLeaf: 'B1.1.1', readBy: READ_BY },
  { key: 'clock.halftime_min', type: 'number', unit: 'min', meaning: 'Length of halftime.', ownerLeaf: 'B1.1.1', readBy: READ_BY },
  { key: 'clock.play_clock_s', type: 'number', unit: 's', meaning: 'Play clock after a normal dead ball.', ownerLeaf: 'B1.3.1', readBy: READ_BY },
  { key: 'clock.play_clock_after_stoppage_s', type: 'number', unit: 's', meaning: 'Play clock after an administrative stoppage.', ownerLeaf: 'B1.3.1', readBy: READ_BY },
  { key: 'clock.play_clock_after_runoff_s', type: 'number', unit: 's', meaning: 'New. Play clock after a stoppage that brings a runoff (B1.3.2).', ownerLeaf: 'B1.3.2', readBy: READ_BY },
  { key: 'clock.play_clock_floor_s', type: 'number', unit: 's', meaning: 'New. Value an interrupted play clock is raised to when it stopped below it (B1.3.2).', ownerLeaf: 'B1.3.2', readBy: READ_BY },
  { key: 'clock.two_minute_timeout', type: 'boolean', meaning: 'The clock stops automatically late in each half: the two-minute warning or the two-minute timeout (B1.4.4, B13.3.2). The bible names the key and gives no type; a switch is proposed.', ownerLeaf: 'B1.4.4', readBy: READ_BY },
  { key: 'clock.two_minute_s', type: 'number', unit: 's', meaning: 'New. Game-clock value of the automatic late-half stop (B1.4.4).', ownerLeaf: 'B1.4.4', readBy: READ_BY },
  { key: 'clock.first_down_stop', type: 'option', options: ['never', 'after_two_minute_timeout'], meaning: 'When an offensive first down in bounds stops the clock (B13.3.1).', ownerLeaf: 'B13.3.1', readBy: READ_BY },
  { key: 'clock.out_of_bounds_restart', type: 'option', options: ['signal_before_2min_snap_after', 'signal_before_2min_first_half_late_window_second_half'], meaning: 'When the clock starts on the snap after a runner goes out of bounds (B1.2.3 exception 4, B13.3.2). The second option name is proposed here: B13.1.1 gives the pro value only as "pro rule (B1)".', ownerLeaf: 'B1.2.3', readBy: READ_BY },
  { key: 'clock.late_window_second_half_s', type: 'number', unit: 's', meaning: 'New. Length of the late window of the second half: "inside the last five minutes" (B1.2.3 exceptions 4 and 9).', ownerLeaf: 'B1.2.3', readBy: READ_BY },
  { key: 'clock.foul_restart_on_snap_late', type: 'boolean', meaning: 'New. After a foul late in a half the clock starts on the snap (B1.2.3 exception 9, items 1 and 2).', ownerLeaf: 'B1.2.3', readBy: READ_BY },
  { key: 'clock.runoff_s', type: 'number', unit: 's', meaning: 'New. Seconds run off for an action that conserves time (B1.6.1). B13.1.2 also names `clock.runoff_table`, with no shape; this module reads the single value.', ownerLeaf: 'B1.6.1', readBy: READ_BY },
  { key: 'clock.defense_half_end_window_s', type: 'number', unit: 's', meaning: 'New. Window at the end of a half in which a defensive act that conserves time may end the half (B1.6.3).', ownerLeaf: 'B1.6.3', readBy: READ_BY },
  { key: 'timeout.per_half', type: 'number', unit: 'count', meaning: 'Charged timeouts per team per half.', ownerLeaf: 'B1.4.1', readBy: READ_BY },
  { key: 'try.two_point_points', type: 'number', unit: 'points', meaning: 'Most points a try can add. Read for the last-play try test (B1.7.2 c).', ownerLeaf: 'B1.7.2', readBy: READ_BY },
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Read through the series verdict: a failed last down is a change of possession (B1.2.2 i).', ownerLeaf: 'B3.4.2', readBy: READ_BY },
];

/** The clock module has no tuning constant. The spotting delay and tempo live with the game flow (J11.4.2). */
export const PARAMS: ParamFile = { module: 'officiating.clock', version: 'wp02.1', params: [] };
