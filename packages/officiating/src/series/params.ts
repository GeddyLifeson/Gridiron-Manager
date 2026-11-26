// Rule keys and tuning constants of the series module (plans/engine-build-plan.md, section 2).
// The module reads rule values by key only. WP-01 owns the values and their fact rows.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['officiating.series'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Charged scrimmage downs in a series.', ownerLeaf: 'B3.1.1', readBy: READ_BY },
  { key: 'series.yards_to_gain', type: 'number', unit: 'yd', meaning: 'Yards from the spot that starts a series to the line to gain.', ownerLeaf: 'B3.1.1', readBy: READ_BY },
  { key: 'field.hash_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance of each inbounds line from its sideline. Read through the field geometry (hashSouthY, hashNorthY).', ownerLeaf: 'B3.3.3', readBy: READ_BY },
];

/** The series module has no tuning constant: every value it uses is a rule key or an exact comparison (J11.3.2). */
export const PARAMS: ParamFile = { module: 'officiating.series', version: 'wp02.1', params: [] };
