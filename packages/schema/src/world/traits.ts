// World contract, part 2: the X1 block every person carries (X1.1.1 to X1.1.4, P3.2.2).
// TRUTH ONLY. No interface module may import or read these numbers (X1.1.1 rule 2); people are known
// on screen by X2 labels over logged behaviour, never by these values.
import { z } from 'zod';
import { pub, truth } from '../field.ts';
import { zScale, zYear } from './primitives.ts';

/** X1.1.1: facets 0 to 100 (50 is the middle), values -50 to +50 (0 is the middle). */
export const FACET_MIN = 0;
export const FACET_MAX = 100;
export const VALUE_MIN = -50;
export const VALUE_MAX = 50;
/** X1.1.1 outputs and X1.1.4: up to 3 goal records per person. */
export const MAX_GOALS = 3;

/** X1.1.4 goal record. `target` is free text or a content ref (a rung, a role, an honour). */
export const GoalRecord = z.object({
  goalId: truth(z.string().min(1)),
  target: truth(z.string()),
  /** Season year by which the person wants it, or null (X1.1.4 outputs). */
  byYear: zYear('truth').nullable(),
  intensity: zScale(0, 100, 'X1.1.4 intensity'),
  status: truth(z.enum(['active', 'met', 'dropped'])),
}).strict();
export type GoalRecord = z.infer<typeof GoalRecord>;

/**
 * The trait block (X1.1.1 outputs). Stored under the key `traitBlock`, not `traits`: the forbidden-key
 * lint bans a key named `traits` because picked traits are ruled out (A3.1.1), and this block is
 * generated truth, never picked (W-06). The user's person has `source: user` and empty maps.
 */
export const TraitBlock = z.object({
  facets: truth(z.record(z.string(), z.number().int().min(FACET_MIN).max(FACET_MAX)), 'index'),
  values: truth(z.record(z.string(), z.number().int().min(VALUE_MIN).max(VALUE_MAX)), 'index'),
  goals: truth(z.array(GoalRecord).max(MAX_GOALS)),
  schemaVersion: pub(z.number().int().positive(), 'version'),
  source: truth(z.enum(['generated', 'imported_neutral', 'user'])),
}).strict().superRefine((b, ctx) => {
  if (b.source === 'user' && (Object.keys(b.facets).length > 0 || Object.keys(b.values).length > 0)) {
    ctx.addIssue({ code: 'custom', message: 'the user person has empty facet and value maps (X1.1.1 rule 3)', path: ['facets'] });
  }
});
export type TraitBlock = z.infer<typeof TraitBlock>;
