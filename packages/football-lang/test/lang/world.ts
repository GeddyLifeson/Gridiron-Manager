// Test helpers: a hand-built perceived view and assignment builders. The view is what the
// perception module (WP-11) will hand the rules; here every value is set by the test.
import type { Action, Assignment, BallStateKind, Condition, DeterministicMath, PerceivedEntity, PlayRead } from '@gm/schema';
import { PARAMS, compileAssignment, constsOf, type Compiled, type PerceivedViewExt } from '../../src/lang/index.ts';
import { PARAMS as LEGALITY_PARAMS, paramTableOf } from '../../src/legality/index.ts';

export const TABLE = paramTableOf([PARAMS, LEGALITY_PARAMS]);
export const K = constsOf(TABLE);

/** Enough of deterministic math for the tests: exact at the angles they use (0 and pi). */
export const MATH: DeterministicMath = {
  sin: () => 0, cos: (x) => (x === 0 ? 1 : -1), atan2: () => 0, exp: () => 1, log: () => 0, pow: (x) => x, sqrt: Math.sqrt, logistic: () => 0.5,
};

export type Spot = [px: number, py: number, velPx?: number, velPy?: number];

export interface World {
  t: number;
  self: Spot;
  /** Other players by slot. A slot that is absent is not perceived. */
  seen: Record<number, Spot>;
  ball: Spot | null;
  kind: BallStateKind | 'unknown';
  read: PlayRead;
  readSide: 'left' | 'right' | 'none';
  carrier: number;
  heard: string[];
  /** Receiver numbers by slot. */
  rn: Record<number, number>;
  gaze: Record<number, number>;
  kick: 'punt' | 'fieldGoal' | 'kickoff' | 'onside' | null;
  landing: [number, number] | null;
  /** The sidelines, [lo, hi], or null when the view does not give them. */
  sidelines?: [number, number] | null;
  /** The opponent he is locked up with in a block, when the view tells him. */
  locked?: number;
  facts: string[];
}

export function world(over: Partial<World> = {}): World {
  return { t: 0.1, self: [0, 0], seen: {}, ball: null, kind: 'held', read: 'unknown', readSide: 'none', carrier: -1, heard: [], rn: {}, gaze: {}, kick: null, landing: null, facts: [], ...over };
}

const ent = (slot: number, s: Spot): PerceivedEntity => ({ slot, px: s[0], py: s[1], velPx: s[2] ?? 0, velPy: s[3] ?? 0, staleTicks: 0 });

/** A live view over the world object: change the world and the same view shows the change. */
export function viewOf(w: World, slot: number): PerceivedViewExt {
  return {
    selfSlot: slot,
    get tSinceSnapS() { return w.t; },
    get self() { return { px: w.self[0], py: w.self[1], velPx: w.self[2] ?? 0, velPy: w.self[3] ?? 0, headingRad: 0 }; },
    entity: (s) => { const e = w.seen[s]; return e === undefined ? null : ent(s, e); },
    ball: () => (w.ball === null ? null : ent(-1, w.ball)),
    ballKind: () => w.kind,
    playRead: () => ({ read: w.read, side: w.readSide, confidence: 1 }),
    believedCarrierSlot: () => w.carrier,
    heard: (call) => w.heard.includes(call),
    receiverNumber: (s) => w.rn[s] ?? 0,
    gazeOf: (s) => w.gaze[s] ?? null,
    kickKind: () => w.kick,
    landingPoint: () => (w.landing === null ? null : { px: w.landing[0], py: w.landing[1] }),
    ...(w.sidelines ? { sidelines: () => ({ lo: w.sidelines![0], hi: w.sidelines![1] }) } : {}),
    ...(w.locked !== undefined ? { lockedWith: () => w.locked! } : {}),
    fact: (name) => w.facts.includes(name),
  };
}

export const test = (name: string, args: Record<string, string | number | boolean> = {}): Condition => ({ op: 'test', name, args });
export const act = (name: string, args: Record<string, string | number | boolean> = {}): Action => ({ name, args });
export const when = (cond: Condition, then: Action[], guard: Condition | null = null, text = ''): Assignment['rules'][number] => ({ when: cond, guard, then, text });
/** A trigger that is true from the first tick, before or after the snap. */
export const ALWAYS = test('timeGt', { s: -40 });

export function assignment(over: Partial<Omit<Assignment, 'behavior' | 'preSnap'>> & { behavior?: Partial<Assignment['behavior']>; preSnap?: Partial<Assignment['preSnap']> } = {}): Assignment {
  const { behavior, preSnap, ...rest } = over;
  return {
    role: 'X',
    behavior: { type: 'route', params: {}, path: [], ...behavior },
    preSnap: { align: { px: 0, py: 0, rule: null }, onLine: false, stance: 'two', motion: [], ...preSnap },
    rules: [], keys: [], gaze: 'key', technique: {}, conceptId: 'test.concept', teachingLoad: 1, calls: [],
    ...rest,
  };
}

export function compiled(a: Assignment, probes: Condition[] = []): Compiled {
  return compileAssignment(a, { params: TABLE, math: MATH, probes });
}

const NAMES = ['F', 'T', 'U'] as const;
/** Evaluates one condition for one tick and names its value: T, F or U (unknown). */
export function valueOf(cond: Condition, w: World, slot = 11, a: Assignment = assignment()): 'F' | 'T' | 'U' {
  const c = compiled(a, [cond]);
  c.decide(slot, viewOf(w, slot));
  return NAMES[c.probeValues[0]!]!;
}

/** Evaluates one condition over several ticks of a changing world. */
export function valuesOver(cond: Condition, worlds: World[], slot = 11, a: Assignment = assignment()): string {
  const c = compiled(a, [cond]);
  let live = worlds[0]!;
  const view = viewOf(new Proxy({} as World, { get: (_t, key) => live[key as keyof World] }), slot);
  return worlds.map((w) => { live = w; c.decide(slot, view); return NAMES[c.probeValues[0]!]!; }).join('');
}

/** Runs an action from the first tick and returns the compiled assignment after `ticks` decisions. */
export function runAction(action: Action, w: World, slot = 11, a: Partial<Parameters<typeof assignment>[0]> = {}, ticks = 1) {
  const c = compiled(assignment({ ...a, rules: [when(ALWAYS, [action])] }));
  const view = viewOf(w, slot);
  let out = c.decide(slot, view);
  for (let i = 1; i < ticks; i++) out = c.decide(slot, view);
  return out;
}
