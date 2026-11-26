// Fact rows behind the real-world numbers of the reputation module (Q6). Status is computed, never typed.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const REPUTATION_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;
const BY_ID = new Map(REPUTATION_FACTS.map((r) => [r.id, r] as const));

export const FACT = {
  hallElectShare: 'F-reputation-0001',
  hallCoachWaitSeasons: 'F-reputation-0002',
  hallCommitteeSize: 'F-reputation-0003',
  hallCoachFinalistsPerClass: 'F-reputation-0004',
} as const;

export function fact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`reputation: unknown fact ${id}`);
  return r;
}

export function factNumber(id: string): number {
  const v = fact(id).value;
  if (typeof v !== 'number') throw new Error(`reputation: fact ${id} is not a number`);
  return v;
}

export function factStatus(id: string): FactStatus { return computeStatus(fact(id)); }

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function isProvisional(id: string): boolean { return factStatus(id) !== 'Verified'; }
