// Words of the career root's route sources (the league tables' group and competition names the content lacks).
import TEXT from './text.json';

const STRINGS = TEXT as Record<string, string>;
export const sourceTextIds = (): string[] => Object.keys(STRINGS);
export function st(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
/** A text id when the table has it, else undefined (for optional lookups such as a division label). */
export const stOrNull = (id: string): string | undefined => STRINGS[id];
