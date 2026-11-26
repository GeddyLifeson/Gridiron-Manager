// Play tagging and its accuracy (H2.1.2). Directly observable tags are always right. Inferred tags
// (coverage after the snap, protection, run concept, pressure design) are right with probability
// p = base + skill term - disguise term; a wrong tag is drawn from the confusable set for the value.
// The true record is never part of the output: the charted row holds only tags.
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';
import type { ChartedPlay } from './types.ts';

/** H2.1.2 rule 5: the inferred tags. Every other field is observable (rule 4). */
export const INFERRED_TAGS = ['coverageFamily', 'protection', 'concept', 'pressureDesign'] as const;
export type InferredTag = (typeof INFERRED_TAGS)[number];

export interface Tagger {
  /** Tagging skill 0 to 1, the K6 staff value; scales the skill term up to its maximum. */
  readonly skill: number;
}

export interface ChartingInputs {
  readonly tagger: Tagger;
  /** Disguise of the defensive call 0 to 1 (J5); scales the disguise term. */
  readonly disguise: (p: ChartedPlay) => number;
  /**
   * What a charter would write for the true value: for a concept, the concept family rather than the
   * play's own name (N2.3.1 rule 2: the true call name is never exposed). Identity when omitted.
   */
  readonly chartValue?: (tag: InferredTag, trueValue: string) => string;
  /** F confusable sets: values a tag is mistaken for. */
  readonly confusable?: (tag: InferredTag, value: string) => readonly string[];
  /** Vocabulary for a tag, used when no confusable set is given. */
  readonly vocabulary?: (tag: InferredTag) => readonly string[];
}

/** H2.1.2 rule 5. */
export function tagAccuracy(skill: number, disguise: number): number {
  const s = Math.min(1, Math.max(0, skill));
  const d = Math.min(1, Math.max(0, disguise));
  return Math.min(1, Math.max(0, param('tag.base') + s * param('tag.skillMax') - d * param('tag.disguiseMax')));
}

/** H2.1.2 acceptance 3: a perfect tagger facing no disguise is always right. */
export const PERFECT_TAGGER: Tagger = { skill: 1 };

/**
 * H2.1.2 acceptance 3 says a perfect-skill tagger facing no disguise is fully correct, but rule 5's
 * starting values top out at 0.80 + 0.15 = 0.95. This module follows the acceptance: skill 1 with zero
 * disguise is always right (reported to the bible thread).
 */
function perfect(t: Tagger): boolean {
  return t.skill >= 1;
}

/**
 * Charts an opponent's rows. One draw per inferred tag that has a value, in play order, from the
 * caller's stream (J13 streams), so a breakdown replays to the same tags.
 */
export function chartOpponent(plays: readonly ChartedPlay[], inp: ChartingInputs, rng: RandomStream): ChartedPlay[] {
  return plays.map((p) => {
    const out: Record<string, unknown> = { ...p, source: 'charted', weight: p.weight };
    const disguise = inp.disguise(p);
    const pRight = perfect(inp.tagger) && disguise <= 0 ? 1 : tagAccuracy(inp.tagger.skill, disguise);
    for (const tag of INFERRED_TAGS) {
      const truth = p[tag];
      if (truth === null) continue;
      const seen = inp.chartValue ? inp.chartValue(tag, truth) : truth;
      // A cancelled play is tagged for formation and personnel only (H2.1.2 edge case).
      if (p.lookOnly) { out[tag] = null; continue; }
      if (pRight >= 1 || rng.uniform() < pRight) { out[tag] = seen; continue; }
      const alts = (inp.confusable ? inp.confusable(tag, seen) : (inp.vocabulary ? inp.vocabulary(tag) : [])).filter((v) => v !== seen);
      out[tag] = alts.length ? alts[rng.int(0, alts.length - 1)]! : seen;
    }
    return out as unknown as ChartedPlay;
  });
}

/**
 * H2.1.2 rule 6: a tag corrected by the user takes the value he enters, right or wrong; nothing is
 * re-rolled. Returns the new row.
 */
export function correctTag(p: ChartedPlay, tag: InferredTag, value: string | null): ChartedPlay {
  return { ...p, [tag]: value };
}

/**
 * H2.2.1 rule 6 header: how a tagger's past tags held up on recheck, in words with the plays behind
 * it. His true accuracy is hidden (K9) and never shown as a number of its own.
 */
export function recheckLine(changed: number, rechecked: number, tag: string): string {
  return `his ${tag} calls were changed on ${changed} of ${rechecked} rechecked plays`;
}

/** F10 confusions named in the bible (H2.1.2 rule 5: quarters mistaken for Cover 2). Others come from F content. */
export const BIBLE_COVERAGE_CONFUSIONS: Readonly<Record<string, readonly string[]>> = { cover4: ['cover2'] };
