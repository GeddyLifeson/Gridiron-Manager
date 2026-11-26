// Perception tuning constants (J3). All are the starting values of the leaf named, or Assumptions
// where the bible gives no number. The vision angles are gameplay Assumptions, not vision science (J3.1.2).
import type { ParamFile, ParamTable } from '@gm/schema';
import { defineParams, fastParams, type ParamRow } from '../tick/param-util.ts';

const READ = 'J3.2.2 key-read timing targets', NONE = 'none yet: flagged for J6.8.1 review', PA = 'J15 play-action band (J3.3.1)';

const ROWS: readonly ParamRow[] = [
  ['bufferTicks', 16, 16, 16, 'ticks', 'bible', 'J3.1.1', 'none: structural'],
  ['delayCapS', 1.5, 1.5, 1.5, 's', 'bible', 'J3.1.1', 'none: structural'],
  ['staleDropS', 1.5, 0.5, 3, 's', 'bible', 'J3.1.1', NONE],
  ['otherEntityDelayS', 0.05, 0, 0.2, 's', 'bible', 'J3.1.1', READ],
  ['centralHalfAngleDeg', 30, 15, 45, 'deg', 'bible', 'J3.1.2', NONE],
  ['peripheralHalfAngleDeg', 100, 70, 130, 'deg', 'bible', 'J3.1.2', NONE],
  ['peripheralPerZDeg', 5, 0, 10, 'deg', 'bible', 'J3.1.2', NONE],
  ['peripheralErrorYd', 0.5, 0, 2, 'yd', 'bible', 'J3.1.2', NONE],
  ['peripheralDelayS', 0.10, 0, 0.3, 's', 'bible', 'J3.1.2', NONE],
  ['capacityBase', 3, 2, 5, 'count', 'bible', 'J3.1.2', NONE],
  ['capacityPerZ', 0.5, 0, 1, 'count', 'bible', 'J3.1.2', NONE],
  ['capacityMin', 2, 1, 3, 'count', 'bible', 'J3.1.2', NONE],
  ['capacityMax', 5, 3, 8, 'count', 'bible', 'J3.1.2', NONE],
  ['occlusionS', 0.5, 0, 1, 's', 'bible', 'J3.1.2', PA],
  ['keyDelayBaseS', 0.25, 0.15, 0.4, 's', 'bible', 'J3.2.1', READ],
  ['keyDelayRecIntercept', 1.25, 1, 1.5, 'ratio', 'bible', 'J3.2.1', READ],
  ['keyDelayRecDivisor', 200, 100, 400, 'iss', 'bible', 'J3.2.1', READ],
  ['keyDelayPrepCut', 0.20, 0, 0.4, 'ratio', 'bible', 'J3.2.1', READ],
  ['keyDelayFatigueS', 0.03, 0, 0.1, 's', 'bible', 'J3.2.1', READ],
  ['keyDelayFloorS', 0.10, 0.05, 0.2, 's', 'bible', 'J3.2.1', READ],
  ['evidenceGainBase', 1.0, 0.5, 1.5, 'ratio', 'bible', 'J3.2.2', READ],
  ['evidenceGainPerZ', 0.25, 0, 0.5, 'ratio', 'bible', 'J3.2.2', READ],
  ['evidenceNoiseBase', 0.5, 0.1, 1, 'ratio', 'bible', 'J3.2.2', READ],
  ['evidenceNoisePerZ', 0.08, 0, 0.2, 'ratio', 'bible', 'J3.2.2', READ],
  ['evidenceNoiseMin', 0.1, 0, 0.5, 'ratio', 'bible', 'J3.2.2', READ],
  ['readThresholdBase', 1.5, 1, 2.5, 'ratio', 'bible', 'J3.2.2', READ],
  ['readThresholdPerZDisc', 0.10, 0, 0.3, 'ratio', 'bible', 'J3.2.2', READ],
  ['readThresholdMin', 1.0, 0.5, 1.5, 'ratio', 'bible', 'J3.2.2', READ],
  ['readThresholdMax', 2.2, 1.5, 3, 'ratio', 'bible', 'J3.2.2', READ],
  ['keyWeightBase', 0.6, 0.3, 0.95, 'ratio', 'bible', 'J3.3.2', 'J3.3.2 counter test'],
  ['keyWeightPerZDisc', 0.1, 0, 0.3, 'ratio', 'bible', 'J3.3.2', 'J3.3.2 counter test'],
  ['keyWeightMin', 0.3, 0, 0.6, 'ratio', 'bible', 'J3.3.2', 'J3.3.2 counter test'],
  ['keyWeightMax', 0.95, 0.6, 1, 'ratio', 'bible', 'J3.3.2', 'J3.3.2 counter test'],
  ['anticipationBase', 0.10, 0, 0.3, 'probability', 'bible', 'J3.2.3', 'J3.2.3 tendency test'],
  ['anticipationPerZRec', 0.08, 0, 0.2, 'probability', 'bible', 'J3.2.3', 'J3.2.3 tendency test'],
  ['anticipationPerZDisc', 0.06, 0, 0.2, 'probability', 'bible', 'J3.2.3', 'J3.2.3 tendency test'],
  ['anticipationMax', 0.5, 0.2, 1, 'probability', 'bible', 'J3.2.3', 'J3.2.3 tendency test'],
  ['coverageRecognitionBaseS', 0.4, 0.2, 0.8, 's', 'bible', 'J3.3.3', 'J3.3.3 disguise test'],
  ['coverageRecognitionPerZS', 0.08, 0, 0.2, 's', 'bible', 'J3.3.3', 'J3.3.3 disguise test'],
  ['coverageRecognitionFloorS', 0.15, 0.05, 0.3, 's', 'bible', 'J3.3.3', 'J3.3.3 disguise test'],
  ['gazeRateRadPs', 6, 2, 12, 'rad/s', 'bible', 'J3.4.1', NONE],
  ['landingErrorYd', 3, 0, 6, 'yd', 'bible', 'J3.5.1', 'J3.5.1 deep-ball test'],
  ['landingShrinkFlightFrac', 0.6, 0.2, 1, 'ratio', 'bible', 'J3.5.1', 'J3.5.1 deep-ball test'],
  ['landingShrinkPerZ', 0.05, 0, 0.15, 'ratio', 'assumption', 'J3.5.1', 'J3.5.1 deep-ball test'],
  ['landingShrinkMinFrac', 0.2, 0.05, 0.6, 'ratio', 'assumption', 'J3.5.1', 'J3.5.1 deep-ball test'],
  ['ballCueDelayS', 0.2, 0, 0.5, 's', 'bible', 'J3.5.1', 'J3.5.1 deep-ball test'],
  ['looseBallNearYd', 3, 1, 6, 'yd', 'bible', 'J3.5.2', NONE],
  ['looseBallSeenDelayS', 0.2, 0, 0.5, 's', 'bible', 'J3.5.2', NONE],
  ['looseBallUnseenDelayS', 0.5, 0, 1, 's', 'bible', 'J3.5.2', NONE],
  ['callBase', 0.97, 0.5, 1, 'probability', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
  ['callNoiseK', 0.25, 0, 0.6, 'probability', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
  ['callDistK', 0.005, 0, 0.02, 'probability/yd', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
  ['callSkillPerZ', 0.05, 0, 0.15, 'probability', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
  ['callCohesion', 0.05, 0, 0.15, 'probability', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
  ['callDelayS', 0.2, 0, 0.5, 's', 'bible', 'J3.6.1', 'J3.6.1 noise test'],
];

export const PARAMS: ParamFile = defineParams('perception', '0.1.0', ROWS);

export type PerceptionParams = Readonly<Record<string, number>>;

const RESOLVED = new WeakMap<ParamTable, PerceptionParams>();
/** Resolve once per play, never inside the tick. Property names are the row names above. */
export function perceptionParams(t: ParamTable): PerceptionParams {
  // A parameter table never changes, so its rows are read once per table, not once per play (G-97).
  const hit = RESOLVED.get(t);
  if (hit !== undefined) return hit;
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`perception.${row[0]}`);
  const fast = fastParams(out);
  RESOLVED.set(t, fast);
  return fast;
}
