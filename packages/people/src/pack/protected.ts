// A6.3.1: events that are never generated for, or stored on, an imported person. The list is content
// (packages/people/data/people-pack-schema/protected-events.json) so it can be audited. A pack is football facts only; one
// that carries an event row of a protected kind fails validation and nothing of it is imported.
import { PROTECTED_EVENT_TYPES, ALLOWED_FOOTBALL_EVENTS } from './spec.ts';

/** Splits a name into lower-case words: "Event_Type" gives ["event", "type"]. */
export function words(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
}

/** The protected type a text names, or undefined. Matches whole words and underscore joined words. */
export function protectedTypeOf(text: string): string | undefined {
  const lower = text.toLowerCase();
  const tokens = new Set(words(text).flatMap((w) => (w.length > 3 && w.endsWith('s') ? [w, w.slice(0, -1)] : [w])));
  for (const t of PROTECTED_EVENT_TYPES) {
    for (const w of t.words) {
      if (w.includes('_') ? lower.replace(/[^a-z_]+/g, '_').includes(w) : tokens.has(w)) return t.id;
    }
  }
  return undefined;
}

const EVENT_NAME_WORDS: ReadonlySet<string> = new Set(['event', 'events', 'incident', 'incidents', 'eventlog']);

/** A table or column name that says "event" or "incident": an event row, which a pack may not carry. */
export function isEventName(name: string): boolean {
  return words(name).some((w) => EVENT_NAME_WORDS.has(w));
}

/** Football events may reach an imported person; anything not listed is protected (A6.3.1 rule 6). */
export function isAllowedFootballEvent(eventType: string): boolean {
  return ALLOWED_FOOTBALL_EVENTS.includes(eventType) && protectedTypeOf(eventType) === undefined;
}
