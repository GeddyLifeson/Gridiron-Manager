// Coach screen lines with `{name}` slots filled (text.json). A missing key throws, so a test finds it.
import TEXT from './text.json' with { type: 'json' };

const T = TEXT as Record<string, string>;
export function t(key: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const s = T[key];
  if (s === undefined) throw new Error(`career read models: no text for ${key}`);
  return s.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`career read models: ${key} needs {${k}}`);
    return String(v);
  });
}
export const hasText = (key: string): boolean => key in T;
/** Whole currency units with thousands separators, from cents (no locale: output stays stable). */
export function money(cents: number, currency = '$'): string {
  const neg = cents < 0;
  const units = Math.round(Math.abs(cents) / 100);
  return `${neg ? '-' : ''}${currency}${String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
export const years = (n: number): string => (n === 1 ? t('years.one') : t('years.many', { n }));
