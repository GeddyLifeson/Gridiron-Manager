// Statistics module numbers (plans/engine-build-plan.md section 2, D-09). Two sources only: rule keys
// read from the rule set, and named parameters. A parameter whose basis is `bible` quotes the leaf
// that states it; `assumption` means this module's author chose it and no source backs it.
import { Contract } from '@gm/engine-core';

type ParamFile = Contract.ParamFile;
type ParamTable = Contract.ParamTable;
type RuleKeyManifest = Contract.RuleKeyManifest;

export const STATS_MODULE = 'engine-game.stats';

/**
 * Rule keys the module reads. All three exist in the dictionary today. They are read only by the public
 * play-by-play export: the clock keys turn a period and a clock into "seconds remaining", and
 * `series.downs` names the last down of a series for the conversion columns.
 */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'clock.periods', type: 'number', unit: 'count', meaning: 'Periods in regulation', ownerLeaf: 'B1', readBy: [STATS_MODULE] },
  { key: 'clock.period_length_s', type: 'number', unit: 's', meaning: 'Length of one period', ownerLeaf: 'B1', readBy: [STATS_MODULE] },
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Downs in a series', ownerLeaf: 'B3', readBy: [STATS_MODULE] },
];

export const PARAMS: ParamFile = {
  module: STATS_MODULE,
  version: '0.1.0',
  params: [
    {
      name: 'stats.fieldGoal.labelAddYd', value: 17, min: 17, max: 18, unit: 'yd', belongsTo: STATS_MODULE,
      basis: 'bible', leaf: 'J9.4.1',
      constrainedBy: 'J15.6.1 field goals by distance bin; engine-game stats test "field goal distance label"',
      status: 'starting',
    },
    {
      name: 'stats.punt.insideYardLine', value: 20, min: 20, max: 20, unit: 'yd', belongsTo: STATS_MODULE,
      basis: 'bible', leaf: 'D14.2.1',
      constrainedBy: 'engine-game stats test "punt inside the 20"',
      status: 'starting',
    },
    {
      name: 'stats.sack.sharedValue', value: 0.5, min: 0.5, max: 0.5, unit: 'count', belongsTo: STATS_MODULE,
      basis: 'bible', leaf: 'D14.1.1',
      constrainedBy: 'engine-game stats test "shared sack"',
      status: 'starting',
    },
    {
      name: 'stats.sack.maxSharers', value: 2, min: 1, max: 3, unit: 'count', belongsTo: STATS_MODULE,
      basis: 'assumption', leaf: 'D14.1.1',
      constrainedBy: 'engine-game stats test "shared sack"',
      status: 'starting',
    },
    {
      name: 'stats.tackle.maxCredited', value: 2, min: 1, max: 3, unit: 'count', belongsTo: STATS_MODULE,
      basis: 'assumption', leaf: 'D14.1.1',
      constrainedBy: 'engine-game stats test "assisted tackle"',
      status: 'starting',
    },
    {
      name: 'stats.personnel.eligibleCount', value: 5, min: 5, max: 5, unit: 'count', belongsTo: STATS_MODULE,
      basis: 'bible', leaf: 'G1.1.1',
      constrainedBy: 'engine-game stats test "public personnel string"',
      status: 'starting',
    },
    {
      name: 'stats.passLocation.middleHalfWidthYd', value: 6, min: 2, max: 10, unit: 'yd', belongsTo: STATS_MODULE,
      basis: 'assumption', leaf: 'J11.9.1',
      constrainedBy: 'pass location share printed by research/nflverse_baselines.py (no J15 row yet); engine-game stats test "pass location"',
      status: 'starting',
    },
  ],
};

/** A read-only table over one parameter file. The integrator's merged table replaces it after the merge. */
export function paramTableOf(file: ParamFile): ParamTable {
  const byName = new Map(file.params.map((p) => [p.name, p.value]));
  return {
    version: file.version,
    has: (name) => byName.has(name),
    num: (name) => {
      const v = byName.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}

/** Field goal distance bands of D14.2.1, as data. `maxYd` null means no upper end. The key is the credit's `splitKey`. */
export const FIELD_GOAL_BANDS: readonly { key: string; minYd: number; maxYd: number | null; leaf: string }[] = [
  { key: '0_19', minYd: 0, maxYd: 19, leaf: 'D14.2.1' },
  { key: '20_29', minYd: 20, maxYd: 29, leaf: 'D14.2.1' },
  { key: '30_39', minYd: 30, maxYd: 39, leaf: 'D14.2.1' },
  { key: '40_49', minYd: 40, maxYd: 49, leaf: 'D14.2.1' },
  { key: '50_59', minYd: 50, maxYd: 59, leaf: 'D14.2.1' },
  { key: '60_', minYd: 60, maxYd: null, leaf: 'D14.2.1' },
];

export function fieldGoalBand(distanceYd: number): string {
  for (const b of FIELD_GOAL_BANDS) if (distanceYd >= b.minYd && (b.maxYd === null || distanceYd <= b.maxYd)) return b.key;
  return FIELD_GOAL_BANDS[0]!.key;
}
