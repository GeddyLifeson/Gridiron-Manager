// A headless staff week: every held seat's week-screen duties performed, by AI workers and optionally the
// user in one seat (S3.1.1 AI use: every cell is also an AI behaviour; the user's seat swaps one AI for the
// human). Writes the S3.1.1 output events. Hours go to E7 through the result; grades go to S4 through events.
import type { RandomStream } from '@gm/schema';
import { CATALOGUE, type Staff } from '../positions/index.ts';
import { BANDS, bandOf, type RungBand } from './duties.ts';
import { EVENT, draft, type DraftMeta, type EventDraft } from './events.ts';
import { dutyList, weekScreen, type DutyAssignment, type WeekKind } from './ownership.ts';
import { aiWorker, performDuties, type BossJudge, type TruthSource, type WeekResult, type Worker } from './perform.ts';

/** Bands above the lowest rung that no held seat on this staff covers (S3.1.1 short staff). */
export function emptyBandsOf(staff: Staff): Set<RungBand> {
  const held = new Set<RungBand>();
  for (const s of staff.seats) { const b = bandOf(s.rung); if (b && s.holderPersonId !== null) held.add(b); }
  return new Set(BANDS.filter((b) => !held.has(b)));
}

export function seatDutyList(staff: Staff, seatId: number, hasRosterSay = false): DutyAssignment[] {
  const seat = staff.seats.find((s) => s.seatId === seatId);
  if (!seat) throw new Error(`ladder: no seat ${seatId}`);
  const job = CATALOGUE.job(seat.catalogueId);
  const callsPlays = Object.values(staff.callers).includes(seat.seatId);
  return dutyList({ job, level: staff.level, flags: { callsPlays, hasRosterSay }, emptyBands: emptyBandsOf(staff) });
}

export interface StaffWeekInput {
  readonly staff: Staff;
  readonly kind: WeekKind;
  readonly truth: TruthSource;
  readonly stream: RandomStream;
  readonly judge: BossJudge | null;
  readonly meta: DraftMeta;
  /** AI accuracy by seat (K6 hidden parameters); default 0.85, a module stand-in until G-26 profiles land. */
  readonly accuracy?: (seatId: number) => number;
  readonly user?: { readonly seatId: number; readonly worker: Worker };
  readonly requests?: ReadonlySet<string>;
  /** Seat id holding final roster say (L5.2.1), if any. */
  readonly rosterSaySeatId?: number | null;
}

export interface SeatWeek { readonly seatId: number; readonly personId: number; readonly result: WeekResult }

export function runStaffWeek(input: StaffWeekInput): { seats: SeatWeek[]; events: EventDraft[] } {
  const seats: SeatWeek[] = [];
  const events: EventDraft[] = [];
  for (const seat of input.staff.seats) {
    if (seat.holderPersonId === null) continue;
    const list = weekScreen(seatDutyList(input.staff, seat.seatId, input.rosterSaySeatId === seat.seatId), input.kind, input.requests);
    if (list.length === 0) continue;
    const worker = input.user?.seatId === seat.seatId ? input.user.worker : aiWorker(input.accuracy?.(seat.seatId) ?? 0.85, input.stream);
    const result = performDuties(list, input.truth, worker, input.judge);
    seats.push({ seatId: seat.seatId, personId: seat.holderPersonId, result });
    for (const a of list) if (a.source === 'pushed_down') events.push(draft(EVENT.pushedDown, input.meta, input.staff.teamId, seat.holderPersonId, seat.seatId, { dutyId: a.duty.id, fromBand: a.fromBand ?? '' }));
    for (const p of result.products) {
      events.push(draft(EVENT.performed, input.meta, input.staff.teamId, seat.holderPersonId, seat.seatId, { dutyId: p.dutyId, ownership: p.ownership, hours: p.hours, used: p.used === true }));
      if (p.grade !== null) events.push(draft(EVENT.graded, input.meta, input.staff.teamId, seat.holderPersonId, seat.seatId, { dutyId: p.dutyId, grader: p.grader, grade: Math.round(p.grade * 10) / 10 }));
    }
  }
  return { seats, events };
}
