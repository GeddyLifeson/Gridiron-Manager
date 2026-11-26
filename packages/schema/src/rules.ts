// Rule-set files (B12.1.1, P4.7.1, P1.3.3) and the rule-key dictionary.
import { z } from 'zod';
import { pub } from './field.ts';
import { Level } from './entities.ts';

export const RuleKeyType = z.enum(['number', 'boolean', 'option']);

/** One entry of the key dictionary: name, type, unit, meaning, owner leaf, and which engine part reads it. */
export const RuleKeyDef = z.object({
  key: pub(z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/)),
  type: pub(RuleKeyType),
  unit: pub(z.string()).optional(),
  options: pub(z.array(z.string())).optional(),
  meaning: pub(z.string()),
  ownerLeaf: pub(z.string()),
  readBy: pub(z.array(z.string())),
});
export type RuleKeyDef = z.infer<typeof RuleKeyDef>;

export const RuleValue = z.object({
  key: pub(z.string()),
  value: pub(z.union([z.number(), z.boolean(), z.string()]), 'ratio'),
  unit: pub(z.string()).optional(),
  /** Register row (Q6.1.1). Every rule value is kind `fact` (Q6.2.1). */
  factId: pub(z.string().regex(/^F-[a-z-]+-\d{4}$/)),
  note: pub(z.string()).optional(),
});
export type RuleValue = z.infer<typeof RuleValue>;

export const RuleSetFile = z.object({
  ruleset_id: pub(z.string().regex(/^[a-z]+_\d{4}$/)),
  level: pub(Level),
  season_year: pub(z.number().int(), 'season_year'),
  parent: pub(z.string()).optional(),
  source: pub(z.object({ document: pub(z.string()), date: pub(z.string()) })),
  schema_version: pub(z.number().int().positive(), 'version'),
  values: pub(z.array(RuleValue)),
}).strict();
export type RuleSetFile = z.infer<typeof RuleSetFile>;

/** The resolved, read-only rule set handed to the engine (P1.3.3). Keys only; no level branching. */
export type RuleSet = {
  readonly id: string;
  readonly level: z.infer<typeof Level>;
  readonly seasonYear: number;
  num(key: string): number;
  bool(key: string): boolean;
  opt(key: string): string;
  keys(): readonly string[];
};
