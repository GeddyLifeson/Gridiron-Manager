// The observer filter (P1.1.4, P1.3.2, K9.1.1). One function decides what one observer may read of
// any value described by a contract schema:
//   public             kept
//   own_team           kept for an owner of the row (./ownership.ts)
//   observer_estimate  kept for the owner of the estimate
//   truth              never kept
// The filter is a whitelist: a key the schema does not name, a field with no class and a shape the
// filter cannot read are all dropped. There is no option that releases truth (Q1.4.2).
import type { Visibility } from '@gm/schema';
import { EMPTY_LOOKUP, type Observer, type WorldLookup } from './observer.ts';
import { isOwner, ownerRuleOf, type OwnerEnv, type OwnerRule, type Owners } from './ownership.ts';
import { isPlainObject, peel, plainClone, stricter, type Schema } from './schema-walk.ts';

/** A filtered value: any field may be missing. */
export type Seen<T> =
  T extends readonly (infer U)[] ? Seen<U>[]
    : T extends object ? { [K in keyof T]?: Seen<T[K]> }
      : T;

export interface FilterOptions {
  readonly lookup?: WorldLookup;
  /** Team ids by side, for sim shapes that carry a side and no game id. */
  readonly sideTeams?: readonly [number, number] | null;
  /** Owner of a value whose shape has no rule of its own (a lone call object). */
  readonly owners?: Owners;
  /** Collects what was removed and why, for tests and the audit. */
  readonly report?: FilterReport;
}

export interface FilterReport {
  dropped: { path: string; reason: 'truth' | 'not_owner' | 'unclassified' | 'unknown_key' | 'unreadable' | 'hidden_row' }[];
}

export const newReport = (): FilterReport => ({ dropped: [] });

const DROP = Symbol('drop');
type Out = unknown | typeof DROP;

interface Ctx {
  observer: Observer;
  env: OwnerEnv;
  report: FilterReport | undefined;
  /** Ownership granted by the caller for the root value (FilterOptions.owners). */
  rootOwn: boolean;
}

interface Frame {
  /** Is the observer an owner of the enclosing row or scope? */
  own: boolean;
  rule: OwnerRule | undefined;
  /** The value the rule is attached to. */
  row: unknown;
  /** Path of the current node relative to `row`. */
  rel: string;
  /** Class forced on the node by the rule's `tighten`, if any. */
  forced?: Visibility;
}

const join = (rel: string, step: string) => (rel === '' ? step.replace(/^\./, '') : rel + step);

function allowed(vis: Visibility, own: boolean): 'yes' | 'truth' | 'not_owner' {
  if (vis === 'public') return 'yes';
  if (vis === 'truth') return 'truth';
  return own ? 'yes' : 'not_owner';
}

function node(schema: Schema, value: unknown, path: string, isField: boolean, frame: Frame, ctx: Ctx): Out {
  const p = peel(schema);
  let vis = p.meta?.vis;
  if (frame.forced) vis = vis ? stricter(vis, frame.forced) : frame.forced;
  if (!vis && isField) { ctx.report?.dropped.push({ path, reason: 'unclassified' }); return DROP; }
  if (vis) {
    const a = allowed(vis, frame.own);
    if (a !== 'yes') { ctx.report?.dropped.push({ path, reason: a }); return DROP; }
  }
  if (value === null || value === undefined) return value;

  switch (p.type) {
    case 'object': {
      if (!isPlainObject(value)) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
      let f = frame;
      const rule = ownerRuleOf(p.inner);
      if (rule) {
        // A shape with its own rule starts a new ownership context, unless a parent scope already set one for it.
        const scoped = frame.rule?.scopes?.[frame.rel];
        const own = scoped ? frame.own : (path === '$' && ctx.rootOwn) || isOwner(ctx.observer, rule.owners(value, ctx.env));
        if (!scoped && rule.hideUnlessOwner && !own) { ctx.report?.dropped.push({ path, reason: 'hidden_row' }); return DROP; }
        f = { own, rule, row: value, rel: '' };
      }
      const shape = p.def.shape as Record<string, Schema>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (!(key in shape)) { ctx.report?.dropped.push({ path: `${path}.${key}`, reason: 'unknown_key' }); continue; }
        const r = child(shape[key]!, value[key], `${path}.${key}`, `.${key}`, true, f, ctx);
        if (r !== DROP) out[key] = r;
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(value)) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
      const out: unknown[] = [];
      value.forEach((v, i) => {
        const r = child(p.def.element as Schema, v, `${path}[${i}]`, '[]', false, frame, ctx);
        if (r !== DROP) out.push(r);
      });
      return out;
    }
    case 'tuple': {
      const items = p.def.items as Schema[];
      if (!Array.isArray(value)) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const s = items[i] ?? (p.def.rest as Schema | null);
        const r = s ? child(s, value[i], `${path}(${i})`, '()', false, frame, ctx) : DROP;
        // A tuple with a hole would shift positions: drop it whole.
        if (r === DROP) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
        out.push(r);
      }
      return out;
    }
    case 'record': {
      if (!isPlainObject(value)) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const r = child(p.def.valueType as Schema, v, `${path}{${k}}`, '{}', false, frame, ctx);
        if (r !== DROP) out[k] = r;
      }
      return out;
    }
    case 'union': {
      if (typeof value !== 'object') return value;
      const opt = pickOption(p.def.options as Schema[], p.def.discriminator as string | undefined, value);
      if (!opt) { ctx.report?.dropped.push({ path, reason: 'unreadable' }); return DROP; }
      return node(opt, value, path, false, frame, ctx);
    }
    case 'intersection': case 'pipe': case 'transform': case 'custom': case 'function': case 'promise': case 'map': case 'set':
      ctx.report?.dropped.push({ path, reason: 'unreadable' });
      return DROP;
    default:
      // Scalars, enums, literals, and `unknown` leaves the contract classed as a whole.
      return plainClone(value, path);
  }
}

/** Steps to a child node, applying the enclosing rule's scope and tighten entries for the child's path. */
function child(schema: Schema, value: unknown, path: string, step: string, isField: boolean, frame: Frame, ctx: Ctx): Out {
  const rel = join(frame.rel, step);
  const next: Frame = { own: frame.own, rule: frame.rule, row: frame.row, rel };
  const forced = frame.rule?.tighten?.[rel];
  if (forced) next.forced = forced;
  const scope = frame.rule?.scopes?.[rel];
  if (scope && value !== null && value !== undefined) {
    next.own = isOwner(ctx.observer, scope.owners(value, frame.row, ctx.env));
    if (scope.hideUnlessOwner && !next.own) { ctx.report?.dropped.push({ path, reason: 'hidden_row' }); return DROP; }
  }
  return node(schema, value, path, isField, next, ctx);
}

export function pickOption(options: Schema[], discriminator: string | undefined, value: object): Schema | undefined {
  if (discriminator && isPlainObject(value)) {
    for (const o of options) {
      const p = peel(o);
      if (p.type !== 'object') continue;
      const d = (p.def.shape as Record<string, Schema>)[discriminator];
      if (!d) continue;
      const lit = peel(d);
      if (lit.type === 'literal' && (lit.def.values as unknown[]).includes(value[discriminator])) return o;
      if (lit.type === 'enum' && Object.values(lit.def.entries as Record<string, unknown>).includes(value[discriminator])) return o;
    }
    return undefined;
  }
  return options.find((o) => (o as unknown as { safeParse(v: unknown): { success: boolean } }).safeParse(value).success);
}

/**
 * Returns the part of `value` the observer may read, as new plain data, or `undefined` when the
 * observer may read none of it. `schema` must be the contract schema that describes `value`.
 */
export function filterValue<T>(schema: Schema, value: T, observer: Observer, opts: FilterOptions = {}): Seen<T> | undefined {
  const rootOwn = opts.owners ? isOwner(observer, opts.owners) : false;
  const ctx: Ctx = { observer, env: { lookup: opts.lookup ?? EMPTY_LOOKUP, sideTeams: opts.sideTeams ?? null }, report: opts.report, rootOwn };
  const out = node(schema, value, '$', false, { own: rootOwn, rule: undefined, row: value, rel: '' }, ctx);
  return out === DROP ? undefined : (out as Seen<T>);
}

/** Filters a list of rows, leaving out rows the observer may not know exist. */
export function filterRows<T>(schema: Schema, rows: readonly T[], observer: Observer, opts: FilterOptions = {}): Seen<T>[] {
  const out: Seen<T>[] = [];
  for (const r of rows) {
    const f = filterValue(schema, r, observer, opts);
    if (f !== undefined) out.push(f);
  }
  return out;
}
