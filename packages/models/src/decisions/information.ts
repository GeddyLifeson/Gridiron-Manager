// Capturing the information set (N3.1.2). Each decision prompt declares its sources. At confirmation the
// values of those sources are copied by value into the record, so a later correction to scouting data
// cannot change what the record says the coach knew. Hidden truth is refused here; it goes to the truth
// view only.
import type { InformationItem, JsonValue } from './types.ts';

/** A source a decision prompt declares (N3.1.2 "Each decision prompt declares its information sources"). */
export interface InformationSource {
  readonly source: string;
  /** Visibility of the source's data. `truth` is never copied into a record (N3.1.2). */
  readonly visibility: 'public' | 'own_team' | 'observer_estimate' | 'truth';
  /** Label key of something this source tells the coach that the model does not use (N3.3.1 rule 4). */
  readonly modelLacks?: string | null;
}

export class InformationError extends Error {}

/** Deep copy of a JSON value, frozen. Throws on anything that is not plain JSON (functions, NaN, cycles). */
export function freezeJson(v: unknown, path = '$', seen: Set<object> = new Set()): JsonValue {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new InformationError(`${path}: number is not finite`);
    return v;
  }
  if (typeof v !== 'object') throw new InformationError(`${path}: ${typeof v} is not JSON`);
  if (seen.has(v)) throw new InformationError(`${path}: cycle`);
  seen.add(v);
  let out: JsonValue;
  if (Array.isArray(v)) {
    out = Object.freeze(v.map((x, i) => freezeJson(x, `${path}[${i}]`, seen)));
  } else {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new InformationError(`${path}: not a plain object`);
    const o: Record<string, JsonValue> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined) continue;
      o[k] = freezeJson(x, `${path}.${k}`, seen);
    }
    out = Object.freeze(o);
  }
  seen.delete(v);
  return out;
}

/**
 * Builds the `information` field at confirmation.
 * - `current` holds each declared source's value as shown or available now.
 * - `viewed` names the sources the user had open. A declared source not viewed is kept and marked
 *   "available, not viewed" (N3.1.2 edge case).
 * A declared source with no current value is recorded as null (nothing was available).
 */
export function captureInformation(
  declared: readonly InformationSource[],
  current: Readonly<Record<string, unknown>>,
  viewed: ReadonlySet<string>,
): readonly InformationItem[] {
  const seen = new Set<string>();
  const items: InformationItem[] = [];
  for (const d of declared) {
    if (seen.has(d.source)) throw new InformationError(`source ${d.source} declared twice`);
    seen.add(d.source);
    if (d.visibility === 'truth') throw new InformationError(`source ${d.source} is hidden truth and may not enter the information set (N3.1.2)`);
    const value = Object.prototype.hasOwnProperty.call(current, d.source) ? freezeJson(current[d.source], d.source) : null;
    items.push(Object.freeze({ source: d.source, viewed: viewed.has(d.source), value, modelLacks: d.modelLacks ?? null }));
  }
  for (const v of viewed) if (!seen.has(v)) throw new InformationError(`viewed source ${v} was not declared by the prompt`);
  return Object.freeze(items);
}

/** Model-lacks notes of an information set, viewed or not, in declaration order (N3.3.1 rule 4). */
export function modelLacks(info: readonly InformationItem[]): readonly string[] {
  const out: string[] = [];
  for (const i of info) if (i.modelLacks && !out.includes(i.modelLacks)) out.push(i.modelLacks);
  return out;
}
