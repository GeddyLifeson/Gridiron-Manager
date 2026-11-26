// Memory rows, kinds and their effective strength (X6.1.1, X6.1.3, X6.2.2, X6.5.1).
// A row is a pointer into the event log held by one person. It stores no text (X6.1.1 rule 4). The stored
// `strength` is the strength at creation; what an old row still weighs is computed at read time from its
// kind, its age and its layer, so nothing has to be rewritten each month.
import { DAYS_PER_YEAR } from '@gm/league';
import { mayReceiveEvent, type MemoryRow, type PersonOrigin, type WorldDate, type WorldTier } from '@gm/schema';
import { mp } from './params.ts';

/**
 * A held memory: G-00's `MemoryRow` plus the two fields X6 needs that the shape does not carry yet
 * (CR-G23-2): the memory kind (event type and holder role, X6.1.3 rule 1) and the second-hand flag (X6.1.1 rule 1).
 */
export interface HeldMemory extends MemoryRow {
  readonly kind: string;
  readonly secondHand: boolean;
}

/** Slot groups of the short layer (X6.1.2). */
export const MEMORY_GROUPS = ['game', 'career', 'roster', 'relationship', 'discipline', 'other'] as const;
export type MemoryGroup = (typeof MEMORY_GROUPS)[number];

export function groupOf(category: string): MemoryGroup {
  return (MEMORY_GROUPS as readonly string[]).includes(category) ? (category as MemoryGroup) : 'other';
}

/** The optional `memory` block of an event type file (X6.1.3 rule 1). Missing fields take the leaf defaults. */
export interface MemoryKindDef {
  readonly lifeMonths?: number;
  readonly holdShare?: number;
  readonly stackFactor?: number;
  readonly stackCap?: number;
  /** Role and promise kinds form negative rows at this multiple (rule 4). */
  readonly negativeWeight?: number;
  /** Kinds whose rows by the same holder about the same subject this kind erases (rule 5). */
  readonly erases?: readonly string[];
  /** A first event (first start, first job, first title): promoted regardless of strength, one per kind (X6.2.1 edge case). */
  readonly first?: boolean;
}

export interface ResolvedKind {
  readonly lifeMonths: number | null;
  readonly holdShare: number;
  readonly stackFactor: number;
  readonly stackCap: number;
  readonly negativeWeight: number;
  readonly erases: readonly string[];
  readonly first: boolean;
}

/** Kind defaults by group (X6.1.3 rule 2). Discipline and other set no life: they use the flat monthly loss (X6.1.2). */
export function resolveKind(def: MemoryKindDef | undefined, group: MemoryGroup): ResolvedKind {
  const defaultLife = group === 'game' || group === 'roster' ? mp('memory.kind.lifeShortMonths')
    : group === 'relationship' || group === 'career' ? mp('memory.kind.lifeLongMonths') : null;
  return {
    lifeMonths: def?.lifeMonths ?? defaultLife,
    holdShare: def?.holdShare ?? mp('memory.kind.holdShare'),
    stackFactor: def?.stackFactor ?? mp('memory.kind.stackFactor'),
    stackCap: def?.stackCap ?? mp('memory.kind.stackCap'),
    negativeWeight: def?.negativeWeight ?? 1,
    erases: def?.erases ?? [],
    first: def?.first ?? false,
  };
}

/** Kind table: kind id (`<event type>/<holder role>`) to its memory block. Content (X2.1.2). */
export type KindTable = Readonly<Record<string, MemoryKindDef>>;

export function kindId(eventType: string, holderRole: string): string { return `${eventType}/${holderRole}`; }

export function kindOf(row: HeldMemory, kinds: KindTable): ResolvedKind {
  return resolveKind(kinds[row.kind], groupOf(row.category));
}

/** Days between two world dates. */
export function daysBetween(a: WorldDate, b: WorldDate): number {
  return (b.seasonYear - a.seasonYear) * DAYS_PER_YEAR + (b.dayIndex - a.dayIndex);
}

export function monthsBetween(a: WorldDate, b: WorldDate): number {
  return daysBetween(a, b) / (DAYS_PER_YEAR / mp('memory.months.perYear'));
}

/**
 * Effective strength of a short row (X6.1.3 rule 2): full strength for `holdShare` of its life, then a
 * straight line to zero at the end of its life. A kind with no life loses 10 percent a month (X6.1.2).
 */
export function shortStrength(row: HeldMemory, kinds: KindTable, now: WorldDate): number {
  const k = kindOf(row, kinds);
  const age = Math.max(0, monthsBetween(row.formed, now));
  if (k.lifeMonths === null) {
    let s = row.strength;
    const whole = Math.floor(age);
    for (let i = 0; i < whole; i++) s *= 1 - mp('memory.short.flatMonthlyLoss');
    return s * (1 - mp('memory.short.flatMonthlyLoss') * (age - whole));
  }
  const hold = k.holdShare * k.lifeMonths;
  if (age <= hold) return row.strength;
  if (age >= k.lifeMonths) return 0;
  return row.strength * (1 - (age - hold) / (k.lifeMonths - hold));
}

/**
 * Effective strength of a permanent row (X6.2.2): falls 5 percent of the original per season to a floor of
 * 40 percent. Negative rows soften half again faster when later positive rows exist between holder and subject.
 */
export function permanentStrength(row: HeldMemory, now: WorldDate, softenedByPositive: boolean): number {
  const seasons = Math.max(0, now.seasonYear - row.formed.seasonYear);
  const rate = mp('memory.permanent.softenPerSeason') * (softenedByPositive && row.sign < 0 ? mp('memory.permanent.positiveSpeedup') : 1);
  return row.strength * Math.max(mp('memory.permanent.softenFloor'), 1 - rate * seasons);
}

/** True when the holder holds a positive row about the same subject formed after this negative row (X6.2.2). */
export function hasLaterPositive(row: HeldMemory, all: readonly HeldMemory[]): boolean {
  if (row.sign >= 0) return false;
  return all.some((r) => r.holderId === row.holderId && r.sign > 0 && sameSubject(r, row) && daysBetween(row.formed, r.formed) > 0);
}

export function effectiveStrength(row: HeldMemory, all: readonly HeldMemory[], kinds: KindTable, now: WorldDate): number {
  return row.layer === 'permanent' ? permanentStrength(row, now, hasLaterPositive(row, all)) : shortStrength(row, kinds, now);
}

export function sameSubject(a: { aboutPersonId: number | null; aboutTeamId: number | null }, b: { aboutPersonId: number | null; aboutTeamId: number | null }): boolean {
  return a.aboutPersonId === b.aboutPersonId && a.aboutTeamId === b.aboutTeamId;
}

/** How the holder stands to the event (X6.1.1 rule 2). */
export type Stake = 'subject' | 'room' | 'onlooker';

/** The event as the row builder needs it: a resolved `WorldEvent` plus its type file fields. */
export interface MemoryEventInput {
  readonly id: number;
  readonly type: string;
  readonly family: string;
  readonly date: WorldDate;
  /** X4.1.1 notability 0 to 100. */
  readonly notability: number;
  readonly aboutPersonId: number | null;
  readonly aboutTeamId: number | null;
  /** Event type file `importedAllowed` (X2.1.2). */
  readonly importedAllowed: boolean;
  /** Event involves a tier 1 person (X6.5.1 tier 2 rule). */
  readonly involvesTier1: boolean;
}

export interface HolderInput {
  readonly id: number;
  readonly origin: PersonOrigin;
  readonly tier: WorldTier;
}

export interface WitnessInput {
  readonly stake: Stake;
  /** Holder's role in the event, for the kind (the benched player, the teammate who watched). */
  readonly role: string;
  /** -1, 0 or +1 from the holder's side, from the event type's role table (X6.1.1 rule 3). */
  readonly sign: -1 | 0 | 1;
  /** Witness or actor (X2.1.1). False means the holder only heard of it. */
  readonly witnessed: boolean;
  /** A news delivery record exists (X12.2.1). Required for a non-witness. */
  readonly newsDelivered: boolean;
}

/**
 * Builds a row, or null when none may be formed (X6.1.1 rule 1, X6.5.1): the user holds no rows; a
 * non-witness needs a news delivery; tier 3 keeps permanent rows only, so forms no new short row; tier 2
 * forms short rows only for events involving tier 1 people; a protected holder forms rows only for event
 * types allowed on imported people.
 */
export function createMemoryRow(event: MemoryEventInput, holder: HolderInput, w: WitnessInput, kinds: KindTable): HeldMemory | null {
  if (holder.origin === 'user') return null;
  if (!w.witnessed && !w.newsDelivered) return null;
  if (holder.tier === 3) return null;
  if (holder.tier === 2 && !event.involvesTier1) return null;
  if (!mayReceiveEvent(holder, { importedAllowed: event.importedAllowed })) return null;
  const kind = kindId(event.type, w.role);
  const group = groupOf(event.family);
  const k = resolveKind(kinds[kind], group);
  const stake = w.stake === 'subject' ? mp('memory.stake.subject') : w.stake === 'room' ? mp('memory.stake.room') : mp('memory.stake.onlooker');
  let s = event.notability * stake;
  if (!w.witnessed) s *= mp('memory.secondHandFactor');
  if (w.sign < 0) s *= k.negativeWeight;
  const strength = Math.round(Math.min(mp('memory.strength.max'), Math.max(0, s)));
  return {
    holderId: holder.id, eventId: event.id, aboutPersonId: event.aboutPersonId, aboutTeamId: event.aboutTeamId,
    category: group, sign: w.sign, strength, layer: 'short', formed: event.date, lastFelt: event.date,
    kind, secondHand: !w.witnessed,
  };
}

/** Drops the X6 extras for storage in the G-00 table until CR-G23-2 lands. */
export function toMemoryRow(m: HeldMemory): MemoryRow {
  const { kind: _k, secondHand: _s, ...row } = m;
  return row;
}
