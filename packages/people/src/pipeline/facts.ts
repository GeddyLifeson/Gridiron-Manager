// Fact rows behind every measured rate in the pipeline (Q6): T11.4.1 translation rates, pick supply, and the
// T11.5.1 movement targets. Built by research/college/make_pipeline_facts.py from the draft history file.
// Status is computed, never typed. The rows stay beside the module until the fact lint reads module files.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './facts.json' with { type: 'json' };
import idsJson from './fact-ids.json' with { type: 'json' };

export const PIPELINE_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

const BY_ID = new Map(PIPELINE_FACTS.map((r) => [r.id, r] as const));
const KEYS: Readonly<Record<string, string>> = idsJson;

/** Fact id for a pipeline key such as `round.1.starter3` or `group.QB.r1.starter5`. */
export function factIdFor(key: string): string {
  const id = KEYS[key];
  if (id === undefined) throw new Error(`pipeline: no fact for ${key}`);
  return id;
}

export function fact(id: string): FactRow {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`pipeline: unknown fact ${id}`);
  return r;
}

/** The number behind a pipeline key. */
export function rate(key: string): number {
  const v = fact(factIdFor(key)).value;
  if (typeof v !== 'number') throw new Error(`pipeline: fact for ${key} is not a number`);
  return v;
}

export function factStatus(id: string): FactStatus {
  return computeStatus(fact(id));
}

/** Anything short of Verified prints PROVISIONAL (Q6.3.1). */
export function isProvisional(key: string): boolean {
  return factStatus(factIdFor(key)) !== 'Verified';
}

export function hasRate(key: string): boolean {
  return KEYS[key] !== undefined;
}
