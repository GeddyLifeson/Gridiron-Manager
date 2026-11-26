// Scheme knowledge and install numbers (D9, G5). Every constant lives in params.json with its basis and
// leaf; code here holds no football number (P1.1.2). Nearly all are Assumptions per D9 ("No project
// research measures learning or cohesion"), so status is `starting` and `constrainedBy` names the target.
import { ParamFile, type ParamTable } from '@gm/schema';
import paramsFile from './params.json' with { type: 'json' };

export const MODULE = 'league.knowledge';
export const PARAMS: ParamFile = ParamFile.parse(paramsFile);

/** Full parameter name from its short name. */
export const p = (short: string): string => `${MODULE}.${short}`;

/** Everything a knowledge function reads numbers from. */
export interface KnowledgeNumbers {
  readonly params: ParamTable;
}

/** A number table over this module's file, with optional overrides by short name. */
export function knowledgeNumbers(overrides: Readonly<Record<string, number>> = {}): KnowledgeNumbers {
  const values = new Map<string, number>();
  for (const row of PARAMS.params) values.set(row.name, row.value);
  for (const [k, v] of Object.entries(overrides)) {
    if (!values.has(p(k))) throw new Error(`parameter override ${k} names no parameter`);
    values.set(p(k), v);
  }
  return {
    params: {
      version: `${PARAMS.module}@${PARAMS.version}`,
      num(name: string): number {
        const v = values.get(name);
        if (v === undefined) throw new Error(`unknown parameter ${name}`);
        return v;
      },
      has: (name: string): boolean => values.has(name),
    },
  };
}

const cache = new WeakMap<KnowledgeNumbers, Map<string, number>>();

/** Short-name reader: `num(n, 'errors.e')`. */
export function num(n: KnowledgeNumbers, short: string): number {
  let m = cache.get(n);
  if (!m) { m = new Map(); cache.set(n, m); }
  let v = m.get(short);
  if (v === undefined) { v = n.params.num(p(short)); m.set(short, v); }
  return v;
}

/** Clamp to the knowledge scale. */
export function clampK(n: KnowledgeNumbers, k: number): number {
  return Math.min(num(n, 'scale.max'), Math.max(0, k));
}
