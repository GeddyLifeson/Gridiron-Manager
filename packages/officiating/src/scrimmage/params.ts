// Rule keys and tuning constants of the scrimmage ruling (plans/engine-build-plan.md, section 2).
// Keys marked "new" in `meaning` are not in the phase 0 dictionary: WP-01 adds them with fact rows.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['officiating.scrimmage'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Points for a touchdown.', ownerLeaf: 'B7.1.1', readBy: READ_BY },
  { key: 'score.safety', type: 'number', unit: 'points', meaning: 'Points for a safety.', ownerLeaf: 'B7.1.1', readBy: READ_BY },
  { key: 'try.two_point_points', type: 'number', unit: 'points', meaning: 'Points for a touchdown on a try, by either team.', ownerLeaf: 'B7.3.2', readBy: READ_BY },
  { key: 'try.safety_points', type: 'number', unit: 'points', meaning: 'New. Points for a play on a try that would ordinarily be a safety (B7.1.1 table, B7.3.2 rule 3).', ownerLeaf: 'B7.3.2', readBy: READ_BY },
  { key: 'try.defense_can_score', type: 'boolean', meaning: 'New. The defense may score on a try by returning the ball to the other end zone (B7.3.2 rule 2; an era switch).', ownerLeaf: 'B7.3.2', readBy: READ_BY },
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Charged scrimmage downs in a series. Read for the last-down fumble limit.', ownerLeaf: 'B3.1.1', readBy: READ_BY },
  { key: 'fumble.advance_restriction', type: 'option', options: ['fourth_down_and_try', 'fourth_down_try_and_after_two_minute_warning'], meaning: 'When only the fumbler may recover and advance for his team (B5.6.2 rules 4 and 5, B13.1.1).', ownerLeaf: 'B5.6.2', readBy: READ_BY },
  { key: 'touchback.yardline', type: 'number', unit: 'yd', meaning: 'Yard line where a team awarded a touchback on a play from scrimmage next snaps (B7.6.1 rule 3).', ownerLeaf: 'B7.6.1', readBy: READ_BY },
  { key: 'touchback.momentum_min_yardline', type: 'number', unit: 'yd', meaning: 'New. Nearest yard line to his goal at which the ball is spotted under the momentum exception (B7.5.2 rule 3).', ownerLeaf: 'B7.5.2', readBy: READ_BY },
  { key: 'deadball.loose_at_rest_yardline', type: 'number', unit: 'yd', meaning: 'New. Yard line where a loose ball that came to rest behind a goal line is placed (B3.2.1 i).', ownerLeaf: 'B3.2.1', readBy: READ_BY },
  { key: 'field.ball_length_yd', type: 'number', unit: 'yd', meaning: 'New. Length of the ball. The ball is in the end zone until all of it is in the field of play (B7.5.1 notes).', ownerLeaf: 'B7.5.1', readBy: READ_BY },
];

/** The scrimmage ruling has no tuning constant: it applies the rule as written to the events it is given (B11.2.1 rule 6). */
export const PARAMS: ParamFile = { module: 'officiating.scrimmage', version: 'wp02.1', params: [] };
