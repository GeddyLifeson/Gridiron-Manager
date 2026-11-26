// Tuning constants of the needs and stress engine (X5). Two kinds only (game-build-plan section 2):
// `bible` quotes the X5 leaf that states the number as a starting value; `assumption` means this module's
// author chose it to make a bible rule computable, and the leaf names the rule it serves. None of these is
// a real-world football fact: X5 states "Football facts used: None" for every leaf, so no fact row applies.
import type { ParamFile, TuningParam } from '@gm/schema';

export const NEEDS_MODULE = 'people.needs';

type Row = [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string];

const ROWS: Row[] = [
  // X5.1.1 / X5.1.2: needs
  ['needs.level.max', 100, 100, 100, 'index', 'bible', 'X5.1.2', 'needs test "need level bounds"'],
  ['needs.buildRate.min', 1, 1, 1, 'index/week', 'bible', 'X5.1.2 rule 3', 'needs test "registry validation"'],
  ['needs.buildRate.max', 4, 4, 4, 'index/week', 'bible', 'X5.1.2 rule 3', 'needs test "registry validation"'],
  ['needs.build.maxEffectivePerWeek', 7, 4, 8, 'index/week', 'assumption', 'X5.1.2 rule 3', 'needs test "no need goes met to max in under half a season"'],
  ['needs.metReliefPerWeek', 4, 1, 10, 'index/week', 'assumption', 'X5.2.1 rule 4', 'needs test "meeting the need lowers its level"'],
  ['needs.trait.facetMid', 50, 50, 50, 'index', 'bible', 'X1.1.1', 'needs test "ego changes role weight"'],
  ['needs.trait.facetSpan', 50, 50, 50, 'index', 'bible', 'X1.1.1', 'needs test "ego changes role weight"'],
  ['needs.trait.valueSpan', 50, 50, 50, 'index', 'bible', 'X1.1.1', 'needs test "ego changes role weight"'],
  ['needs.reference.seasons', 2, 2, 2, 'count', 'bible', 'X5.1.2 rule 5', 'needs test "reference points"'],
  ['needs.reference.fallShare', 0.25, 0.25, 0.25, 'ratio', 'bible', 'X5.1.2 rule 5', 'needs test "reference points"'],
  ['needs.reference.gapGainPerPoint', 0.01, 0, 0.02, 'ratio', 'assumption', 'X5.1.2 rule 5', 'needs test "a demoted starter builds faster than a career backup"'],
  // X5.2.1: stress
  ['needs.stress.max', 1000, 1000, 1000, 'index', 'bible', 'X5.2.1', 'needs test "stress bounds"'],
  ['needs.stress.inflowFactor', 0.3, 0.3, 0.3, 'ratio', 'bible', 'X5.2.1 rule 1', 'needs test "X5.2.1 acceptance"'],
  ['needs.stress.decayPerWeek', 12, 12, 12, 'index/week', 'bible', 'X5.2.1 rule 1', 'needs test "X5.2.1 acceptance"'],
  ['needs.stress.decayScaleMin', 0.85, 0.81, 1, 'ratio', 'assumption', 'X5.2.1 rule 1 (bible says 0.5; raised so the X5.2.1 acceptance holds at patience 0, coordinator ruling 2026-11-26, bible amendment requested)', 'needs test "X5.2.1 acceptance"'],
  ['needs.stress.decayScaleMax', 1.5, 1.5, 1.5, 'ratio', 'bible', 'X5.2.1 rule 1', 'needs test "patience scales decay"'],
  ['needs.stress.eventCap', 60, 60, 60, 'index', 'bible', 'X5.2.1 rule 2', 'needs test "one maximal event moves stress by no more than 60"'],
  ['needs.stress.droppedGoalFactor', 0.6, 0.6, 0.6, 'ratio', 'bible', 'X5.2.1 rule 3', 'needs test "dropped goal"'],
  ['needs.talk.relief', 10, 0, 30, 'index', 'assumption', 'X5.2.1 rule 4', 'needs test "a talk alone is lost with a penalty"'],
  ['needs.talk.penalty', 10, 0, 30, 'index', 'assumption', 'X5.2.1 rule 4', 'needs test "a talk alone is lost with a penalty"'],
  ['needs.talk.weeks', 4, 4, 4, 'week', 'bible', 'X5.2.1 rule 4', 'needs test "a talk alone is lost with a penalty"'],
  ['needs.overruled.maxHit', 20, 20, 20, 'index', 'bible', 'X5.2.1 rule 5', 'needs test "overruled against his grain"'],
  ['needs.overruled.maxRelief', 5, 5, 5, 'index', 'bible', 'X5.2.1 rule 5', 'needs test "overruled against his grain"'],
  ['needs.offseason.weeksPerUpdate', 4, 4, 5, 'week', 'assumption', 'X5.2.1 edge case', 'needs test "monthly offseason update"'],
  // X5.2.3: bands and outcomes
  ['needs.band.unsettled', 250, 250, 250, 'index', 'bible', 'X5.2.3 rule 5', 'needs test "bands"'],
  ['needs.band.unhappy', 500, 500, 500, 'index', 'bible', 'X5.2.3 rule 5', 'needs test "bands"'],
  ['needs.band.breaking', 750, 750, 750, 'index', 'bible', 'X5.2.3 rule 5', 'needs test "bands"'],
  ['needs.band.downHysteresis', 50, 50, 50, 'index', 'bible', 'X5.2.3 rule 5', 'needs test "bands do not flicker"'],
  ['needs.band.startMax', 200, 200, 200, 'index', 'bible', 'X5.2.3 rule 5', 'needs test "start stress"'],
  ['needs.band.singleEventHoldWeeks', 1, 0, 2, 'week', 'assumption', 'X5.2.3 acceptance', 'needs test "no breakpoint on one event with needs met"'],
  ['needs.act.weeklyChance', 0.15, 0.15, 0.15, 'probability', 'bible', 'X5.2.3 rule 2', 'needs test "act chance"'],
  ['needs.act.loyaltyReductionMax', 0.5, 0, 1, 'ratio', 'assumption', 'X5.2.3 rule 2', 'needs test "loyalty lowers the act chance"'],
  ['needs.act.candorWarnMin', 25, 25, 25, 'index', 'bible', 'X1.2.1 rule 2 (mild band edge), X5.2.3 rule 2', 'needs test "warning before acts"'],
  ['needs.act.dwellWeeks', 2, 2, 2, 'week', 'bible', 'X5.2.3 rule 7', 'needs test "dwell before an act"'],
  ['needs.act.finalStrawWeeks', 4, 4, 4, 'week', 'bible', 'X5.2.3 rule 7', 'needs test "final straw"'],
  ['needs.act.finalStrawPool', 3, 3, 3, 'count', 'bible', 'X5.2.3 rule 7', 'needs test "final straw"'],
  ['needs.act.teamCapPerWeek', 2, 2, 2, 'count', 'bible', 'X5.2.3 rule 6', 'needs test "team cap"'],
  // X5.2.4: release, spacing, coping
  ['needs.release.points', 150, 150, 150, 'index', 'bible', 'X5.2.4 rule 1', 'needs test "release"'],
  ['needs.spacing.sameActWeeks', 26, 26, 26, 'week', 'bible', 'X5.2.4 rule 2', 'needs test "repeat spacing"'],
  ['needs.spacing.anyActWeeks', 8, 8, 8, 'week', 'bible', 'X5.2.4 rule 2', 'needs test "repeat spacing"'],
  ['needs.coping.startWeeks', 4, 4, 4, 'week', 'bible', 'X5.2.4 rule 3', 'needs test "coping"'],
  ['needs.coping.stopSettledWeeks', 4, 4, 4, 'week', 'bible', 'X5.2.4 rule 5', 'needs test "coping"'],
  ['needs.coping.addressedToConfideChance', 0.5, 0.5, 0.5, 'probability', 'bible', 'X5.2.4 rule 5', 'needs test "coping"'],
  ['needs.coping.relief.confiding', 4, 4, 4, 'index/week', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.relief.extraWork', 3, 3, 3, 'index/week', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.relief.withdrawal', 2, 2, 2, 'index/week', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.relief.goingOutLate', 3, 3, 3, 'index/week', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.relief.ventingPublic', 3, 3, 3, 'index/week', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.relief.faithPractice', 2, 0, 5, 'index/week', 'assumption', 'X5.2.4 rule 4 (L4.6.1 sets it; placeholder until L4 lands)', 'needs test "coping"'],
  ['needs.coping.incidentFactor', 1.3, 1.3, 1.3, 'ratio', 'bible', 'X5.2.4 rule 4', 'needs test "coping"'],
  ['needs.coping.faithMin', 25, 25, 25, 'index', 'bible', 'X1.2.1 rule 2 (mild band edge), X5.2.4 rule 3', 'needs test "coping"'],
  ['needs.coping.minorAge', 18, 18, 18, 'year', 'bible', 'X5.2.4 rule 6', 'needs test "no minor copes by going out late"'],
];

export const PARAMS: ParamFile = {
  module: NEEDS_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name, value, min, max, unit, belongsTo: NEEDS_MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** Reads a parameter of this module. Throws on an unknown name, so a typo never reads as zero. */
export function np(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${NEEDS_MODULE}: unknown parameter ${name}`);
  return v;
}

/** Seeded draw in [0, 1). The caller passes the next value of a `@gm/engine-core` stream (J13): `people` may not import it (P1.2.1). */
export type Draw = () => number;
