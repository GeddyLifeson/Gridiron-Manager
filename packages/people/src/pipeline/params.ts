// College-to-pro pipeline parameter file (T11). Every tuning number the module uses is a row here.
// `basis: 'bible'` rows are starting values T11 states; `basis: 'assumption'` rows are forms or values chosen
// here for a rule T11 states without a number. None of them is a measured football fact: the measured rates
// (T11.4.1, T11.5.1) are fact rows in facts.json, never params.
import type { ParamFile, TuningParam } from '@gm/schema';

type Basis = 'b' | 'a';
type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: Basis];

function group(belongsTo: string, leaf: string, constrainedBy: string, rows: readonly Row[]): TuningParam[] {
  return rows.map(([name, value, min, max, unit, basis]) => ({
    name: `pipeline.${name}`, value, min, max, unit, belongsTo,
    basis: basis === 'b' ? 'bible' as const : 'assumption' as const,
    leaf, constrainedBy, status: 'starting' as const,
  }));
}

const FIT = 'T11.3.1 open question: fit so simulated drafts meet T11.4.1 (Q2)';

export const PARAMS: ParamFile = {
  module: 'people.pipeline',
  version: '0.1.0',
  params: [
    ...group('level factor', 'T11.3.1', FIT, [
      // Weight on a whole stat line when play-level data is absent (rule 4). T11.3.1 marks them Assumption.
      ['level.pro', 1.0, 0.1, 1, 'weight', 'b'],
      ['level.collegePower', 0.6, 0.1, 1, 'weight', 'b'],
      ['level.collegeTopOther', 0.45, 0.05, 1, 'weight', 'b'],
      ['level.collegeSecond', 0.3, 0.05, 1, 'weight', 'b'],
      ['level.collegeLower', 0.2, 0.02, 1, 'weight', 'b'],
      ['level.highSchool', 0.1, 0.01, 1, 'weight', 'b'],
    ]),
    ...group('opponent weight', 'T11.3.1', FIT, [
      // f(opponent - grade) in the summary form (rule 3): about 0.2 against much weaker opposition, 1.0 against
      // equal or stronger. Between, f = 1 / (the D6.4.5 variance multiplier), so the summary path and the
      // play-level path (people.scouting) agree wherever both apply (README decision P-02).
      ['opponent.minWeight', 0.2, 0.05, 1, 'weight', 'b'],
      ['opponent.baseWeight', 1.0, 0.1, 2, 'weight', 'b'],
    ]),
    ...group('production normalisation', 'T11.3.1', 'T11.3.1 rule 6: per play, per opportunity and by system pass rate', [
      // Share of a pass-rate gap that is treated as system inflation of volume statistics. Form chosen here.
      ['scheme.passRateElasticity', 1.0, 0, 1.5, 'share', 'a'],
      // Supporting-cast adjustment adds its own uncertainty (D6.4.5 rule 4): sd per ISS of cast gap from 50.
      ['scheme.castSdPerIss', 0.15, 0, 1, 'iss per iss', 'a'],
    ]),
    ...group('coach reports', 'T11.2.1', 'T11.2.1 acceptance: a coach with a long honest record reduces grade error', [
      // Talking a player up shifts the stated value by this many ISS.
      ['report.talkUpIss', 6, 0, 20, 'iss', 'a'],
      // Scouts read a statement's error sd from the coach's record: sd = mean absolute error x sqrt(pi / 2),
      // the ratio for a normal error. A form chosen here (README P-04), not a football number.
      ['report.maeToSd', 1.2533, 1, 2, 'ratio', 'a'],
      // Statements needed before the accuracy record replaces the neutral prior weight.
      ['report.recordPriorCount', 5, 1, 50, 'statements', 'a'],
      // Neutral prior mean absolute error of an unknown coach.
      ['report.priorErrorIss', 4, 0, 20, 'iss', 'a'],
      // Trust loss multiplier when a hidden injury surfaces (edge case): the coach's variance multiplier is
      // multiplied by this for every scout who asked.
      ['report.hiddenInjuryPenalty', 4, 1, 20, 'multiplier', 'a'],
      // Head coach hours per scout visit (rule 4: starting value 1 hour).
      ['report.visitHoursHeadCoach', 1, 0, 8, 'hours', 'b'],
      ['report.visitHoursPositionCoach', 2, 0, 8, 'hours', 'a'],
      // Practice and film access: share by which a fully open program cuts the visit's evidence variance.
      ['report.openAccessGain', 0.2, 0, 0.9, 'share', 'a'],
    ]),
    ...group('pre-draft', 'T11.2.2', 'T11.2.2 open question: combine and pro day facts (research)', [
      // Combine invites (rule 2: starting value 320). Unverified in T11.2.2; a named assumption until sourced.
      ['predraft.combineInvites', 320, 200, 400, 'players', 'b'],
      // Measured tests reveal measurables with small error (rule 3): sd of a measured 40 in seconds.
      ['predraft.measuredFortySdS', 0.02, 0, 0.1, 's', 'a'],
      // Sessions of workout evidence one testing event stands for.
      ['predraft.testingSessions', 1, 0.5, 3, 'sessions', 'a'],
    ]),
    ...group('calibration tolerance', 'T11.4.1', 'T11.4.1 tolerance rule', [
      ['calibration.tolBigSample', 0.08, 0, 0.3, 'share', 'b'],
      ['calibration.tolSmallSample', 0.12, 0, 0.3, 'share', 'b'],
      ['calibration.bigSampleN', 100, 10, 1000, 'picks', 'b'],
      ['calibration.qb1Starter5Low', 0.43, 0, 1, 'share', 'b'],
      ['calibration.qb1Starter5High', 0.67, 0, 1, 'share', 'b'],
      // T11.5.1: movement between levels lands within 50 percent of the starting targets.
      ['calibration.movementTolerance', 0.5, 0, 1, 'share', 'b'],
    ]),
    ...group('honours', 'T11.1.1', 'T11.1.1 AI use: general managers who weight honours heavily draft worse', [
      // Draft interest added per honour at full honour weight (K7 disposition 1). Interest only, never an attribute.
      ['honours.interestIssPerHonour', 1.5, 0, 10, 'iss per honour', 'a'],
      // Most honours that move interest; beyond this they add nothing.
      ['honours.cap', 6, 0, 20, 'honours', 'a'],
    ]),
    ...group('pro regard', 'T11.5.1', 'T11.5.1 rule 1: regard is computed from logged history', [
      // Weights of the regard terms. Forms chosen here; regard is a 0-100 standing, 50 neutral.
      ['regard.neutral', 50, 0, 100, 'points', 'a'],
      ['regard.perDraftedPlayer', 1.5, 0, 10, 'points per player', 'a'],
      ['regard.draftedCap', 15, 0, 50, 'points', 'a'],
      ['regard.perSlotOutcome', 4, 0, 20, 'points per player-outcome', 'a'],
      ['regard.slotCap', 20, 0, 50, 'points', 'a'],
      ['regard.accuracyIssToPoints', 1.5, 0, 10, 'points per iss', 'a'],
      ['regard.accuracyCap', 10, 0, 30, 'points', 'a'],
      ['regard.perNetworkTie', 1, 0, 10, 'points per tie', 'a'],
      ['regard.networkCap', 10, 0, 30, 'points', 'a'],
      ['regard.transferableSystem', 3, 0, 15, 'points', 'a'],
    ]),
  ],
};

const BY_NAME = new Map(PARAMS.params.map((x) => [x.name, x.value]));

/** Reads one pipeline parameter. Throws on an unknown name so a typo never reads as zero. */
export function p(name: string): number {
  const v = BY_NAME.get(`pipeline.${name}`);
  if (v === undefined) throw new Error(`unknown pipeline parameter ${name}`);
  return v;
}

/**
 * Rule keys this module reads. `people` may not import `rules-data` (P1.2.1), so the caller reads the value
 * and passes it in (calibration takes the round count).
 */
export const RULE_KEYS: readonly string[] = ['league_rules.draft.rounds'];
