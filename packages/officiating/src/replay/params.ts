// Replay numbers and rule keys (B9, B13.9). Tuning values live in params.json; rule values come from
// the rule set by key. Who may start a review, how many challenges, what a lost one costs, which
// plays belong to the booth and which rulings replay may change are all rule data, so one module
// serves both levels (B9 "College differences").
import { ParamFile, RulingAspect, type RuleKeyManifest } from '@gm/schema';
import file from './params.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);

const MODULE = 'officiating.replay';
const p = <T extends string>(name: T) => `${MODULE}.${name}` as const;

export const REPLAY = {
  evidenceSightOpen: p('evidenceSightOpen'),
  evidenceSightCrowded: p('evidenceSightCrowded'),
  evidenceSightPile: p('evidenceSightPile'),
  evidenceScaleYd: p('evidenceScaleYd'),
  evidenceScaleS: p('evidenceScaleS'),
  evidenceNoMargin: p('evidenceNoMargin'),
  postseasonCameraFactor: p('postseasonCameraFactor'),
  boothStopThreshold: p('boothStopThreshold'),
  assistFactor: p('assistFactor'),
  continuingActionS: p('continuingActionS'),
} as const;

export function replayParamNames(): string[] { return Object.values(REPLAY); }

/** Plays only the booth may review under `replay.model = challenge_plus_booth` (B9.1.2 rules 1 to 5). */
export const BOOTH_ONLY = ['after_two_minute', 'overtime', 'scoring_play', 'try', 'turnover', 'failed_fourth_down', 'kick_possession', 'disqualification'] as const;
export type BoothOnly = (typeof BOOTH_ONLY)[number];

export const KEY = {
  model: 'replay.model',
  challengeCount: 'challenge.count',
  thirdIf: 'challenge.third_if',
  requiresTimeout: 'challenge.requires_timeout',
  needsTimeout: 'challenge.needs_available_timeout',
  overturnRefundsTimeout: 'challenge.overturn_refunds_timeout',
  allowedInOvertime: 'challenge.allowed_in_overtime',
  noRecoveryEndZoneYardline: 'replay.no_recovery_end_zone_yardline',
  downs: 'series.downs',
} as const;
export const boothOnlyKey = (item: BoothOnly) => `replay.booth_only.${item}`;
export const assistKey = (aspect: RulingAspect) => `replay.assist.${aspect}`;

/** Option values of `replay.model` (B13.1.1). The value names the procedure, never the level. */
export const MODEL = { challengePlusBooth: 'challenge_plus_booth', boothAllPlays: 'booth_all_plays' } as const;
export const THIRD_IF = { eitherWon: 'either_of_first_two_won', never: 'never' } as const;

/** Template keys for a challenge that gets no review (B9.1.1 rule 4a). */
export const REFUSED = {
  overtime: 'replay.refused.overtime',
  boothOnly: 'replay.refused.booth_only',
  noChallenges: 'replay.refused.no_challenges',
  noTimeout: 'replay.refused.no_timeout',
  notReviewable: 'replay.refused.not_reviewable',
} as const;

const BOOTH_ONLY_MEANING: Readonly<Record<BoothOnly, string>> = {
  after_two_minute: 'a play that begins after the two-minute warning of either half',
  overtime: 'a play in overtime',
  scoring_play: 'a play ruled a score',
  try: 'a try, good or no good',
  turnover: 'an interception, or a fumble or backward pass ruled recovered by the opponent',
  failed_fourth_down: 'the offense ruled short of the line to gain on the last down of a series',
  kick_possession: 'the kicking team ruled in possession at the end of a kick down',
  disqualification: 'a player disqualification',
};

const me = ['officiating/replay'];

/** Rule keys the replay module reads (B12.1.2). WP-01 owns the values and the fact rows. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: KEY.model, type: 'option', options: [MODEL.challengePlusBooth, MODEL.boothAllPlays],
    meaning: 'Replay procedure: coach challenges plus a booth with its own list of plays, or a booth that may stop any play',
    ownerLeaf: 'B13.9.1', readBy: me },
  { key: KEY.challengeCount, type: 'number', unit: 'count', meaning: 'Coach challenges per team per game before any earned one',
    ownerLeaf: 'B9.1.1', readBy: me },
  { key: KEY.thirdIf, type: 'option', options: [THIRD_IF.eitherWon, THIRD_IF.never],
    meaning: 'Condition for one more challenge after the base count is used', ownerLeaf: 'B9.1.1', readBy: me },
  { key: KEY.requiresTimeout, type: 'boolean', meaning: 'A challenge is made by taking a team timeout (false = by a flag, with the timeout charged only if the challenge fails)',
    ownerLeaf: 'B13.13.1', readBy: me },
  { key: KEY.needsTimeout, type: 'boolean', meaning: 'A team with no timeouts left may not challenge', ownerLeaf: 'B9', readBy: me },
  { key: KEY.overturnRefundsTimeout, type: 'boolean', meaning: 'A challenge that changes a ruling costs no timeout',
    ownerLeaf: 'B13.9.1', readBy: me },
  { key: KEY.allowedInOvertime, type: 'boolean', meaning: 'Coaches may challenge in overtime', ownerLeaf: 'B13.9.1', readBy: me },
  { key: KEY.noRecoveryEndZoneYardline, type: 'number', unit: 'yd',
    meaning: 'Yard line the ball goes to when replay shows it was lost in a team\'s own end zone and nobody clearly recovered it',
    ownerLeaf: 'B9.4.1', readBy: me },
  { key: KEY.downs, type: 'number', unit: 'count', meaning: 'Downs in a series (read to recognise a failed last down)',
    ownerLeaf: 'B3.1', readBy: me },
  ...BOOTH_ONLY.map((item) => ({
    key: boothOnlyKey(item), type: 'boolean' as const,
    meaning: `Under replay.model challenge_plus_booth, only the booth may review: ${BOOTH_ONLY_MEANING[item]}`,
    ownerLeaf: 'B9.1.2', readBy: me,
  })),
  ...RulingAspect.options.map((aspect) => ({
    key: assistKey(aspect), type: 'boolean' as const,
    meaning: `Replay assist may correct a ruling of aspect ${aspect} without a review`,
    ownerLeaf: 'B9.5.1', readBy: me,
  })),
];
