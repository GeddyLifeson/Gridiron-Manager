// Rule keys and tuning constants of the expected points model (N2.2.1, contract D-09, D-19).
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

const READ_BY = ['models.ep'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Points for a touchdown: the touchdown class value before the try (N2.2.1 rule 2).', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'score.field_goal', type: 'number', unit: 'points', meaning: 'Points for a field goal: the field goal class value.', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'score.safety', type: 'number', unit: 'points', meaning: 'Points for a safety: the safety class value.', ownerLeaf: 'B7', readBy: READ_BY },
];

const rows: TuningParam[] = [];
function assume(name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.ep.${name}`, value, min, max, unit, belongsTo: 'models.ep', basis: 'assumption', leaf, constrainedBy, status: 'starting' });
}

// Fit controls. Choices of this module, not football facts.
assume('ridge', 1, 0, 100, 'ratio', 'N2.2.1', 'N2.2.1 acceptance: held-out class shares within 1 point per yard decile');
assume('maxIterations', 25, 1, 200, 'count', 'N2.2.1', 'N2.2.1 acceptance: held-out class shares');
assume('tolerance', 1e-6, 1e-12, 1e-2, 'ratio', 'N2.2.1', 'N2.2.1 acceptance: held-out class shares');
// A state with fewer training plays than this in its support bucket is flagged sparse (N2.7.2).
// Same starting count N2.2.3 rule 3 uses to grey a rate.
rows.push({ name: 'models.ep.sparseSupport', value: 30, min: 1, max: 1000, unit: 'count', belongsTo: 'models.ep', basis: 'bible', leaf: 'N2.2.3', constrainedBy: 'N2.7.2 limits-of-the-model note', status: 'starting' });
// N2.2.3 rule 1 (coaching definition of success). Stated in the leaf as starting values, status 2 of 3.
function bible(name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.ep.${name}`, value, min, max, unit, belongsTo: 'models.ep', basis: 'bible', leaf, constrainedBy, status: 'starting' });
}
bible('success.firstDownShare', 0.4, 0, 1, 'ratio', 'N2.2.3', 'N2.2.3 acceptance: switching definitions changes success columns only');
bible('success.secondDownShare', 0.6, 0, 1, 'ratio', 'N2.2.3', 'N2.2.3 acceptance');
bible('success.lateDownShare', 1, 0, 1, 'ratio', 'N2.2.3', 'N2.2.3 acceptance');
bible('explosive.runYd', 10, 1, 99, 'yd', 'N2.2.3', 'N2.2.3 rule 2 (user-editable threshold)');
bible('explosive.passYd', 20, 1, 99, 'yd', 'N2.2.3', 'N2.2.3 rule 2 (user-editable threshold)');
bible('report.minSample', 30, 1, 1000, 'count', 'N2.2.3', 'N2.2.3 rule 3 (rates on fewer plays are greyed)');

export const PARAMS: ParamFile = { module: 'models.ep', version: 'g07.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.ep.${name}`);
  if (!r) throw new Error(`unknown parameter models.ep.${name}`);
  return r.value;
}
