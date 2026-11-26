// Fact rows behind the real-world numbers this module is calibrated against (Q6). Status is computed from
// the sources, never typed; anything short of Verified prints PROVISIONAL (Q6.3.1). K8 itself states that
// almost every constant is an Assumption; these rows are the calibration targets of E4.3.1 and E4.7.2.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const STAKEHOLDER_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows.map((r) => ({ ...r, status: computeStatus(r) }));

const BY_ID = new Map(STAKEHOLDER_FACTS.map((r) => [r.id, r] as const));

export function stakeholderFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`stakeholders: unknown fact ${id}`);
  return r;
}

export function stakeholderFactStatus(id: string): FactStatus {
  return computeStatus(stakeholderFact(id));
}

/** Q6.3.1: the label printed next to the number. */
export function stakeholderProvisional(id: string): '' | 'PROVISIONAL' {
  return stakeholderFactStatus(id) === 'Verified' ? '' : 'PROVISIONAL';
}
