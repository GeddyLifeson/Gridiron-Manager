// D9.4.1 knowledge errors on a play. Probability on an assignment = e x (1 - k/100)^2, times the position's
// difficulty factor (0.6 to 1.6, linear in difficulty 1 to 5), times 1.3 for an item changed at the line,
// times the noise factor (J12). Knowledge under 80 adds (80 - k) x 0.01 s of processing delay. The error
// type is drawn from the assignment's error table, which J4 owns and the caller passes.
import type { RandomStream } from '@gm/schema';
import type { KnowledgeBook } from './book.ts';
import type { Assignment, ItemCatalogue } from './items.ts';
import { num, type KnowledgeNumbers } from './params.ts';

/** The leaf's error types (J4 owns the table and its weights per assignment). */
export const ERROR_TYPES = ['wrong_alignment', 'wrong_direction', 'wrong_man', 'wrong_depth', 'late', 'missed_check'] as const;
export type KnowledgeErrorType = (typeof ERROR_TYPES)[number];

/** D9.4.1 base probability from knowledge alone. */
export function baseErrorChance(n: KnowledgeNumbers, k: number): number {
  const g = 1 - k / num(n, 'scale.max');
  return num(n, 'errors.e') * g * g;
}

/** Difficulty 1 to 5 mapped linearly onto the leaf's factor range. */
export function difficultyFactor(n: KnowledgeNumbers, difficulty: number): number {
  const lo = num(n, 'items.difficultyMin');
  const hi = num(n, 'items.difficultyMax');
  const t = (Math.min(hi, Math.max(lo, difficulty)) - lo) / (hi - lo);
  const a = num(n, 'errors.difficultyFactorMin');
  return a + t * (num(n, 'errors.difficultyFactorMax') - a);
}

/** D9.4.1 processing delay in seconds. */
export function processingDelay(n: KnowledgeNumbers, k: number): number {
  return Math.max(0, num(n, 'errors.delayBelow') - k) * num(n, 'errors.delayPerPoint');
}

export interface ErrorChanceInput {
  readonly knowledge: number;
  readonly difficulty: number;
  readonly changedAtLine: boolean;
  /** J12 noise factor for the offense on the road; 1 when quiet. */
  readonly noise: number;
}

export function errorChance(n: KnowledgeNumbers, x: ErrorChanceInput): number {
  const p = baseErrorChance(n, x.knowledge) * difficultyFactor(n, x.difficulty) * (x.changedAtLine ? num(n, 'errors.lineChange') : 1) * x.noise;
  return Math.min(1, Math.max(0, p));
}

/** What J4 and J5 receive per player. */
export interface AssignmentDraw {
  readonly player: number;
  readonly knowledge: number;
  readonly chance: number;
  readonly error: KnowledgeErrorType | null;
  /** The item with the lowest knowledge, named on the film sheet ("did not know ..."). */
  readonly item: string | null;
  readonly delayS: number;
  /** Tag for the film sheet: knowledge errors are separate from discipline errors (D4.2.1). */
  readonly tag: 'knowledge';
}

/**
 * Draw knowledge errors for every assignment of a called play. Difficulty is the hardest item of the
 * assignment for the position; the line-change factor applies when the weakest item was changed at the line.
 */
export function drawPlayErrors(
  book: KnowledgeBook, assignments: readonly Assignment[], day: number, noise: number, rng: RandomStream,
  errorWeights: (a: Assignment) => readonly number[] = () => ERROR_TYPES.map(() => 1),
): AssignmentDraw[] {
  const n = book.n;
  const cat: ItemCatalogue = book.catalogue;
  return assignments.map((a) => {
    let k = num(n, 'scale.max');
    let weakest: string | null = null;
    let diff = num(n, 'items.difficultyMin');
    for (const i of a.items) {
      const v = book.value(a.player, i, day);
      if (weakest === null || v < k) { k = v; weakest = i; }
      if (cat.get(i)) diff = Math.max(diff, cat.difficulty(i, a.position));
    }
    const changed = weakest !== null && (a.changedAtLine ?? []).includes(weakest);
    const chance = errorChance(n, { knowledge: k, difficulty: diff, changedAtLine: changed, noise });
    const hit = rng.chance(chance);
    const error = hit ? ERROR_TYPES[rng.pick(errorWeights(a))]! : null;
    return { player: a.player, knowledge: k, chance, error, item: hit ? weakest : null, delayS: processingDelay(n, k), tag: 'knowledge' };
  });
}
