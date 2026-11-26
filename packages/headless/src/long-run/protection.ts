// Q1.6.2 imported-people protection scan (A6.3.1, X14). Events, generated text and family records are
// scanned for anything protected landing on a person with origin `imported`. The one decision function
// is `mayReceiveEvent` (schema); the people package owns the person ids of an event and the text scan.
import { importing } from '@gm/people';
import { mayReceiveEvent, type EventTypeDef, type WorldEvent } from '@gm/schema';
import type { PersonView, WorldView } from './types.ts';

export interface ProtectionHit {
  readonly kind: 'event' | 'text' | 'family' | 'history_run';
  readonly personId: number;
  readonly detail: string;
}

export type EventTypeLookup = (id: string) => Pick<EventTypeDef, 'importedAllowed' | 'harmClass'> | undefined;

export function importedIds(world: Pick<WorldView, 'people'>): Set<number> {
  const out = new Set<number>();
  for (const p of world.people.values()) if (p.origin === 'imported') out.add(p.id);
  return out;
}

/** Protected events on imported people among `events` (an unknown type counts as protected, A6.3.1 rule 6). */
export function protectedEventHits(
  events: Iterable<Pick<WorldEvent, 'id' | 'type' | 'actors' | 'subjects'>>, people: ReadonlyMap<number, Pick<PersonView, 'origin'>>, typeOf: EventTypeLookup,
): ProtectionHit[] {
  const hits: ProtectionHit[] = [];
  for (const e of events) {
    for (const pid of importing.eventPersonIds(e)) {
      const p = people.get(pid);
      if (!p || mayReceiveEvent(p, typeOf(e.type))) continue;
      hits.push({ kind: 'event', personId: pid, detail: `event ${e.id} type ${e.type}` });
    }
  }
  return hits;
}

/** Protected topics or quotations in generated text near an imported person's name (A6.3.1 rule 5). */
export function protectedTextHits(texts: readonly string[], world: Pick<WorldView, 'people'>): ProtectionHit[] {
  const imported = [...world.people.values()].filter((p) => p.origin === 'imported');
  if (imported.length === 0) return [];
  const byName = new Map(imported.map((p) => [`${p.name.first} ${p.name.last}`, p.id]));
  const names = imported.map((p) => ({ first: p.name.first, last: p.name.last }));
  const hits: ProtectionHit[] = [];
  for (const t of texts) {
    for (const f of importing.scanProtectedText(t, names)) {
      hits.push({ kind: 'text', personId: byName.get(f.name) ?? 0, detail: `${f.kind}${f.topic ? ` (${f.topic})` : ''}: ${f.sentence}` });
    }
  }
  return hits;
}

/** Q1.6.2 edge case: family is never imported or invented for a real person. A family member sharing an imported person's household is a hit. */
export function inventedFamilyHits(world: Pick<WorldView, 'people'>): ProtectionHit[] {
  const householdOwner = new Map<number, number>();
  for (const p of world.people.values()) {
    const h = p.life?.householdId ?? null;
    if (p.origin === 'imported' && h !== null) householdOwner.set(h, p.id);
  }
  const hits: ProtectionHit[] = [];
  if (householdOwner.size === 0) return hits;
  for (const p of world.people.values()) {
    const h = p.life?.householdId ?? null;
    if (h === null || p.origin === 'imported' || !p.roles.includes('family')) continue;
    const owner = householdOwner.get(h);
    if (owner !== undefined) hits.push({ kind: 'family', personId: owner, detail: `family member ${p.id} shares household ${h}` });
  }
  return hits;
}

/** A6.3.1 rule 4 / X14.4.2: the pre-career history run writes nothing onto imported people. */
export function historyRunHits(world: Pick<WorldView, 'people' | 'log'>, careerStart: { seasonYear: number; dayIndex: number }): ProtectionHit[] {
  const ids = importedIds(world);
  if (ids.size === 0) return [];
  const rows = world.log.rows();
  const byId = new Map(rows.map((e) => [e.id, e]));
  return importing.historyRunViolations(rows, ids, careerStart).map((eventId) => {
    const e = byId.get(eventId);
    const pid = e ? importing.eventPersonIds(e).find((id) => ids.has(id)) ?? 0 : 0;
    return { kind: 'history_run' as const, personId: pid, detail: `event ${eventId} before the career start` };
  });
}
