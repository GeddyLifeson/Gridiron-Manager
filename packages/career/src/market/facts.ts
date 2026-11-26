// Fact rows behind the real-world numbers the market uses as calibration targets (Q6). Status is
// computed from the sources, never typed. Anything short of Verified prints PROVISIONAL (Q6.3.1).
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };

export const MARKET_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(MARKET_FACTS.map((r) => [r.id, r] as const));

export function marketFact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`market: unknown fact ${id}`);
  return r;
}

export function marketFactNumber(id: string): number {
  const v = marketFact(id).value;
  if (typeof v !== 'number') throw new Error(`market: fact ${id} is not a number`);
  return v;
}

export const marketFactStatus = (id: string): FactStatus => computeStatus(marketFact(id));
export const marketFactProvisional = (id: string): boolean => marketFactStatus(id) !== 'Verified';
