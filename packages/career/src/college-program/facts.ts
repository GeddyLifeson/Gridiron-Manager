// Fact rows behind every real-world number in the college program module (Q6). Status is computed
// from the sources, never typed; anything short of Verified prints PROVISIONAL (Q6.3.1).
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const PROGRAM_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows.map((r) => ({ ...r, status: computeStatus(r) }));

const BY_ID = new Map(PROGRAM_FACTS.map((r) => [r.id, r] as const));

export function programFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`college-program: unknown fact ${id}`);
  return r;
}

export function programFactNumber(id: string): number {
  const v = programFact(id).value;
  if (typeof v !== 'number') throw new Error(`college-program: fact ${id} is not a number`);
  return v;
}

export function programFactStatus(id: string): FactStatus {
  return computeStatus(programFact(id));
}

/** Q6.3.1: the label a screen or report prints next to the number. */
export function provisionalLabel(id: string): '' | 'PROVISIONAL' {
  return programFactStatus(id) === 'Verified' ? '' : 'PROVISIONAL';
}
