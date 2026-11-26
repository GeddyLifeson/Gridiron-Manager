// Fact rows behind the real-world counts this module leans on (Q6). Status is computed, never typed.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const BOSSES_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(BOSSES_FACTS.map((r) => [r.id, r] as const));

export function bossesFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`bosses: unknown fact ${id}`);
  return r;
}

export function bossesFactStatus(id: string): FactStatus {
  return computeStatus(bossesFact(id));
}

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function bossesFactProvisional(id: string): boolean {
  return bossesFactStatus(id) !== 'Verified';
}

/** The fact the arrangement odds are anchored on (L5.2.1). */
export const POWER_ODDS_FACT = 'F-bosses-0001';
