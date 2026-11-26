// Shared runtime of the compiled rule language: the per-player context, tri-state logic, and the
// entity selectors (J4.1.2). Everything here reads the `PerceivedView` only. There is no path from
// a rule to true state (J3.1.1): a selector that cannot be resolved from the view is "unknown".
import { SLOTS_PER_TEAM, type Assignment, type Behavior, type Intent, type PerceivedEntity, type PerceivedView, type Slot } from '@gm/schema';
import type { Consts } from './params.ts';
import { VOCABULARY } from './vocabulary.ts';

/** Tri-state truth (J4.1.2 edge case): an entity not perceived makes a condition "unknown", which is false for triggers. */
export const F = 0, T = 1, U = 2;
export type Tri = 0 | 1 | 2;
export const tri = (b: boolean): Tri => (b ? T : F);

/**
 * Optional perceptions the contract's `PerceivedView` does not yet expose. A condition that needs one
 * is "unknown" when the view lacks it. Requested as a contract change in the WP-10 report.
 */
export interface PerceivedViewExt extends PerceivedView {
  /** Where a perceived player is looking, play-frame radians (J3.4.2), or null. */
  gazeOf?(slot: Slot): number | null;
  /** The kind of kick in the air as the player sees it (J4.1.2 kicking game). */
  kickKind?(): 'punt' | 'fieldGoal' | 'kickoff' | 'onside' | null;
  /** His estimate of where the ball in the air comes down (J3.5.1), play frame. */
  landingPoint?(): { readonly px: number; readonly py: number } | null;
  /** The sidelines in his play frame: lateral position of the lower and the higher one. */
  sidelines?(): { readonly lo: number; readonly hi: number };
  /** The opponent he is locked up with in a block, or -1. */
  lockedWith?(): Slot | -1;
  /** A fact he has perceived by sight or signal: `fairCatchSignal`, `kickTouchedByReceivers`, `kickRolling`, `kickDeadByRule`. */
  fact?(name: string): boolean;
}

interface MutableEntity { slot: Slot | -1; px: number; py: number; velPx: number; velPy: number; staleTicks: number }
interface MutablePoint { px: number; py: number }
export interface ActivePoint { px: number; py: number; kind: 'through' | 'cut' | 'settle' }

/** One player's evaluation context. Built once per compiled assignment and reused every tick (P6.3.1). */
export interface Ctx {
  view: PerceivedViewExt;
  slot: Slot;
  /** Slots 0 to 10 snap or kick the ball (J1.2.2). */
  offense: boolean;
  ownStart: number;
  oppStart: number;
  readonly k: Consts;
  readonly a: Assignment;
  /** Scratch memory for stateful conditions and actions, zeroed at the start of each play. */
  readonly mem: Float64Array;
  /** +1 when the player lined up to the offense's left of the ball, -1 to the right (fixed at first evaluation). */
  side: 1 | -1;
  readonly self: MutableEntity;
  readonly intent: Intent;
  readonly tp: MutablePoint;
  readonly fp: MutablePoint;
  /** The path being run: the assignment's, or a conversion's. */
  path: readonly ActivePoint[];
  pathIndex: number;
  stemDone: boolean;
  atTarget: boolean;
  /** Current man, as a selector. Starts as the behavior's `man` parameter. */
  man: Sel | null;
  behavior: Behavior;
  stateIndex: number;
  technique: Record<string, string>;
  calls: string[];
  /** Tick counter within the play, from the first evaluation. */
  ticks: number;
  /** Position at the first evaluation of the play: where he lined up. */
  startPx: number;
  startPy: number;
}

export type Sel = (c: Ctx) => PerceivedEntity | null;

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
export function speed(e: PerceivedEntity): number { return Math.sqrt(e.velPx * e.velPx + e.velPy * e.velPy); }

/** Visits each perceived player of one team in slot order. Unperceived players are skipped. */
export function eachOf(c: Ctx, start: number, visit: (e: PerceivedEntity) => void): void {
  for (let s = start; s < start + SLOTS_PER_TEAM; s++) {
    if (s === c.slot) continue;
    const e = c.view.entity(s);
    if (e !== null) visit(e);
  }
}

export function nearestOf(c: Ctx, start: number, keep: ((e: PerceivedEntity) => boolean) | null = null): PerceivedEntity | null {
  let best: PerceivedEntity | null = null, bestD = Infinity;
  for (let s = start; s < start + SLOTS_PER_TEAM; s++) {
    if (s === c.slot) continue;
    const e = c.view.entity(s);
    if (e === null || (keep !== null && !keep(e))) continue;
    const d = dist(e.px, e.py, c.self.px, c.self.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** Receiver number `n` from the sideline in on a side. `final` counts from where receivers are now. */
function receiver(c: Ctx, n: number, sideSign: 1 | -1, final: boolean): PerceivedEntity | null {
  if (!final) {
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      if (c.view.receiverNumber(s) !== n) continue;
      const e = s === c.slot ? c.self : c.view.entity(s);
      if (e !== null && (e.py >= 0 ? 1 : -1) === sideSign) return e;
    }
    return null;
  }
  // Count again from the sideline in, among the players numbered at the snap who are now on that side.
  let found: PerceivedEntity | null = null, lastEdge = Infinity;
  for (let rank = 1; rank <= n; rank++) {
    found = null;
    let edge = -Infinity;
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      if (c.view.receiverNumber(s) === 0) continue;
      const e = s === c.slot ? c.self : c.view.entity(s);
      if (e === null || (e.py >= 0 ? 1 : -1) !== sideSign) continue;
      const w = Math.abs(e.py);
      if (w < lastEdge && w > edge) { edge = w; found = e; }
    }
    if (found === null) return null;
    lastEdge = edge;
  }
  return found;
}

const SIDES = VOCABULARY.selectors.receiver.sides;
const FINAL = VOCABULARY.selectors.receiver.finalPrefix;

/** Splits a receiver selector such as `#2`, `#3:left`, `final#2:away`. Null when the text is not one. */
export function parseReceiver(text: string): { n: number; side: string; final: boolean } | null {
  const m = /^([a-z]*)#(\d+)(?::([a-z]+))?$/.exec(text);
  if (m === null) return null;
  const prefix = m[1]!, n = Number(m[2]), side = m[3] ?? 'mine';
  if (prefix !== '' && prefix !== FINAL) return null;
  if (!VOCABULARY.selectors.receiver.numbers.includes(n) || !SIDES.includes(side)) return null;
  return { n, side, final: prefix === FINAL };
}

export function sideSign(c: Ctx, side: string): 1 | -1 {
  if (side === 'left') return 1;
  if (side === 'right') return -1;
  return side === 'away' ? (c.side === 1 ? -1 : 1) : c.side;
}

/** True when the selector text is well formed. `role:` and `qb` are legal before binding (J4.3.1). */
export function isSelector(text: string): boolean {
  if (VOCABULARY.selectors.fixed.includes(text)) return true;
  if (text.startsWith('slot:')) { const n = Number(text.slice(5)); return /^\d+$/.test(text.slice(5)) && n >= 0 && n < 2 * SLOTS_PER_TEAM; }
  if (text.startsWith('role:')) return /^[A-Za-z0-9_+-]+$/.test(text.slice(5));
  return parseReceiver(text) !== null;
}

/**
 * Where he sees the ball carrier: the carrier himself when tracked this tick, else the held ball when that
 * is fresher (the ball is in the carrier's hands), else the carrier's last seen spot. Without this, a
 * defender who tracks the ball but last saw the back before the handoff chases a stale spot (J3.1.1, J3.5.3).
 */
export function seenCarrier(c: Ctx): PerceivedEntity | null {
  const s = c.view.believedCarrierSlot();
  if (s === -1) return null;
  if (s === c.slot) return c.self;
  const e = c.view.entity(s);
  if (e !== null && e.staleTicks === 0) return e;
  const b = c.view.ballKind() === 'held' ? c.view.ball() : null;
  if (b !== null && (e === null || b.staleTicks < e.staleTicks)) return b;
  return e;
}

const NONE: Sel = () => null;

/**
 * The rusher a blocker takes (J4.1.3). A back or the quarterback sees the nearest one. A man on the line takes the
 * nearest rusher that no teammate on the line is nearer to (a tie goes to the inside man), so the tackle kicks out
 * to the end instead of doubling the guard's man; with none of his own he helps on the nearest.
 */
function rusherFor(c: Ctx): PerceivedEntity | null {
  const k = c.k, me = c.self, carrier = c.view.believedCarrierSlot();
  const onLine = c.offense && c.startPx >= -k.onLineDepth;
  let near: PerceivedEntity | null = null, nearD = Infinity, mine: PerceivedEntity | null = null, mineD = Infinity;
  for (let s = SLOTS_PER_TEAM; s < 2 * SLOTS_PER_TEAM; s++) {
    if (s === c.slot) continue;
    const e = c.view.entity(s);
    if (e === null || !(e.velPx < 0 || e.px < k.onLineDepth)) continue;
    const d = dist(e.px, e.py, me.px, me.py);
    if (d < nearD) { near = e; nearD = d; }
    if (!onLine || d >= mineD || d > k.scanRange) continue;
    let own = true;
    for (let t = 0; t < SLOTS_PER_TEAM && own; t++) {
      if (t === c.slot || t === carrier) continue;
      const m = c.view.entity(t);
      if (m === null || m.px < me.px - k.onLineDepth || m.px > me.px + k.onLineDepth) continue;
      const dm = dist(e.px, e.py, m.px, m.py);
      if (dm < d - k.headUp || (dm <= d + k.headUp && Math.abs(m.py) < Math.abs(me.py))) own = false;
    }
    if (own) { mine = e; mineD = d; }
  }
  return mine ?? near;
}

/**
 * Compiles a selector to a closure over the view. An unbound `role:` or `qb` resolves to nobody.
 * `qb` is the bound quarterback selector (the `qb` behavior parameter that binding writes, J4.3.1).
 */
export function compileSelector(text: string, keys: readonly string[], qb: string | null = null): Sel {
  switch (text) {
    case 'self': return (c) => c.self;
    case 'ball': return (c) => c.view.ball();
    case 'carrier': return seenCarrier;
    case 'man': return (c) => (c.man === null ? null : c.man(c));
    case 'key': { const first = keys[0]; return first === undefined || first === 'key' ? NONE : compileSelector(first, [], qb); }
    case 'nearestThreat': return (c) => nearestOf(c, 0, (e) => c.view.receiverNumber(e.slot) > 0);
    case 'nearestDefender': return (c) => nearestOf(c, c.oppStart);
    case 'nearestRusher': return rusherFor;
    case 'deepestReceiver': return (c) => {
      let best: PerceivedEntity | null = null;
      eachOf(c, 0, (e) => { if (c.view.receiverNumber(e.slot) > 0 && (best === null || e.px > best.px)) best = e; });
      return best;
    };
    case 'qb': return qb !== null && qb.startsWith('slot:') ? compileSelector(qb, []) : NONE;
    default: break;
  }
  if (text.startsWith('slot:')) { const s = Number(text.slice(5)); return (c) => (s === c.slot ? c.self : c.view.entity(s)); }
  if (text.startsWith('role:')) return NONE;
  const r = parseReceiver(text);
  if (r === null) return NONE;
  return (c) => receiver(c, r.n, sideSign(c, r.side), r.final);
}

/** Aim helpers. The intent's points are owned by the context, so nothing is allocated in a tick. */
export function aim(c: Ctx, px: number, py: number): void { c.tp.px = px; c.tp.py = py; c.intent.target = c.tp; }
export function face(c: Ctx, px: number, py: number): void { c.fp.px = px; c.fp.py = py; c.intent.faceTarget = c.fp; }
export function faceBall(c: Ctx): void { const b = c.view.ball(); if (b !== null) face(c, b.px, b.py); }
