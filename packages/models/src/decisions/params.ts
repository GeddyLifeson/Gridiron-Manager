// Tuning constants of the decision log (N3). No rule keys: the log reads no rule value.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [];

const rows: TuningParam[] = [];
function add(name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.decisions.${name}`, value, min, max, unit, belongsTo: 'models.decisions', basis, leaf, constrainedBy, status: 'starting' });
}

// Width of an option's range, in standard errors either side of the value. N3.3.1 shows a range
// ("61% (58 to 64)") but gives no width. 1.96 standard errors is the usual two-sided 95% interval of a
// normal estimate; chosen by the module author, not a football fact.
add('rangeSe', 1.96, 0.5, 4, 'ratio', 'assumption', 'N3.3.1', 'N3.3.1 acceptance: 200 hand-checked situations; nothing inside the range classed clearly wrong');
// Smallest half-width an option's range may have when the model reports a sparse state (N3.3.1 edge case:
// "show a wide range"). Win probability units. Chosen by the module author.
add('sparseMinHalfWidth', 0.1, 0, 0.5, 'ratio', 'assumption', 'N3.3.1', 'N3.3.1 edge case: weak late-game states are never classed clearly wrong');
// N3.3.3: follow-up checks "at set intervals (4 weeks, end of season)".
add('followUpWeeks', 4, 1, 52, 'count', 'bible', 'N3.3.3', 'N3.3.3 acceptance: every cut of a player who later plays elsewhere gets a follow-up');
// N3.4.1: "the three decisions with the largest effect".
add('reportTopEffects', 3, 1, 10, 'count', 'bible', 'N3.4.1', 'N3.4.1 acceptance: totals equal the sums of listed records');
// N3.4.2: "a starting minimum of 8 decisions in the bucket".
add('patternMinimum', 8, 1, 100, 'count', 'bible', 'N3.4.2', 'N3.4.2 acceptance: no pattern from fewer than the minimum');

export const PARAMS: ParamFile = { module: 'models.decisions', version: 'g31.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.decisions.${name}`);
  if (!r) throw new Error(`unknown parameter models.decisions.${name}`);
  return r.value;
}
