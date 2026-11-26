// Tuning constants of the decision record score (N4). No rule keys: the score reads no rule value.
// Every value is a starting value. "bible" means the number is written in the cited leaf (most of
// those leaves call it an Assumption themselves); "assumption" means this module chose it.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [];

const rows: TuningParam[] = [];
function add(name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.rating.${name}`, value, min, max, unit, belongsTo: 'models.rating', basis, leaf, constrainedBy, status: 'starting' });
}

// N4.2.1 rule 3: "k a starting 50 decisions". Also the "mostly prior" line of N4.5.1 limit 1.
add('shrinkageK', 50, 1, 1000, 'count', 'bible', 'N4.2.1', 'N4.5.1 acceptance: a component with 30 scored decisions is flagged mostly prior');
// N4.2.1 rule 7: a game-management loss counts only at a WP edge of at least 1.5 percentage points.
add('lossBandWp', 0.015, 0, 0.1, 'ratio', 'bible', 'N4.2.1', 'N4.2.1 acceptance: an edge of 1.4 points is a close call, 3 points with an interval above zero is a loss');
// N4.2.1 edge case: an accepted suggestion is credited at a starting half weight.
add('suggestionWeight', 0.5, 0, 1, 'ratio', 'bible', 'N4.2.1', 'N4.2.1 edge case: the rest goes to the coordinator');
// N4.2.1 rule 6: the EP and WP models must reach a calibration error of at most 0.01 on held-out seasons.
add('calibrationMax', 0.01, 0, 0.1, 'ratio', 'bible', 'N4.2.1', 'nflfastR reports 0.006 (EP) and 0.0055 (WP); N4.2.1 sets 0.01');
// N4.2.1 rule 3 says "a bootstrap interval" without a width. 80% matches the interval N4.2.2 uses for
// the roster percentile, so the page shows one kind of range. Module choice.
add('intervalLevel', 0.8, 0.5, 0.99, 'ratio', 'assumption', 'N4.2.1', 'N4.2.2 uses an 80% interval');
// Resamples per bootstrap interval. Module choice: enough for stable 10th and 90th percentiles.
add('bootstrapDraws', 400, 50, 10000, 'count', 'assumption', 'N4.2.1', 'two runs with the same inputs give the same range');
// N4.1.1 "A component with too few samples shows not enough evidence" gives no count. Module choice.
add('minEvidence', 10, 1, 1000, 'count', 'assumption', 'N4.1.1', 'below it the component shows "not enough evidence"');
// Scale from value per decision (difference from the reference coach) to the 0 to 100 score; 50 is the
// reference coach (N4.2.3 acceptance). Module choices, to be checked by Q5 against real coach records.
// Game management and special teams: 0.01 WP per decision better than the reference = 25 points.
add('scaleWp', 2500, 100, 20000, 'ratio', 'assumption', 'N4.2.1', 'Q5 coach validation');
// Play calling and in-game adjustment: 0.1 expected points per call better than the reference = 25 points.
add('scaleEp', 250, 10, 5000, 'ratio', 'assumption', 'N4.2.1', 'Q5 coach validation');
// Share-correct components (film, player evaluation, operation speed, teaching, game planning,
// play design): 10 percentage points better than the reference = 25 points.
add('scaleShare', 250, 10, 5000, 'ratio', 'assumption', 'N4.2.1', 'Q5 coach validation');
// N4.2.1 rule 2 "plus a predictability penalty" gives no size. Expected points charged per unit of
// predictability above the reference caller's. Module choice.
add('predictabilityPenaltyEp', 0.2, 0, 2, 'ratio', 'assumption', 'N4.2.1', 'G8 self-scout; N3.3.2 predictability');
// Operation speed: a call confirmed with fewer than this many tenths left on the play clock counts as
// late. N4.1.1 names "late calls" without a cut. Module choice (5 seconds).
add('lateCallTenths', 50, 0, 400, 'count', 'assumption', 'N4.1.1', 'I2.1.2 play clock always runs');
// N4.2.2: 200 reference runs per season; percentile words at the 80th and 20th; under 8 games "too few".
add('rosterRuns', 200, 20, 5000, 'count', 'bible', 'N4.2.2', 'N4.2.2 acceptance: median percentile 45 to 55 over 100 test seasons');
add('rosterHighPct', 80, 50, 100, 'ratio', 'bible', 'N4.2.2', 'words "well above what this roster suggests"');
add('rosterLowPct', 20, 0, 50, 'ratio', 'bible', 'N4.2.2', 'words "well below"');
add('rosterMinGames', 8, 1, 17, 'count', 'bible', 'N4.2.2', 'N4.2.2 acceptance: 6 games shows "too few games to say"');
// N4.2.3: before a save has a season of AI decisions the reference coach goes for it on 50% of clear-go
// fourth downs and kicks on 95% of clear-kick ones.
add('referenceGoRate', 0.5, 0, 1, 'ratio', 'bible', 'N4.2.3', 'replaced by the save league median after one season');
add('referenceKickRate', 0.95, 0, 1, 'ratio', 'bible', 'N4.2.3', 'replaced by the save league median after one season');
// N4.4.1: up to 10 user-chosen decision reports, plus the 5 largest scored losses always included.
add('evidenceUserMax', 10, 0, 50, 'count', 'bible', 'N4.4.1', 'N4.4.1 acceptance: the 5 largest losses cannot be removed');
add('evidenceForcedLosses', 5, 0, 50, 'count', 'bible', 'N4.4.1', 'N4.4.1 acceptance');

export const PARAMS: ParamFile = { module: 'models.rating', version: 'g95.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.rating.${name}`);
  if (!r) throw new Error(`unknown parameter models.rating.${name}`);
  return r.value;
}
