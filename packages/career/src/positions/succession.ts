// X8.1.1 succession grammar, X8.3.1 interim naming, X8.3.2 the absent play caller.
// Resolution walks the chair's steps in order; the first step with an eligible candidate wins; ties break
// by years in that chair, years on this staff, age (older first), then person id, so two runs of one seed
// resolve every tie the same way (J13).
import type { RandomStream, SuccessionStep, WorldDate } from '@gm/schema';
import { CATALOGUE, type Catalogue } from './catalogue.ts';
import { param } from './params.ts';
import { fillSeat, headCoachSeat, seat, seatsHeldBy, setCaller, type Seat, type Side, type Staff } from './staff.ts';

/** What succession needs to know about a person (all public or own-team facts). */
export interface PersonFacts {
  readonly personId: number;
  /** Birth as an absolute day number (smaller is older). */
  readonly bornDay: number;
  readonly employed: boolean;
  readonly suspended: boolean;
  readonly onLeave: boolean;
  /** Absolute day number he joined this staff, or null if unknown. */
  readonly joinedStaffDay: number | null;
  /** E1.1.1 coaching side he came up on (X8.3.2 "the head coach if he came up on that side"). */
  readonly cameUpOn: Side | null;
}

export interface SuccessionContext {
  readonly staff: Staff;
  readonly people: ReadonlyMap<number, PersonFacts>;
  /** Absolute day number of today (years in chair are measured from seat start dates). */
  readonly today: number;
  /** Absolute day number of a world date (the league calendar owns the year length). */
  dayOf(d: WorldDate): number;
  /** People unavailable for this resolution (the departed or absent holder, and anyone ruled out). */
  readonly absent: ReadonlySet<number>;
  /**
   * The appointer's choice at an `appointer_pick` step: given the eligible staff in tie-break order,
   * return one of their ids, or 'outside' when the step allows it. Absent means the first candidate.
   */
  readonly appointerPick?: (seatId: number, candidates: readonly number[], outsideAllowed: boolean) => number | 'outside';
  readonly catalogue?: Catalogue;
}

export type Resolution =
  | { readonly kind: 'inside'; readonly personId: number; readonly step: number; readonly stepKind: SuccessionStep['kind'] }
  | { readonly kind: 'outside'; readonly step: number }
  | { readonly kind: 'none' };

interface Cand { readonly personId: number; readonly chairDay: number; readonly staffDay: number; readonly bornDay: number }

const BIG = Number.MAX_SAFE_INTEGER;

function sortCands(cands: Cand[], order: 'years_in_chair' | 'years_on_staff' | 'age'): Cand[] {
  const keys: ((c: Cand) => number)[] = order === 'years_on_staff'
    ? [(c) => c.staffDay, (c) => c.chairDay, (c) => c.bornDay]
    : order === 'age'
      ? [(c) => c.bornDay, (c) => c.chairDay, (c) => c.staffDay]
      : [(c) => c.chairDay, (c) => c.staffDay, (c) => c.bornDay];
  // Earlier day = more years = first. Person id last keeps it deterministic.
  return cands.sort((a, b) => {
    for (const k of keys) { const d = k(a) - k(b); if (d !== 0) return d; }
    return a.personId - b.personId;
  });
}

/** X8.1.1 rule 2: employed, not suspended, not on leave, not absent, and not leaving a game chair uncovered. */
function eligible(personId: number, targetSeatId: number, ctx: SuccessionContext, visiting: ReadonlySet<number>): boolean {
  if (ctx.absent.has(personId)) return false;
  const p = ctx.people.get(personId);
  if (!p || !p.employed || p.suspended || p.onLeave) return false;
  const cat = ctx.catalogue ?? CATALOGUE;
  for (const held of seatsHeldBy(ctx.staff, personId)) {
    if (held.seatId === targetSeatId || !cat.position(held.positionId).definition.requiredForGame) continue;
    if (visiting.has(held.seatId)) return false;
    // Would his own game chair have someone behind it from inside the staff?
    const behind = resolveInner(held.seatId, { ...ctx, absent: new Set([...ctx.absent, personId]) }, new Set([...visiting, targetSeatId]), false);
    if (behind.kind !== 'inside') return false;
  }
  return true;
}

function candidate(personId: number, chairSeats: readonly Seat[], ctx: SuccessionContext): Cand {
  const p = ctx.people.get(personId)!;
  const chairDay = Math.min(BIG, ...chairSeats.filter((s) => s.holderPersonId === personId && s.holderSince).map((s) => ctx.dayOf(s.holderSince!)));
  return { personId, chairDay, staffDay: p.joinedStaffDay ?? BIG, bornDay: p.bornDay };
}

function stepCandidates(step: SuccessionStep, target: Seat, ctx: SuccessionContext, visiting: ReadonlySet<number>): number[] {
  const cat = ctx.catalogue ?? CATALOGUE;
  const held = ctx.staff.seats.filter((s) => s.holderPersonId !== null && s.seatId !== target.seatId);
  let pool: Seat[];
  let order: 'years_in_chair' | 'years_on_staff' | 'age' = 'years_in_chair';
  switch (step.kind) {
    case 'named_deputy': {
      const d = target.namedDeputyPersonId;
      return d !== null && eligible(d, target.seatId, ctx, visiting) ? [d] : [];
    }
    case 'role': pool = held.filter((s) => s.positionId === step.positionId); break;
    case 'role_group':
      pool = held.filter((s) => cat.position(s.positionId).roleGroup === step.group && (step.side === null || s.side === step.side));
      order = step.order;
      break;
    case 'appointer_pick': pool = held.filter((s) => cat.position(s.positionId).roleGroup !== 'boss'); break;
  }
  const ids = [...new Set(pool.map((s) => s.holderPersonId!))].filter((id) => eligible(id, target.seatId, ctx, visiting));
  return sortCands(ids.map((id) => candidate(id, pool, ctx)), order).map((c) => c.personId);
}

function resolveInner(seatId: number, ctx: SuccessionContext, visiting: ReadonlySet<number>, allowOutside: boolean): Resolution {
  const cat = ctx.catalogue ?? CATALOGUE;
  const target = seat(ctx.staff, seatId);
  const def = cat.position(target.positionId).definition;
  const steps = def.successionRule;
  const inner = new Set([...visiting, seatId]);
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const cands = stepCandidates(step, target, ctx, inner);
    if (step.kind === 'appointer_pick') {
      const outsideOk = allowOutside && step.outsideAllowed;
      if (cands.length > 0) {
        const choice = ctx.appointerPick ? ctx.appointerPick(seatId, cands, outsideOk) : cands[0]!;
        if (choice === 'outside') { if (outsideOk) return { kind: 'outside', step: i }; }
        else if (cands.includes(choice)) return { kind: 'inside', personId: choice, step: i, stepKind: step.kind };
        else return { kind: 'inside', personId: cands[0]!, step: i, stepKind: step.kind };
      }
      // X8.1.1 edge case: every candidate ineligible; a game chair's appointer may reach outside the staff.
      if (allowOutside && (step.outsideAllowed || def.requiredForGame)) return { kind: 'outside', step: i };
      continue;
    }
    if (cands.length > 0) return { kind: 'inside', personId: cands[0]!, step: i, stepKind: step.kind };
  }
  return { kind: 'none' };
}

/** Resolve who fills a chair now under its X8.1.1 rule. 'none' means the chair waits for a hire (X8.4.2). */
export function resolveSuccession(seatId: number, ctx: SuccessionContext): Resolution {
  return resolveInner(seatId, ctx, new Set(), true);
}

// ---------- X8.3.1 interim ----------

export interface InterimResult {
  readonly staff: Staff;
  readonly resolution: Resolution;
  /** Interim or acting per the chair's `interimAllowed`; null when nobody was named. */
  readonly holding: 'interim' | 'acting' | null;
}

/**
 * Name the interim (or acting holder) of an emptied chair the same day (X8.3.1 rule 1). An AI appointer
 * with an inside candidate still goes outside with the starting chance when the chair's rule allows it;
 * the user's appointer decides through `appointerPick`. The interim keeps his old seats (X8.3.1).
 * An 'outside' result leaves the chair open for K7 to supply the person.
 */
export function nameInterim(seatId: number, date: WorldDate, ctx: SuccessionContext, opts: { appointerIsUser: boolean; stream: RandomStream }): InterimResult {
  const cat = ctx.catalogue ?? CATALOGUE;
  const def = cat.position(seat(ctx.staff, seatId).positionId).definition;
  if (def.interimAllowed === 'no') return { staff: ctx.staff, resolution: { kind: 'none' }, holding: null };
  const pickStep = def.successionRule.findIndex((s) => s.kind === 'appointer_pick' && s.outsideAllowed);
  if (!opts.appointerIsUser && pickStep >= 0 && opts.stream.chance(param('interim.outsideChance'))) {
    return { staff: ctx.staff, resolution: { kind: 'outside', step: pickStep }, holding: null };
  }
  const r = resolveSuccession(seatId, ctx);
  if (r.kind !== 'inside') return { staff: ctx.staff, resolution: r, holding: null };
  const holding = def.interimAllowed === 'acting_only' ? 'acting' : 'interim';
  return { staff: fillSeat(ctx.staff, seatId, r.personId, date, holding), resolution: r, holding };
}

// ---------- X8.3.2 absent play caller ----------

export interface StandIn { readonly personId: number; readonly seatId: number; readonly reason: 'named_deputy' | 'head_coach_side' | 'senior_position_coach' | 'head_coach' }

/**
 * Default stand-in when the caller of a side is unavailable: the caller seat's named deputy, else the head
 * coach if he came up on that side, else the senior position coach on that side, else the head coach.
 * Nobody calls two sides at once (X8.3.2 edge case): people calling another side are skipped.
 */
export function standInCaller(side: Side, ctx: SuccessionContext): StandIn {
  const cat = ctx.catalogue ?? CATALOGUE;
  const staff = ctx.staff;
  const callerSeat = seat(staff, staff.callers[side]);
  const busy = new Set<number>();
  for (const [s, id] of Object.entries(staff.callers)) {
    if (s === side) continue;
    const h = seat(staff, id).holderPersonId;
    if (h !== null && !ctx.absent.has(h)) busy.add(h);
  }
  const ok = (id: number | null): id is number => {
    if (id === null || busy.has(id) || ctx.absent.has(id)) return false;
    const p = ctx.people.get(id);
    return !!p && p.employed && !p.suspended && !p.onLeave;
  };
  const seatOf = (id: number) => seatsHeldBy(staff, id)[0]!.seatId;
  if (ok(callerSeat.namedDeputyPersonId) && seatsHeldBy(staff, callerSeat.namedDeputyPersonId).length > 0) {
    return { personId: callerSeat.namedDeputyPersonId, seatId: seatOf(callerSeat.namedDeputyPersonId), reason: 'named_deputy' };
  }
  const hc = headCoachSeat(staff);
  if (ok(hc.holderPersonId) && ctx.people.get(hc.holderPersonId)?.cameUpOn === side) return { personId: hc.holderPersonId, seatId: hc.seatId, reason: 'head_coach_side' };
  const coaches = staff.seats.filter((s) => s.holderPersonId !== null && cat.position(s.positionId).roleGroup === 'position_coaches' && s.side === side && ok(s.holderPersonId));
  const ranked = sortCands([...new Set(coaches.map((s) => s.holderPersonId!))].map((id) => candidate(id, coaches, ctx)), 'years_in_chair');
  if (ranked.length > 0) return { personId: ranked[0]!.personId, seatId: seatOf(ranked[0]!.personId), reason: 'senior_position_coach' };
  if (hc.holderPersonId !== null) return { personId: hc.holderPersonId, seatId: hc.seatId, reason: 'head_coach' };
  throw new Error(`positions: team ${staff.teamId} has nobody to call ${side} (X8.3.1 must name a head coach first)`);
}

/** Apply a stand-in for one game: the caller of `side` becomes his seat (the sheet passes as is, G7). */
export function applyStandIn(staff: Staff, side: Side, s: StandIn): Staff {
  return setCaller(staff, side, s.seatId);
}

/** X8.3.2 rule 5: one AI-world draw for a caller missing a game for illness or family reasons. */
export function callerAbsentThisGame(stream: RandomStream): boolean {
  return stream.chance(param('standin.absenceRatePerGame'));
}

/** X8.3.2 rule 1: minutes before kickoff after which the default stand-in stands. */
export function standInDeadlineMinutes(): number {
  return param('standin.pregameDeadlineMinutes');
}
