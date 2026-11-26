// Cohort constants (G-44; X11). Every number is either a starting value an X11 leaf states (basis
// 'bible', with the leaf) or a named Assumption (basis 'assumption'). Measured football facts are not
// here: they are fact rows in ./data/facts.json with computed status (Q6.1.2), read by ./targets.ts.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

const MODULE = 'people.cohorts';
const ROWS: readonly Row[] = [
  // X11.2.1 derived starting values (Assumption in the leaf).
  ['proPoolPerDrafted', 4, 2, 8, 'ratio', 'bible', 'X11.2.1', 'X11.2.1 derived: pro entry pool tracked = drafted x 4 (Assumption)'],
  ['undraftedPerDrafted', 2, 1, 4, 'ratio', 'bible', 'X11.2.1', 'X11.2.1 derived: undrafted signings = drafted x 2 (Assumption)'],
  ['topSigneesPerTeam', 18, 10, 30, 'count', 'bible', 'X11.2.1', 'X11.2.1 signees row: about 18 per team (F-cohort-0005, 1 of 3)'],
  ['recruitTrackedPerSignee', 3, 1, 6, 'ratio', 'bible', 'X11.2.1', 'X11.2.1 derived: recruit class tracked = top-level signees x 3 (Assumption)'],
  // X11.2.1 walk-on row has no data (T5 research owed). Share of a team's signees, Assumption.
  ['walkOnPerSignee', 0.5, 0, 2, 'ratio', 'assumption', 'X11.1.1', 'X11.1.1 college_walk_on: no source read'],
  // X11.1.3 rule 1: openings x 1.3, rule 2 make-up, rule 4 decay, acceptance band 10 to 40 percent unplaced.
  ['coachSurplus', 1.3, 1, 2, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 rule 1 (Assumption in the leaf)'],
  ['coachMixCollegeOnly', 0.7, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 rule 2 (no source found)'],
  ['coachMixFormerPro', 0.1, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 rule 2 (no source found)'],
  ['coachMixNeverPlayed', 0.2, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 rule 2 (no source found)'],
  ['coachUnplacedLeaveChance', 0.4, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 rule 4 (Assumption)'],
  ['coachUnplacedBandLow', 0.1, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 acceptance starting band'],
  ['coachUnplacedBandHigh', 0.4, 0, 1, 'ratio', 'bible', 'X11.1.3', 'X11.1.3 acceptance starting band'],
  ['coachEntryAgeMin', 21, 18, 30, 'y', 'bible', 'X11.1.2', 'X11.1.2 rule 1 (S1.3.1 table, 1 of 3)'],
  ['coachEntryAgeMax', 23, 18, 35, 'y', 'bible', 'X11.1.2', 'X11.1.2 rule 1 (S1.3.1 table, 1 of 3)'],
  ['ladderYearsMedianLow', 13, 5, 25, 'y', 'bible', 'X11.1.3', 'X11.1.3 rule 5 ladder speed band'],
  ['ladderYearsMedianHigh', 18, 5, 25, 'y', 'bible', 'X11.1.3', 'X11.1.3 rule 5 ladder speed band'],
  // X11.1.2 acceptance for the pro entry pool ages.
  ['proPoolMedianAge', 22, 18, 26, 'y', 'bible', 'X11.1.2', 'X11.1.2 acceptance: median 22 (F-cohort-0004)'],
  ['proPoolMedianTol', 1, 0, 3, 'y', 'bible', 'X11.1.2', 'X11.1.2 acceptance: plus or minus 1'],
  ['proPoolBandMin', 21, 18, 26, 'y', 'bible', 'X11.1.2', 'X11.1.2 acceptance: 21 to 24'],
  ['proPoolBandMax', 24, 18, 30, 'y', 'bible', 'X11.1.2', 'X11.1.2 acceptance: 21 to 24'],
  ['proPoolBandShareMin', 0.7, 0, 1, 'ratio', 'bible', 'X11.1.2', 'X11.1.2 acceptance: at least 70 percent'],
  // X11.1.2 rule 5: day-one stress drawn 20 to 80 on the X5 0 to 200 scale (starting value).
  ['stressStartMin', 20, 0, 200, 'index', 'bible', 'X11.1.2', 'X11.1.2 rule 5'],
  ['stressStartMax', 80, 0, 200, 'index', 'bible', 'X11.1.2', 'X11.1.2 rule 5'],
  // X11.1.4 bosses, executives, reporters.
  ['bossMinQualifiedPool', 3, 1, 10, 'count', 'bible', 'X11.1.4', 'X11.1.4 rule 2'],
  ['bossNewAgeMin', 35, 25, 60, 'y', 'bible', 'X11.1.4', 'X11.1.4 rule 2 (starting value)'],
  ['bossNewAgeMax', 55, 30, 75, 'y', 'bible', 'X11.1.4', 'X11.1.4 rule 2 (starting value)'],
  ['bossMaxAge', 85, 60, 100, 'y', 'bible', 'X11.1.4', 'X11.1.4 acceptance starting bound'],
  ['reporterFromRetireesShare', 0.02, 0, 0.2, 'ratio', 'bible', 'X11.1.4', 'X11.1.4 rule 3'],
  ['reporterNewAgeMin', 22, 18, 40, 'y', 'bible', 'X11.1.4', 'X11.1.4 rule 3'],
  ['reporterNewAgeMax', 30, 18, 50, 'y', 'bible', 'X11.1.4', 'X11.1.4 rule 3'],
  // X11.2.2 tolerances (Assumption in the leaf).
  ['sizeTolShare', 0.15, 0, 0.5, 'ratio', 'bible', 'X11.2.2', 'X11.2.2 tolerances'],
  ['bandTolPoints', 0.03, 0, 0.2, 'ratio', 'bible', 'X11.2.2', 'X11.2.2 tolerances'],
  // X11.2.2 conflict: a fixed 3-point band tolerance is about 1.6 standard errors for a neutral-band share
  // in a cohort of 500 (2.3 at 1,000), and the check runs over about 100 facet-band cells, so a correct
  // cohort fails most of the time. The tolerance widens to this many binomial standard errors where that
  // is larger (Assumption, same fix as G-17's classSampleZ for D13.4.5); logged for the X11 owner.
  ['bandSampleZ', 4, 2, 6, 'z', 'assumption', 'X11.2.2', 'X11.2.2 a correct cohort passes; a bad one is caught'],
  ['bandCheckMinCohort', 500, 50, 5000, 'count', 'bible', 'X11.2.2', 'X11.2.2 cohorts of 500 or more'],
  ['maxReseeds', 3, 1, 10, 'count', 'bible', 'X11.2.2', 'X11.2.2 at most 3 times'],
  // X11.2.3 stock balance and exit references.
  ['stockTolShare', 0.05, 0, 0.2, 'ratio', 'bible', 'X11.2.3', 'X11.2.3 rule 1'],
  ['stockWindowSeasons', 10, 1, 30, 'count', 'bible', 'X11.2.3', 'X11.2.3 rule 1'],
  ['proFinalAgeMedianLow', 26, 20, 32, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 2 soak band (see conflict note in targets.ts)'],
  ['proFinalAgeMedianHigh', 28, 20, 32, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 2 soak band'],
  ['proCareerMedianLow', 2, 1, 6, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 3 band'],
  ['proCareerMedianHigh', 4, 1, 8, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 3 band'],
  ['proRosterAgeMedianLow', 25, 20, 30, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 4 band'],
  ['proRosterAgeMedianHigh', 27, 20, 30, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 4 band'],
  ['coachRetireStartAge', 55, 40, 70, 'y', 'bible', 'X11.2.3', 'X11.2.3 rule 6 (Assumption)'],
  ['coachRetireStartChance', 0.03, 0, 0.2, 'ratio', 'bible', 'X11.2.3', 'X11.2.3 rule 6'],
  ['coachRetireStepPerYear', 0.02, 0, 0.1, 'ratio', 'bible', 'X11.2.3', 'X11.2.3 rule 6'],
  ['coachRetireCap', 0.4, 0, 1, 'ratio', 'bible', 'X11.2.3', 'X11.2.3 rule 6 (from 75)'],
  // X11.3.1 top-up.
  ['topUpMinPool', 3, 1, 10, 'count', 'bible', 'X11.3.1', 'X11.3.1 order of fill (Assumption)'],
  ['topUpMaxPerPositionWeek', 4, 1, 20, 'count', 'bible', 'X11.3.1', 'X11.3.1 cap (Assumption)'],
  ['topUpProAgeMin', 23, 18, 35, 'y', 'bible', 'X11.3.1', 'X11.3.1 free-agent age band'],
  ['topUpProAgeMax', 30, 18, 40, 'y', 'bible', 'X11.3.1', 'X11.3.1 free-agent age band'],
  ['topUpWalkOnAgeMin', 18, 16, 25, 'y', 'bible', 'X11.3.1', 'X11.3.1 walk-on age band'],
  ['topUpWalkOnAgeMax', 22, 16, 25, 'y', 'bible', 'X11.3.1', 'X11.3.1 walk-on age band'],
  ['topUpExistingShareMin', 0.8, 0, 1, 'ratio', 'bible', 'X11.3.1', 'X11.3.1 acceptance starting band'],
  // X11.4.2 collision redraws.
  ['collisionFirstRedraws', 5, 1, 20, 'count', 'bible', 'X11.4.2', 'X11.4.2 rule 3'],
  // Recruit age at entry to the tracked years: D13.3.2 owns it; until wired, 17 (Assumption: a high
  // school junior in the fall, the first year T4 lets programs track).
  ['recruitEntryAge', 17, 14, 19, 'y', 'assumption', 'D13.3.2', 'D13.3.2 tracked years owner'],
  ['walkOnEntryAge', 18, 16, 22, 'y', 'assumption', 'T5', 'T5 walk-on research owed'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g44.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a cohort constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown cohort parameter ${name}`);
  return v;
}
