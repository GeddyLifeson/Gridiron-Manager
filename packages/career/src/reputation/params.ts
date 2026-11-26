// Design constants of the reputation module (game build plan section 2). Every value is a starting value
// the bible states (basis "bible": E5 and S11 mark them all as Assumptions) or one this module chose where
// the leaf names a parameter without a number (basis "assumption"). None is a real-world fact. The one
// real-world number this module uses (the Hall of Fame election share) is a fact row (facts.json).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'career.reputation';

const ROWS: readonly Row[] = [
  // E5.1.1 the record.
  ['record.neutral', 50, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['record.regardMin', 0, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['record.regardMax', 100, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['impression.knownMax', 0.3, 0, 1, 'ratio', 'bible', 'E5.1.1'],
  ['impression.regardMax', 10, 0, 50, 'index', 'bible', 'E5.1.1'],
  ['impression.fadeSeasons', 2, 1, 10, 'seasons', 'bible', 'E5.1.1'],
  ['known.floorShareOfPeak', 0.5, 0, 1, 'ratio', 'bible', 'E5.1.1'],
  ['band.unknownBelowKnown', 0.15, 0, 1, 'ratio', 'bible', 'E5.1.1'],
  ['band.doubtedBelow', 35, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['band.mixedTo', 55, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['band.respectedTo', 75, 0, 100, 'index', 'bible', 'E5.1.1'],
  ['decay.quietSeason', 0.05, 0, 1, 'ratio', 'bible', 'E5.1.1'],
  ['decay.fansQuietSeason', 0.15, 0, 1, 'ratio', 'bible', 'E5.2.5'],
  ['fans.towardMedia', 0.2, 0, 1, 'ratio', 'bible', 'E5.2.5'],
  ['panel.topEvents', 3, 1, 10, 'count', 'bible', 'E5.1.1'],
  // E5.1.2 the update.
  ['update.knownDamping', 0.5, 0, 1, 'ratio', 'bible', 'E5.1.2'],
  ['update.knownPerReach', 0.02, 0, 1, 'ratio', 'bible', 'E5.1.2'],
  ['update.retractionShare', 0.5, 0, 1, 'ratio', 'bible', 'E5.1.2'],
  // E5.2.1 players talk.
  ['players.spreadBase', 0.05, 0, 1, 'ratio', 'bible', 'E5.2.1'],
  ['players.spreadPerInfluence', 0.25, 0, 1, 'ratio', 'bible', 'E5.2.1'],
  ['players.trustBase', 40, 0, 100, 'index', 'bible', 'E5.2.1'],
  ['players.trustPerValue', 0.2, 0, 1, 'ratio', 'bible', 'E5.2.1'],
  // E5.2.2 to E5.2.4 default reach by audience.
  ['reach.coaches', 0.3, 0, 1, 'ratio', 'bible', 'E5.2.2'],
  ['reach.owners', 0.5, 0, 1, 'ratio', 'bible', 'E5.2.3'],
  // E5.7.1 reach by rung of the subject at the time of the event.
  ['rung.lowMax', 4, 0, 9, 'rung', 'bible', 'E5.7.1'],
  ['rung.lowReach', 0.05, 0, 1, 'ratio', 'bible', 'E5.7.1'],
  ['rung.midMax', 6, 0, 9, 'rung', 'bible', 'E5.7.1'],
  ['rung.midReach', 0.1, 0, 1, 'ratio', 'bible', 'E5.7.1'],
  ['rung.publicFrom', 7, 0, 9, 'rung', 'bible', 'E5.7.1'],
  ['rung.publicReach', 0.3, 0, 1, 'ratio', 'bible', 'E5.7.1'],
  ['rung.fullFrom', 8, 0, 9, 'rung', 'bible', 'E5.7.1'],
  // E5.7.1 rule 2: level transfer of shared audiences; media and fans keep regard per competition.
  ['transfer.knownPublic', 0.5, 0, 1, 'ratio', 'bible', 'E5.7.1'],
  // X2.3.1 rule 2 first-hand against public, and E5.3.2 rule 3 reference willingness.
  ['view.firstHandRatio', 2, 0, 10, 'ratio', 'bible', 'X2.3.1'],
  ['view.memoryScale', 0.1, 0, 1, 'ratio', 'assumption', 'X2.3.1'],
  ['view.edgeScale', 0.2, 0, 1, 'ratio', 'assumption', 'X2.3.1'],
  ['reference.minStrength', 60, 0, 100, 'index', 'assumption', 'E5.3.2'],
  // E5.4 and S11.2 the coaching tree.
  ['tree.headCoachRungMin', 8, 0, 9, 'rung', 'bible', 'E2.1.1'],
  ['tree.coordinatorRung', 7, 0, 9, 'rung', 'bible', 'E2.1.1'],
  ['tree.riseRungs', 1, 1, 9, 'rung', 'bible', 'E5.4.1'],
  ['tree.familiarityPerHire', 3, 0, 20, 'index', 'bible', 'E5.4.2'],
  ['tree.familiarityCap', 9, 0, 50, 'index', 'bible', 'E5.4.2'],
  ['tree.reverseLongSeasons', 3, 1, 20, 'seasons', 'bible', 'S11.2.1'],
  ['tree.reverseLong', 0.15, 0, 1, 'ratio', 'bible', 'S11.2.1'],
  ['tree.reverseShort', 0.08, 0, 1, 'ratio', 'bible', 'S11.2.1'],
  ['tree.listedGenerations', 2, 1, 5, 'count', 'bible', 'S11.2.1'],
  // E5.6.1 awards.
  ['award.weightWinsAbove', 1, 0, 10, 'ratio', 'bible', 'E5.6.1'],
  ['award.weightImprovement', 0.6, 0, 10, 'ratio', 'bible', 'E5.6.1'],
  ['award.weightPlace', 0.3, 0, 10, 'ratio', 'bible', 'E5.6.1'],
  ['award.noiseSd', 1, 0, 10, 'wins', 'assumption', 'E5.6.1'],
  ['award.repOwners', 3, 0, 20, 'index', 'bible', 'E5.6.1'],
  ['award.repMedia', 3, 0, 20, 'index', 'bible', 'E5.6.1'],
  ['award.repFans', 2, 0, 20, 'index', 'bible', 'E5.6.1'],
  // E5.6.2 records.
  ['records.winShareMinGames', 80, 1, 500, 'count', 'bible', 'E5.6.2'],
  ['records.milestoneEvery', 100, 1, 1000, 'count', 'assumption', 'E5.6.2'],
  // E5.6.3 Hall of Fame case. Weights are bible starting values; the logistic shape is this module's.
  ['hall.weightTitle', 20, 0, 100, 'index', 'bible', 'E5.6.3'],
  ['hall.winsPerPoint', 10, 1, 100, 'count', 'bible', 'E5.6.3'],
  ['hall.weightPlayoffWin', 1.5, 0, 20, 'index', 'bible', 'E5.6.3'],
  ['hall.weightWinShare', 100, 0, 500, 'index', 'bible', 'E5.6.3'],
  ['hall.weightTreeHeadCoach', 2, 0, 20, 'index', 'bible', 'E5.6.3'],
  ['hall.conductPenalty', 15, 0, 100, 'index', 'assumption', 'E5.6.3'],
  ['hall.logisticCentre', 60, 0, 200, 'index', 'assumption', 'E5.6.3'],
  ['hall.logisticScale', 10, 1, 100, 'index', 'assumption', 'E5.6.3'],
  ['hall.mediaShift', 0.05, 0, 1, 'ratio', 'assumption', 'E5.6.3'],
  ['hall.outlookBallots', 10, 1, 30, 'count', 'bible', 'E5.6.3'],
  ['hall.outlookBorderline', 0.05, 0, 1, 'probability', 'bible', 'E5.6.3'],
  ['hall.outlookStrong', 0.4, 0, 1, 'probability', 'bible', 'E5.6.3'],
  ['hall.outlookNearCertain', 0.85, 0, 1, 'probability', 'bible', 'E5.6.3'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g52.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible)`
      : `${leaf} acceptance (module assumption, needs research or tuning)`,
    status: 'starting',
  })),
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** A starting value by its short name (without the module prefix). */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`${MODULE}: unknown param ${name}`);
  return v;
}

/** Parameter overrides for tests and tuning: short name to value. */
export type Overrides = Readonly<Record<string, number>>;

export function paramWith(o: Overrides | undefined): (name: string) => number {
  return (name) => (o && name in o ? o[name]! : param(name));
}
