// Tuning constants of opponent scouting and self-scout (G-66: H2.1, H2.2, N2.3.1, G8). No rule keys:
// field geometry arrives as a built FieldGeometry from the caller (J1.1.1).
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [];

const rows: TuningParam[] = [];
function add(basis: 'bible' | 'assumption', name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): void {
  rows.push({ name: `models.tendencies.${name}`, value, min, max, unit, belongsTo: 'models.tendencies', basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('bible', n, v, lo, hi, u, leaf, c);
const assume = (n: string, v: number, lo: number, hi: number, u: string, leaf: string, c: string) => add('assumption', n, v, lo, hi, u, leaf, c);

// G8.1.1 bands for two-way choices. 80% strong mark: Verified in the leaf (Vint 2023, MatchQuarters 2024,
// TXHSFBChat 2026, Bartlett 2026). Watch and lean lines and their minimum counts are the leaf's Assumptions.
bible('band.strongRate', 0.8, 0.5, 1, 'ratio', 'G8.1.1', 'G8.1.1 acceptance: 18 of 20 from one formation shows strong');
bible('band.watchRate', 0.7, 0.5, 1, 'ratio', 'G8.1.1', 'G8.1.1 acceptance: 7 of 10 shows watch (Assumption in the leaf)');
bible('band.watchMinCalls', 10, 1, 100, 'count', 'G8.1.1', 'G8.1.1 acceptance (Assumption in the leaf)');
bible('band.leanRate', 0.6, 0.5, 1, 'ratio', 'G8.1.1', 'G8.1.1 acceptance: 13 of 20 shows lean (Assumption in the leaf)');
bible('band.leanMinCalls', 20, 1, 200, 'count', 'G8.1.1', 'G8.1.1 acceptance (Assumption in the leaf)');
bible('band.countsOnlyBelow', 5, 1, 50, 'count', 'G8.1.1', 'G8.1.1: cells under 5 calls show counts only; acceptance 4 of 4');
bible('band.multiLeagueFactor', 1.5, 1, 5, 'ratio', 'G8.1.1', 'G8.1.1 multi-outcome strong line (Assumption in the leaf)');
bible('band.multiMinRate', 0.6, 0, 1, 'ratio', 'G8.1.1', 'G8.1.1 multi-outcome strong line (Assumption in the leaf)');
// The leaf applies bands "to the range" but names no width; H2.2.1's 90% Wilson range would make its own
// 18-of-20 acceptance fail (lower bound 0.738). One standard error (z = 1, lower bound 0.813) is this module's reading.
assume('band.rangeZ', 1, 0.1, 3, 'z', 'G8.1.1', 'G8.1.1 acceptance 18 of 20 strong; reported to the bible thread');

// H2.2.1 tendency tables.
bible('table.intervalZ', 1.6448536269514722, 0.5, 3.5, 'z', 'H2.2.1', 'H2.2.1 rule 3: 90% Wilson interval on n_eff (starting choice)');
bible('table.thinNEff', 8, 1, 100, 'count', 'H2.2.1', 'H2.2.1 rule 4: rows with n_eff under 8 are thin');

// N2.3.1 strength mark against the team's own overall rate.
bible('store.strongPoints', 0.15, 0, 1, 'ratio', 'N2.3.1', 'N2.3.1 rule 3 (starting value)');
bible('store.strongMinPlays', 12, 1, 200, 'count', 'N2.3.1', 'N2.3.1 rule 3 (starting value)');
bible('store.leanPoints', 0.08, 0, 1, 'ratio', 'N2.3.1', 'N2.3.1 rule 3 (starting value)');
bible('store.leanMinPlays', 8, 1, 200, 'count', 'N2.3.1', 'N2.3.1 rule 3 (starting value)');

// H2.1.1 breakdown scope and relevance weights.
bible('scope.hoursPerGameSide', 6, 0.5, 40, 'h', 'H2.1.1', 'H2.1.1 rule 1 (starting value)');
bible('scope.speedMin', 0.7, 0.1, 1, 'ratio', 'H2.1.1', 'H2.1.1 rule 1 speed factor range');
bible('scope.speedMax', 1.3, 1, 3, 'ratio', 'H2.1.1', 'H2.1.1 rule 1 speed factor range');
bible('scope.defaultGames', 4, 1, 17, 'count', 'H2.1.1', 'H2.1.1: last N games, starting default 4');
bible('weight.recent', 1, 0, 1, 'ratio', 'H2.1.1', 'H2.1.1 rule 4: last 4 games');
bible('weight.earlierSeason', 0.7, 0, 1, 'ratio', 'H2.1.1', 'H2.1.1 rule 4');
bible('weight.lastSeason', 0.4, 0, 1, 'ratio', 'H2.1.1', 'H2.1.1 rule 4');
bible('weight.previousTeam', 0.5, 0, 1, 'ratio', 'H2.1.1', 'H2.1.1 rule 4 and H2.2.2 (prior teams 0.5)');
bible('weight.beforeCallerChange', 0.3, 0, 1, 'ratio', 'H2.1.1', 'H2.1.1 edge case (N2.3.1 says 0.25; reported)');
bible('weight.recentGames', 4, 1, 17, 'count', 'H2.1.1', 'H2.1.1 rule 4: "the last 4 games"');

// G8.1.1 self-scout default window: the last three games. Verified in the leaf (Vint, Bartlett, MatchQuarters).
bible('self.defaultWindowGames', 3, 1, 17, 'count', 'G8.1.1', 'G8.1.1 default window');

// H2.1.2 tagging accuracy of inferred tags.
bible('tag.base', 0.8, 0, 1, 'ratio', 'H2.1.2', 'H2.1.2 rule 5 (starting value)');
bible('tag.skillMax', 0.15, 0, 1, 'ratio', 'H2.1.2', 'H2.1.2 rule 5 (starting value)');
bible('tag.disguiseMax', 0.15, 0, 1, 'ratio', 'H2.1.2', 'H2.1.2 rule 5 (starting value)');
// H2.1.3 cut-up watching cost.
bible('cutup.secondsPerPlay', 20, 1, 300, 's', 'H2.1.3', 'H2.1.3 starting value');

// Charting definitions this module needs that no leaf states.
assume('chart.pressureRushers', 5, 4, 11, 'count', 'G8.1.1', 'Pressure or not: five or more rushers (F9 vocabulary); a modelling choice');
assume('chart.hashToleranceYd', 0.5, 0, 5, 'yd', 'H2.1.2', 'A snap within this of an inbounds line is on that hash');

// G8.1.2 what the opponent probably knows.
bible('exposure.weightRecent', 1, 0, 1, 'ratio', 'G8.1.2', 'G8.1.2 window weights (Assumptions in the leaf)');
bible('exposure.weightSimilar', 0.7, 0, 1, 'ratio', 'G8.1.2', 'G8.1.2');
bible('exposure.weightLastMeeting', 0.5, 0, 1, 'ratio', 'G8.1.2', 'G8.1.2');
bible('exposure.recentGames', 3, 1, 17, 'count', 'G8.1.2', 'G8.1.2: the three most recent games (Verified in the leaf)');
bible('exposure.similarGames', 2, 0, 17, 'count', 'G8.1.2', 'G8.1.2: up to two earlier games against similar schemes');
bible('exposure.bandStrong', 3, 0, 10, 'ratio', 'G8.1.2', 'G8.1.2 band weights');
bible('exposure.bandWatch', 2, 0, 10, 'ratio', 'G8.1.2', 'G8.1.2 band weights');
bible('exposure.bandLean', 1, 0, 10, 'ratio', 'G8.1.2', 'G8.1.2 band weights');
bible('exposure.topShown', 5, 1, 50, 'count', 'G8.1.2', 'G8.1.2: top 5 shown first');

// G8.3.1 structural tells.
bible('tell.rate', 0.85, 0.5, 1, 'ratio', 'G8.3.1', 'G8.3.1: 85% line (multiple-comparisons margin, Assumption in the leaf)');
bible('tell.minSnaps', 8, 1, 100, 'count', 'G8.3.1', 'G8.3.1 minimum sample (Assumption in the leaf)');
// G8.3.2 player tells (all Assumptions in the leaf).
bible('habit.findBase', 0.1, 0, 1, 'ratio', 'G8.3.2', 'G8.3.2 weekly find chance');
bible('habit.findCap', 0.5, 0, 1, 'ratio', 'G8.3.2', 'G8.3.2 cap');
bible('habit.skillMin', 0.5, 0.1, 1, 'ratio', 'G8.3.2', 'G8.3.2 skill factor range');
bible('habit.skillMax', 1.5, 1, 3, 'ratio', 'G8.3.2', 'G8.3.2 skill factor range');
bible('habit.falseBase', 0.05, 0, 1, 'ratio', 'G8.3.2', 'G8.3.2 false report chance');
bible('habit.fixPeriodsPerWeek', 2, 1, 10, 'count', 'G8.3.2', 'G8.3.2: two 10-minute periods a week');
bible('habit.fixPeriodMinutes', 10, 1, 60, 'min', 'G8.3.2', 'G8.3.2');
bible('habit.fixWeeks', 3, 1, 20, 'count', 'G8.3.2', 'G8.3.2');
bible('habit.relapseChance', 0.2, 0, 1, 'ratio', 'G8.3.2', 'G8.3.2 relapse per snap above fatigue line');
bible('habit.relapseFatigue', 0.7, 0, 1, 'ratio', 'G8.3.2', 'G8.3.2: fatigue above 70%');
bible('habit.relapseWeeks', 6, 0, 52, 'count', 'G8.3.2', 'G8.3.2: until 6 more weeks pass');
bible('habit.filmSnapsForEdge', 10, 1, 200, 'count', 'G8.3.2', 'G8.3.2: perception edge after 10 snaps of film');

// G8.4 breakers and holds.
bible('breaker.callsPerBreakerMin', 4, 1, 50, 'count', 'G8.4.1', 'G8.4.1 dose: one breaker per 4 to 6 calls (Assumption in the leaf)');
bible('breaker.callsPerBreakerMax', 6, 1, 50, 'count', 'G8.4.1', 'G8.4.1 dose');
bible('hold.limitPerSide', 5, 1, 50, 'count', 'G8.4.3', 'G8.4.3 starting limit (Assumption in the leaf)');
bible('hold.repsPerWeek', 1, 0, 10, 'count', 'G8.4.3', 'G8.4.3: one practice rep a week per held call');

// G8.5.1 report cadence and costs (Assumptions in the leaf, time figures 1 of 3).
bible('report.quickHours', 1, 0, 40, 'h', 'G8.5.1', 'G8.5.1 quick report: 1 hour of a QC coach');
bible('report.quickMeetingMinutes', 20, 0, 240, 'min', 'G8.5.1', 'G8.5.1 plus 20 minutes of staff meeting');
bible('report.studyHours', 6, 0, 100, 'h', 'G8.5.1', 'G8.5.1 larger study');
bible('report.deepHours', 20, 0, 400, 'h', 'G8.5.1', 'G8.5.1 deep study');
bible('report.quickGames', 3, 1, 17, 'count', 'G8.5.1', 'G8.5.1: quick report on the last three games');
bible('report.postseasonGames', 5, 1, 17, 'count', 'G8.5.1', 'G8.5.1: last five games against the season');
bible('report.studyAfterGame', 3, 1, 17, 'count', 'G8.5.1', 'G8.5.1: a larger study after the third game');
// How a report author's skill and hours turn into noise in the ranking. The leaf states the effect
// ("a weak author misses the important ones or flags noise") and the acceptance; the size is this module's.
assume('report.noiseAtZeroSkill', 3, 0, 20, 'ratio', 'G8.5.1', 'G8.5.1 acceptance: low skill lists the planted strongest first in under half of seasons');
assume('report.noiseAtFullSkill', 0.15, 0, 20, 'ratio', 'G8.5.1', 'G8.5.1 acceptance: high skill lists it first in at least 90%');
assume('report.shortHoursPenalty', 1, 0, 10, 'ratio', 'G8.5.1', 'G8.5.1: a report written in less than its hours is thinner');

// H2.1.3 situation buckets (starting buckets in the leaf: long 7+, medium 3 to 6, short 1 to 2).
bible('bucket.shortMaxYd', 2, 1, 5, 'yd', 'H2.1.3', 'H2.1.3 starting buckets');
bible('bucket.mediumMaxYd', 6, 3, 9, 'yd', 'H2.1.3', 'H2.1.3 starting buckets');
// Field zones and score and time states for cuts. The leaves name the cuts but not their edges.
assume('zone.goalLineYd', 5, 1, 10, 'yd', 'H2.1.3', 'Goal-line cut-up edge; a modelling choice');
assume('zone.redZoneYd', 20, 10, 30, 'yd', 'H2.1.3', 'Red-zone cut-up edge (inside the 20, the usual charting edge)');
assume('zone.backedUpYd', 90, 80, 99, 'yd', 'H2.1.3', 'Backed-up cut-up edge: inside the own 10');
assume('score.closePoints', 8, 1, 16, 'points', 'N2.3.1', 'Score-state cut: one score either way');
assume('time.lateHalfTenths', 1200, 300, 3000, 'tenths_s', 'N2.3.1', 'Time-state cut: last two minutes of a half');
assume('sheet.minCalls', 2, 1, 20, 'count', 'G8.3.1', 'Sheet scan lists a formation whose calls on the sheet are all one kind, from this many calls');

export const PARAMS: ParamFile = { module: 'models.tendencies', version: 'g66.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `models.tendencies.${name}`);
  if (!r) throw new Error(`unknown parameter models.tendencies.${name}`);
  return r.value;
}
