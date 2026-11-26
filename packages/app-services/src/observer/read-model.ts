// Read models (P1.3.2): what a screen may show, already filtered and labelled. A builder receives an
// ObservedWorld and parameters and returns plain data. The registry refuses a model whose data schema
// has a truth-class field or an unclassed field, so the Q1.4.2 scan cannot be bypassed by forgetting it.
import { Permission, ValueMeta } from '@gm/schema';
import { ObservedWorld } from './observed-world.ts';
import type { Observer, TableSource } from './observer.ts';
import { canonical, pathsOfClass, plainClone, walkSchema, type Schema } from './schema-walk.ts';

export type PermissionValue = ReturnType<typeof Permission.parse>;
export type ValueMetaData = ReturnType<typeof ValueMeta.parse>;
export type Params = Readonly<Record<string, string | number | boolean | null>>;

export interface ReadModelSpec<P extends Params = Params, D = unknown> {
  /** Model name, the part of the key before the parameters (`depthChart`). */
  readonly name: string;
  /** Schema of `data`. Every field carries a visibility class; none may be truth. */
  readonly data: Schema;
  /** S3 task ids that decide the permission state shown with the model (O7.1.1). */
  readonly taskIds?: readonly string[];
  build(world: ObservedWorld, params: P): { data: D; meta?: Record<string, ValueMetaData> };
}

export interface ReadModelEnvelope<D = unknown> {
  key: string;
  version: number;
  permission: PermissionValue;
  data: D;
  meta: Record<string, ValueMetaData>;
}

/** Yours, Assigned, Suggest or Read for these tasks and this observer. The S3 packages supply the real one. */
export type PermissionResolver = (observer: Observer, taskIds: readonly string[]) => PermissionValue;
export const READ_ONLY: PermissionResolver = () => 'Read';

export class ReadModelError extends Error {}

/** `name(a=1,b="x")` with parameters in key order (P1.3.2 "model name plus parameters"). */
export function readModelKey(name: string, params: Params = {}): string {
  const parts = Object.keys(params).sort().map((k) => `${k}=${JSON.stringify(params[k])}`);
  return `${name}(${parts.join(',')})`;
}

/** Problems that bar a data schema from being a read model. Empty when it may be registered. */
export function readModelSchemaProblems(name: string, data: Schema): string[] {
  const out = pathsOfClass(data, 'truth').map((p) => `${name}${p}: class truth in a read model (P1.1.4, Q1.4.2)`);
  walkSchema(data, (n) => { if (n.isField && !n.vis) out.push(`${name}${n.path}: no visibility class (P3.1.2)`); });
  return out;
}

export class ReadModelRegistry {
  private readonly specs = new Map<string, ReadModelSpec<any, any>>();

  register<P extends Params, D>(spec: ReadModelSpec<P, D>): this {
    if (!/^[a-z][A-Za-z0-9]*$/.test(spec.name)) throw new ReadModelError(`read model name ${spec.name}: use lowerCamelCase`);
    if (this.specs.has(spec.name)) throw new ReadModelError(`read model ${spec.name} is registered twice`);
    const problems = readModelSchemaProblems(spec.name, spec.data);
    if (problems.length) throw new ReadModelError(problems.join('; '));
    this.specs.set(spec.name, spec);
    return this;
  }

  get(name: string): ReadModelSpec {
    const s = this.specs.get(name);
    if (!s) throw new ReadModelError(`unknown read model ${name}`);
    return s;
  }

  names(): string[] { return [...this.specs.keys()].sort(); }
  /** Data schemas by name, for the truth scan (Q1.4.2). */
  schemas(): Record<string, Schema> { return Object.fromEntries([...this.specs].map(([k, v]) => [k, v.data])); }
}

export interface BuildOptions {
  readonly permission?: PermissionResolver;
  /** Check the builder's output against its schema. On in development and tests; a release build may turn it off (P2.2.1). */
  readonly validate?: boolean;
}

export interface BuiltModel<D = unknown> {
  model: ReadModelEnvelope<D>;
  /** Tables the builder read. */
  inputs: string[];
}

type Parser = { safeParse(v: unknown): { success: true; data: unknown } | { success: false; error: { message: string } } };

/** Builds one read model for one observer. `version` is filled by the hub; a direct build gets 0. */
export function buildReadModel<D = unknown>(
  registry: ReadModelRegistry, source: TableSource, observer: Observer, name: string, params: Params = {}, opts: BuildOptions = {},
): BuiltModel<D> {
  const spec = registry.get(name);
  const world = new ObservedWorld(source, observer);
  const built = spec.build(world, params);
  const data = plainClone(built.data, `${name}.data`);
  const meta = plainClone(built.meta ?? {}, `${name}.meta`);
  if (opts.validate !== false) {
    const r = (spec.data as unknown as Parser).safeParse(data);
    if (!r.success) throw new ReadModelError(`read model ${name}: data does not match its schema: ${r.error.message}`);
    // A non-strict schema strips keys it does not name. A builder that returns such a key has a bug that could be a leak.
    if (canonical(r.data) !== canonical(data)) throw new ReadModelError(`read model ${name}: the builder returned fields its schema does not name`);
    for (const [k, m] of Object.entries(meta)) {
      const mr = (ValueMeta as unknown as Parser).safeParse(m);
      if (!mr.success || canonical(mr.data) !== canonical(m)) throw new ReadModelError(`read model ${name}: meta for ${k} is not a ValueMeta (O6.5.1)`);
    }
  }
  const permission = (opts.permission ?? READ_ONLY)(observer, spec.taskIds ?? []);
  return { model: { key: readModelKey(name, params), version: 0, permission, data: data as D, meta }, inputs: world.tablesRead() };
}

/** A `readModel` message of the thread protocol (P2.2.1). The worker layer adds `seq`. */
export interface ReadModelMessage { kind: 'readModel'; body: ReadModelEnvelope }

interface Subscription {
  name: string;
  params: Params;
  key: string;
  version: number;
  text: string | null;
  inputs: Set<string> | null;
  dirty: boolean;
}

/**
 * Subscriptions and versions (P1.3.2, P2.2.1). A model is rebuilt only when a command or a simulation
 * step touched a table its builder read, and a message goes out only when its content changed.
 */
export class ReadModelHub {
  private readonly subs = new Map<string, Subscription>();

  constructor(
    private readonly registry: ReadModelRegistry,
    private readonly source: TableSource,
    private observer: Observer,
    private readonly opts: BuildOptions = {},
  ) {}

  subscribe(name: string, params: Params = {}): string {
    this.registry.get(name);
    const key = readModelKey(name, params);
    if (!this.subs.has(key)) this.subs.set(key, { name, params, key, version: 0, text: null, inputs: null, dirty: true });
    return key;
  }

  unsubscribe(key: string): void { this.subs.delete(key); }

  subscribed(): string[] { return [...this.subs.keys()].sort(); }

  /** Call after a command or simulation step with the tables it wrote. */
  touch(tables: Iterable<string>): void {
    const t = new Set(tables);
    for (const s of this.subs.values()) if (!s.inputs || [...s.inputs].some((x) => t.has(x))) s.dirty = true;
  }

  touchAll(): void { for (const s of this.subs.values()) s.dirty = true; }

  /** A change of seat (a new job, a second window for another role) rebuilds everything for the new observer. */
  setObserver(observer: Observer): void {
    this.observer = observer;
    this.touchAll();
  }

  /** Rebuilds what is dirty and returns one message per model whose content or permission changed. */
  flush(): ReadModelMessage[] {
    const out: ReadModelMessage[] = [];
    for (const s of [...this.subs.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      if (!s.dirty) continue;
      const built = buildReadModel(this.registry, this.source, this.observer, s.name, s.params, this.opts);
      s.dirty = false;
      s.inputs = new Set(built.inputs);
      const text = canonical({ p: built.model.permission, d: built.model.data, m: built.model.meta });
      if (text === s.text) continue;
      s.text = text;
      s.version += 1;
      out.push({ kind: 'readModel', body: { ...built.model, version: s.version } });
    }
    return out;
  }
}
