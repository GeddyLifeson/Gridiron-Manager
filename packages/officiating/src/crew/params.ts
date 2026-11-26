// Crew model numbers (B11.1.1, B11.3.1, B11.3.2, B11.4.1). The values live in params.json: source in
// this package holds no number other than 0 and 1 (P1.1.2). Each row says whether the bible states
// it as a starting value or whether it is this module's assumption.
import { ParamFile, RulingAspect, type FoulId, type ParamTable, type RuleKeyManifest, type RuleSet } from '@gm/schema';
import file from './params.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const MODULE = 'officiating.crew';
const p = <T extends string>(name: T) => `${MODULE}.${name}` as const;

/** Parameter names, so a typing mistake is a compile error and not a lookup failure at run time. */
export const CREW = {
  refereeDepthYd: p('refereeDepthYd'),
  refereeOffsetYd: p('refereeOffsetYd'),
  umpireDepthYd: p('umpireDepthYd'),
  deepWingDepthYd: p('deepWingDepthYd'),
  backJudgeDepthYd: p('backJudgeDepthYd'),
  zoneRadiusYd: p('zoneRadiusYd'),
  outOfZoneFactor: p('outOfZoneFactor'),
  missingOfficialFactor: p('missingOfficialFactor'),
  objectiveCallChance: p('objectiveCallChance'),
  objectiveCallCap: p('objectiveCallCap'),
  judgmentCallCap: p('judgmentCallCap'),
  severityFactorMin: p('severityFactorMin'),
  severityFactorMax: p('severityFactorMax'),
  impactAtPointFactor: p('impactAtPointFactor'),
  impactAwayFactor: p('impactAwayFactor'),
  sightOpenFactor: p('sightOpenFactor'),
  sightCrowdedFactor: p('sightCrowdedFactor'),
  sightPileFactor: p('sightPileFactor'),
  phantomMaxChance: p('phantomMaxChance'),
  errorAtBoundary: p('errorAtBoundary'),
  errorSightOpenFactor: p('errorSightOpenFactor'),
  errorSightCrowdedFactor: p('errorSightCrowdedFactor'),
  errorSightPileFactor: p('errorSightPileFactor'),
  spotSdOpenYd: p('spotSdOpenYd'),
  spotSdCrowdedYd: p('spotSdCrowdedYd'),
  spotSdPileYd: p('spotSdPileYd'),
  scoreWindowYd: p('scoreWindowYd'),
  shortOfGoalYd: p('shortOfGoalYd'),
  erroneousWhistlePerGame: p('erroneousWhistlePerGame'),
  whistleChancesPerGame: p('whistleChancesPerGame'),
  crewFactorSd: p('crewFactorSd'),
  crewFactorMin: p('crewFactorMin'),
  crewFactorMax: p('crewFactorMax'),
  accuracyMin: p('accuracyMin'),
  accuracyMax: p('accuracyMax'),
  postseasonAccuracyMin: p('postseasonAccuracyMin'),
  postseasonAccuracyMax: p('postseasonAccuracyMax'),
} as const;

/** Detection family of a foul: the six of B11.4.1 plus `other` for a foul in none of them. */
export const DETECTION_FAMILIES = [
  'offensive_holding', 'defensive_coverage', 'pre_snap', 'roughing_and_safety', 'special_teams_blocks', 'conduct', 'other',
] as const;
export type DetectionFamily = (typeof DETECTION_FAMILIES)[number];

/** Aspects whose wrong rulings come from the margin curve of B11.3.2 rule 2. */
export const MARGIN_ASPECTS = ['catch', 'fumble_before_down', 'forward_or_backward_pass', 'score', 'touching', 'kick_good'] as const;
export type MarginAspect = (typeof MARGIN_ASPECTS)[number];

export const baseParam = (family: DetectionFamily) => `${MODULE}.base.${family}`;
/** Rule key that says whether replay may change a ruling of this aspect (B9.3.1: the list is data). */
export const reviewableKey = (aspect: RulingAspect) => `replay.reviewable.${aspect}`;
/**
 * Per-foul replay switches. They are not catalogue fields of the contract yet (change request in the
 * WP-05 report), so they are read only where the rule set defines them and are otherwise off.
 */
export const foulReplayKey = (id: FoulId, field: 'replay_reviewed' | 'assist_removable') => `foul.${id}.${field}`;
export function foulReplaySwitch(rules: RuleSet, id: FoulId, field: 'replay_reviewed' | 'assist_removable'): boolean {
  const key = foulReplayKey(id, field);
  return rules.keys().includes(key) && rules.bool(key);
}
export const errorScaleYdParam = (aspect: MarginAspect) => `${MODULE}.errorScaleYd.${aspect}`;
export const errorScaleSParam = (aspect: MarginAspect) => `${MODULE}.errorScaleS.${aspect}`;

/** Every parameter name this module may ask for. The tests check it against params.json both ways. */
export function crewParamNames(): string[] {
  return [
    ...Object.values(CREW),
    ...DETECTION_FAMILIES.map(baseParam),
    ...MARGIN_ASPECTS.flatMap((a) => [errorScaleYdParam(a), errorScaleSParam(a)]),
  ];
}

/** A parameter table over one or more parameter files. The integrator merges the real one (D-09). */
export function paramTable(files: readonly ParamFile[], overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const values = new Map<string, number>();
  for (const f of files) for (const row of f.params) values.set(row.name, row.value);
  for (const [k, v] of Object.entries(overrides)) {
    if (!values.has(k)) throw new Error(`parameter override ${k} names no parameter`);
    values.set(k, v);
  }
  return {
    version: files.map((f) => `${f.module}@${f.version}`).join(','),
    num(name: string): number {
      const v = values.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
    has(name: string): boolean { return values.has(name); },
  };
}

const REVIEWABLE_MEANING: Readonly<Record<RulingAspect, string>> = {
  catch: 'complete, incomplete or intercepted pass',
  down_by_contact: 'runner down by contact (a whistle that stopped a live play is never reviewable)',
  spot: 'the dead-ball spot against the line to gain',
  forward_or_backward_pass: 'pass forward or backward',
  in_bounds: 'runner or receiver in or out of bounds',
  score: 'ball breaking the plane of the goal line in possession',
  possession: 'recovery of a loose ball',
  fumble_before_down: 'fumble before the runner was down',
  kick_good: 'field goal or try good or no good',
  touching: 'touching of a kick or a loose ball',
  foul: 'a foul call (a single foul may be opened to review by its own switch)',
};

/**
 * Rule keys the crew model reads (B12.1.2). WP-01 owns the values and the fact rows. The catalogue
 * keys `foul.<id>.<field>` are read through `foulKey` when a mistaken flag needs a foul record, and
 * `foul.<id>.replay_reviewed` is asked for only where the rule set defines it.
 */
export const RULE_KEYS: RuleKeyManifest = [
  {
    key: 'catch.feet_required', type: 'number', unit: 'count',
    meaning: 'Feet (or other body part) down in bounds with control for a catch',
    ownerLeaf: 'B13.4.2', readBy: ['officiating/crew (a pass the crew rules complete is recorded with this many feet down)'],
  },
  ...RulingAspect.options.map((aspect) => ({
    key: reviewableKey(aspect), type: 'boolean' as const,
    meaning: `Replay may change a ruling of: ${REVIEWABLE_MEANING[aspect]}`,
    ownerLeaf: 'B9.3.1', readBy: ['officiating/crew (the `reviewable` field of each ruling)', 'officiating/replay'],
  })),
];
