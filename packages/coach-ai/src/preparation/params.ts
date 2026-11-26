// Tuning constants of coach AI preparation (G-74, bible K3). Every number K3 states as a starting value
// is a `bible` row citing its leaf; every number this module had to choose is an `assumption` row.
// coach-ai may not import @gm/schema (P1.2.1), so the rows are plain objects in the TuningParam shape;
// the test parses the file with the schema's `ParamFile`.

export interface PrepParamRow {
  name: string; value: number; min: number; max: number; unit: string; belongsTo: string;
  basis: 'bible' | 'assumption'; leaf: string; constrainedBy: string; status: 'starting' | 'fitted' | 'frozen';
}

/** No rule keys: practice limits (T5.4.1 `ruleSet.weeklyHourLimit`, C11) arrive already applied in the practice budget (H1, H3.1). */
export const RULE_KEYS: readonly never[] = [];

const rows: PrepParamRow[] = [];
function add(basis: 'bible' | 'assumption', name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `coachAi.preparation.${name}`, value, min, max, unit, belongsTo: 'coachAi.preparation', basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('bible', n, v, lo, hi, u, leaf, c);
const assume = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('assumption', n, v, lo, hi, u, leaf, c);

// K3 gives ranges "by preparation" without the mapping. This module maps a z-score linearly onto each
// range between these two ends and holds the end value beyond them.
assume('z.low', -2, -4, 0, 'z', 'K3.1.1', 'K3.4.2 acceptance: coverage rises with preparation across the league');
assume('z.high', 2, 0, 4, 'z', 'K3.1.1', 'K3.4.2 acceptance: coverage rises with preparation across the league');

// K3.1.1 scouting.
bible('scout.gamesMin', 2, 1, 17, 'count', 'K3.1.1', 'K3.1.1 rule 1: 2 to 6 most recent games');
bible('scout.gamesMax', 6, 1, 17, 'count', 'K3.1.1', 'K3.1.1 rule 1: 2 to 6 most recent games');
bible('scout.splitBaseZ', -1.5, -4, 4, 'z', 'K3.1.1', 'K3.1.1 rule 2: one extra split per 0.75 z above -1.5');
bible('scout.splitStepZ', 0.75, 0.1, 4, 'z', 'K3.1.1', 'K3.1.1 rule 2');
bible('scout.tellFindMin', 0.1, 0, 1, 'ratio', 'K3.1.1', 'K3.1.1 rule 4: 10% to 60% per existing tell');
bible('scout.tellFindMax', 0.6, 0, 1, 'ratio', 'K3.1.1', 'K3.1.1 rule 4: 10% to 60% per existing tell');
assume('scout.tellFullHours', 4, 0.5, 40, 'h', 'K3.1.1', 'K3.1.1 rule 4 "by evaluation and hours spent": hours at which the hours term is full');

// K3.2.1 matchups.
assume('matchup.unknownBandIss', 12, 1, 40, 'iss', 'K3.2.1', 'K3.2.1 edge case: no estimate at all; D6 prior sd with no information is 12');
assume('matchup.starFlagIss', 10, 1, 40, 'iss', 'K3.4.1', 'K3.4.1 rule 5 "if the staff grades flag one": estimate this far above his own lineup mean');

// K3.3.1 payoffs.
bible('payoff.repsMinPerCell', 0, 0, 100, 'count', 'K3.3.1', 'K3.3.1 rule 3: 0 to 20 reps per cell');
bible('payoff.repsMaxPerCell', 20, 0, 200, 'count', 'K3.3.1', 'K3.3.1 rule 3: 0 to 20 reps per cell');
bible('payoff.repsWeeklyCap', 3000, 0, 100000, 'count', 'K3.3.1', 'K3.3.1 rule 5: 3,000 reps per AI team per week; P6 open question');
bible('payoff.noiseSdMax', 0.2, 0, 2, 'ep', 'K3.3.1', 'K3.3.1 rule 4: 0.20 to 0.05 expected points');
bible('payoff.noiseSdMin', 0.05, 0, 2, 'ep', 'K3.3.1', 'K3.3.1 rule 4: 0.20 to 0.05 expected points');

// K3.3.2 matrices (candidate and look limits repeat K4.3.1 rule 1).
bible('matrix.mergeShare', 0.03, 0, 0.5, 'ratio', 'K3.3.2', 'K3.3.2: looks under 3% in a bucket merge into other');
bible('matrix.candidateCap', 12, 2, 40, 'count', 'K3.3.2', 'K3.3.2 and K4.3.1 rule 1: at most 12 candidates');
bible('matrix.lookCap', 8, 2, 40, 'count', 'K4.3.1', 'K4.3.1 rule 1: at most 8 look classes');
assume('matrix.thinBucketPlays', 5, 1, 50, 'count', 'K3.3.2', 'G6.1.1: buckets under 5 plays show counts only; below it the whole-report shares are used');

// K3.4.1 the plan.
bible('plan.newCallsMin', 0, 0, 20, 'count', 'K3.4.1', 'K3.4.1 rule 3: low staffs add 0 to 2 new calls');
bible('plan.newCallsMax', 8, 0, 40, 'count', 'K3.4.1', 'K3.4.1 rule 3: high staffs add up to 8');
bible('plan.wrinklesMax', 2, 0, 10, 'count', 'K3.4.1', 'K3.4.1 rule 3: one or two wrinkles for high staffs');
assume('plan.wrinkleZ', 0, -4, 4, 'z', 'K3.4.1', 'K3.4.1 rule 3 "high ones": first wrinkle above this z, second one z higher');
bible('plan.themesMin', 2, 0, 10, 'count', 'K3.4.1', 'K3.4.1 rule 4: top 2 to 3');
bible('plan.themesMax', 3, 0, 10, 'count', 'K3.4.1', 'K3.4.1 rule 4: top 2 to 3');
bible('plan.contingencyZ', 0, -4, 4, 'z', 'K3.4.1', 'K3.4.1 rule 6: full contingency versions above z 0');
assume('plan.installCostEp', 0.1, 0, 1, 'ep', 'K3.4.1', 'K3.4.1 rule 2 "minus an install cost": cost of a call at readiness 0, scaled by 1 minus readiness');
bible('plan.readyLine', 0.6, 0, 1, 'ratio', 'G5.1.1', 'G5.1.1 "installed" line of 60 (quoted in G7.8.1); K3.4.1 rule 1 standing menu and rule 6 backup package');
assume('plan.backupPackageCalls', 6, 1, 30, 'count', 'K3.4.1', 'K3.4.1 rule 6 "a short list of calls that suit the backup"');
bible('plan.contingenciesMax', 4, 0, 10, 'count', 'G6.5.2', 'G6.5.2: up to 4 contingencies per side (Assumption in the leaf)');
bible('plan.headCoachWeight', 0.3, 0, 1, 'ratio', 'K2.6.1', 'K2.6.1 rule 3: head coach preference blended at 0.3 on the side he does not call');

// K3.4.2 the sheet.
bible('sheet.coverageMin', 0.7, 0, 1, 'ratio', 'K3.4.2', 'K3.4.2 rule 2: 70% to 100% of situations get their own box');
bible('sheet.coverageMax', 1, 0, 1, 'ratio', 'K3.4.2', 'K3.4.2 rule 2');
bible('sheet.scriptMin', 8, 0, 40, 'count', 'K4.5.1', 'K4.5.1: script 8 to 15 calls by preparation');
bible('sheet.scriptMax', 15, 0, 40, 'count', 'K4.5.1', 'K4.5.1: script 8 to 15 calls by preparation');
assume('sheet.sequencesMin', 0, 0, 20, 'count', 'K4.3.4', 'K4.3.4 rule 4: package count depends on preparation; no number in the leaf');
assume('sheet.sequencesMax', 4, 0, 20, 'count', 'K4.3.4', 'K4.3.4 rule 4: package count depends on preparation; no number in the leaf');
assume('sheet.boxMinCalls', 2, 1, 12, 'count', 'G7.3.2', 'G7.3.2 sourced 2 to 10 calls per box; K4.1.1 needs 2 candidates');

// K3.5.1 practice.
bible('practice.backupShareMin', 0.15, 0, 1, 'ratio', 'K3.5.1', 'K3.5.1 rule 2: backups get 15% to 30% of team reps');
bible('practice.backupShareMax', 0.3, 0, 1, 'ratio', 'K3.5.1', 'K3.5.1 rule 2; the span above the minimum is the health-risk term added to the coach\'s `backupRepShare` (K2.1.3 rule 4)');

// K3.7.1 offseason.
bible('offseason.veteranYearsPro', 5, 1, 20, 'yr', 'K2.1.3', 'K2.1.3 rule 4: `veteranBias` is ISS per five years of pro experience');
bible('offseason.veteranYearsCollege', 2, 1, 6, 'yr', 'K2.1.3', 'K2.1.3 rule 4: per two years of eligibility used in college');

export const PARAMS: { module: string; version: string; params: PrepParamRow[] } = { module: 'coachAi.preparation', version: 'g74.1', params: rows };

const byName = new Map(rows.map((r) => [r.name, r.value]));
export function param(name: string): number {
  const v = byName.get(`coachAi.preparation.${name}`);
  if (v === undefined) throw new Error(`unknown preparation parameter ${name}`);
  return v;
}
