// Event type registry (X2.1.2). Types are content: the registry checks each file and refuses the set
// when a type breaks a rule, so the content build fails (X2.1.2 acceptance).
import { EventTypeDef, eventTypeProblems, type HarmClass } from '@gm/schema';
import { HISTORY_MODULE, LOWEST_TIER } from './params.ts';

/** The summary row compaction writes in place of many detail rows (X2.1.3 rule 3, X2.4.1 rule 5). */
export const HISTORY_SUMMARY_TYPE = 'history_summary';

/** Reversal types (X2.1.3 rule 1): each points at the row it reverses through `causeId`. */
export const REVERSAL_TYPES: readonly string[] = ['result_vacated', 'stat_corrected', 'award_rescinded'];

/** Families compaction never folds (X2.4.1 rule 4). */
export const NEVER_COMPACTED_FAMILIES: readonly string[] = ['career', 'honors', 'world', 'relationship', 'discipline'];

/** Families a reversal may belong to (X2.1.3 rule 1). */
export const REVERSAL_FAMILIES: readonly string[] = ['world', 'honors'];

export const HISTORY_SUMMARY_DEF: EventTypeDef = {
  id: HISTORY_SUMMARY_TYPE,
  family: 'world',
  payloadSchema: {},
  witnessRule: 'public',
  lineTemplate: 'history.summary.line',
  harmClass: 'none',
  importedAllowed: true,
  minTier: LOWEST_TIER,
  consumers: [HISTORY_MODULE, 'models.labels'],
  compactable: false,
};

export interface TypeRegistry {
  get(id: string): EventTypeDef | undefined;
  has(id: string): boolean;
  ids(): string[];
}

export type RegistryResult = { ok: true; registry: TypeRegistry } | { ok: false; problems: string[] };

/**
 * Build the registry. Problems: a file that fails the schema, a duplicate id, no consumer, a personal or
 * harmful type open to imported people, a reversal type outside the world and honors families, and a
 * never-compacted family marked compactable. The summary type is always present.
 */
export function buildTypeRegistry(defs: readonly unknown[]): RegistryResult {
  const problems: string[] = [];
  const map = new Map<string, EventTypeDef>();
  map.set(HISTORY_SUMMARY_TYPE, HISTORY_SUMMARY_DEF);
  defs.forEach((d, i) => {
    const parsed = EventTypeDef.safeParse(d);
    if (!parsed.success) {
      const id = typeof d === 'object' && d !== null && 'id' in d ? String((d as { id: unknown }).id) : `#${i}`;
      problems.push(`event type ${id}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      return;
    }
    const t = parsed.data;
    if (map.has(t.id)) { problems.push(`event type ${t.id}: duplicate id`); return; }
    problems.push(...eventTypeProblems(t));
    if (REVERSAL_TYPES.includes(t.id) && !REVERSAL_FAMILIES.includes(t.family)) problems.push(`event type ${t.id}: a reversal must be in the world or honors family (X2.1.3 rule 1)`);
    if (t.compactable && NEVER_COMPACTED_FAMILIES.includes(t.family)) problems.push(`event type ${t.id}: family ${t.family} is never compacted (X2.4.1 rule 4)`);
    map.set(t.id, t);
  });
  if (problems.length) return { ok: false, problems };
  const ids = [...map.keys()].sort();
  return { ok: true, registry: { get: (id) => map.get(id), has: (id) => map.has(id), ids: () => [...ids] } };
}

/** Throwing form for callers that hold already-checked content. */
export function typeRegistry(defs: readonly unknown[]): TypeRegistry {
  const r = buildTypeRegistry(defs);
  if (!r.ok) throw new Error(`event type registry refused:\n${r.problems.join('\n')}`);
  return r.registry;
}

/** L9.1.2 guard class is derived, never stored (X2.1.2 rule 2). Re-exported for readers of a registry. */
export function isProtectedHarm(h: HarmClass): boolean {
  return h === 'personal' || h === 'harmful';
}
