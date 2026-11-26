// Field model: rule keys read and tuning constants (J1). No field dimension is a literal here:
// dimensions are rule values (J1.1.1 acceptance 3), and everything else is a named starting value.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams } from '../tick/param-util.ts';

const READ_BY = ['engine-core/field'];

/** Keys this module reads. WP-01 owns the values and fact rows; a key with no value yet is listed in the WP report. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'field.goal_to_goal_yd', type: 'number', unit: 'yd', meaning: 'Distance between the goal lines', ownerLeaf: 'J1.1.1', readBy: READ_BY },
  { key: 'field.end_zone_depth_ft', type: 'number', unit: 'ft', meaning: 'Depth of each end zone, goal line to end line', ownerLeaf: 'J1.1.1', readBy: READ_BY },
  { key: 'field.width_ft', type: 'number', unit: 'ft', meaning: 'Width of the field, sideline to sideline', ownerLeaf: 'J1.1.1', readBy: READ_BY },
  { key: 'field.hash_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance from each sideline to the inbounds lines (hash marks)', ownerLeaf: 'B13.2.1', readBy: READ_BY },
  { key: 'field.goal_width_ft', type: 'number', unit: 'ft', meaning: 'Distance between the uprights (length of the crossbar)', ownerLeaf: 'J1.1.1', readBy: READ_BY },
  { key: 'field.crossbar_height_ft', type: 'number', unit: 'ft', meaning: 'Height of the top of the crossbar above the ground', ownerLeaf: 'J1.1.1', readBy: READ_BY },
  { key: 'field.numbers_bottom_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance from each sideline to the bottom of the yard-line numbers (J1.1.1: not yet extracted from the Rule 1 diagram)', ownerLeaf: 'J1.1.3', readBy: READ_BY },
  { key: 'field.numbers_top_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance from each sideline to the top of the yard-line numbers (J1.1.1: not yet extracted from the Rule 1 diagram)', ownerLeaf: 'J1.1.3', readBy: READ_BY },
];

/** Keys `landmark` treats as optional: a landmark whose key has no value resolves to null, never to a guess. */
export const OPTIONAL_RULE_KEYS: readonly string[] = ['field.numbers_bottom_from_sideline_ft', 'field.numbers_top_from_sideline_ft'];

export const PARAMS: ParamFile = defineParams('field', '0.1.0', [
  ['middleToleranceYd', 1, 0, 3, 'yd', 'bible', 'J1.1.2', 'none: structural'],
  ['landmarkEndLineMarginYd', 1, 0, 3, 'yd', 'bible', 'J1.1.3', 'none: structural'],
  ['bodyRadiusBaseYd', 0.30, 0.2, 0.5, 'yd', 'bible', 'J1.4.1', 'J2.5.3 spacing test'],
  ['bodyRadiusPerLbYd', 0.0006, 0, 0.002, 'yd/lb', 'bible', 'J1.4.1', 'J2.5.3 spacing test'],
  ['footAllowanceYd', 0.15, 0, 0.5, 'yd', 'bible', 'J1.5.2', 'J1.5.2 boundary cases'],
  ['ballCarryOffsetYd', 0.3, 0, 0.6, 'yd', 'bible', 'J1.5.2', 'J1.5.2 boundary cases'],
  ['leverageToleranceYd', 0.5, 0, 2, 'yd', 'bible', 'J1.5.1', 'none: structural'],
]);

export interface FieldParams {
  readonly middleToleranceYd: number;
  readonly landmarkEndLineMarginYd: number;
  readonly bodyRadiusBaseYd: number;
  readonly bodyRadiusPerLbYd: number;
  readonly footAllowanceYd: number;
  readonly ballCarryOffsetYd: number;
  readonly leverageToleranceYd: number;
}

/** Resolve once per play, never inside the tick. */
export function fieldParams(t: ParamTable): FieldParams {
  const n = (k: string) => t.num(`field.${k}`);
  return {
    middleToleranceYd: n('middleToleranceYd'), landmarkEndLineMarginYd: n('landmarkEndLineMarginYd'),
    bodyRadiusBaseYd: n('bodyRadiusBaseYd'), bodyRadiusPerLbYd: n('bodyRadiusPerLbYd'),
    footAllowanceYd: n('footAllowanceYd'), ballCarryOffsetYd: n('ballCarryOffsetYd'),
    leverageToleranceYd: n('leverageToleranceYd'),
  };
}
