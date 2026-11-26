// Design constants of the playbook and terminology module (G-67, game build plan section 2). Every value
// here is a starting value a G3 or G4 leaf states (basis "bible"; the bible marks each one an Assumption or
// tuning knob) or one this module chose where the leaf names a quantity without a number (basis
// "assumption"). None is a real-world fact: the sourced facts in G3 and G4 (playbook sizes, call lengths)
// are anchors for these knobs, not inputs. Rule values (radio cutoff) are read by key (keys.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string];

export const MODULE = 'content.playbook';

const ROWS: readonly Row[] = [
  // G3.1.1 generated book size (pro offensive book, tuning knob inside the Verified order of magnitude).
  ['book.generatedMin', 600, 1, 5000, 'plays', 'bible', 'G3.1.1'],
  ['book.generatedMax', 1000, 1, 5000, 'plays', 'bible', 'G3.1.1'],
  // G3.1.2 thin formation.
  ['grid.thinFormationPlays', 10, 1, 100, 'plays', 'bible', 'G3.1.2'],
  // G3.2.1 review thresholds.
  ['roles.reactionSeen', 3, 1, 20, 'calls', 'bible', 'G3.2.1'],
  ['roles.reactionWindow', 6, 1, 40, 'calls', 'bible', 'G3.2.1'],
  ['roles.constraintNeverCalledGames', 4, 1, 20, 'games', 'bible', 'G3.2.1'],
  ['roles.shotShareMax', 0.1, 0, 1, 'ratio', 'bible', 'G3.2.1'],
  // G3.2.2 looks-alike tolerance.
  ['series.alignToleranceYd', 0.5, 0, 5, 'yd', 'bible', 'G3.2.2'],
  ['series.moveToleranceDeg', 15, 0, 90, 'deg', 'bible', 'G3.2.2'],
  ['series.slots', 11, 11, 11, 'count', 'bible', 'G3.2.2'],
  // G3.3.1 readiness and capacity.
  ['size.readyReps', 4, 1, 20, 'reps', 'bible', 'G3.3.1'],
  ['size.heldReps', 2, 1, 20, 'reps', 'bible', 'G3.3.1'],
  ['size.repsPerPlayCeiling', 4.5, 1, 20, 'reps', 'bible', 'G3.3.1'],
  ['size.projectionWeeks', 4, 1, 12, 'weeks', 'bible', 'G3.3.1'],
  // G4.1.2 huddle procedure.
  ['huddle.baseS', 4, 0, 20, 's', 'bible', 'G4.1.2'],
  ['huddle.twiceMishearFactor', 0.5, 0, 1, 'ratio', 'bible', 'G4.1.2'],
  ['huddle.mishearBase', 0.002, 0, 1, 'probability', 'assumption', 'G4.1.2'],
  ['huddle.mishearPerNoise', 0.02, 0, 1, 'probability', 'assumption', 'G4.1.2'],
  ['huddle.mishearPerSecond', 0.002, 0, 1, 'probability', 'assumption', 'G4.1.2'],
  ['huddle.mishearLowKnowledge', 1, 0, 5, 'ratio', 'assumption', 'G4.1.2'],
  // G4.1.3 parser.
  ['parse.maxEditDistance', 2, 0, 5, 'count', 'bible', 'G4.1.3'],
  // G4.2.2 word list.
  ['words.schemeDiscount', 0.2, 0, 1, 'ratio', 'bible', 'G4.2.2'],
  // G4.3.1 spoken length.
  ['spoken.syllablesPerS', 5, 1, 12, 'syllables/s', 'bible', 'G4.3.1'],
  ['spoken.boundaryPauseS', 0.2, 0, 2, 's', 'bible', 'G4.3.1'],
  ['spoken.tokenS', 0.65, 0.5, 0.8, 's', 'bible', 'G4.3.1'],
  // G4.3.2 limits.
  ['limits.maxS', 4, 1, 15, 's', 'bible', 'G4.3.2'],
  ['limits.maxWordsSingle', 12, 1, 40, 'words', 'bible', 'G4.3.2'],
  ['limits.maxWordsDouble', 18, 1, 60, 'words', 'bible', 'G4.3.2'],
  ['limits.earlyRecognitionKnowledge', 0.9, 0, 1, 'ratio', 'bible', 'G4.3.2'],
  ['limits.earlyRecognitionTokens', 4, 1, 10, 'tokens', 'bible', 'G4.3.2'],
  ['limits.earlyRecognitionExtraS', 0.3, 0, 2, 's', 'bible', 'G4.3.2'],
  ['limits.aliasKnowledgeBelow', 0.5, 0, 1, 'ratio', 'bible', 'G4.3.2'],
  // G4.4.1 wristband.
  ['band.relayS', 2, 0, 10, 's', 'bible', 'G4.4.1'],
  ['band.lookupS', 1, 0, 5, 's', 'bible', 'G4.4.1'],
  ['band.lookupMinS', 0.3, 0, 5, 's', 'assumption', 'G4.4.1'],
  ['band.lookupRepsToMin', 40, 1, 1000, 'reps', 'assumption', 'G4.4.1'],
  ['band.playerLookupError', 0.01, 0, 1, 'probability', 'bible', 'G4.4.1'],
  ['band.playerLookupErrorMin', 0.002, 0, 1, 'probability', 'assumption', 'G4.4.1'],
  ['band.maxCalls', 200, 1, 1000, 'calls', 'bible', 'G4.4.1'],
  ['band.dirtyDozen', 12, 1, 50, 'calls', 'bible', 'G4.4.1'],
  ['band.defenseCellsMin', 40, 1, 200, 'cells', 'bible', 'G4.4.5'],
  ['band.defenseCellsMax', 60, 1, 200, 'cells', 'bible', 'G4.4.5'],
  ['band.wrongCardError', 0.002, 0, 1, 'probability', 'bible', 'G4.4.5'],
  // G4.4.2 code words.
  ['codes.teachUnits', 1, 0, 10, 'units', 'bible', 'G4.4.2'],
  ['codes.indicatorPresnapS', 1.5, 0, 10, 's', 'bible', 'G4.4.2'],
  ['codes.packageMin', 8, 0, 100, 'codes', 'bible', 'G4.4.2'],
  ['codes.packageMax', 20, 0, 100, 'codes', 'bible', 'G4.4.2'],
  // G4.4.3 signals.
  ['signals.relayS', 3, 0, 10, 's', 'bible', 'G4.4.3'],
  ['signals.teachUnits', 1, 0, 10, 'units', 'bible', 'G4.4.3'],
  ['signals.decodeBase', 0.04, 0, 1, 'probability', 'bible', 'G4.4.3'],
  ['signals.dummyFactor', 0.15, 0, 1, 'ratio', 'bible', 'G4.4.3'],
  ['signals.dummyCap', 3, 0, 10, 'count', 'bible', 'G4.4.3'],
  ['signals.signsMax', 3, 1, 10, 'count', 'bible', 'G4.4.3'],
  ['signals.effortMax', 2, 0, 10, 'ratio', 'bible', 'G4.4.3'],
  ['signals.tvShare', 0.5, 0, 2, 'ratio', 'bible', 'G4.4.3'],
  ['signals.timingLeakShare', 0.5, 0, 1, 'ratio', 'bible', 'G4.4.3'],
  ['signals.coverReduction', 0.2, 0, 1, 'ratio', 'bible', 'G4.4.3'],
  // G4.4.4 dummies.
  ['dummy.learnBase', 0.7, 0, 1, 'ratio', 'bible', 'G4.4.4'],
  ['dummy.actConfidence', 0.6, 0, 1, 'ratio', 'bible', 'G4.4.4'],
  ['dummy.defaultRate', 0.3, 0, 1, 'ratio', 'bible', 'G4.4.4'],
  ['dummy.costS', 1, 0, 5, 's', 'bible', 'G4.4.4'],
  ['dummy.ownMistake', 0.02, 0, 1, 'probability', 'bible', 'G4.4.4'],
  // G4.5.1 defensive relay links.
  ['relay.voiceBase', 0.99, 0, 1, 'probability', 'bible', 'G4.5.1'],
  ['relay.voiceNoise', 0.25, 0, 1, 'probability', 'bible', 'G4.5.1'],
  ['relay.signalBase', 0.98, 0, 1, 'probability', 'bible', 'G4.5.1'],
  ['relay.signalNoise', 0.05, 0, 1, 'probability', 'bible', 'G4.5.1'],
  ['relay.knowledge', 0.1, 0, 1, 'probability', 'bible', 'G4.5.1'],
  ['relay.voiceS', 0.6, 0, 5, 's', 'bible', 'G4.5.1'],
  ['relay.signalS', 0.8, 0, 5, 's', 'bible', 'G4.5.1'],
  ['relay.everyoneReadsError', 0.01, 0, 1, 'probability', 'bible', 'G4.4.5'],
  // G4.5.2 defensive words.
  ['defense.coverageWordsMax', 20, 1, 100, 'words', 'bible', 'G4.5.2'],
  ['defense.templateMinWords', 2, 1, 10, 'words', 'bible', 'G4.5.1'],
  ['defense.templateMaxWords', 5, 1, 20, 'words', 'bible', 'G4.5.1'],
  // G4.6.1 line words.
  ['line.hearNoise', 0.6, 0, 1, 'ratio', 'bible', 'G4.6.1'],
  ['line.hearPerYard', 0.01, 0, 1, 'ratio', 'bible', 'G4.6.1'],
  ['line.hearFreeYards', 10, 0, 60, 'yd', 'bible', 'G4.6.1'],
  ['line.signalBase', 0.97, 0, 1, 'probability', 'bible', 'G4.6.1'],
  ['line.signalNoise', 0.1, 0, 1, 'probability', 'bible', 'G4.6.1'],
  ['line.reactProtectionS', 0.8, 0, 5, 's', 'bible', 'G4.6.1'],
  ['line.reactKillS', 1.2, 0, 5, 's', 'bible', 'G4.6.1'],
  ['line.reactAudibleS', 1.5, 0, 5, 's', 'bible', 'G4.6.1'],
  // G4.7.1 renaming.
  ['relearn.labelKeep', 0.4, 0, 1, 'ratio', 'bible', 'G4.7.1'],
  ['relearn.labelUnitShare', 0.5, 0, 1, 'ratio', 'bible', 'G4.7.1'],
  ['relearn.sameFamilyShare', 0.3, 0, 1, 'ratio', 'bible', 'G4.7.1'],
  ['relearn.interferenceKnowledge', 0.8, 0, 1, 'ratio', 'bible', 'G4.7.1'],
  ['relearn.interferenceMishear', 0.5, 0, 5, 'ratio', 'bible', 'G4.7.1'],
  ['relearn.interferenceWeeks', 4, 0, 52, 'weeks', 'bible', 'G4.7.1'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g67.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf,
    constrainedBy: basis === 'bible'
      ? `${leaf} acceptance (starting value, Assumption in the bible; coach review Q5)`
      : `${leaf} acceptance (module assumption where the leaf names no number; needs calibration)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`playbook: unknown parameter ${name}`);
  return v;
}

/** Learning profile of a language family (G4.2.1 table, learning units per position group). */
export interface LearningProfile {
  readonly baseVocabulary: number;
  readonly newPassPlay: number;
  readonly knownFromNewFormation: number;
  readonly spotTransfer: number;
  readonly codeWordCost: number;
  readonly spokenMultiplier: number;
}

/** G4.2.1 starting values (all Assumption in the bible, tuned in calibration and coach review Q5). */
export const LEARNING_PROFILES = {
  digit: { baseVocabulary: 10, newPassPlay: 0.5, knownFromNewFormation: 0.7, spotTransfer: 0.3, codeWordCost: 1.0, spokenMultiplier: 0.7 },
  descriptive: { baseVocabulary: 8, newPassPlay: 1.0, knownFromNewFormation: 0.7, spotTransfer: 0.3, codeWordCost: 1.0, spokenMultiplier: 1.0 },
  concept: { baseVocabulary: 6, newPassPlay: 3.0, knownFromNewFormation: 0.3, spotTransfer: 0.9, codeWordCost: 0.5, spokenMultiplier: 0.45 },
} as const satisfies Record<string, LearningProfile>;
