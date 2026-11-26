// The append-only event log (X2.1.1, X2.1.3). One emit path for every system; no update or delete path
// exists. A correction is a new row whose `causeId` points at the original (X2.1.3 rule 1). Compaction
// (./compact.ts) is the one permitted rewrite and builds a new log from its output.
import {
  WorldEvent, SeasonLogHash, mayReceiveEvent,
  type EventTypeDef, type PersonOrigin, type WitnessRule, type WorldDate, type WorldTier,
} from '@gm/schema';
import { EMPTY_SEASON_HASH, chainHash } from './hash.ts';
import { HISTORY_SUMMARY_TYPE, REVERSAL_FAMILIES, REVERSAL_TYPES, type TypeRegistry } from './registry.ts';

/** Keys a payload may never hold (X2.1.1 acceptance: no traits field; W-06 stores traits as `traitBlock`). */
export const FORBIDDEN_PAYLOAD_KEYS: readonly string[] = ['traitBlock', 'traits', 'facets', 'values', 'goals', 'label', 'labelId', 'labels'];

export type Scalar = string | number | boolean | null;

/** What a system hands to `emit`. The log assigns the id; notability comes from the fan-out hook (W-17). */
export interface EmitInput {
  readonly type: string;
  readonly date: WorldDate;
  readonly period?: number | null;
  readonly clockTenths?: number | null;
  readonly competitionId?: number | null;
  readonly teamId?: number | null;
  readonly venueId?: number | null;
  readonly actors?: readonly { personId: number; role: string }[];
  readonly subjects?: readonly WorldEvent['subjects'][number][];
  readonly payload?: Readonly<Record<string, Scalar>>;
  readonly witnesses: WitnessRule;
  readonly causeId?: number | null;
  readonly tier: WorldTier;
  readonly source: WorldEvent['source'];
}

export type EmitResult =
  | { ok: true; event: WorldEvent }
  | { ok: false; code: 'unknown_type' | 'below_min_tier' | 'payload' | 'protected' | 'order' | 'cause' | 'witness' | 'schema'; reason: string };

export interface EventLogOptions {
  readonly registry: TypeRegistry;
  /** Origin of a person, for the imported-person protection (P3.2.2, X14.1.2). Unknown people pass. */
  readonly originOf?: (personId: number) => PersonOrigin | undefined;
  /** Registered label ids; a payload string equal to one is refused (X2.1.1 acceptance). */
  readonly labelIds?: ReadonlySet<string>;
  /** X4 notability, scored inside the emit fan-out before the row is appended (W-17). */
  readonly notabilityOf?: (draft: WorldEvent, def: EventTypeDef) => number | null;
  /** Run the schema parser on every row (default true). */
  readonly validateRows?: boolean;
}

export type Subscriber = (event: WorldEvent, def: EventTypeDef) => void;

interface SeasonChain { year: number; count: number; lastId: number | null; hashHex: string }

function dateCmp(a: WorldDate, b: WorldDate): number {
  return a.seasonYear !== b.seasonYear ? a.seasonYear - b.seasonYear : a.dayIndex - b.dayIndex;
}

/** People an event lands on: its actors and its person subjects. */
export function personIdsOf(e: Pick<WorldEvent, 'actors' | 'subjects'>): number[] {
  const out = new Set<number>();
  for (const a of e.actors) out.add(a.personId);
  for (const s of e.subjects) if (s.kind === 'person') out.add(s.id);
  return [...out];
}

function payloadProblem(def: EventTypeDef, payload: Readonly<Record<string, Scalar>>, labelIds: ReadonlySet<string> | undefined): string | null {
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(k)) return `payload key ${k} is a label or traits field (X2.1.1 rule 2)`;
    const v = payload[k];
    if (typeof v === 'string' && labelIds?.has(v)) return `payload ${k} holds label id ${v} (X2.1.1 rule 2)`;
  }
  if (def.id === HISTORY_SUMMARY_TYPE) return null;
  const want = def.payloadSchema;
  for (const k of Object.keys(payload)) if (!(k in want)) return `payload key ${k} is not in type ${def.id}`;
  for (const [k, kind] of Object.entries(want)) {
    const v = payload[k];
    if (v === undefined) return `payload key ${k} missing for type ${def.id}`;
    if (v === null) continue;
    const ok = kind === 'string' ? typeof v === 'string'
      : kind === 'number' ? typeof v === 'number' && Number.isFinite(v)
      : kind === 'boolean' ? typeof v === 'boolean'
      : kind === 'id' ? typeof v === 'number' && Number.isInteger(v) && v > 0
      : typeof v === 'string' && /^-?\d+:\d+$/.test(v);
    if (!ok) return `payload ${k} should be ${kind} for type ${def.id}`;
  }
  return null;
}

export class EventLog {
  readonly #opts: EventLogOptions;
  readonly #rows: WorldEvent[] = [];
  readonly #index = new Map<number, number>();
  readonly #byPerson = new Map<number, number[]>();
  readonly #byType = new Map<string, number[]>();
  readonly #seasons = new Map<number, SeasonChain>();
  readonly #subs: Subscriber[] = [];
  #nextId = 1;

  constructor(opts: EventLogOptions) { this.#opts = opts; }

  /** Rebuild a log from saved rows, re-running every check and recomputing the season hashes. */
  static fromRows(rows: readonly WorldEvent[], opts: EventLogOptions): EventLog {
    const log = new EventLog(opts);
    for (const r of rows) {
      const res = log.#append(r, true);
      if (!res.ok) throw new Error(`saved event ${r.id} refused: ${res.reason}`);
    }
    return log;
  }

  get registry(): TypeRegistry { return this.#opts.registry; }
  get size(): number { return this.#rows.length; }
  /** The id the next emitted row receives. */
  get nextId(): number { return this.#nextId; }

  /** X2.1.1 fan-out: called once per appended row, in append order. */
  subscribe(fn: Subscriber): () => void {
    this.#subs.push(fn);
    return () => { const i = this.#subs.indexOf(fn); if (i >= 0) this.#subs.splice(i, 1); };
  }

  emit(input: EmitInput): EmitResult {
    const draft: WorldEvent = {
      id: this.#nextId,
      type: input.type,
      when: { date: { seasonYear: input.date.seasonYear, dayIndex: input.date.dayIndex }, period: input.period ?? null, clockTenths: input.clockTenths ?? null },
      competitionId: input.competitionId ?? null,
      where: { teamId: input.teamId ?? null, venueId: input.venueId ?? null },
      actors: (input.actors ?? []).map((a) => ({ personId: a.personId, role: a.role })),
      subjects: (input.subjects ?? []).map((s) => ({ kind: s.kind, id: s.id })),
      payload: { ...(input.payload ?? {}) },
      witnesses: JSON.parse(JSON.stringify(input.witnesses)) as WitnessRule,
      causeId: input.causeId ?? null,
      notability: null,
      tier: input.tier,
      source: input.source,
    };
    return this.#append(draft, false);
  }

  /**
   * A reversal (X2.1.3 rule 1): a new row of a reversal type pointing at the original. Readers apply it at
   * read time (`reversedIds`). The original row is never touched.
   */
  reverse(originalId: number, input: Omit<EmitInput, 'causeId'>): EmitResult {
    if (!REVERSAL_TYPES.includes(input.type)) return { ok: false, code: 'cause', reason: `${input.type} is not a reversal type` };
    return this.emit({ ...input, causeId: originalId });
  }

  #append(row: WorldEvent, restoring: boolean): EmitResult {
    const def = this.#opts.registry.get(row.type);
    if (!def) return { ok: false, code: 'unknown_type', reason: `no event type ${row.type}` };
    if (row.tier > def.minTier) return { ok: false, code: 'below_min_tier', reason: `type ${row.type} is not emitted at tier ${row.tier} (min tier ${def.minTier})` };
    if (def.id !== HISTORY_SUMMARY_TYPE && row.witnesses.kind !== def.witnessRule) return { ok: false, code: 'witness', reason: `type ${row.type} has witness rule ${def.witnessRule}, got ${row.witnesses.kind}` };
    const pp = payloadProblem(def, row.payload, this.#opts.labelIds);
    if (pp) return { ok: false, code: 'payload', reason: pp };
    const originOf = this.#opts.originOf;
    if (originOf) {
      for (const pid of personIdsOf(row)) {
        const origin = originOf(pid);
        if (origin && !mayReceiveEvent({ origin }, def)) return { ok: false, code: 'protected', reason: `type ${row.type} may not land on imported person ${pid} (A6.3.1)` };
      }
    }
    const last = this.#rows[this.#rows.length - 1];
    if (restoring) {
      if (last && row.id <= last.id) return { ok: false, code: 'order', reason: `id ${row.id} is not above ${last.id}` };
    } else if (row.id !== this.#nextId) return { ok: false, code: 'order', reason: `id ${row.id} is not the next id` };
    if (last && dateCmp(row.when.date, last.when.date) < 0) return { ok: false, code: 'order', reason: `event ${row.id} is dated before event ${last.id} (simulation order, X2.1.1 rule 4)` };
    if (row.causeId !== null && !this.#index.has(row.causeId)) return { ok: false, code: 'cause', reason: `cause ${row.causeId} is not an earlier event` };
    if (REVERSAL_TYPES.includes(row.type) && (row.causeId === null || !REVERSAL_FAMILIES.includes(def.family))) return { ok: false, code: 'cause', reason: `reversal ${row.type} needs a cause` };
    let final = row;
    if (!restoring && this.#opts.notabilityOf) final = { ...row, notability: this.#opts.notabilityOf(row, def) };
    if (this.#opts.validateRows !== false) {
      const p = WorldEvent.safeParse(final);
      if (!p.success) return { ok: false, code: 'schema', reason: p.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ') };
    }
    const frozen = deepFreeze(final);
    const at = this.#rows.length;
    this.#rows.push(frozen);
    this.#index.set(frozen.id, at);
    for (const pid of personIdsOf(frozen)) push(this.#byPerson, pid, at);
    push(this.#byType, frozen.type, at);
    const year = frozen.when.date.seasonYear;
    const chain = this.#seasons.get(year) ?? { year, count: 0, lastId: null, hashHex: EMPTY_SEASON_HASH };
    chain.count += 1;
    chain.lastId = frozen.id;
    chain.hashHex = chainHash(chain.hashHex, frozen);
    this.#seasons.set(year, chain);
    this.#nextId = frozen.id + 1;
    for (const s of this.#subs) s(frozen, def);
    return { ok: true, event: frozen };
  }

  get(id: number): WorldEvent | undefined {
    const i = this.#index.get(id);
    return i === undefined ? undefined : this.#rows[i];
  }

  /** All rows in append order. The array is a copy; rows are frozen. */
  rows(): WorldEvent[] { return [...this.#rows]; }

  /** Rows that land on a person (actor or person subject), in order. */
  forPerson(personId: number): WorldEvent[] { return (this.#byPerson.get(personId) ?? []).map((i) => this.#rows[i]!); }

  ofType(type: string): WorldEvent[] { return (this.#byType.get(type) ?? []).map((i) => this.#rows[i]!); }

  /** Ids reversed by a later reversal row (X2.1.3 rule 2: readers apply reversals at read time). */
  reversedIds(): Set<number> { return reversedIds(this.#rows); }

  /** Per-season running hashes for the save (X2.1.3 rule 4), oldest season first. */
  seasonHashes(): SeasonLogHash[] {
    return [...this.#seasons.values()].sort((a, b) => a.year - b.year).map((c) => SeasonLogHash.parse({ year: c.year, eventCount: c.count, lastEventId: c.lastId, hashHex: c.hashHex }));
  }
}

/** Ids of rows that a reversal row points at. */
export function reversedIds(rows: readonly WorldEvent[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows) if (r.causeId !== null && REVERSAL_TYPES.includes(r.type)) out.add(r.causeId);
  return out;
}

/** Seasons whose stored hash does not match the rows (N4 tamper check). A missing or extra season counts. */
export function tamperedSeasons(rows: readonly WorldEvent[], stored: readonly SeasonLogHash[]): number[] {
  const fresh = new Map<number, SeasonChain>();
  for (const r of rows) {
    const y = r.when.date.seasonYear;
    const c = fresh.get(y) ?? { year: y, count: 0, lastId: null, hashHex: EMPTY_SEASON_HASH };
    c.count += 1; c.lastId = r.id; c.hashHex = chainHash(c.hashHex, r);
    fresh.set(y, c);
  }
  const bad = new Set<number>();
  const seen = new Set<number>();
  for (const s of stored) {
    seen.add(s.year);
    const c = fresh.get(s.year);
    if (!c || c.hashHex !== s.hashHex || c.count !== s.eventCount || c.lastId !== s.lastEventId) bad.add(s.year);
  }
  for (const y of fresh.keys()) if (!seen.has(y)) bad.add(y);
  return [...bad].sort((a, b) => a - b);
}

function push<K>(m: Map<K, number[]>, k: K, v: number): void {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}
