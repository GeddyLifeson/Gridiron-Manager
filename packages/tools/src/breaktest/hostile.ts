// Hostile and boundary values: what a broken screen, a modded save, a fast double-click or a bad paste can
// put in front of the game. Every list is deterministic; targets pick from them with the run's stream.
import type { Rnd } from './types.ts';

/** Numbers at and past the edges a number field can have. */
export const BOUNDARY_NUMBERS: readonly number[] = [
  0, -0, 1, -1, 0.5, -0.5, 1e-9, 2 ** 31 - 1, 2 ** 31, -(2 ** 31), 2 ** 53 - 1, 2 ** 53 + 2, Number.MAX_VALUE, -Number.MAX_VALUE,
  Number.MIN_VALUE, Number.EPSILON, Infinity, -Infinity, NaN,
];

/** Strings that break naive code: empty, huge, control characters, markup, look-alike names, path tricks. */
export const HOSTILE_STRINGS: readonly string[] = [
  '', ' ', '\u0000', '\n\r\t', 'a'.repeat(10_000), '<script>x</script>', '"; DROP TABLE commands; --', '../../save', '__proto__',
  'constructor', 'toString', '‮evil', '\uD800', 'NaN', 'null', 'undefined', '0', '-1', '1e309', 'Ünïcødé 名前 🏈',
];

/** Payloads of the wrong shape: what arrives when a screen sends the wrong object. */
export function hostilePayloads(): readonly unknown[] {
  const deep: Record<string, unknown> = {};
  let cur = deep;
  for (let i = 0; i < 200; i++) { const next: Record<string, unknown> = {}; cur['x'] = next; cur = next; }
  return [
    null, undefined, 0, 'string', true, [], [1, 2, 3], {}, { days: '7' }, { days: [7] }, { days: { valueOf: 7 } }, deep,
    JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: { prototype: { polluted: true } } },
    Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i])),
  ];
}

export function boundaryNumber(r: Rnd): number { return r.pick(BOUNDARY_NUMBERS); }
export function hostileString(r: Rnd): string { return r.pick(HOSTILE_STRINGS); }
export function hostilePayload(r: Rnd): unknown { return r.pick(hostilePayloads()); }

/** True for a number a count, an id or a money amount in cents may hold. */
export const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Plain-JSON form of an action argument (NaN, Infinity and -0 kept as tagged strings so a run file replays). */
export function toJson(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $num: 'NaN' };
    if (v === Infinity) return { $num: 'Infinity' };
    if (v === -Infinity) return { $num: '-Infinity' };
    if (Object.is(v, -0)) return { $num: '-0' };
    return v;
  }
  if (v === undefined) return { $undef: true };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  return v;
}

export function fromJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o['$num'] === 'string' && Object.keys(o).length === 1) return o['$num'] === '-0' ? -0 : Number(o['$num']);
    if (o['$undef'] === true && Object.keys(o).length === 1) return undefined;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fromJson(x)]));
  }
  return v;
}
