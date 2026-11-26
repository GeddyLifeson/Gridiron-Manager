// X8.4.1 firing cascade and X8.4.2 vacancy filling. When a head coach goes, the new one brings people he
// trusts, keeps some incumbents, and releases the rest; every chair a promotion empties opens in turn, so
// one change ripples down the chart until a chair posts to the market (K7). Choices by people (who comes,
// whom the appointer promotes) are inputs decided by K7, K8 and the user; this module owns the order, the
// windows, the starting chances, and the bookkeeping.
import type { RandomStream, WorldDate } from '@gm/schema';
import { CATALOGUE, type Catalogue, type CascadeKind } from './catalogue.ts';
import { draft, EVENT, type DraftMeta, type EventDraft } from './events.ts';
import { param } from './params.ts';
import { fillSeat, seat, seatsHeldBy, vacateSeat, type Staff } from './staff.ts';

/** Keyed stream factory (scope fields: team id, seat id, decision). Stream name requested: CR-G25-3. */
export type StreamFor = (scope: readonly (string | number)[]) => RandomStream;

/** What the new head coach and the appointer think of one incumbent (X7 edges, X2.3.1 views, F/G family). */
export interface IncumbentView {
  readonly strongPositiveEdge: boolean;
  readonly negativeEdge: boolean;
  readonly unitTopQuarter: boolean;
  readonly sameSchemeFamily: boolean;
  readonly requiredByAppointer: boolean;
}

export interface CascadeInput {
  readonly staff: Staff;
  readonly newHeadCoachId: number;
  /** Day the new head coach was hired, or the review start (the day after a bowl, X8.4.1 edge case). */
  readonly reviewStart: WorldDate;
  /** Bring list after K7: for each chair, the person the new head coach wanted and whether he came. */
  readonly bring: readonly { readonly seatId: number; readonly personId: number; readonly accepted: boolean }[];
  /** Incumbents the new head coach keeps in a different chair (a retained event with the new title). */
  readonly moves?: readonly { readonly personId: number; readonly toSeatId: number }[];
  view(personId: number, seatId: number): IncumbentView;
  readonly stream: StreamFor;
  addDays(d: WorldDate, days: number): WorldDate;
  readonly meta: DraftMeta;
  readonly catalogue?: Catalogue;
}

export interface SeatDecision {
  readonly seatId: number;
  readonly incumbentId: number | null;
  readonly outcome: 'brought' | 'retained' | 'moved' | 'released' | 'open';
  /** Person in the chair after the review (null when it opens). */
  readonly holderId: number | null;
  /** The decision is due by this date (X8.4.1 rule 1). */
  readonly decideBy: WorldDate;
  /** Chance the incumbent was kept (rule 3), null when no draw was made. */
  readonly keepChance: number | null;
}

export interface CascadeResult {
  readonly staff: Staff;
  readonly decisions: readonly SeatDecision[];
  readonly events: readonly EventDraft[];
  /** Chairs left open, each to run through `fillVacancy`. */
  readonly openSeatIds: readonly number[];
}

/** X8.4.1 rule 3: base chance by chair kind plus adjustments, clamped; the appointer's say is 100 percent. */
export function keepChance(kind: CascadeKind, v: IncumbentView): number {
  if (v.requiredByAppointer) return 1;
  if (kind === 'none' || kind === 'head_coach') return 1;
  let p = param(`keep.${kind}`);
  if (v.strongPositiveEdge) p += param('keep.adjust.strongEdge');
  if (v.unitTopQuarter) p += param('keep.adjust.topQuarterUnit');
  if (v.sameSchemeFamily) p += param('keep.adjust.sameScheme');
  if (v.negativeEdge) p += param('keep.adjust.negativeEdge');
  return Math.min(param('keep.clampMax'), Math.max(0, p));
}

function windowDays(kind: CascadeKind): number {
  return kind === 'coordinator' || kind === 'special_teams_coordinator' ? param('cascade.coordinatorWindowDays') : param('cascade.otherWindowDays');
}

/** Run the review of every chair after a head coach change (X8.4.1 rules 1 to 4). */
export function firingCascade(input: CascadeInput): CascadeResult {
  const cat = input.catalogue ?? CATALOGUE;
  let staff = input.staff;
  const decisions: SeatDecision[] = [];
  const events: EventDraft[] = [];
  const open: number[] = [];
  const teamId = staff.teamId;
  const bringBySeat = new Map(input.bring.filter((b) => b.accepted).map((b) => [b.seatId, b.personId] as const));
  const moved = new Map((input.moves ?? []).map((m) => [m.personId, m.toSeatId] as const));
  const reviewed = staff.seats.filter((s) => {
    const kind = cat.position(s.positionId).cascadeKind;
    return kind !== 'none' && kind !== 'head_coach';
  });
  // Pass 1: decide each incumbent where he sits; release frees his chair before anyone moves in.
  const released = new Set<number>();
  const kept: { personId: number; seatId: number }[] = [];
  for (const s of reviewed) {
    const kind = cat.position(s.positionId).cascadeKind;
    const decideBy = input.addDays(input.reviewStart, windowDays(kind));
    const inc = s.holderPersonId;
    if (inc === null || inc === input.newHeadCoachId) continue;
    if (moved.has(inc)) { kept.push({ personId: inc, seatId: s.seatId }); continue; }
    if (bringBySeat.has(s.seatId)) {
      released.add(inc);
      decisions.push({ seatId: s.seatId, incumbentId: inc, outcome: 'released', holderId: null, decideBy, keepChance: null });
      continue;
    }
    const p = keepChance(kind, input.view(inc, s.seatId));
    const keep = p >= 1 || input.stream([teamId, s.seatId, 'keep']).chance(p);
    if (keep) kept.push({ personId: inc, seatId: s.seatId });
    else released.add(inc);
    decisions.push({ seatId: s.seatId, incumbentId: inc, outcome: keep ? 'retained' : 'released', holderId: keep ? inc : null, decideBy, keepChance: p });
  }
  // People released from every seat they held leave the staff; those kept anywhere stay.
  const keptIds = new Set(kept.map((k) => k.personId));
  for (const s of reviewed) {
    const h = s.holderPersonId;
    if (h !== null && released.has(h) && !keptIds.has(h)) staff = vacateSeat(staff, s.seatId, input.reviewStart);
  }
  for (const id of released) if (!keptIds.has(id)) events.push(draft(EVENT.released, input.meta, teamId, id, 'released', seatsHeldBy(input.staff, id)[0]?.seatId ?? null, { seatId: seatsHeldBy(input.staff, id)[0]?.seatId ?? null }));
  // Pass 2: moves (kept, new chair), then the bring list fills its chairs.
  for (const [personId, toSeatId] of moved) {
    for (const s of seatsHeldBy(staff, personId)) staff = vacateSeat(staff, s.seatId, input.reviewStart);
    const target = seat(staff, toSeatId);
    if (target.holderPersonId !== null) staff = vacateSeat(staff, toSeatId, input.reviewStart);
    staff = fillSeat(staff, toSeatId, personId, input.reviewStart);
    decisions.push({ seatId: toSeatId, incumbentId: personId, outcome: 'moved', holderId: personId, decideBy: input.addDays(input.reviewStart, windowDays(cat.position(target.positionId).cascadeKind)), keepChance: null });
    events.push(draft(EVENT.retained, input.meta, teamId, personId, 'retained', toSeatId, { seatId: toSeatId, moved: true }));
  }
  for (const k of kept) if (!moved.has(k.personId)) events.push(draft(EVENT.retained, input.meta, teamId, k.personId, 'retained', k.seatId, { seatId: k.seatId, moved: false }));
  for (const [seatId, personId] of bringBySeat) {
    staff = fillSeat(staff, seatId, personId, input.reviewStart);
    decisions.push({ seatId, incumbentId: null, outcome: 'brought', holderId: personId, decideBy: input.addDays(input.reviewStart, windowDays(cat.position(seat(staff, seatId).positionId).cascadeKind)), keepChance: null });
  }
  for (const s of staff.seats) if (s.holderPersonId === null && reviewed.some((r) => r.seatId === s.seatId)) open.push(s.seatId);
  return { staff, decisions, events, openSeatIds: open };
}

/** X8.4.1 rule 5: the departed head coach's close staff weigh his offer; base weights for K7. */
export function followChance(oldRung: number | null, offeredRung: number | null): number {
  return (offeredRung ?? 0) >= (oldRung ?? 0) ? param('follow.sameOrHigher') : param('follow.lower');
}

export function decideFollow(personId: number, oldRung: number | null, offeredRung: number | null, stream: RandomStream): boolean {
  return stream.chance(followChance(oldRung, offeredRung));
}

/** X8.4.1 rule 6: released people still without a job after the starting time become exit candidates (X12.1.3). */
export function exitCandidates(released: readonly { personId: number; releasedDay: number }[], today: number, employed: (id: number) => boolean): readonly number[] {
  const after = param('cascade.exitAfterDaysUnemployed');
  return released.filter((r) => !employed(r.personId) && today - r.releasedDay >= after).map((r) => r.personId);
}

// ---------- X8.4.2 vacancies ----------

/** The appointer's decision for one open chair: promote someone already on the staff, or post it. */
export type VacancyDecision = { readonly kind: 'promote'; readonly personId: number } | { readonly kind: 'post' };

export interface VacancyResult {
  readonly staff: Staff;
  readonly events: readonly EventDraft[];
  /** Chairs posted to K7 (job_opened), in the order they opened. */
  readonly posted: readonly number[];
}

/**
 * Fill an open chair, inside first (X8.4.2 rule 1). A promotion empties the person's old chair unless
 * the new one is a title on top of it (S1.1.2 rung 6); that chair is decided next, and so on down the
 * chart until a chair is posted. Chains are bounded by the staff size, so every call ends.
 */
export function fillVacancy(staff0: Staff, seatId: number, date: WorldDate, decide: (s: Staff, seatId: number) => VacancyDecision, meta: DraftMeta, cat: Catalogue = CATALOGUE): VacancyResult {
  let staff = staff0;
  const events: EventDraft[] = [];
  const posted: number[] = [];
  const queue: number[] = [seatId];
  const done = new Set<number>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    const s = seat(staff, id);
    if (s.holderPersonId !== null && s.holding === 'permanent') continue;
    const d = decide(staff, id);
    if (d.kind === 'promote') {
      const from = seatsHeldBy(staff, d.personId).filter((x) => x.seatId !== id);
      const keepOld = s.titleOnTop || cat.job(s.catalogueId).titleOnTop;
      if (!keepOld) for (const f of from) { staff = vacateSeat(staff, f.seatId, date); queue.push(f.seatId); }
      staff = fillSeat(staff, id, d.personId, date);
      events.push(draft(EVENT.promoted, meta, staff.teamId, d.personId, 'promoted', id, { seatId: id, fromSeatId: from[0]?.seatId ?? null }));
    } else {
      posted.push(id);
      events.push(draft(EVENT.opened, meta, staff.teamId, null, 'none', id, { seatId: id, rung: s.rung ?? -1, positionId: s.positionId }));
    }
  }
  return { staff, events, posted };
}

/** X8.4.2: a low chair still open after the starting weeks fills from the weekly pool (D13.3.6). */
export function poolFillDue(staff: Staff, seatId: number, today: number, dayOf: (d: WorldDate) => number): boolean {
  const s = seat(staff, seatId);
  if (s.holderPersonId !== null || s.vacantSince === null || s.rung === null) return false;
  if (s.rung > param('vacancy.poolRungMax')) return false;
  return today - dayOf(s.vacantSince) >= param('vacancy.poolAfterWeeks') * param('vacancy.daysPerWeek');
}

/** X8.4.2 acceptance: chairs open longer than the starting bound (a soak check, not a rule). */
export function overdueSeats(staff: Staff, today: number, dayOf: (d: WorldDate) => number): readonly number[] {
  return staff.seats.filter((s) => s.holderPersonId === null && s.vacantSince !== null && today - dayOf(s.vacantSince) > param('vacancy.maxEmptyDays')).map((s) => s.seatId);
}
