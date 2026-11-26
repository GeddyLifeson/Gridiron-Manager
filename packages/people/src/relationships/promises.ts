// Promises on the edge (X7.2.3). L1 owns the ledger and judges kept, broken or void; this file moves the
// ties of the people who know of the promise and no one else. There is no pooled trust currency.
import type { WorldDate } from '@gm/schema';
import { applyEvent, createTie, dayNumber, sideOf, turnCold, type Tie } from './edges.ts';
import type { PairContext, TieStore } from './create.ts';
import { rp } from './params.ts';

export interface PromiseMade {
  readonly promiseId: number;
  /** The person who made the promise. */
  readonly promiserId: number;
  /** The person it was made to. */
  readonly holderId: number;
  readonly eventId: number;
  readonly date: WorldDate;
}

/** Open a `promise` edge, holder to promiser, while the promise stands (X7.2.3). */
export function openPromise(store: TieStore, ctx: PairContext, p: PromiseMade): Tie {
  const t = createTie({
    a: p.holderId, b: p.promiserId, kind: 'promise', promiseId: p.promiseId, date: p.date, basisEventId: p.eventId,
    sociabilityA: ctx.sociabilityOf(p.holderId), sociabilityB: ctx.sociabilityOf(p.promiserId), userId: ctx.userId,
  });
  store.put(t);
  return t;
}

/** Someone who saw or heard of the promise's outcome (a teammate, a recruit's family, his high school coach). */
export interface PromiseWitness {
  readonly personId: number;
  /** Memory strength of the second-hand row the memory module gave him (X6.1.1 rule 1). */
  readonly memoryStrength: number;
}

export interface PromiseResolution {
  readonly promiseId: number;
  readonly promiserId: number;
  readonly holderId: number;
  readonly outcome: 'kept' | 'broken' | 'void';
  readonly eventId: number;
  readonly date: WorldDate;
  readonly witnesses: readonly PromiseWitness[];
}

/** Which people's ties a resolution moved, for the view update (X2.3.1) and the test of X7.2.3. */
export interface PromiseEffect {
  readonly personId: number;
  readonly change: number;
  readonly secondHand: boolean;
}

/** The holder's side toward the promiser: on every tie the two share, holder first. */
function holderSides(store: TieStore, holderId: number, promiserId: number): Tie[] {
  return store.between(holderId, promiserId).filter((t) => sideOf(t, holderId) !== null);
}

/**
 * Resolve a promise (X7.2.3). Broken: the holder's ties to the promiser take a hit of 30 and turn cold;
 * witnesses' existing ties to the promiser move by their second-hand memory strength (X7.2.2 rule 1).
 * Kept: plus 15 for the holder, witnesses likewise in the positive. Void (made impossible by injury): no
 * change. The `promise` edge closes in every case.
 */
export function resolvePromise(store: TieStore, ctx: PairContext, r: PromiseResolution): PromiseEffect[] {
  const open = store.find('promise', r.holderId, r.promiserId, null, r.promiseId);
  if (open) store.delete(open);
  if (r.outcome === 'void') return [];
  const effects: PromiseEffect[] = [];
  const broken = r.outcome === 'broken';
  const amount = broken ? -rp('promise.brokenHit') : rp('promise.keptGain');
  let holderChange = 0;
  for (const t of holderSides(store, r.holderId, r.promiserId)) {
    const s = sideOf(t, r.holderId)!;
    const before = s.strength;
    s.strength = Math.min(rp('edge.strength.max'), Math.max(0, s.strength + amount));
    if (s.strength > s.peak) s.peak = s.strength;
    if (broken) turnCold(s);
    if (dayNumber(r.date) > dayNumber(t.lastContact)) t.lastContact = r.date;
    holderChange += s.strength - before;
  }
  effects.push({ personId: r.holderId, change: holderChange, secondHand: false });
  const sign = broken ? -1 : 1;
  for (const w of [...r.witnesses].sort((x, y) => x.personId - y.personId)) {
    if (w.personId === r.holderId || w.personId === r.promiserId) continue;
    let change = 0;
    for (const t of holderSides(store, w.personId, r.promiserId)) {
      change += applyEvent(t, { eventId: r.eventId, date: r.date, sign, memoryStrength: w.memoryStrength, firstHand: false, contact: false },
        ctx.fitOf(w.personId, r.promiserId), w.personId, { a: ctx.loyaltyOf(t.a), b: t.b === null ? null : ctx.loyaltyOf(t.b) });
    }
    effects.push({ personId: w.personId, change, secondHand: true });
  }
  return effects;
}
