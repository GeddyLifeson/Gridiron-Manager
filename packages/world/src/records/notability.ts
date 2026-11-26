// X4 notability in the world. The score is computed once at emit (X4.1.1 rule 4) through the log's
// `notabilityOf` hook, which the composition root passes to `createWorld`: `worldNotability()`. Weekly step 5
// then indexes the week's scored rows into career rollups per person (X4.2.2): counts by band, honour
// counters, and the top events. A rollup is an index of ids and counts, never a judgment; it can be rebuilt
// from the log (`rebuildRollups`). The hall reads the honour counters (`honoursOf`, HallBinding.honours).
import { awards } from '@gm/league';
import type { EventTypeDef, WorldEvent } from '@gm/schema';
import { TITLE_WON } from '../loop/events.ts';
import type { LiveWorld, StepHandler } from '../loop/types.ts';
import { RECORDS_CONTENT, type RecordsContent } from './statistics.ts';

/** `LiveWorld.systemState` key of the rollup index. */
export const NOTABILITY_KEY = 'notability';

/** What a row alone tells the X4.1.1 terms. Expectation, streaks and edges are not held off-screen yet. */
export function contextOf(row: WorldEvent, c: RecordsContent = RECORDS_CONTENT): awards.NotabilityContext {
  if (row.type === TITLE_WON) return { stakes: ['title'] };
  if (row.type === awards.HONOUR.record) return { record: String(row.payload['recordId']).endsWith(c.franchiseSuffix) ? 'team' : 'level' };
  return {};
}

/** The log hook for `createWorld({ notabilityOf })`. */
export function worldNotability(c: RecordsContent = RECORDS_CONTENT): (draft: WorldEvent, def: EventTypeDef) => number {
  return awards.notabilityFor((row) => contextOf(row, c));
}

/** One person's career rollup (X4.2.2), plain data. `top` holds [eventId, score, seasonYear, dayIndex]. */
export interface PersonRollup {
  readonly bands: Record<string, number>;
  readonly honours: Record<string, number>;
  readonly seasons: number[];
  top: [number, number, number, number][];
}
export interface NotabilityState {
  /** Next log id to read. */
  cursor: number;
  readonly people: Record<string, PersonRollup>;
}

export function notabilityOf(world: LiveWorld): NotabilityState {
  let s = world.systemState.get(NOTABILITY_KEY) as NotabilityState | undefined;
  if (!s) { s = { cursor: 1, people: {} }; world.systemState.set(NOTABILITY_KEY, s); }
  return s;
}

const HONOUR_TYPES = new Set<string>([...Object.values(awards.HONOUR), TITLE_WON]);

/** Rows the index takes: honours, and anything at or over the noted band (routine rows stay in the log only). */
export function indexed(row: WorldEvent): boolean {
  return row.notability !== null && (HONOUR_TYPES.has(row.type) || row.notability >= awards.param('notability.band.noted'));
}

function personsOf(e: WorldEvent): number[] {
  const s = new Set<number>(e.actors.map((a) => a.personId));
  for (const x of e.subjects) if (x.kind === 'person') s.add(x.id);
  return [...s].sort((a, b) => a - b);
}

/** X4.2.2 field 1 ordering: score, then event time, then id. */
function byScore(a: [number, number, number, number], b: [number, number, number, number]): number {
  return b[1] - a[1] || a[2] - b[2] || a[3] - b[3] || a[0] - b[0];
}

/** Fold rows into the index, using league.awards' own rollup for counters (one call per batch). */
export function foldRows(state: NotabilityState, rows: readonly WorldEvent[]): number {
  const take = rows.filter(indexed);
  if (take.length === 0) return 0;
  const topCareer = awards.param('rollup.topCareer');
  for (const r of awards.seasonRollups(take)) {
    const p = state.people[r.subjectId] ??= { bands: {}, honours: {}, seasons: [], top: [] };
    for (const [k, v] of Object.entries(r.countsByBand)) if (v) p.bands[k] = (p.bands[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.honourCounters)) if (k !== awards.COUNTER.vacated && v) p.honours[k] = (p.honours[k] ?? 0) + v;
    if (!p.seasons.includes(r.seasonYear)) p.seasons.push(r.seasonYear);
  }
  for (const e of take) for (const id of personsOf(e)) {
    const p = state.people[id]!;
    p.top.push([e.id, e.notability ?? 0, e.when.date.seasonYear, e.when.date.dayIndex]);
    p.top.sort(byScore);
    if (p.top.length > topCareer) p.top.length = topCareer;
  }
  return take.length;
}

/** Weekly step 5 (X12.1.1): index every row logged since the last pass. */
export function notabilityStep(): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const s = notabilityOf(world);
    const rows: WorldEvent[] = [];
    for (let id = s.cursor; id < world.log.nextId; id++) { const r = world.log.get(id); if (r) rows.push(r); }
    s.cursor = world.log.nextId;
    return { read: rows.length, indexed: foldRows(s, rows), people: Object.keys(s.people).length };
  };
}

/** The index rebuilt from rows alone (X4.2.2 acceptance: rebuilding reproduces the stored rows). */
export function rebuildRollups(rows: readonly WorldEvent[]): NotabilityState {
  const s: NotabilityState = { cursor: 1, people: {} };
  foldRows(s, rows);
  return s;
}

/** Career honour counters of a person, for the hall (HallBinding.honours). Empty when he has none. */
export function honoursOf(world: LiveWorld, personId: number): Readonly<Record<string, number>> {
  return notabilityOf(world).people[personId]?.honours ?? {};
}
