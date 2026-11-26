// Fact rows that back every real-world number in the wealth module (Q6). Status is computed, never typed.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const WEALTH_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(WEALTH_FACTS.map((r) => [r.id, r] as const));

export function fact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`wealth: unknown fact ${id}`);
  return r;
}

export function factNumber(id: string): number {
  const v = fact(id).value;
  if (typeof v !== 'number') throw new Error(`wealth: fact ${id} is not a number`);
  return v;
}

export function factString(id: string): string {
  const v = fact(id).value;
  if (typeof v !== 'string') throw new Error(`wealth: fact ${id} is not a string`);
  return v;
}

export function factStatus(id: string): FactStatus {
  return computeStatus(fact(id));
}

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function isProvisional(id: string): boolean {
  return factStatus(id) !== 'Verified';
}

/** A tax or rate row may ship only when it is not in conflict and has at least one real source. */
export function isShippable(id: string): boolean {
  const s = factStatus(id);
  return s !== 'Conflict' && s !== 'Unverified';
}

/** "0:0.10,12400:0.12" to ordered [startUsd, rate] pairs. */
export function parseSchedule(s: string): { readonly from: number; readonly rate: number }[] {
  return s.split(',').map((part) => {
    const [a, b] = part.split(':');
    return { from: Number(a), rate: Number(b) };
  });
}
