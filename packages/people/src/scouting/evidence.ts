// Evidence sources and their noise (D6.4.2), opponent strength (D6.4.5), and the user's own grades
// (D6.4.3, E9.1.3 case 1). This file turns "who looked, how, against whom" into an evidence variance.
// It never reads a true value; observe.ts draws the observed value for AI evaluators.
import type { WorldDate } from '@gm/schema';
import type { Contributor, EvidenceItem } from './estimate.ts';
import { p } from './params.ts';

/** Evidence sources of the D6.4.2 table. */
export const EVIDENCE_SOURCES = [
  'game_live', 'game_film', 'opponent_film', 'practice_full', 'practice_walk',
  'workout', 'interview', 'season_stats', 'grading_service',
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

const NOISE_PARAM: Record<EvidenceSource, string> = {
  game_live: 'noise.gameLive',
  game_film: 'noise.gameFilm',
  opponent_film: 'noise.opponentFilm',
  practice_full: 'noise.practiceFull',
  practice_walk: 'noise.practiceWalk',
  workout: 'noise.workout',
  interview: 'noise.interview',
  season_stats: 'noise.seasonStats',
  grading_service: 'noise.gradingService',
};

/** Sources counted per snap or per rep, which share the one tuning multiplier (README S-03). */
const PER_SNAP: ReadonlySet<EvidenceSource> = new Set(['game_live', 'game_film', 'opponent_film', 'practice_full', 'practice_walk', 'grading_service']);

/** Noise sd of one unit of a source before evaluator skill (D6.4.2 table, with the snap tuning). */
export function sourceNoiseSd(source: EvidenceSource): number {
  const base = p(NOISE_PARAM[source]);
  return PER_SNAP.has(source) ? base * p('noise.snapTuning') : base;
}

/** Evaluator skill multiplies noise sd by (1.6 - skill / 100) (D6.4.2). */
export function skillMultiplier(skill: number): number {
  return p('skill.base') - skill / p('skill.divisor');
}

/** Gap above which evidence says little about the top of the scale (D6.4.5 rule 3). */
export function excessOverOpponent(level: number, opponent: number): number {
  const x = level - opponent - p('opponent.offset');
  return x > 0 ? x : 0;
}

/**
 * Variance multiplier for evidence against weaker opposition (D6.4.5 rule 3, which this module takes as
 * the form of D6.4.2's "a rep against a much weaker opponent has its noise doubled", README S-04):
 * 1 + ((estimate - opponent - 10) / 10)^2 above the offset. Evaluators apply it in proportion to their
 * skill, so low-skill staff trust weak-schedule evidence too much.
 */
export function opponentVarianceMultiplier(estimateMean: number, opponent: number | null, skill: number): number {
  if (opponent === null) return 1;
  const r = excessOverOpponent(estimateMean, opponent) / p('opponent.scale');
  const share = skill / p('skill.divisor');
  return 1 + (share > 1 ? 1 : share < 0 ? 0 : share) * r * r;
}

export interface LookContext {
  readonly attribute: string;
  readonly source: EvidenceSource;
  /** Units of the source this item stands for: snaps, reps, sessions, interviews, or season share. */
  readonly units: number;
  readonly date: WorldDate;
  readonly evaluator: Contributor;
  /** Evaluation skill used for noise (AI staff: hidden K2 or L4 value; user: `skill.userTerm`). */
  readonly skill: number;
  /** The organisation's current estimate mean of the attribute, which sets the opponent cut. */
  readonly estimateMean: number;
  /** Opponent strength in ISS on the reps observed, or null when it does not apply (interview). */
  readonly opponent: number | null;
}

/** Variance of an evidence item of `units` units (D6.4.2, D6.4.5). */
export function evidenceVariance(ctx: Omit<LookContext, 'attribute' | 'date' | 'evaluator'>): number {
  if (!(ctx.units > 0)) throw new Error('evidence needs at least some units');
  const sd = sourceNoiseSd(ctx.source) * skillMultiplier(ctx.skill);
  return (sd * sd / ctx.units) * opponentVarianceMultiplier(ctx.estimateMean, ctx.opponent, ctx.skill);
}

/** Builds an evidence item from a value already observed (by observe.ts, or entered by a person). */
export function evidenceItem(ctx: LookContext, value: number): EvidenceItem {
  return {
    attribute: ctx.attribute, value, variance: evidenceVariance(ctx), units: ctx.units,
    date: ctx.date, evaluator: ctx.evaluator,
  };
}

/**
 * The user's own grade (D6.4.3, E9.1.3 case 1): it enters with exactly the value he gave, right or wrong,
 * with no noise draw and no stored skill of his. For weighting only it carries the evidence variance of the
 * median evaluator, the same for every user and every career.
 */
export function userGradeItem(ctx: Omit<LookContext, 'skill'>, valueGiven: number): EvidenceItem {
  return evidenceItem({ ...ctx, skill: p('skill.userTerm') }, valueGiven);
}
