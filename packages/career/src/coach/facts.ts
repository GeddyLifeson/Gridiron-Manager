// Fact rows behind the real-world shares the coach module uses (Q6). Status is computed, never typed;
// anything short of Verified prints PROVISIONAL (Q6.3.1).
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const COACH_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(COACH_FACTS.map((r) => [r.id, r] as const));

export function coachFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`coach: unknown fact ${id}`);
  return r;
}

export function coachFactStatus(id: string): FactStatus {
  return computeStatus(coachFact(id));
}

export function isProvisional(id: string): boolean {
  return coachFactStatus(id) !== 'Verified';
}

/** "a:0.1,b:0.2" to a map of shares. */
export function shareMap(id: string): ReadonlyMap<string, number> {
  const v = coachFact(id).value;
  if (typeof v !== 'string') throw new Error(`coach: fact ${id} is not a share list`);
  return new Map(v.split(',').map((part) => {
    const [k, n] = part.split(':');
    return [k ?? '', Number(n)] as const;
  }));
}

/** College head coach shortcut: where the last seat came from (E1.6.1). */
export const FACT_COLLEGE_LAST_SEAT = 'F-coach-0001';
/** Professional head coach shortcut: where the last seat came from (E1.6.1). */
export const FACT_PRO_LAST_SEAT = 'F-coach-0002';
