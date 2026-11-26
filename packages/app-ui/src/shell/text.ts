// Shell strings (O6.6.1): every user-facing string comes from text.json by id, with named slots.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

export function hasText(id: string): boolean { return Object.prototype.hasOwnProperty.call(STRINGS, id); }

/** The string for an id with `{slot}` filled. An unknown id shows the id itself, so a gap is visible. */
export function t(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const textIds = (): string[] => Object.keys(STRINGS);
