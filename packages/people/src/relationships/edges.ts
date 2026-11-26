// Relationship edges (X7.1.1, X7.2.2). A tie between two people (or a person and a team) forms only from
// a shared event, grows or fades with contact, and is shaped by fit. No tie is assigned: `family` and
// `prior` are the two exceptions the leaf allows, and they come from generation or import.
//
// A directional kind (`worked_under`, `coached`, `recruited_by`) keeps one strength per direction. In a
// directional tie `a` is the junior party: `a` worked under `b`, `a` was coached by `b`, `a` was recruited
// by `b`. The user's own side is never stored (X7.1.1 edge case: the game never tells the user how he feels).
import { DAYS_PER_YEAR } from '@gm/league';
import type { RelationshipEdge, WorldDate } from '@gm/schema';
import { rp } from './params.ts';

export const EDGE_KINDS = ['worked_under', 'worked_with', 'teammate', 'coached', 'recruited_by', 'promise', 'rival', 'family', 'prior', 'mentor', 'agent'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Kinds that store one strength per direction (X7.1.1). */
export const DIRECTIONAL_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(['worked_under', 'coached', 'recruited_by']);
/** Kinds that may exist without a basis event (X7.1.1). */
export const BASISLESS_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>(['family', 'prior']);

export type Sign = 'warm' | 'neutral' | 'cold';

/** One direction of a tie: how the holder feels about the other party. */
export interface Side {
  strength: number;
  sign: Sign;
  /** Highest strength reached, for the decay floor (X7.2.2 rule 2). */
  peak: number;
  /** Date through which time decay has been applied. */
  decayedThrough: WorldDate;
}

/** A basis event and the size of its effect, so the five strongest can be kept (X7.1.1). */
export interface BasisEntry { readonly eventId: number; readonly weight: number }

/**
 * A tie. `ab` is how `a` feels about `b`; `ba` how `b` feels about `a`. For a non-directional kind both
 * sides hold the same numbers. A side is null when its holder is the user or a team.
 */
export interface Tie {
  readonly a: number;
  /** The other person, or null when the tie ends at a team (`rival`). */
  readonly b: number | null;
  readonly bTeamId: number | null;
  readonly kind: EdgeKind;
  /** The L1 ledger id for a `promise` edge, else null. */
  readonly promiseId: number | null;
  ab: Side | null;
  ba: Side | null;
  readonly since: WorldDate;
  lastContact: WorldDate;
  basis: BasisEntry[];
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function dayNumber(d: WorldDate): number {
  return d.seasonYear * DAYS_PER_YEAR + d.dayIndex;
}

export function monthsBetween(from: WorldDate, to: WorldDate): number {
  return (dayNumber(to) - dayNumber(from)) / (DAYS_PER_YEAR / rp('months.perYear'));
}

function addMonths(d: WorldDate, months: number): WorldDate {
  const n = dayNumber(d) + Math.round(months * (DAYS_PER_YEAR / rp('months.perYear')));
  const y = Math.floor(n / DAYS_PER_YEAR);
  return { seasonYear: y, dayIndex: n - y * DAYS_PER_YEAR };
}

const later = (x: WorldDate, y: WorldDate): WorldDate => (dayNumber(x) >= dayNumber(y) ? x : y);

export function tieKey(t: Pick<Tie, 'a' | 'b' | 'bTeamId' | 'kind' | 'promiseId'>): string {
  return `${t.kind}:${t.a}:${t.b ?? `t${t.bTeamId}`}${t.promiseId === null ? '' : `:p${t.promiseId}`}`;
}

/** Starting strength: 20, moved up to plus or minus 10 by the mean sociability of the two parties (X7.1.1 rule 4). */
export function startStrength(sociabilityA: number | null, sociabilityB: number | null): number {
  const mid = rp('fit.facet.middle');
  const sa = sociabilityA ?? mid;
  const sb = sociabilityB ?? mid;
  const swing = rp('edge.start.sociabilitySwing') * (((sa + sb) / 2 - mid) / mid);
  return clamp(rp('edge.start') + swing, 0, rp('edge.strength.max'));
}

function newSide(strength: number, date: WorldDate): Side {
  return { strength, sign: 'neutral', peak: strength, decayedThrough: date };
}

export interface NewTieInput {
  readonly a: number;
  readonly b: number | null;
  readonly bTeamId?: number | null;
  readonly kind: EdgeKind;
  readonly date: WorldDate;
  /** The event that formed the tie. Required unless the kind is `family` or `prior`. */
  readonly basisEventId: number | null;
  readonly sociabilityA?: number | null;
  readonly sociabilityB?: number | null;
  /** Ids of parties whose side is not stored: the user. */
  readonly userId?: number | null;
  readonly promiseId?: number | null;
  /** Strength to start from instead of the X7.1.1 rule (a `prior` from an imported career, X14.2.1). */
  readonly strength?: number;
}

/** Create a tie. Throws when a kind that needs a basis event has none (X7.1.1 acceptance). */
export function createTie(input: NewTieInput): Tie {
  if (input.basisEventId === null && !BASISLESS_KINDS.has(input.kind)) {
    throw new Error(`people.relationships: a ${input.kind} edge needs a basis event (X7.1.1)`);
  }
  const bTeamId = input.bTeamId ?? null;
  if ((input.b === null) === (bTeamId === null)) throw new Error('people.relationships: an edge ends at a person or a team (X7.1.1)');
  const s = input.strength ?? startStrength(input.sociabilityA ?? null, input.sociabilityB ?? null);
  const userId = input.userId ?? null;
  return {
    a: input.a,
    b: input.b,
    bTeamId,
    kind: input.kind,
    promiseId: input.promiseId ?? null,
    ab: input.a === userId ? null : newSide(s, input.date),
    ba: input.b === null || input.b === userId ? null : newSide(s, input.date),
    since: input.date,
    lastContact: input.date,
    basis: input.basisEventId === null ? [] : [{ eventId: input.basisEventId, weight: s }],
  };
}

/** Keep the five strongest basis events, strongest first, ties broken by the older id (X7.1.1). */
export function addBasis(t: Tie, eventId: number, weight: number): void {
  const w = Math.abs(weight);
  const existing = t.basis.find((e) => e.eventId === eventId);
  const rest = t.basis.filter((e) => e.eventId !== eventId);
  rest.push({ eventId, weight: existing ? Math.max(existing.weight, w) : w });
  rest.sort((x, y) => y.weight - x.weight || x.eventId - y.eventId);
  t.basis = rest.slice(0, rp('edge.basis.max'));
}

/** The sides a holder reads: `a`'s view is `ab`, `b`'s view is `ba`. */
export function sideOf(t: Tie, holderId: number): Side | null {
  if (holderId === t.a) return t.ab;
  if (holderId === t.b) return t.ba;
  return null;
}

/** Floor of a side: a quarter of its peak (X7.2.2 rule 2). */
export function floorOf(s: Side): number {
  return rp('decay.floorShare') * s.peak;
}

/**
 * Apply time decay to one side up to `now` (X7.2.2 rule 2): after 6 months without contact, 1 point a
 * month (half for a loyal holder) down to a floor of a quarter of the peak. Time never changes the sign.
 */
export function settleSide(s: Side, lastContact: WorldDate, now: WorldDate, loyal: boolean): void {
  const graceEnd = addMonths(lastContact, rp('decay.graceMonths'));
  const from = later(graceEnd, s.decayedThrough);
  if (dayNumber(now) <= dayNumber(from)) {
    s.decayedThrough = later(s.decayedThrough, now);
    return;
  }
  const months = monthsBetween(from, now);
  const rate = rp('decay.perMonth') * (loyal ? rp('decay.loyalFactor') : 1);
  const floor = floorOf(s);
  if (s.strength > floor) s.strength = Math.max(floor, s.strength - months * rate);
  s.decayedThrough = now;
}

/** Whether a facet value counts as high `loyalty` for decay (Assumption: the friction "high" line). */
export function isLoyal(loyalty: number | null | undefined): boolean {
  return (loyalty ?? rp('fit.facet.middle')) >= rp('fit.high');
}

export interface DecayLoyalty { readonly a: number | null; readonly b: number | null }

/** Settle both sides of a tie to `now`. Team rival edges decay by season instead (`fadeDormantRival`). */
export function settleTie(t: Tie, now: WorldDate, loyalty: DecayLoyalty = { a: null, b: null }): void {
  if (t.kind === 'rival' && t.bTeamId !== null) return;
  if (t.ab) settleSide(t.ab, t.lastContact, now, isLoyal(loyalty.a));
  if (t.ba) settleSide(t.ba, t.lastContact, now, isLoyal(loyalty.b));
}

/** A shared event as it reaches one holder's side of a tie (X7.2.2 rule 1). */
export interface EdgeEventInput {
  readonly eventId: number;
  readonly date: WorldDate;
  /** +1 positive, -1 negative, 0 neutral (a neutral event only counts as contact). */
  readonly sign: -1 | 0 | 1;
  /** The holder's memory strength of the event, 0 to 100 (X6.1.1), already second-hand halved when heard. */
  readonly memoryStrength: number;
  /** True when the holder saw or took part in it; false when heard (X6.1.1 rule 1). */
  readonly firstHand: boolean;
  /** True when the event put the two in touch (a call, a meeting, a shared event): resets the decay clock. */
  readonly contact: boolean;
}

function updateSign(s: Side, sign: -1 | 0 | 1, firstHand: boolean): void {
  if (sign < 0 && s.strength < rp('sign.coldBelow')) s.sign = 'cold';
  else if (sign > 0 && firstHand) {
    if (s.sign === 'cold' && s.strength >= rp('sign.thawFrom')) s.sign = 'neutral';
    else if (s.sign === 'neutral' && s.strength >= rp('sign.warmFrom')) s.sign = 'warm';
  }
}

/**
 * Move one side by an event: memory strength times 0.1 times (1 + 0.5 fit), added for a positive event,
 * subtracted for a negative one (X7.2.2 rule 1). A cold side warms only through first-hand positive events
 * (X7.2.2 edge case). Returns the change applied.
 */
export function applyToSide(s: Side, ev: EdgeEventInput, fitValue: number): number {
  if (ev.sign === 0) return 0;
  if (ev.sign > 0 && s.sign === 'cold' && !ev.firstHand) return 0;
  const size = ev.memoryStrength * rp('growth.perMemoryPoint') * (1 + rp('growth.fitWeight') * fitValue);
  const before = s.strength;
  s.strength = clamp(s.strength + ev.sign * size, 0, rp('edge.strength.max'));
  if (s.strength > s.peak) s.peak = s.strength;
  updateSign(s, ev.sign, ev.firstHand);
  return s.strength - before;
}

/**
 * Apply an event to a tie for one holder (or both sides when `holderId` is null and the kind is not
 * directional). Settles decay first, so a tie that sat untouched loses its months before the event lands.
 */
export function applyEvent(t: Tie, ev: EdgeEventInput, fitValue: number, holderId: number | null, loyalty?: DecayLoyalty): number {
  settleTie(t, ev.date, loyalty);
  const sides: Side[] = [];
  if (holderId === null) {
    if (t.ab) sides.push(t.ab);
    if (t.ba) sides.push(t.ba);
  } else {
    const s = sideOf(t, holderId);
    if (s) sides.push(s);
  }
  let moved = 0;
  for (const s of sides) moved += applyToSide(s, ev, fitValue);
  if (ev.contact) {
    t.lastContact = later(t.lastContact, ev.date);
    for (const s of sides) s.decayedThrough = later(s.decayedThrough, ev.date);
    if (holderId === null || !DIRECTIONAL_KINDS.has(t.kind)) {
      if (t.ab) t.ab.decayedThrough = later(t.ab.decayedThrough, ev.date);
      if (t.ba) t.ba.decayedThrough = later(t.ba.decayedThrough, ev.date);
    }
  }
  if (moved !== 0) addBasis(t, ev.eventId, moved);
  return moved;
}

/** Set a side's sign cold outright (a broken promise, X7.2.3 acceptance). */
export function turnCold(s: Side): void {
  s.sign = 'cold';
}

/** Words for a side (X7.2.2): close, working, distant, or cold. Never a number (X7.4.1). */
export type TieWord = 'close' | 'working' | 'distant' | 'cold';
export function describeSide(s: Side): TieWord {
  if (s.sign === 'cold') return 'cold';
  if (s.strength >= rp('describe.close')) return 'close';
  if (s.strength >= rp('describe.working')) return 'working';
  return 'distant';
}

/**
 * The G-00 `RelationshipEdge` rows of a tie: one row per stored side, holder first. The shape holds one
 * strength, so the back side is a second row with `a` and `b` swapped. Each person keeps his own side even
 * for a non-directional kind, because memories (and so feelings) are per person (X6.1.1); the two sides of a
 * non-directional kind start equal. CR-G24-1 asks for a direction field so readers need not infer which party
 * of a directional kind is junior.
 */
export function toEdgeRows(t: Tie): RelationshipEdge[] {
  const basisEventIds = t.basis.map((e) => e.eventId);
  const rows: RelationshipEdge[] = [];
  const mk = (a: number, b: number | null, bTeamId: number | null, s: Side): RelationshipEdge => ({
    a, b, bTeamId, kind: t.kind, strength: Math.round(s.strength), sign: s.sign, since: t.since, lastContact: t.lastContact, basisEventIds,
  });
  if (t.ab) rows.push(mk(t.a, t.b, t.bTeamId, t.ab));
  if (t.ba && t.b !== null) rows.push(mk(t.b, t.a, null, t.ba));
  return rows;
}
