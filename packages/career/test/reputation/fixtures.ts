// Shared fixtures for the reputation tests: a log builder, a deterministic test stream and math.
import type { DeterministicMath, RandomStream, WorldEvent } from '@gm/schema';
import type { FoldContext } from '../../src/reputation/index.ts';

export const COLLEGE = 1;
export const PRO = 2;
export const LEVEL: Record<number, string> = { [COLLEGE]: 'college', [PRO]: 'pro' };
export const levelKeyOf = (c: number): string => LEVEL[c] ?? 'other';

let nextId = 1;
export function resetIds(): void { nextId = 1; }

export interface Ev {
  type: string;
  year?: number;
  day?: number;
  actors: { personId: number; role: string }[];
  payload?: WorldEvent['payload'];
  competitionId?: number | null;
  teamId?: number | null;
  witnesses?: WorldEvent['witnesses'];
  causeId?: number | null;
}

export function ev(e: Ev): WorldEvent {
  return {
    id: nextId++,
    type: e.type,
    when: { date: { seasonYear: e.year ?? 2030, dayIndex: e.day ?? 100 }, period: null, clockTenths: null },
    competitionId: e.competitionId === undefined ? PRO : e.competitionId,
    where: { teamId: e.teamId === undefined ? 10 : e.teamId, venueId: null },
    actors: e.actors,
    subjects: [],
    payload: e.payload ?? {},
    witnesses: e.witnesses ?? { kind: 'public' },
    causeId: e.causeId ?? null,
    notability: null,
    tier: 1,
    source: 'sim',
  };
}

export const coach = (id: number) => [{ personId: id, role: 'coach' }];

/** Every subject is a head coach unless the map says otherwise. */
export function ctx(rungs: Record<number, number> = {}, extra: Partial<FoldContext> = {}): FoldContext {
  return { rungOf: (id) => rungs[id] ?? 9, levelKeyOf, ...extra };
}

/** mulberry32-based stream for tests only (core code takes engine streams). */
export function testStream(seed: number): RandomStream {
  let a = seed >>> 0;
  let draws = 0;
  const u32 = () => { draws++; a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
  const uniform = () => (u32() * 4294967296 + u32()) / 18446744073709551616;
  return {
    name: 'test',
    get draws() { return draws; },
    nextU32: u32,
    uniform,
    normal: () => { const u = Math.max(uniform(), 1e-12); const v = uniform(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    chance: (p) => uniform() < p,
    pick: (w) => { const tot = w.reduce((x, y) => x + y, 0); let r = uniform() * tot; for (let i = 0; i < w.length; i++) { r -= w[i]!; if (r < 0) return i; } return w.length - 1; },
    int: (lo, hi) => lo + Math.floor(uniform() * (hi - lo + 1)),
  };
}

export const MATH: DeterministicMath = {
  sin: Math.sin, cos: Math.cos, atan2: Math.atan2, exp: Math.exp, log: Math.log, pow: Math.pow, sqrt: Math.sqrt,
  logistic: (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x)))),
};
