// Fact rows that back the real-world numbers of the life module (Q6). Status is computed, never typed.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const LIFE_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(LIFE_FACTS.map((r) => [r.id, r] as const));

export function lifeFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`life: unknown fact ${id}`);
  return r;
}

export function lifeFactNumber(id: string): number {
  const v = lifeFact(id).value;
  if (typeof v !== 'number') throw new Error(`life: fact ${id} is not a number`);
  return v;
}

export function lifeFactStatus(id: string): FactStatus {
  return computeStatus(lifeFact(id));
}

/** Recommended minimum nightly sleep for adults (F-life-0001). */
export const FACT_SLEEP_MIN = 'F-life-0001';
/** Long-working-hours threshold in hours a week (F-life-0002). */
export const FACT_LONG_HOURS = 'F-life-0002';
