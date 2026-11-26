// The short layer that turns over and the permanent layer for the few things that stay (X6.1.2, X6.1.3
// rules 3 and 5, X6.2.1, X6.2.2, X6.5.1 demotion). Every function takes one holder's rows and returns new
// rows: nothing is mutated, so a replay gives the same rows.
import type { WorldDate } from '@gm/schema';
import { mp } from './params.ts';
import { daysBetween, effectiveStrength, groupOf, kindOf, sameSubject, shortStrength, type HeldMemory, type KindTable } from './rows.ts';

const isShort = (r: HeldMemory) => r.layer === 'short';
const isPerm = (r: HeldMemory) => r.layer === 'permanent';

export interface InsertResult {
  readonly rows: readonly HeldMemory[];
  readonly inserted: boolean;
  /** Event ids of rows removed (replaced, erased). */
  readonly removed: readonly number[];
}

/**
 * Inserts a new short row for one holder. Order: erasures declared by the new row's kind (X6.1.3 rule 5);
 * the stack cap for its kind and subject (rule 3: further rows are not stored, unless stronger than the
 * weakest); then the slot limit of its group (X6.1.2: enters if a slot is free or it is at least as strong
 * as the weakest row, which it replaces; at equal strength the later one stays).
 */
export function insertShort(rows: readonly HeldMemory[], row: HeldMemory, kinds: KindTable, now: WorldDate): InsertResult {
  const k = kindOf(row, kinds);
  const removed: number[] = [];
  let out = rows.filter((r) => {
    const erase = r.holderId === row.holderId && k.erases.includes(r.kind) && sameSubject(r, row);
    if (erase) removed.push(r.eventId);
    return !erase;
  });
  const eff = (r: HeldMemory) => shortStrength(r, kinds, now);
  const weakestOf = (list: readonly HeldMemory[]) => list.reduce<HeldMemory | null>((w, r) => (w === null || eff(r) < eff(w) || (eff(r) === eff(w) && daysBetween(r.formed, w.formed) > 0) ? r : w), null);

  const sameKind = out.filter((r) => isShort(r) && r.holderId === row.holderId && r.kind === row.kind && sameSubject(r, row));
  if (sameKind.length >= k.stackCap) {
    const w = weakestOf(sameKind)!;
    if (eff(row) < eff(w)) return { rows: out, inserted: false, removed };
    out = out.filter((r) => r !== w); removed.push(w.eventId);
  }
  const group = groupOf(row.category);
  const inGroup = out.filter((r) => isShort(r) && r.holderId === row.holderId && groupOf(r.category) === group);
  if (inGroup.length >= mp('memory.short.slotsPerGroup')) {
    const w = weakestOf(inGroup)!;
    if (eff(row) < eff(w)) return { rows: out, inserted: false, removed };
    out = out.filter((r) => r !== w); removed.push(w.eventId);
  }
  return { rows: [...out, row], inserted: true, removed };
}

/** Deletes short rows that have faded under strength 5 (X6.1.2). Permanent rows are never deleted. */
export function pruneShort(rows: readonly HeldMemory[], kinds: KindTable, now: WorldDate): HeldMemory[] {
  return rows.filter((r) => !isShort(r) || shortStrength(r, kinds, now) >= mp('memory.short.deleteBelow'));
}

/**
 * Sum of a holder's rows of one kind about one subject with repeats giving less (X6.1.3 rule 3): sorted
 * strongest first, the n-th counts times stackFactor^(n-1), up to the stack cap.
 */
export function stackedStrength(rows: readonly HeldMemory[], kinds: KindTable, now: WorldDate): number {
  if (rows.length === 0) return 0;
  const k = kindOf(rows[0]!, kinds);
  const sorted = rows.map((r) => effectiveStrength(r, rows, kinds, now)).sort((a, b) => b - a).slice(0, k.stackCap);
  let mult = 1;
  let total = 0;
  for (const s of sorted) { total += s * mult; mult *= k.stackFactor; }
  return total;
}

export interface PromotionContext {
  /** People the holder has an X7 edge with. */
  readonly edgePersonIds: ReadonlySet<number>;
}

export interface PromotionResult {
  readonly rows: readonly HeldMemory[];
  readonly promoted: readonly HeldMemory[];
  /** Event ids exempt from compaction from now on (X2.4.1 rule 4). */
  readonly compactionExempt: readonly number[];
}

/**
 * Season-end promotion for one holder (X6.2.1). A short row is promoted if its strength at creation was 70
 * or more, if it is the holder's strongest row about a person he has an edge with, or if it is a first
 * event and he has no permanent row of that kind. The layer holds at most 12 rows: when full, a candidate
 * replaces the weakest permanent row only if stronger.
 */
export function promoteAtSeasonEnd(rows: readonly HeldMemory[], kinds: KindTable, now: WorldDate, ctx: PromotionContext): PromotionResult {
  const short = rows.filter(isShort);
  const strongestAbout = new Map<number, HeldMemory>();
  for (const r of short) {
    if (r.aboutPersonId === null || !ctx.edgePersonIds.has(r.aboutPersonId)) continue;
    const cur = strongestAbout.get(r.aboutPersonId);
    if (!cur || r.strength > cur.strength) strongestAbout.set(r.aboutPersonId, r);
  }
  const permKinds = new Set(rows.filter(isPerm).map((r) => r.kind));
  const firsts = new Set<string>();
  const candidates = short.filter((r) => {
    if (r.strength >= mp('memory.permanent.promoteMin')) return true;
    if (r.aboutPersonId !== null && strongestAbout.get(r.aboutPersonId) === r) return true;
    if (kindOf(r, kinds).first && !permKinds.has(r.kind) && !firsts.has(r.kind)) { firsts.add(r.kind); return true; }
    return false;
  }).sort((a, b) => b.strength - a.strength || a.eventId - b.eventId);

  let perm = rows.filter(isPerm);
  const promoted: HeldMemory[] = [];
  const cap = mp('memory.permanent.cap');
  for (const c of candidates) {
    const p: HeldMemory = { ...c, layer: 'permanent' };
    if (perm.length < cap) { perm = [...perm, p]; promoted.push(p); continue; }
    const weakest = perm.reduce((w, r) => (effectiveStrength(r, rows, kinds, now) < effectiveStrength(w, rows, kinds, now) ? r : w));
    if (c.strength > effectiveStrength(weakest, rows, kinds, now)) {
      perm = [...perm.filter((r) => r !== weakest), p];
      promoted.push(p);
    }
  }
  const promotedIds = new Set(promoted.map((r) => r.eventId));
  return {
    rows: [...perm, ...short.filter((r) => !promotedIds.has(r.eventId))],
    promoted,
    compactionExempt: perm.map((r) => r.eventId),
  };
}

export interface RefeelHit {
  readonly eventId: number;
  /** Positive is a stress hit, negative a relief (X5.2.1), strength times 0.2, signed from the holder's side. */
  readonly stress: number;
}

/**
 * Re-feeling on meeting the subject again (X6.2.2): a game against him, an interview with him, joining his
 * staff. Anniversaries are not used. A row triggers once per meeting: a row already felt on this date is skipped.
 * A retired subject's rows stop triggering and stay on the record.
 */
export function refeel(rows: readonly HeldMemory[], subject: { aboutPersonId: number | null; aboutTeamId: number | null }, on: WorldDate, subjectRetired: boolean): { rows: HeldMemory[]; hits: RefeelHit[] } {
  const hits: RefeelHit[] = [];
  if (subjectRetired) return { rows: [...rows], hits };
  const out = rows.map((r) => {
    if (!isPerm(r) || !sameSubject(r, subject)) return r;
    if (r.lastFelt.seasonYear === on.seasonYear && r.lastFelt.dayIndex === on.dayIndex) return r;
    const s = permanentStrengthFor(r, rows, on);
    hits.push({ eventId: r.eventId, stress: Math.round(-r.sign * s * mp('memory.permanent.refeelFactor') * 10) / 10 });
    return { ...r, lastFelt: on };
  });
  return { rows: out, hits };
}

function permanentStrengthFor(r: HeldMemory, all: readonly HeldMemory[], on: WorldDate): number {
  return effectiveStrength(r, all, {}, on);
}

/**
 * Demotion out of tier 1 (X6.5.1 edge case): promote any short row that qualifies, then drop short rows
 * the new tier does not keep. Tier 2 keeps short rows about tier 1 people; tier 3 keeps permanent rows only.
 */
export function demote(rows: readonly HeldMemory[], kinds: KindTable, now: WorldDate, ctx: PromotionContext, newTier: 2 | 3, involvesTier1: (r: HeldMemory) => boolean): PromotionResult {
  const p = promoteAtSeasonEnd(rows, kinds, now, ctx);
  const kept = p.rows.filter((r) => isPerm(r) || (newTier === 2 && involvesTier1(r)));
  return { ...p, rows: kept };
}
