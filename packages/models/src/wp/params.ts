// Rule keys and tuning constants of the win probability model (N2.2.2, contract D-09, D-19).
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

const READ_BY = ['models.wp'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'clock.periods', type: 'number', unit: 'count', meaning: 'Periods in regulation: with the period length, the regulation length over which the pregame prior fades (N2.2.2 rule 2).', ownerLeaf: 'B1', readBy: READ_BY },
  { key: 'clock.period_length_s', type: 'number', unit: 's', meaning: 'Length of one period (N2.2.2 rule 2).', ownerLeaf: 'B1', readBy: READ_BY },
  { key: 'clock.play_clock_s', type: 'number', unit: 's', meaning: 'Play clock: the most time one kneel-down can take off the game clock (N2.2.2 acceptance, kneel-down state).', ownerLeaf: 'B1', readBy: READ_BY },
  { key: 'series.downs', type: 'number', unit: 'count', meaning: 'Downs in a series: how many kneel-downs remain (N2.2.2 acceptance).', ownerLeaf: 'B3', readBy: READ_BY },
];

const rows: TuningParam[] = [];
function assume(name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.wp.${name}`, value, min, max, unit, belongsTo: 'models.wp', basis: 'assumption', leaf, constrainedBy, status: 'starting' });
}

assume('ridge', 1, 0, 100, 'ratio', 'N2.2.2', 'N2.2.2 acceptance: calibration in every 5-point band');
assume('maxIterations', 30, 1, 200, 'count', 'N2.2.2', 'N2.2.2 acceptance: calibration');
assume('tolerance', 1e-6, 1e-12, 1e-2, 'ratio', 'N2.2.2', 'N2.2.2 acceptance: calibration');
assume('sparseSupport', 30, 1, 1000, 'count', 'N2.7.2', 'N2.7.2 limits-of-the-model note (same count as models.ep.sparseSupport)');
// Kneel-out rule. Conservative on purpose: one extra clock stop beyond the defense's timeouts covers an
// automatic late-half stop (B1.4.4), and each kneel is assumed to lose this many yards, so a kneel that
// could end in a safety is never ruled certain.
assume('kneel.extraStops', 1, 0, 3, 'count', 'N2.2.2', 'N2.2.2 acceptance: kneel-down state returns at least 0.99');
assume('kneel.lossYd', 2, 0, 5, 'yd', 'N2.2.2', 'N2.2.2 acceptance: kneel-down state');
// Calibration bands of N2.2.2 acceptance ("every 5-point band").
rows.push({ name: 'models.wp.calibration.bandWidth', value: 0.05, min: 0.01, max: 0.5, unit: 'ratio', belongsTo: 'models.wp', basis: 'bible', leaf: 'N2.2.2', constrainedBy: 'N2.2.2 acceptance: calibration', status: 'starting' });

export const PARAMS: ParamFile = { module: 'models.wp', version: 'g07.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.wp.${name}`);
  if (!r) throw new Error(`unknown parameter models.wp.${name}`);
  return r.value;
}
