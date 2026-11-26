// Tuning constants of the predictability index (G8.2.1, contract D-09). No rule keys.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [];

const rows: TuningParam[] = [];
function assume(name: string, value: number, min: number, max: number, unit: string, constrainedBy: string): void {
  rows.push({ name: `models.predictability.${name}`, value, min, max, unit, belongsTo: 'models.predictability', basis: 'assumption', leaf: 'G8.2.1', constrainedBy, status: 'starting' });
}

// Reference model (G8.2.1 rules). Shrinkage toward the league baseline and the rolling window length
// are this module's choices: "retrained in a rolling window and never sees the future".
assume('priorStrength', 20, 0.1, 1000, 'count', 'G8.2.1 acceptance: a random caller scores near zero gain');
assume('windowCalls', 600, 10, 100000, 'count', 'G8.2.1 acceptance: an always-run-on-first-down caller scores worse than a mixed one');
assume('baselineSmoothing', 1, 0, 100, 'count', 'G8.2.1: league baseline for a situation with few calls');
// Situation buckets: what an opponent knows before the snap. Edges are modelling choices.
assume('bucket.shortYd', 2, 1, 5, 'yd', 'G8.2.1 calibration anchor (Q2 band around 67 to 75 percent)');
assume('bucket.mediumYd', 6, 3, 9, 'yd', 'G8.2.1 calibration anchor');
assume('bucket.longYd', 10, 7, 15, 'yd', 'G8.2.1 calibration anchor');
assume('bucket.redZoneYd', 20, 10, 30, 'yd', 'G8.2.1 calibration anchor');
assume('bucket.goalLineYd', 5, 1, 10, 'yd', 'G8.2.1 calibration anchor');
assume('bucket.ownDeepYd', 80, 70, 95, 'yd', 'G8.2.1 calibration anchor');
assume('bucket.closeScore', 8, 1, 16, 'points', 'G8.2.1 calibration anchor');
assume('bucket.lateHalfS', 120, 30, 300, 's', 'G8.2.1 calibration anchor');
// Forced-call rule list (G8.2.1 edge cases): long-yardage desperation late in the game.
assume('forced.desperationSeconds', 120, 0, 900, 's', 'G8.2.1 edge cases: situations that force the call are excluded');
assume('forced.desperationTrailBy', 9, 1, 30, 'points', 'G8.2.1 edge cases');

export const PARAMS: ParamFile = { module: 'models.predictability', version: 'g07.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.predictability.${name}`);
  if (!r) throw new Error(`unknown parameter models.predictability.${name}`);
  return r.value;
}
