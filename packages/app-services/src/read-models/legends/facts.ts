// Fact rows behind the real-world numbers of the legends views (Q6): record book qualifiers (X3.4.1
// rule 3). Status is computed from sources, never typed; anything short of Verified prints PROVISIONAL
// (Q6.3.1). The rows stay beside the module until the fact register lint reads module-local files.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const LEGENDS_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;
const BY_ID = new Map(LEGENDS_FACTS.map((r) => [r.id, r] as const));

export function fact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`legends: unknown fact ${id}`);
  return r;
}

export function factStatus(id: string): FactStatus { return computeStatus(fact(id)); }
export function isProvisional(id: string): boolean { return factStatus(id) !== 'Verified'; }

export function factValue(id: string): number {
  const v = fact(id).value;
  if (typeof v !== 'number') throw new Error(`legends: fact ${id} holds no number`);
  return v;
}
