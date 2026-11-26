// Fact rows behind the measured question mix (Q6). Status is computed from the sources, never typed;
// anything short of Verified prints PROVISIONAL (Q6.3.1). Built by research/press/make_facts.py.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const PRESS_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows.map((r) => ({ ...r, status: computeStatus(r) }));

const BY_ID = new Map(PRESS_FACTS.map((r) => [r.id, r] as const));

export function pressFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`press: unknown fact ${id}`);
  return r;
}

export function pressFactStatus(id: string): FactStatus {
  return computeStatus(pressFact(id));
}

/** Q6.3.1: the label printed next to a measured number. */
export function pressProvisional(id: string): '' | 'PROVISIONAL' {
  return pressFactStatus(id) === 'Verified' ? '' : 'PROVISIONAL';
}
