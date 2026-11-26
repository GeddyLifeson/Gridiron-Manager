// Words of the career root (app composition, handoff item D).
import TEXT from './text.json';

const STRINGS = TEXT as Record<string, string>;
export const rootTextIds = (): string[] => Object.keys(STRINGS);
export function rt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
