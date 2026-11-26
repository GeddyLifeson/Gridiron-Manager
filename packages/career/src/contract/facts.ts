// Fact rows behind every real-world number in the contract module (Q6). Status is computed, never typed.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const CONTRACT_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(CONTRACT_FACTS.map((r) => [r.id, r] as const));

export function contractFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`contract: unknown fact ${id}`);
  return r;
}

export function contractFactNumber(id: string): number {
  const v = contractFact(id).value;
  if (typeof v !== 'number') throw new Error(`contract: fact ${id} is not a number`);
  return v;
}

export function contractFactStatus(id: string): FactStatus {
  return computeStatus(contractFact(id));
}

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function contractFactProvisional(id: string): boolean {
  return contractFactStatus(id) !== 'Verified';
}
