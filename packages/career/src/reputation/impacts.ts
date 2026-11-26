// The reputation event table (E5.1.2 rule 4): which logged world events move which audience, by how much.
// The table is data (impacts.json). Each row names the world event type an owning module writes, the actor
// role whose reputation moves, optional payload conditions, and a starting size per audience (E5.2.1 to
// E5.2.5, all Assumptions in the bible). Results are judged against expectation through the payload
// (`bands`: signed bands above expectation, E5.1.2 rule 6), never by the record alone.
import type { WorldEvent } from '@gm/schema';
import impactsJson from './impacts.json' with { type: 'json' };
import transferJson from './transfer.json' with { type: 'json' };
import { AUDIENCES, type AudienceId } from './audiences.ts';

export type Scalar = string | number | boolean | null;

export interface PayloadMatch {
  readonly key: string;
  readonly op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  readonly value: Scalar;
}

export interface ImpactRow {
  readonly kind: string;
  readonly eventType: string;
  /** Actor role on the event whose reputation moves. */
  readonly subjectRole: string;
  readonly sizes: Readonly<Partial<Record<AudienceId, number>>>;
  readonly match?: readonly PayloadMatch[];
  /** Per audience, a payload key whose absolute value multiplies the size (bands above expectation). */
  readonly scaleBy?: Readonly<Partial<Record<AudienceId, string>>>;
  /** Applies once per subject (E5.2.1 lame duck, removed authority). */
  readonly once?: boolean;
  /** Stored on the relationship with that party only, never in an audience (E5.2.3 edge case). */
  readonly partyOnly?: boolean;
  /** Fans of the event's team (`where.teamId`) rather than the national value (E5.2.5). */
  readonly fanBase?: boolean;
  /** Fixed reach overriding the audience default. */
  readonly reach?: number;
  readonly leaf: string;
}

export interface ImpactTable {
  readonly version: string;
  readonly rows: readonly ImpactRow[];
  /** Event types that move a coach between competitions: payload `fromCompetitionId`, `toCompetitionId`. */
  readonly transferEventTypes: readonly string[];
  /** Event types that retract an earlier event named by `causeId` (E5.1.2 edge case). */
  readonly retractionTypes: readonly string[];
  readonly byType: ReadonlyMap<string, readonly ImpactRow[]>;
}

/** Level-to-level transfer weights of the shared audiences (E5.7.1 rule 2), keyed `from>to` by level key. */
export type TransferTable = Readonly<Record<string, Readonly<Partial<Record<AudienceId, number>>>>>;

const OPS = new Set(['eq', 'gt', 'lt', 'gte', 'lte']);

/** Content-build check: a broken table throws at load, never at play time. */
export function impactTableProblems(raw: { rows: readonly ImpactRow[] }): string[] {
  const out: string[] = [];
  const kinds = new Set<string>();
  for (const r of raw.rows) {
    if (kinds.has(r.kind)) out.push(`duplicate kind ${r.kind}`);
    kinds.add(r.kind);
    if (!r.eventType) out.push(`${r.kind}: no event type`);
    const auds = Object.keys(r.sizes);
    if (auds.length === 0) out.push(`${r.kind}: no audience`);
    for (const a of auds) if (!AUDIENCES.includes(a as AudienceId)) out.push(`${r.kind}: unknown audience ${a}`);
    for (const a of Object.keys(r.scaleBy ?? {})) if (!auds.includes(a)) out.push(`${r.kind}: scaleBy for audience without a size ${a}`);
    for (const m of r.match ?? []) if (!OPS.has(m.op)) out.push(`${r.kind}: unknown op ${m.op}`);
    if (r.reach !== undefined && (r.reach < 0 || r.reach > 1)) out.push(`${r.kind}: reach outside 0 to 1`);
    if (r.fanBase && !auds.includes('fans')) out.push(`${r.kind}: fanBase without a fans size`);
  }
  return out;
}

export function buildImpactTable(raw: Omit<ImpactTable, 'byType'>): ImpactTable {
  const problems = impactTableProblems(raw);
  if (problems.length) throw new Error(`reputation impact table: ${problems.join('; ')}`);
  const byType = new Map<string, ImpactRow[]>();
  for (const r of raw.rows) {
    const list = byType.get(r.eventType) ?? [];
    list.push(r);
    byType.set(r.eventType, list);
  }
  return { ...raw, byType };
}

export const IMPACTS: ImpactTable = buildImpactTable(impactsJson as unknown as Omit<ImpactTable, 'byType'>);
export const TRANSFER: TransferTable = transferJson.pairs as TransferTable;

function test(m: PayloadMatch, v: Scalar | undefined): boolean {
  if (v === undefined) return false;
  if (m.op === 'eq') return v === m.value;
  if (typeof v !== 'number' || typeof m.value !== 'number') return false;
  if (m.op === 'gt') return v > m.value;
  if (m.op === 'lt') return v < m.value;
  if (m.op === 'gte') return v >= m.value;
  return v <= m.value;
}

export function rowMatches(r: ImpactRow, e: WorldEvent): boolean {
  return (r.match ?? []).every((m) => test(m, e.payload[m.key]));
}

/** Rows of the table that this event fires, in table order. */
export function rowsFor(table: ImpactTable, e: WorldEvent): ImpactRow[] {
  return (table.byType.get(e.type) ?? []).filter((r) => rowMatches(r, e));
}

/** Signed size for one audience after payload scaling. */
export function sizeFor(r: ImpactRow, a: AudienceId, e: WorldEvent): number {
  const base = r.sizes[a] ?? 0;
  const key = r.scaleBy?.[a];
  if (!key) return base;
  const v = e.payload[key];
  return typeof v === 'number' ? base * Math.abs(v) : base;
}
