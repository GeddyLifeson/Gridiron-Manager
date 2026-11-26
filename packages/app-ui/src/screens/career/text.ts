import TEXT from './text.json' with { type: 'json' };

const T = TEXT as Record<string, string>;
/** Career screen text with `{name}` slots filled. A missing key shows the key, so a test can find it. */
export function ct(key: string, vars: Record<string, string | number> = {}): string {
  const s = T[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
export const hasCareerText = (key: string): boolean => key in T;
export const words = (s: string): string => s.replace(/_/g, ' ');
/** Whole currency units with thousands separators, from cents (no locale: P1.1.1 keeps output stable). */
export function money(cents: number, currency = '$'): string {
  const neg = cents < 0;
  const units = Math.round(Math.abs(cents) / 100);
  const s = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${currency}${s}`;
}
