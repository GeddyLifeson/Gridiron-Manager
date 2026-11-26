// Drawing an observation from truth (D6.4.2, D6.4.3, D6.4.5). THE ONLY FILE IN THIS MODULE THAT READS A
// TRUE VALUE. It runs inside the world loop for AI evaluators and staff reports, never on the interface
// side. Read models (view.ts) and display (scales.ts, display.ts) take estimates only; a test checks that
// none of them imports this file.
import type { EvidenceItem } from './estimate.ts';
import { evidenceItem, excessOverOpponent, skillMultiplier, sourceNoiseSd, type LookContext } from './evidence.ts';
import { p } from './params.ts';

/** A standard normal source. `Stream` from `@gm/engine-core` satisfies it (J13). */
export interface NormalSource {
  normal(): number;
}

/** An AI evaluator's hidden lean (D6.4.3). Truth on the evaluator (K2, L4, ScoutingBlock). */
export interface EvaluatorLean {
  /** Constant leniency offset, drawn once per evaluator (sd `bias.leniencySd`). */
  readonly leniency: number;
  /** Per-player offset for favourites and doghouse players (sd `bias.favouriteSd`), 0 for most. */
  readonly playerOffset: number;
  /** Lean for traits that suit his scheme, on this attribute. */
  readonly schemeOffset: number;
}

/** Draws an evaluator's constant leniency (D6.4.3) from the caller's stream. */
export function drawLeniency(rng: NormalSource): number {
  return rng.normal() * p('bias.leniencySd');
}

/** Draws a favourite or doghouse offset (D6.4.3); `tie` in [-1, 1] is the D12 relationship's direction. */
export function drawPlayerOffset(rng: NormalSource, tie: number): number {
  return tie * Math.abs(rng.normal()) * p('bias.favouriteSd');
}

/**
 * One observation of `units` units (D6.4.2): true value + evaluator bias + noise. Noise of an aggregate of
 * n units has sd / sqrt(n), so one item can stand for a whole film session. Against weak opposition a
 * low-skill evaluator also leans toward the dominance he sees (D6.4.5 rule 3).
 */
export function observe(trueValue: number, ctx: LookContext, lean: EvaluatorLean, rng: NormalSource): EvidenceItem {
  const sd = sourceNoiseSd(ctx.source) * skillMultiplier(ctx.skill) / Math.sqrt(ctx.units);
  const ignore = 1 - ctx.skill / p('skill.divisor');
  const weak = ctx.opponent === null ? 0 : excessOverOpponent(trueValue, ctx.opponent) * p('opponent.weakScheduleLean') * (ignore > 0 ? ignore : 0);
  const value = trueValue + lean.leniency + lean.playerOffset + lean.schemeOffset + weak + rng.normal() * sd;
  return evidenceItem(ctx, value);
}

/** An unbiased look, for tests and for evidence with no evaluator (public test results). */
export const NO_LEAN: EvaluatorLean = { leniency: 0, playerOffset: 0, schemeOffset: 0 };

/**
 * A school-reported test (D6.1.2): flattering by `reported.fortyBiasS` with sd `reported.fortySdS`.
 * Returns the number the school reports; display.ts shows it with a "reported" marker.
 */
export function reportedForty(trueFortyS: number, rng: NormalSource): number {
  return trueFortyS + p('reported.fortyBiasS') + rng.normal() * p('reported.fortySdS');
}
