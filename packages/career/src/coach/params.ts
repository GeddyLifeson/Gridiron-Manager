// Design constants and rule keys of the coach-record module (G-29: bible E1, E10, E11, S2).
// Game build plan section 2: tuning constants are PARAMS with basis `bible` (the leaf states the number
// as a starting value) or `assumption` (the leaf names the parameter but gives no number). None of these
// is presented as a real-world fact. The only real-world rule this module reads (the graduate assistant
// limits of S3.3.4) is a league-rule value read by key through RULE_KEYS, never a constant here.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

const MODULE = 'career.coach';

const ROWS: readonly Row[] = [
  // E1.5.1 and E1.7.1 check 4: age bounds
  ['ageBase', 22, 16, 30, 'years', 'bible', 'E1.5.1'],
  ['maxStartAge', 65, 40, 80, 'years', 'bible', 'E1.5.1'],
  ['rung0MinAge', 18, 14, 30, 'years', 'bible', 'E1.5.1'],
  ['rung0MaxAge', 45, 25, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.nobody', 22, 14, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.graduate_assistant', 23, 14, 70, 'years', 'assumption', 'E1.5.1'],
  ['defaultAge.quality_control', 25, 14, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.position_coach', 31, 14, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.coordinator', 38, 14, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.head_coach.college', 44, 14, 70, 'years', 'bible', 'E1.5.1'],
  ['defaultAge.head_coach.pro', 48, 14, 70, 'years', 'bible', 'E1.5.1'],
  // E1.2.1 playing history
  ['proSeasonsMin', 1, 1, 5, 'seasons', 'bible', 'E1.2.1'],
  ['proSeasonsMax', 15, 5, 25, 'seasons', 'bible', 'E1.2.1'],
  ['shortProMaxSeasons', 4, 1, 10, 'seasons', 'bible', 'E1.2.1'],
  ['playerRepEdge.major_college', 5, 0, 20, 'points 0..100', 'bible', 'E1.2.1'],
  ['playerRepEdge.pro_short', 8, 0, 20, 'points 0..100', 'bible', 'E1.2.1'],
  ['playerRepEdge.pro_long', 10, 0, 20, 'points 0..100', 'bible', 'E1.2.1'],
  ['playerRepEdgeDecaySeasons', 2, 1, 6, 'seasons', 'bible', 'E1.2.1'],
  // E1.2.2 coaching history and the tree
  ['maxMentors', 2, 1, 4, 'count', 'bible', 'E1.2.2'],
  ['seatSeasonsPerMentorMin', 2, 1, 6, 'seasons', 'bible', 'E1.2.2'],
  ['seatSeasonsPerMentorMax', 6, 2, 12, 'seasons', 'bible', 'E1.2.2'],
  ['edgeStrengthPerSeason', 20, 1, 50, 'points 0..100', 'bible', 'E1.2.2'],
  ['edgeStrengthCap', 80, 10, 100, 'points 0..100', 'bible', 'E1.2.2'],
  ['edgePersonalTerm', 15, 0, 40, 'points 0..100', 'bible', 'E1.2.2'],
  ['mentorMinHeadSeasonsInSpan', 2, 1, 6, 'seasons', 'bible', 'E1.7.1'],
  ['followColleagueChance', 0.8, 0, 1, 'probability', 'bible', 'E1.2.2'],
  ['edgeWarmCut', 5, 0, 40, 'points 0..100', 'assumption', 'E1.2.2'],
  // E1.2.2 generator starting values for a written history (seasons per stage)
  ['stage.entry.min', 2, 1, 10, 'seasons', 'bible', 'E1.2.2'],
  ['stage.entry.max', 6, 1, 12, 'seasons', 'bible', 'E1.2.2'],
  ['stage.position.min', 3, 1, 12, 'seasons', 'bible', 'E1.2.2'],
  ['stage.position.max', 12, 1, 25, 'seasons', 'bible', 'E1.2.2'],
  ['stage.coordinator.min', 1, 1, 10, 'seasons', 'bible', 'E1.2.2'],
  ['stage.coordinator.max', 8, 1, 20, 'seasons', 'bible', 'E1.2.2'],
  ['stage.head.min', 2, 1, 10, 'seasons', 'assumption', 'E1.6.1'],
  ['stage.head.max', 6, 1, 20, 'seasons', 'assumption', 'E1.6.1'],
  ['stage.lastCoordinator.min', 1, 1, 5, 'seasons', 'bible', 'E1.7.2'],
  ['stage.lastCoordinator.max', 2, 1, 8, 'seasons', 'bible', 'E1.7.2'],
  // E1.6.1 mentors written per start (table: GA 0 or 1, QC 1, position 1 or 2, coordinator 1 or 2, head 2)
  ['mentorsMin.nobody', 0, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.nobody', 0, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMin.graduate_assistant', 0, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.graduate_assistant', 1, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMin.quality_control', 1, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.quality_control', 1, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMin.position_coach', 1, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.position_coach', 2, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMin.coordinator', 1, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.coordinator', 2, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMin.head_coach', 2, 0, 4, 'count', 'bible', 'E1.6.1'],
  ['mentorsMax.head_coach', 2, 0, 4, 'count', 'bible', 'E1.6.1'],
  // E1.2.3 other work
  ['otherWorkYearsMax', 20, 0, 40, 'years', 'bible', 'E1.2.3'],
  ['educationHiringTerm', 0.02, 0, 0.2, 'score 0..1', 'bible', 'E1.2.3'],
  // E1.6.1 written seasons by shortcut start (table)
  ['written.graduate_assistant.min', 0, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.graduate_assistant.max', 1, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.quality_control.min', 2, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.quality_control.max', 4, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.position_coach.min', 5, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.position_coach.max', 9, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.coordinator.min', 10, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.coordinator.max', 14, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.head_coach.college.min', 14, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.head_coach.college.max', 20, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.head_coach.pro.min', 16, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  ['written.head_coach.pro.max', 24, 0, 40, 'seasons', 'bible', 'E1.6.1'],
  // E10.1.1 statement
  ['maxCommitments', 8, 1, 20, 'count', 'bible', 'E10.1.1'],
  // E10.4.1 ledger: the leaf names a window but no length
  ['ledgerWindowSeasons', 3, 1, 10, 'seasons', 'assumption', 'E10.4.1'],
  ['ledgerRecentExamples', 3, 1, 10, 'count', 'assumption', 'E10.4.1'],
  // The ledger's tests need a margin; E10.4.1 rule 1 says "by a margin" and gives no number.
  ['fourthDownGoMarginEp', 0.5, 0, 3, 'expected points', 'assumption', 'E10.4.1'],
  ['youngPlayerMinSnapShare', 0.1, 0, 1, 'ratio', 'assumption', 'E10.4.1'],
  ['penaltyGameMaxYards', 60, 0, 200, 'yards/game', 'assumption', 'E10.4.1'],
  ['lateGameRunShareMin', 0.5, 0, 1, 'ratio', 'assumption', 'E10.4.1'],
  // E11.1.1 and E11.3.1 notebook
  ['noteMaxChars', 4000, 100, 100000, 'characters', 'bible', 'E11.1.1'],
  ['resurfaceShown', 5, 1, 20, 'count', 'bible', 'E11.3.1'],
  ['oldNoteSeasons', 3, 1, 10, 'seasons', 'bible', 'E11.3.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g29.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible' ? `${leaf} acceptance (bible starting value, needs research)` : `${leaf} acceptance (assumption, needs research)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`coach: unknown parameter ${name}`);
  return v;
}

const READ_BY = ['career.coach'];

/**
 * League-rule keys this module reads (game build plan section 2). The values are not yet in
 * packages/rules-data; they are requested from the rule-values thread (S3.3.4 sources: NCAA 2023-01-11
 * release for the three-year maximum, Verified; the seven-year window 2 of 3). Callers pass them in
 * `CoachRules`, read from the rule set by these keys.
 */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'staff.ga_max_seasons', type: 'number', unit: 'seasons', meaning: 'Most seasons a person may serve as a graduate assistant coach (S3.3.4 rule 3).', ownerLeaf: 'S3.3.4', readBy: READ_BY },
  { key: 'staff.ga_degree_window_years', type: 'number', unit: 'years', meaning: 'A graduate assistant must have finished a bachelor\'s degree or used up eligibility within this many years (S3.3.4 rule 1).', ownerLeaf: 'S3.3.4', readBy: READ_BY },
];

/** The rule values creation needs, read by the caller from the level's rule set via RULE_KEYS. */
export interface CoachRules {
  readonly gaMaxSeasons: number;
  readonly gaDegreeWindowYears: number;
}
