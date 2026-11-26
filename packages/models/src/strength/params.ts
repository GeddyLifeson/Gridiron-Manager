// Rule keys and tuning constants of the team-strength estimate, the decision chart, the variance brief,
// tracking, and analytics access (N2.4 to N2.7). Bible starting values say `bible`; numbers this module
// chose say `assumption` and are never presented as facts.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

const READ_BY = ['models.strength'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Points for a touchdown: the go and two-point outcomes of the decision chart (N2.4.1).', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'score.field_goal', type: 'number', unit: 'points', meaning: 'Points for a field goal: the kick column of the decision chart (N2.4.1).', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'try.kick_points', type: 'number', unit: 'points', meaning: 'Points for a kicked try: the two-point chart and the value of a touchdown (N2.4.1).', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'try.two_point_points', type: 'number', unit: 'points', meaning: 'Points for a run or pass try: the two-point chart (N2.4.1).', ownerLeaf: 'B7', readBy: READ_BY },
  { key: 'series.yards_to_gain', type: 'number', unit: 'yd', meaning: 'Distance of a new series: the state after a converted fourth down (N2.4.1).', ownerLeaf: 'B3', readBy: READ_BY },
  { key: 'field.goal_to_goal_yd', type: 'number', unit: 'yd', meaning: 'Field length: turns one team’s yard line into the other’s (N2.4.1).', ownerLeaf: 'B2', readBy: READ_BY },
  { key: 'fg.miss_spot_min_yardline', type: 'number', unit: 'yd', meaning: 'Nearest receiving-team yard line after a missed field goal: the miss outcome of the kick column (N2.4.1).', ownerLeaf: 'B13.6.2', readBy: READ_BY },
  // Not yet in the key dictionary: requested from the integrator and G-10 with this PR (fact rows needed,
  // N2.6.1 cites 2 of 3 sources for the pro value; the college value is Unverified).
  { key: 'analytics.home_advantage_pts', type: 'number', unit: 'points', meaning: 'Prior centre of home advantage in the team-strength fit (N2.6.1 rule 5, "a config value per level").', ownerLeaf: 'N2.6.1', readBy: READ_BY },
];

const rows: TuningParam[] = [];
function add(basis: 'bible' | 'assumption', name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.strength.${name}`, value, min, max, unit, belongsTo: 'models.strength', basis, leaf, constrainedBy, status: 'starting' });
}

// ---- N2.6.1 team strength
// Rule 2: prior weight 100 percent before week 1, 50 percent after 4 games, under 10 percent after 12.
// The fade is w(n) = 1 / (1 + (n / halfGames)^shape); shape 2.5 gives 6.5 percent at 12 games.
add('bible', 'prior.halfGames', 4, 1, 16, 'count', 'N2.6.1', 'N2.6.1 rule 2: 50 percent after 4 games');
add('assumption', 'prior.fadeShape', 2.5, 2.01, 6, 'ratio', 'N2.6.1', 'N2.6.1 rule 2: under 10 percent after 12 games (needs shape above 2)');
// "Last season's estimate regressed to the mean": the share kept is this module's choice until Q-area
// seasons fit it (N2.6.1 acceptance: beat a last-season baseline in mean absolute error).
add('assumption', 'prior.carryOver', 0.6, 0, 1, 'ratio', 'N2.6.1', 'N2.6.1 acceptance: predicted margins beat a last-season baseline over 200 seasons');
add('assumption', 'prior.homeGames', 8, 0.5, 100, 'count', 'N2.6.1', 'N2.6.1 rule 5: home advantage prior weight, in games of evidence');
// Edge case: a team that rests starters in the final week has that game down-weighted.
add('bible', 'restedWeight', 0.25, 0, 1, 'ratio', 'N2.6.1', 'N2.6.1 edge cases');
// Share of a game's offensive points measure taken from drive EPA when the caller supplies it (inputs:
// "game results and drive-level EPA with garbage time filtered"); the rest is the points scored.
add('assumption', 'epaShare', 0.5, 0, 1, 'ratio', 'N2.6.1', 'N2.6.1 acceptance: mean error near zero over 200 seasons');
// Error band of a prior-only term (week 1) and the residual spread used before any games are in.
add('assumption', 'prior.sd', 5, 0.5, 20, 'points', 'N2.6.1', 'N2.6.1 outputs: error band before week 1');
add('assumption', 'residualSdDefault', 10, 1, 30, 'points', 'N2.6.1', 'N2.6.1 outputs: error band before enough games');
add('assumption', 'minResidualSd', 3, 0.1, 30, 'points', 'N2.6.1', 'N2.6.1 outputs: error band never collapses to zero on a short sample');
// Rule 3: points of offense per point of public quarterback estimate (D6 scale). Starting choice.
add('assumption', 'qb.pointsPerEstimate', 0.25, 0, 2, 'points', 'N2.6.1', 'N2.6.1 acceptance: removing a starting quarterback changes the offense term the same week');
add('assumption', 'band.z', 1, 0.5, 3, 'ratio', 'N2.6.1', 'N2.6.1 outputs: each term with an error band (one standard error)');

// ---- N2.4.1 decision chart
add('bible', 'chart.coachsCallWp', 0.01, 0, 0.1, 'ratio', 'N2.4.1', 'N2.4.1 rule 2: margin under 1.0 point is "coach’s call"');
add('assumption', 'chart.maxDistanceYd', 15, 5, 30, 'yd', 'N2.4.1', 'N2.4.1: chart rows by distance (longer is always a kick or punt in the cell table)');
add('assumption', 'chart.yardStep', 1, 1, 10, 'yd', 'N2.4.1', 'N2.4.1: one column per yard line');
add('assumption', 'chart.neutralSeconds', 1800, 60, 3600, 's', 'N2.4.1', 'N2.4.1 rule 3: neutral game state for the weekly baseline (start of the second half)');

// ---- N2.4.2 variance brief
add('bible', 'variance.simsPerLever', 500, 50, 20000, 'count', 'N2.4.2', 'N2.4.2 inputs: starting 500 games per lever');
add('bible', 'variance.nearEvenPts', 2, 0, 10, 'points', 'N2.4.2', 'N2.4.2 edge cases: gap under 2 points shows "no variance edge"');
add('assumption', 'variance.clearZ', 2, 1, 4, 'ratio', 'N2.4.2', 'N2.4.2 rule 1 and acceptance: within two standard errors');

// ---- N2.5.1 tracking
add('bible', 'tracking.sampleHz', 10, 1, 60, 'count', 'N2.5.1', 'N2.5.1 rule 1: down-sampled to 10 samples per second');
add('bible', 'tracking.underloaded', 0.8, 0.1, 1, 'ratio', 'N2.5.1', 'N2.5.1 rule 3');
add('bible', 'tracking.spike', 1.3, 1, 3, 'ratio', 'N2.5.1', 'N2.5.1 rule 3');
add('bible', 'tracking.topSpeedDrop', 0.05, 0, 0.5, 'ratio', 'N2.5.1', 'N2.5.1 rule 4: 5 percent under season best');
add('bible', 'tracking.topSpeedGames', 2, 1, 5, 'count', 'N2.5.1', 'N2.5.1 rule 4: two straight games');
add('bible', 'tracking.acuteDays', 7, 1, 14, 'day', 'N2.5.1', 'N2.5.1 rule 3: 7-day sum');
add('bible', 'tracking.chronicDays', 28, 7, 56, 'day', 'N2.5.1', 'N2.5.1 rule 3: 28-day weekly average');
// Speed bands for high-speed distance, sprints, and acceleration counts. The bible names the measures,
// not the cut-offs; vendors differ. Starting choices, not facts.
add('assumption', 'tracking.highSpeedYdS', 6, 3, 9, 'yd_per_s', 'N2.5.1', 'N2.5.1 what the user sees: high-speed distance');
add('assumption', 'tracking.sprintYdS', 7.5, 5, 11, 'yd_per_s', 'N2.5.1', 'N2.5.1 what the user sees: sprint count');
add('assumption', 'tracking.accelYdS2', 3, 1, 8, 'yd_per_s2', 'N2.5.1', 'N2.5.1 what the user sees: accelerations and decelerations');
add('assumption', 'tracking.minEffortS', 1, 0.1, 3, 's', 'N2.5.1', 'N2.5.1: a sprint counts once it lasts this long');
add('assumption', 'tracking.minAccelS', 0.3, 0.1, 2, 's', 'N2.5.1', 'N2.5.1: an acceleration or deceleration counts once it lasts this long');

// ---- N2.7 access and limits
add('bible', 'limits.thinSe', 0.03, 0, 0.2, 'ratio', 'N2.7.2', 'N2.7.2 rule 1: thin above 3 win-probability points');
add('bible', 'limits.solidSe', 0.01, 0, 0.1, 'ratio', 'N2.7.2', 'N2.7.2 rule 1: solid under 1 point');
add('bible', 'limits.thinDensity', 200, 1, 10000, 'count', 'N2.7.2', 'N2.7.2 rule 1: training density under 200 plays');
add('bible', 'limits.chartedFloor', 20, 1, 200, 'count', 'N2.1.2', 'N2.1.2 rule 3: hidden below 20 plays');
// Staff hours per report each week and per-person capacity (N2.7.1 rule 1). Starting choices.
add('assumption', 'access.hours.strength', 2, 0, 40, 'h', 'N2.7.1', 'N2.7.1 acceptance: no analysts, no weekly chart');
add('assumption', 'access.hours.chart', 6, 0, 40, 'h', 'N2.7.1', 'N2.7.1 acceptance');
add('assumption', 'access.hours.variance', 4, 0, 40, 'h', 'N2.7.1', 'N2.7.1 acceptance');
add('assumption', 'access.hours.load', 3, 0, 40, 'h', 'N2.7.1', 'N2.7.1 acceptance');
add('assumption', 'access.hours.gameTracking', 3, 0, 40, 'h', 'N2.7.1', 'N2.7.1 acceptance');
add('assumption', 'access.hours.liveWp', 3, 0, 40, 'h', 'N2.7.1', 'N2.7.1 rule 2: no live win probability without an analyst');
add('assumption', 'access.analystHours', 20, 1, 80, 'h', 'N2.7.1', 'N2.7.1 rule 1: capacity by headcount and skill');

export const PARAMS: ParamFile = { module: 'models.strength', version: 'g71.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.strength.${name}`);
  if (!r) throw new Error(`unknown parameter models.strength.${name}`);
  return r.value;
}
