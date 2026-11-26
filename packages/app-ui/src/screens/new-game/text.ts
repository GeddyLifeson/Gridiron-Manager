import TEXT from './text.json' with { type: 'json' };

const T = TEXT as Record<string, string>;
/** New game text with `{name}` slots filled. A missing key shows the key, so a test can find it. */
export function nt(key: string, vars: Record<string, string | number> = {}): string {
  const s = T[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
export const hasNewGameText = (key: string): boolean => key in T;
export const words = (s: string): string => s.replace(/^[a-z]+\./, '').replace(/[._]/g, ' ');
/** Seconds as hours and minutes, no locale (P1.1.1). */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
