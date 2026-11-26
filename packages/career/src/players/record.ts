// The relationship record and its memory ledger (L1.1.1, L1.1.2). One directed record per pair: how the
// holder sees the other person. Every value moves only through events; there is no charisma or persuasion
// value for anyone (L1.1.1). The ledger keeps what the holder remembers, decaying by half-life per kind.
import type { WorldDate } from '@gm/schema';
import EVENTS from './events.json' with { type: 'json' };
import { clamp, daysBetween, halfPow, weeksBetween } from './math.ts';
import { pp } from './params.ts';

export type Channel = 'trust' | 'respect' | 'roleBelief';
export type HalfLifeClass = 'routine' | 'playingTime' | 'promise' | 'personal' | 'cutDay';

/** One row of events.json (L1.1.2 event sources). */
export interface EventKind {
  readonly base: number;
  readonly halfLife: HalfLifeClass;
  readonly weights: Partial<Record<Channel, number>>;
  readonly facet: string | null;
  readonly invert: boolean;
  readonly leaf: string;
}

export const EVENT_KINDS: Readonly<Record<string, EventKind>> = (EVENTS as { kinds: Record<string, EventKind> }).kinds;

export function eventKind(kind: string): EventKind {
  const k = EVENT_KINDS[kind];
  if (!k) throw new Error(`career.players: unknown relationship event kind ${kind}`);
  return k;
}

/** One remembered event (L1.1.2): `{type, date, strength, half_life_weeks, witnesses[], about_person}`. */
export interface LedgerMemory {
  readonly kind: string;
  readonly date: WorldDate;
  /** Strength at formation, -100 to +100. */
  readonly strength: number;
  readonly halfLifeWeeks: number;
  readonly witnesses: readonly number[];
  readonly aboutPersonId: number;
  /** True when the holder saw it himself; false for a witness copy (L1.1.2 rule 4). */
  readonly firstHand: boolean;
  /** The X2 event the memory points at, when the log has one. */
  readonly eventId: number | null;
}

/** `relationship[a][b] = {trust, respect, familiarity, role_belief, memories[]}` (L1.1.1). Truth: never shown as a number. */
export interface RelationshipRecord {
  readonly holderId: number;
  readonly aboutId: number;
  readonly trust: number;
  readonly respect: number;
  readonly familiarity: number;
  readonly roleBelief: number;
  readonly memories: readonly LedgerMemory[];
  /** Season both were last on one team; drives the decay of familiarity while apart. */
  readonly lastTogetherSeason: number;
  readonly together: boolean;
}

export interface NewPairing {
  readonly holderId: number;
  readonly aboutId: number;
  /** The coach's reputation with players, 0 to 1 (E5 `regard` scaled); adds up to 30 respect. */
  readonly coachPlayerRegard: number;
  readonly season: number;
  /** College coach who recruited the player (L1.1.3 edge case): familiarity 25 to 40 from the contact. */
  readonly recruitingFamiliarity?: number;
}

/** A record for a new pairing with the L1.1.1 starting values. */
export function newRecord(p: NewPairing): RelationshipRecord {
  const fam = p.recruitingFamiliarity === undefined ? pp('record.start.familiarity')
    : clamp(p.recruitingFamiliarity, pp('know.recruitedStartMin'), pp('know.recruitedStartMax'));
  return {
    holderId: p.holderId,
    aboutId: p.aboutId,
    trust: pp('record.start.trust'),
    respect: clamp(pp('record.start.respect') + pp('record.start.respectFromReputationMax') * clamp(p.coachPlayerRegard, 0, 1), 0, pp('record.scaleMax')),
    familiarity: fam,
    roleBelief: pp('record.start.roleBelief'),
    memories: [],
    lastTogetherSeason: p.season,
    together: true,
  };
}

export function halfLifeWeeks(c: HalfLifeClass): number {
  return pp(`ledger.halfLife.${c}`);
}

/** The 0.5 to 1.5 personality factor (L1.1.1). A kind with no facet reacts at 1. */
export function personalityFactor(kind: EventKind, facets: Readonly<Record<string, number>>): number {
  if (kind.facet === null) return 1;
  const f = clamp(facets[kind.facet] ?? 50, 0, 100) / 100;
  const lo = pp('record.personality.min');
  const hi = pp('record.personality.max');
  return kind.invert ? hi - (hi - lo) * f : lo + (hi - lo) * f;
}

/** `familiarity_shield = 0.3 * familiarity/100 * trust/100` (L1.1.1). Absorbs part of a bad event only. */
export function familiarityShield(r: RelationshipRecord): number {
  return pp('record.shield.factor') * (r.familiarity / 100) * (r.trust / 100);
}

/** Effective strength now (L1.1.2): `strength * 0.5^(weeks/half_life)`; touchstones keep a quarter (L1.1.5). */
export function effectiveStrength(m: LedgerMemory, now: WorldDate): number {
  const weeks = Math.max(0, weeksBetween(m.date, now));
  const s = m.strength * halfPow(weeks / m.halfLifeWeeks);
  if (Math.abs(m.strength) >= pp('ledger.touchstone.min')) {
    const floor = m.strength * pp('ledger.touchstone.floorShare');
    return Math.abs(s) < Math.abs(floor) ? floor : s;
  }
  return s;
}

/** True for a memory strong enough to join the permanent layer (L1.1.5 touchstone). X6 owns the layer itself. */
export function isTouchstone(m: LedgerMemory): boolean {
  return Math.abs(m.strength) >= pp('ledger.touchstone.min');
}

/** Insert a memory, dropping the weakest effective one when the 40-row cap is passed (L1.1.2). */
export function insertMemory(list: readonly LedgerMemory[], m: LedgerMemory, now: WorldDate): LedgerMemory[] {
  const out = [...list, m];
  while (out.length > pp('ledger.cap')) {
    let weakest = 0;
    let weakestAbs = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = Math.abs(effectiveStrength(out[i]!, now));
      if (a < weakestAbs) { weakestAbs = a; weakest = i; }
    }
    out.splice(weakest, 1);
  }
  return out;
}

export interface EventInput {
  readonly kind: string;
  readonly date: WorldDate;
  /** Overrides the row's base strength (scored talks, public call-out by personality, praise decay). */
  readonly strength?: number;
  readonly witnesses?: readonly number[];
  readonly eventId?: number | null;
  /** Extra multipliers the caller owns: youth (L1.5.1), phone (L1.2.1), veteran release weight (L1.4.3). */
  readonly scale?: number;
}

export interface EventResult {
  readonly record: RelationshipRecord;
  readonly memory: LedgerMemory;
  /** Change applied to each value, after clamping. */
  readonly moved: Readonly<Record<Channel, number>>;
}

/**
 * Apply one event to a record (L1.1.1): strength = base * personality factor * caller scale, and for a bad
 * event also * (1 - familiarity shield). The strength is stored as a memory and the same amount, split by
 * the row's weights, moves trust, respect and role belief. Values stay in 0 to 100.
 */
export function applyEvent(r: RelationshipRecord, ev: EventInput, facets: Readonly<Record<string, number>>): EventResult {
  const kind = eventKind(ev.kind);
  const base = ev.strength ?? kind.base;
  let s = base * personalityFactor(kind, facets) * (ev.scale ?? 1);
  if (s < 0) s *= 1 - familiarityShield(r);
  s = clamp(s, -100, 100);
  const memory: LedgerMemory = {
    kind: ev.kind, date: ev.date, strength: s, halfLifeWeeks: halfLifeWeeks(kind.halfLife),
    witnesses: ev.witnesses ?? [], aboutPersonId: r.aboutId, firstHand: true, eventId: ev.eventId ?? null,
  };
  const max = pp('record.scaleMax');
  const next = (ch: Channel): number => clamp(r[ch] + s * (kind.weights[ch] ?? 0), 0, max);
  const trust = next('trust');
  const respect = next('respect');
  const roleBelief = next('roleBelief');
  return {
    record: { ...r, trust, respect, roleBelief, memories: insertMemory(r.memories, memory, ev.date) },
    memory,
    moved: { trust: trust - r.trust, respect: respect - r.respect, roleBelief: roleBelief - r.roleBelief },
  };
}

/**
 * Move one value directly by a stated amount (role talk deltas of L1.2.2, the neglect drift of L1.2.4).
 * These rules name a value change, not a memory, so no ledger row is written.
 */
export function nudge(r: RelationshipRecord, ch: Channel, amount: number): RelationshipRecord {
  return { ...r, [ch]: clamp(r[ch] + amount, 0, pp('record.scaleMax')) };
}

/**
 * Witness copies (L1.1.2 rule 4): each witness whose tie to the subject is above 60 gets the memory at half
 * strength on his own record about the coach. Returns the witness ids that took a copy.
 */
export function witnessCopy(m: LedgerMemory, tieToSubject: (witnessId: number) => number, coachRecordOf: (witnessId: number) => RelationshipRecord | null, facetsOf: (witnessId: number) => Readonly<Record<string, number>>): { witnessId: number; result: EventResult }[] {
  const out: { witnessId: number; result: EventResult }[] = [];
  for (const w of m.witnesses) {
    if (tieToSubject(w) <= pp('ledger.witness.tieMin')) continue;
    const rec = coachRecordOf(w);
    if (!rec) continue;
    const result = applyEvent(rec, { kind: m.kind, date: m.date, strength: m.strength * pp('ledger.witness.share'), eventId: m.eventId }, facetsOf(w));
    const copy: LedgerMemory = { ...result.memory, firstHand: false, witnesses: [] };
    out.push({ witnessId: w, result: { ...result, memory: copy, record: { ...result.record, memories: [...result.record.memories.slice(0, -1), copy] } } });
  }
  return out;
}

/** Familiarity: +1 per shared week (L1.1.1). */
export function sharedWeek(r: RelationshipRecord): RelationshipRecord {
  return r.together ? { ...r, familiarity: clamp(r.familiarity + pp('record.familiarity.perSharedWeek'), 0, pp('record.scaleMax')) } : r;
}

/** Familiarity from one one-on-one talk: 3 to 6 (L1.1.1), picked by the caller's seeded draw in [0, 1). */
export function talkFamiliarity(r: RelationshipRecord, draw: number): RelationshipRecord {
  const lo = pp('record.familiarity.perTalkMin');
  const hi = pp('record.familiarity.perTalkMax');
  const gain = lo + Math.floor(clamp(draw, 0, 0.999999) * (hi - lo + 1));
  return { ...r, familiarity: clamp(r.familiarity + gain, 0, pp('record.scaleMax')) };
}

/** One of the pair left the team (trade, release). The record is kept (L1.1.1 edge case). */
export function separate(r: RelationshipRecord, season: number): RelationshipRecord {
  return { ...r, together: false, lastTogetherSeason: season };
}

/** Back on one team: familiarity loses 10 per full season apart (L1.1.1); everything else is kept. */
export function reunite(r: RelationshipRecord, season: number): RelationshipRecord {
  if (r.together) return r;
  const apart = Math.max(0, season - r.lastTogetherSeason);
  return { ...r, together: true, lastTogetherSeason: season, familiarity: clamp(r.familiarity - apart * pp('record.familiarity.decayPerSeasonApart'), 0, pp('record.scaleMax')) };
}

/**
 * The last N events the coach knows of, newest first (L1.1.1, L1.1.2): first-hand rows only. Witness
 * copies are things the coach did not see and are never listed. Strengths are not returned.
 */
export function knownRecent(r: RelationshipRecord): { kind: string; date: WorldDate }[] {
  return r.memories.filter((m) => m.firstHand)
    .slice()
    .sort((a, b) => daysBetween(a.date, b.date))
    .slice(0, pp('ledger.cardRecent'))
    .map((m) => ({ kind: m.kind, date: m.date }));
}
