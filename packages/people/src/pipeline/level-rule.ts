// The level rule in the pipeline (T11.1.1, T4.7.1, D6.4.5 rule 1). One record per player for life, one
// absolute scale. Entering the pros (or dropping a level, or going to coach) changes the job or roster row's
// level and team, never an attribute. Honours are X2 events that feed reputation, media boards and general
// managers' interest only: no function in this module takes an honour and returns an attribute.
import type { PersonRecord } from '@gm/schema';
import { p } from './params.ts';

/** Moves between levels that the rule covers in both directions (T11.1.1 rules 2 and 6). */
export const LEVEL_MOVES = ['draft', 'undrafted_signing', 'transfer_down', 'transfer_up', 'to_coaching'] as const;
export type LevelMove = (typeof LEVEL_MOVES)[number];

/** Parts of the playing block that hold true values (D6.1): none may change at a level move. */
const TRUE_PARTS = ['attributes', 'ceilings', 'tests', 'hidden', 'conditioning', 'heightIn', 'weightLb'] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return false;
    if (!sameValue((a as Record<string, unknown>)[ka[i]!], (b as Record<string, unknown>)[kb[i]!])) return false;
  }
  return true;
}

/**
 * Paths of true playing values that differ between two snapshots of one person (T11.1.1 acceptance: the day
 * before and the day after the draft). Empty means the rule held. Leaf-level paths such as
 * `playing.attributes.speed` are listed.
 */
export function levelMoveDiff(before: Pick<PersonRecord, 'id' | 'playing'>, after: Pick<PersonRecord, 'id' | 'playing'>): string[] {
  if (before.id !== after.id) throw new Error('a level move keeps one record per player for life (T11.1.1 rule 1)');
  const a = before.playing;
  const b = after.playing;
  if (a === undefined || b === undefined) return a === b ? [] : ['playing'];
  const out: string[] = [];
  for (const part of TRUE_PARTS) {
    const x = a[part] as unknown;
    const y = b[part] as unknown;
    if (typeof x === 'object' && x !== null && typeof y === 'object' && y !== null) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of [...keys].sort()) {
        if (!sameValue((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k])) out.push(`playing.${part}.${k}`);
      }
    } else if (!sameValue(x, y)) {
      out.push(`playing.${part}`);
    }
  }
  return out;
}

/** Throws when a level move touched a true value. The world loop calls it around the draft and transfers. */
export function assertLevelMoveKeepsTruth(move: LevelMove, before: Pick<PersonRecord, 'id' | 'playing'>, after: Pick<PersonRecord, 'id' | 'playing'>): void {
  const diff = levelMoveDiff(before, after);
  if (diff.length > 0) throw new Error(`${move} changed true values (T11.1.1): ${diff.join(', ')}`);
}

/** Who may read honours (T11.1.1 rule 3). Attributes and their growth are not on the list. */
export const HONOUR_CONSUMERS = ['reputation', 'media_board', 'gm_interest'] as const;
export type HonourConsumer = (typeof HONOUR_CONSUMERS)[number];

/**
 * A general manager's draft interest in a prospect (T11.1.1 rule 5, AI use): his board grade plus a pull
 * from honours scaled by his K7 disposition `honourWeight` (0 to 1, truth on the AI executive). Interest
 * orders a board; it is not a grade and never writes to an estimate or an attribute. Managers who weight
 * honours heavily over-draft decorated players, which is how real drafts miss.
 */
export function draftInterest(input: { readonly boardGrade: number; readonly honourCount: number; readonly honourWeight: number }): number {
  const w = input.honourWeight < 0 ? 0 : input.honourWeight > 1 ? 1 : input.honourWeight;
  const cap = p('honours.cap');
  const n = input.honourCount < 0 ? 0 : input.honourCount > cap ? cap : input.honourCount;
  return input.boardGrade + w * n * p('honours.interestIssPerHonour');
}
