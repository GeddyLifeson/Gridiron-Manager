// News items from log rows only (G-44 acceptance; C10, X12.2, P3.5.1). C10 creates no world state: every
// item points at the public X2 events it was built from, and an event that is not public never becomes a
// news item (it can still travel along edges as a delivery, ./delivery.ts). Rumors are not log rows and
// are never news items (X12.2.2).
import { NewsItem, guardClassOf, type EventTypeDef, type PersonOrigin, type WorldEvent } from '@gm/schema';
import { param } from './params.ts';

export interface NewsOptions {
  /** Event type definitions by id (the save's type registry). */
  readonly types: ReadonlyMap<string, EventTypeDef>;
  /** First id to issue; ids rise by one per item. */
  readonly firstId: number;
  /** Kinds that are always news whatever their notability (C10.3.1 rule 1: head coach and coordinator changes). */
  readonly alwaysNews?: (e: WorldEvent, def: EventTypeDef) => boolean;
  /** Origin of a person, for the protection guard (P3.2.2, X14.1.2). */
  readonly originOf?: (personId: number) => PersonOrigin | undefined;
}

export type SkipReason = 'not_public' | 'unknown_type' | 'below_floor' | 'protected';

export interface NewsBuild {
  readonly items: NewsItem[];
  readonly skipped: readonly { eventId: number; reason: SkipReason }[];
}

function scalarParams(p: WorldEvent['payload']): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(p)) if (v !== null) out[k] = v;
  return out;
}

/**
 * Builds news items from log rows, in log order. An item is made only from a public event of a known
 * type whose notability is at or above the floor (or that `alwaysNews` names). A personal or harmful
 * event touching an imported person is skipped even if a bad row got into the log (belt and braces on
 * top of the log's own check, W-28).
 */
export function newsFromEvents(rows: readonly WorldEvent[], opts: NewsOptions): NewsBuild {
  const items: NewsItem[] = [];
  const skipped: { eventId: number; reason: SkipReason }[] = [];
  let id = opts.firstId;
  for (const e of rows) {
    const def = opts.types.get(e.type);
    if (!def) { skipped.push({ eventId: e.id, reason: 'unknown_type' }); continue; }
    if (e.witnesses.kind !== 'public') { skipped.push({ eventId: e.id, reason: 'not_public' }); continue; }
    const persons = [...new Set([...e.actors.map((a) => a.personId), ...e.subjects.filter((s) => s.kind === 'person').map((s) => s.id)])];
    if (guardClassOf(def.harmClass) !== 'football' && persons.some((p) => opts.originOf?.(p) === 'imported')) {
      skipped.push({ eventId: e.id, reason: 'protected' });
      continue;
    }
    const always = opts.alwaysNews?.(e, def) ?? false;
    if (!always && (e.notability ?? 0) < param('newsNotabilityFloor')) { skipped.push({ eventId: e.id, reason: 'below_floor' }); continue; }
    const teams = [...new Set([...(e.where.teamId !== null ? [e.where.teamId] : []), ...e.subjects.filter((s) => s.kind === 'team').map((s) => s.id)])];
    items.push(NewsItem.parse({
      id: id++,
      date: { seasonYear: e.when.date.seasonYear, dayIndex: e.when.date.dayIndex },
      kind: e.type,
      subjectPersonIds: persons,
      subjectTeamIds: teams,
      templateKey: def.lineTemplate,
      params: scalarParams(e.payload),
      audience: 'media',
      sourceEventIds: [e.id],
    }));
  }
  return { items, skipped };
}

/**
 * G-44 acceptance check: every item cites at least one event that exists in the log and is public, and
 * no item is dated before its source. Returns the problems found.
 */
export function newsTraceProblems(items: readonly NewsItem[], rows: readonly WorldEvent[]): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: string[] = [];
  for (const it of items) {
    if (it.sourceEventIds.length === 0) out.push(`news ${it.id}: no source event`);
    for (const sid of it.sourceEventIds) {
      const e = byId.get(sid);
      if (!e) { out.push(`news ${it.id}: source ${sid} is not in the log`); continue; }
      if (e.witnesses.kind !== 'public') out.push(`news ${it.id}: source ${sid} is not public`);
      const d = e.when.date;
      if (it.date.seasonYear < d.seasonYear || (it.date.seasonYear === d.seasonYear && it.date.dayIndex < d.dayIndex)) out.push(`news ${it.id}: dated before its source`);
    }
  }
  return out;
}

/** C10.3.1 acceptance helper: every event matching `isHeadCoachChange` has a news item. */
export function missingCarouselItems(rows: readonly WorldEvent[], items: readonly NewsItem[], isHeadCoachChange: (e: WorldEvent) => boolean): number[] {
  const covered = new Set(items.flatMap((i) => i.sourceEventIds));
  return rows.filter((e) => isHeadCoachChange(e) && !covered.has(e.id)).map((e) => e.id);
}
