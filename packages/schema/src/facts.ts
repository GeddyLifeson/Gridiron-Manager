// Fact register rows (Q6.1.1) and computed status (Q6.1.2).
import { z } from 'zod';
import { pub } from './field.ts';

export const FactDomain = z.enum(['rule', 'league-rule', 'measured-rate', 'physical', 'coaching-convention', 'medical', 'career', 'technical']);

export const FactStatus = z.enum(['Verified', 'Rulebook only', '2 of 3', '1 of 3', 'Unverified', 'Conflict', 'Assumption']);
export type FactStatus = z.infer<typeof FactStatus>;

export const FactSource = z.object({
  citation: pub(z.string()),
  locator: pub(z.string()),
  dateRead: pub(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  howRead: pub(z.enum(['primary text', 'dataset computed', 'secondary summary', 'model knowledge'])),
  independenceGroup: pub(z.string()),
  /** Is this the official primary source for the fact (the rule book for a rule)? */
  primary: pub(z.boolean()),
  /** Exact words copied from the source; the quote lint re-finds them in the source text when it is present. */
  quote: pub(z.string()).optional(),
  /** Value this source supports, when it supports a number or option. */
  value: pub(z.union([z.number(), z.boolean(), z.string()]), 'ratio').optional(),
});
export type FactSource = z.infer<typeof FactSource>;

export const FactRow = z.object({
  id: pub(z.string().regex(/^F-[a-z-]+-\d{4}$/)),
  level: pub(z.enum(['pro', 'college', 'both'])),
  domain: pub(FactDomain),
  statement: pub(z.string()),
  value: pub(z.union([z.number(), z.boolean(), z.string()]), 'ratio').optional(),
  unit: pub(z.string()).optional(),
  validFor: pub(z.string()),
  sources: pub(z.array(FactSource)),
  status: pub(FactStatus),
  /** Set only for design rows: Assumption is a design choice and is never promoted. */
  assumption: pub(z.boolean()).optional(),
  usedBy: pub(z.array(z.string())),
  notes: pub(z.string()).optional(),
  statusHistory: pub(z.array(z.object({ date: pub(z.string()), status: pub(FactStatus), reason: pub(z.string()) }))),
}).strict();
export type FactRow = z.infer<typeof FactRow>;

export const FactFile = z.object({
  domain: pub(FactDomain),
  rows: pub(z.array(FactRow)),
});

/** Q6.1.2: status is computed from sources, never typed. */
export function computeStatus(row: Pick<FactRow, 'sources' | 'value' | 'assumption'>): FactStatus {
  if (row.assumption) return 'Assumption';
  const read = row.sources.filter((s) => s.howRead !== 'model knowledge');
  if (read.length === 0) return 'Unverified';
  const values = read.filter((s) => s.value !== undefined).map((s) => s.value);
  if (row.value !== undefined && values.some((v) => v !== row.value)) return 'Conflict';
  const groups = new Set(read.map((s) => s.independenceGroup));
  const primary = read.some((s) => s.primary && s.howRead === 'primary text');
  if (groups.size >= 3) return 'Verified';
  if (primary && groups.size >= 2) return 'Verified';
  if (primary) return 'Rulebook only';
  if (groups.size === 2) return '2 of 3';
  return '1 of 3';
}

/** Statuses that a rule value may ship with (Q6.3.1, P4.7.1). */
export function ruleStatusShippable(s: FactStatus): boolean {
  return s === 'Verified' || s === 'Rulebook only';
}
