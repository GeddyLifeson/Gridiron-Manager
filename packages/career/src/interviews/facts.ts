// Fact rows behind what real interviews cover and how teams weigh fit (Q6). Status is computed from
// the sources, never typed. Anything short of Verified prints PROVISIONAL (Q6.3.1).
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const INTERVIEW_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(INTERVIEW_FACTS.map((r) => [r.id, r] as const));

export function interviewFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`interviews: unknown fact ${id}`);
  return r;
}

export const interviewFactStatus = (id: string): FactStatus => computeStatus(interviewFact(id));
export const interviewFactProvisional = (id: string): boolean => interviewFactStatus(id) !== 'Verified';
