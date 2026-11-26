// Tuning constants of relationships (X7) and the locker-room graph (L2.1). Every number is an X7 or L2.1
// starting value (`bible`) or a value this module's author chose to make a rule computable (`assumption`).
// X7 and L2.1 state "Football facts used: None" for every leaf this module implements, except X7.3.1 and
// X7.3.2 (offensive line continuity: Unverified), which is why the contest effect ships at zero.
import type { ParamFile, TuningParam } from '@gm/schema';

export const RELATIONSHIPS_MODULE = 'people.relationships';

type Row = [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string];

const ROWS: Row[] = [
  // X7.1.1 edge record and creation
  ['edge.strength.max', 100, 100, 100, 'index', 'bible', 'X7.1.1', 'relationships test "edge record"'],
  ['edge.start', 20, 20, 20, 'index', 'bible', 'X7.1.1 rule 4', 'relationships test "creation"'],
  ['edge.start.sociabilitySwing', 10, 10, 10, 'index', 'bible', 'X7.1.1 rule 4', 'relationships test "creation"'],
  ['edge.basis.max', 5, 5, 5, 'count', 'bible', 'X7.1.1', 'relationships test "basis"'],
  ['edge.minWeeksTogether', 2, 1, 4, 'count', 'assumption', 'X7.1.1 edge case (one week together: no edge)', 'relationships test "short stint"'],
  ['rival.meetings', 3, 3, 3, 'count', 'bible', 'X7.1.1 rule 3', 'relationships test "rivals"'],
  ['rival.minStakes', 15, 15, 15, 'index', 'bible', 'X7.1.1 rule 3', 'relationships test "rivals"'],
  ['rival.windowSeasons', 6, 6, 6, 'count', 'bible', 'X7.1.1 rule 3', 'relationships test "rivals"'],
  // X7.2.1 fit
  ['fit.pairTerm.range', 0.3, 0.3, 0.3, 'ratio', 'bible', 'X7.2.1', 'relationships test "fit"'],
  ['fit.facet.span', 100, 100, 100, 'index', 'bible', 'X1.1.1 (facets 0 to 100)', 'relationships test "fit"'],
  ['fit.facet.middle', 50, 50, 50, 'index', 'bible', 'X1.1.1 (50 is the middle)', 'relationships test "fit"'],
  ['fit.high', 70, 60, 80, 'index', 'assumption', 'X7.2.1 friction terms ("high")', 'relationships test "friction"'],
  ['fit.low', 30, 20, 40, 'index', 'assumption', 'X7.2.1 friction terms ("low")', 'relationships test "friction"'],
  ['fit.friction.egoPair', 0.3, 0, 1, 'ratio', 'assumption', 'X7.2.1 (two high-ego people, boss and subordinate)', 'relationships test "friction"'],
  ['fit.friction.candorUnderLow', 0.2, 0, 1, 'ratio', 'assumption', 'X7.2.1 (high candor under a low-candor boss)', 'relationships test "friction"'],
  ['fit.friction.riskGap', 0.2, 0, 1, 'ratio', 'assumption', 'X7.2.1 (far-apart risk tolerance, head coach and play caller)', 'relationships test "friction"'],
  ['fit.riskGap.far', 40, 30, 60, 'index', 'assumption', 'X7.2.1 ("far apart")', 'relationships test "friction"'],
  // X7.2.2 growth and decay
  ['growth.perMemoryPoint', 0.1, 0.1, 0.1, 'ratio', 'bible', 'X7.2.2 rule 1', 'relationships test "growth"'],
  ['growth.fitWeight', 0.5, 0.5, 0.5, 'ratio', 'bible', 'X7.2.2 rule 1', 'relationships test "fit moves growth"'],
  ['decay.graceMonths', 6, 6, 6, 'month', 'bible', 'X7.2.2 rule 2', 'relationships test "decay floor"'],
  ['decay.perMonth', 1, 1, 1, 'index', 'bible', 'X7.2.2 rule 2', 'relationships test "decay floor"'],
  ['decay.loyalFactor', 0.5, 0.5, 0.5, 'ratio', 'bible', 'X7.2.2 rule 2 ("slowed by half")', 'relationships test "decay floor"'],
  ['decay.floorShare', 0.25, 0.25, 0.25, 'ratio', 'bible', 'X7.2.2 rule 2', 'relationships test "decay floor"'],
  ['rival.dormantSeasons', 10, 10, 10, 'count', 'bible', 'X7.2.2 rule 4', 'relationships test "dormant rivalry"'],
  ['rival.fadeShare', 0.1, 0.1, 0.1, 'ratio', 'bible', 'X7.2.2 rule 4', 'relationships test "dormant rivalry"'],
  ['sign.coldBelow', 15, 5, 25, 'index', 'assumption', 'X7.2.2 rule 1 ("can turn the sign cold")', 'relationships test "sign"'],
  ['sign.warmFrom', 50, 40, 60, 'index', 'assumption', 'X7.2.2 (close, working, distant, cold)', 'relationships test "sign"'],
  ['sign.thawFrom', 40, 30, 50, 'index', 'assumption', 'X7.2.2 edge case (cold warms through first-hand events)', 'relationships test "sign"'],
  ['describe.close', 60, 60, 60, 'index', 'assumption', 'X7.2.2 words; same line as L2.1.1 "close"', 'relationships test "words"'],
  ['describe.working', 30, 20, 40, 'index', 'assumption', 'X7.2.2 words', 'relationships test "words"'],
  // X7.2.3 promises
  ['promise.brokenHit', 30, 30, 30, 'index', 'bible', 'X7.2.3', 'relationships test "promises"'],
  ['promise.keptGain', 15, 15, 15, 'index', 'bible', 'X7.2.3', 'relationships test "promises"'],
  // X7.4.2 vouching
  ['vouch.weightPerPoint', 0.01, 0.01, 0.01, 'ratio', 'bible', 'X7.4.2', 'relationships test "vouching"'],
  ['vouch.firedCost', 10, 10, 10, 'index', 'bible', 'X7.4.2', 'relationships test "vouching"'],
  ['vouch.firedWithinSeasons', 2, 2, 2, 'count', 'bible', 'X7.4.2', 'relationships test "vouching"'],
  ['vouch.promotedGain', 5, 5, 5, 'index', 'bible', 'X7.4.2', 'relationships test "vouching"'],
  // X7.3 unit cohesion
  ['cohesion.practiceWeight', 0.25, 0.25, 0.25, 'ratio', 'bible', 'X7.3.1', 'relationships test "cohesion counts"'],
  ['cohesion.carryover', 0.7, 0.7, 0.7, 'ratio', 'bible', 'X7.3.1', 'relationships test "cohesion carryover"'],
  ['cohesion.contest.saturationSnaps', 800, 800, 800, 'count', 'bible', 'X7.3.2', 'relationships test "contest modifier"'],
  ['cohesion.contest.saturationShare', 0.9, 0.9, 0.9, 'ratio', 'bible', 'X7.3.2', 'relationships test "contest modifier"'],
  ['cohesion.contest.cap', 0.015, 0, 0.015, 'probability', 'bible', 'X7.3.2 (1.5 percentage points, inside X1.4.2)', 'relationships test "contest modifier"'],
  ['cohesion.contest.shipped', 0, 0, 1, 'ratio', 'bible', 'X7.3.2 (ships at zero until the X7.3.1 fact is 2 of 3)', 'relationships test "contest modifier"'],
  // L2.1.1 player-to-player ties
  ['tie.base', 20, 20, 20, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.sameRoom', 15, 15, 15, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.sameClass', 10, 10, 10, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.formerTeammates', 15, 15, 15, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.sameAgent', 5, 5, 5, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.sameRegion', 5, 5, 5, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.fitSwing', 15, 15, 15, 'index', 'bible', 'L2.1.1 (personality fit -15 to +15)', 'locker test "initial tie"'],
  ['tie.cap', 90, 90, 90, 'index', 'bible', 'L2.1.1', 'locker test "initial tie"'],
  ['tie.weekly.sameRoom', 1, 1, 1, 'index', 'bible', 'L2.1.1', 'locker test "weekly drift"'],
  ['tie.weekly.other', 0.5, 0.5, 0.5, 'index', 'bible', 'L2.1.1', 'locker test "weekly drift"'],
  ['tie.ceiling.middle', 50, 40, 60, 'index', 'assumption', 'L2.1.1 ("ceiling set by personality fit")', 'locker test "weekly drift"'],
  ['tie.ceiling.swing', 40, 30, 40, 'index', 'assumption', 'L2.1.1 ("ceiling set by personality fit")', 'locker test "weekly drift"'],
  ['tie.fight', 25, 25, 25, 'index', 'bible', 'L2.1.1', 'locker test "fight"'],
  ['tie.battle.lowFit', 1, 1, 1, 'index', 'bible', 'L2.1.1', 'locker test "job battle"'],
  ['tie.closeAbove', 60, 60, 60, 'index', 'bible', 'L2.1.1', 'locker test "labels"'],
  ['tie.frictionBelow', 20, 20, 20, 'index', 'bible', 'L2.1.1', 'locker test "labels"'],
  ['tie.frictionWeeks', 8, 8, 8, 'count', 'bible', 'L2.1.1', 'locker test "labels"'],
  ['tie.partedDecayPerSeason', 10, 10, 10, 'index', 'bible', 'L2.1.1', 'locker test "parted"'],
  ['tie.store.above', 30, 30, 30, 'index', 'bible', 'L2.1.1 edge case', 'locker test "sparse"'],
  ['tie.store.below', 20, 20, 20, 'index', 'bible', 'L2.1.1 edge case', 'locker test "sparse"'],
  ['tie.default', 25, 25, 25, 'index', 'bible', 'L2.1.1 edge case', 'locker test "sparse"'],
  // L2.1.2 rooms and cliques
  ['clique.minSize', 4, 4, 4, 'count', 'bible', 'L2.1.2', 'locker test "cliques"'],
  ['clique.minTie', 65, 65, 65, 'index', 'bible', 'L2.1.2', 'locker test "cliques"'],
  ['clique.problemTrustBelow', 35, 35, 35, 'index', 'bible', 'L2.1.2', 'locker test "cliques"'],
  ['room.bondAlarmBelow', 30, 30, 30, 'index', 'bible', 'L2.1.2', 'locker test "rooms"'],
  ['room.bondAlarmWeeks', 4, 4, 4, 'count', 'bible', 'L2.1.2', 'locker test "rooms"'],
  // L2.1.3 influence
  ['influence.w.leadership', 0.3, 0.3, 0.3, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.w.performance', 0.2, 0.2, 0.2, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.w.tenure', 0.15, 0.15, 0.15, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.w.role', 0.15, 0.15, 0.15, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.w.tie', 0.1, 0.1, 0.1, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.w.captain', 0.1, 0.1, 0.1, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.tenureCapSeasons', 6, 6, 6, 'count', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.role.starter', 100, 100, 100, 'index', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.role.rotation', 50, 50, 50, 'index', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.role.reserve', 20, 20, 20, 'index', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.quarterbackBonus', 10, 10, 10, 'index', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['influence.injuredKeep', 0.8, 0.8, 0.8, 'ratio', 'bible', 'L2.1.3', 'locker test "influence"'],
  ['scale.max', 100, 100, 100, 'index', 'bible', 'L2.1 (0 to 100 values)', 'locker test "influence"'],
  ['months.perYear', 12, 12, 12, 'count', 'bible', 'X7.2.2 (months of a calendar year)', 'relationships test "decay floor"'],
];

export const PARAMS: ParamFile = {
  module: RELATIONSHIPS_MODULE,
  version: '0.1.0',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name, value, min, max, unit, belongsTo: RELATIONSHIPS_MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

export function rp(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${RELATIONSHIPS_MODULE}: unknown parameter ${name}`);
  return v;
}

/**
 * Seeded draw in [0, 1) for one pair, from the `pair.chemistry` stream keyed by the two person ids
 * (X7.2.1). The caller builds it from a `@gm/engine-core` stream; this package may not import the engine.
 * It must return the same value for (a, b) and (b, a).
 */
export type PairDraw = (lowId: number, highId: number) => number;
