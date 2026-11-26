// Mixing real and generated people (U5, X14.2.2, D13.5.2). The pack changes how many generated people are needed,
// never how good each one is (U5.1.2): this file only counts. The generator draws fills at full profile.
import type { PersonRecord } from '@gm/schema';

/** U5.1.1 groups. High school recruits have no setting: always generated (rule 3). */
export const MIX_GROUPS = ['pro_players', 'college_players', 'pro_head_coaches', 'college_head_coaches', 'assistant_coaches', 'officials', 'staff'] as const;
export type MixGroup = (typeof MIX_GROUPS)[number];
export type MixSetting = 'real_where_available' | 'generated_only';
export type MixConfig = Readonly<Record<MixGroup, MixSetting>>;

export const DEFAULT_MIX: MixConfig = Object.freeze(Object.fromEntries(MIX_GROUPS.map((g) => [g, 'real_where_available' as MixSetting])) as Record<MixGroup, MixSetting>);

/** Rule 1 and 2: how many generated people a group needs after the real ones are placed. */
export function fillNeed(group: MixGroup, worldNeed: number, realPlaced: number, mix: MixConfig): number {
  const real = mix[group] === 'generated_only' ? 0 : realPlaced;
  return Math.max(0, worldNeed - real);
}

/**
 * U5.2.1 rules 2 and 3: a delta pack adds only people new to the world by source key; the generated cohort of
 * the same group shrinks by the number of real entrants. A certified career accepts no delta (rule 4).
 */
export function deltaEntrants(deltaKeys: readonly string[], inWorld: ReadonlySet<string>, opts: { certified: boolean }): { entrants: string[]; skipped: string[]; refused: boolean } {
  if (opts.certified) return { entrants: [], skipped: [...deltaKeys], refused: true };
  const entrants: string[] = [], skipped: string[] = [];
  for (const k of [...new Set(deltaKeys)].sort()) (inWorld.has(k) ? skipped : entrants).push(k);
  return { entrants, skipped, refused: false };
}

export function cohortAfterEntrants(cohortSize: number, realEntrants: number): number {
  return Math.max(0, cohortSize - realEntrants);
}

/** Lower-cased full name for the collision guard. */
const fullName = (n: { first: string; last: string }) => `${n.first} ${n.last}`.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Collision guard (D13.5.2, U5.2.3 rule 3, D13.6.1 step 6): generated people whose full name equals an imported
 * person's. The caller renames them; a generated person keeps `origin: generated` and no protection (X14.1.1 edge case).
 */
export function nameCollisions(world: readonly Pick<PersonRecord, 'id' | 'origin' | 'name'>[]): number[] {
  const real = new Set(world.filter((p) => p.origin === 'imported').map((p) => fullName(p.name)));
  return world.filter((p) => p.origin !== 'imported' && real.has(fullName(p.name))).map((p) => p.id).sort((a, b) => a - b);
}

// ---- X14.2.2 two record lists ----

export interface RecordRow { personId: number; value: number }

/**
 * "This world" counts only X2 log totals; "Including prior careers" adds prior block totals for display only.
 * X4, L6 and trophies read the first list alone.
 */
export function recordLists(worldTotals: ReadonlyMap<number, number>, priorTotals: ReadonlyMap<number, number>, top: number): { thisWorld: RecordRow[]; includingPrior: RecordRow[] } {
  const rank = (m: Map<number, number>) => [...m.entries()].map(([personId, value]) => ({ personId, value })).sort((a, b) => b.value - a.value || a.personId - b.personId).slice(0, top);
  const combined = new Map(worldTotals);
  for (const [id, v] of priorTotals) combined.set(id, (combined.get(id) ?? 0) + v);
  return { thisWorld: rank(new Map([...worldTotals].filter(([, v]) => v > 0))), includingPrior: rank(combined) };
}
