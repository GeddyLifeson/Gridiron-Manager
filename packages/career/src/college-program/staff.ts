// T9.4.1 college staff structure and limits, and the staff side of T9.6.1 pay. Limits come from rule
// keys (never hard-coded). Going over a seat limit warns once a season and writes one violation row
// per hire through the L8.2.5 pipeline; it never blocks. Only the budget is arithmetic: money not in
// the pool cannot be paid.
import type { PersonOrigin, RandomStream, RuleSet, WorldDate, WorldTier } from '@gm/schema';
import { compliance } from '@gm/league';
import { committedSalaries } from './budget.ts';
import { P } from './params.ts';
import { drawSalaryCents } from './pay.ts';
import { seatLimit } from './rules.ts';
import { LIMITED_SEATS, type LimitedSeat, type ProgramState, type ProgramTier, type StaffSeat } from './types.ts';

/**
 * Violation class per limited seat. Off-campus recruiters are a T9.5.1 recruiting row (class
 * `recruiting_contact`). The other seat limits need class `staff_seat_limit`, requested from the
 * pipeline owner (CR-G38-3); until it lands commitAct answers `unknown_class` and the hire still stands.
 */
export const SEAT_CLASS: Readonly<Record<LimitedSeat, string>> = {
  off_campus_recruiter: 'recruiting_contact',
  graduate_assistant: 'staff_seat_limit',
  strength: 'staff_seat_limit',
  student_assistant: 'staff_seat_limit',
  headset: 'staff_seat_limit',
};

export function seatCount(staff: readonly StaffSeat[], seat: LimitedSeat): number {
  return staff.filter((s) => s.counts.includes(seat)).length;
}

/** Total staff size by tier (T9.4.1 rule 3). Staff beyond the budget is not possible: callers check money. */
export function drawStaffSize(tier: ProgramTier, rng: RandomStream): number {
  return rng.int(P(`staff.size_min.${tier}`), P(`staff.size_max.${tier}`));
}

export interface SeatWarning {
  readonly seat: LimitedSeat;
  readonly limit: number;
  readonly countAfter: number;
  readonly classId: string;
  /** Shown only the first time this season (T9.4.1 acceptance: warns once). */
  readonly show: boolean;
}

export interface HireCheck {
  readonly money: 'ok' | 'no_money' | 'seats_frozen';
  readonly warnings: readonly SeatWarning[];
}

/** What a hire would do, before the coach confirms (L8.2.5 step 1 for the seat limits). */
export function checkHire(p: ProgramState, seat: StaffSeat, rules: RuleSet): HireCheck {
  const free = p.budget.lines[seat.pool] - committedSalaries(p.staff, seat.pool);
  const money = p.budget.seatsFrozen ? 'seats_frozen' : seat.salaryCents > free ? 'no_money' : 'ok';
  const warnings: SeatWarning[] = [];
  for (const s of seat.counts) {
    const limit = seatLimit(rules, s);
    if (limit === null) continue;
    const after = seatCount(p.staff, s) + 1;
    if (after > limit) warnings.push({ seat: s, limit, countAfter: after, classId: SEAT_CLASS[s], show: !p.warnedSeats.includes(s) });
  }
  return { money, warnings };
}

/** The person making the hire and where the act lands. */
export interface HireContext {
  readonly hirerPersonId: number;
  readonly hirerRole: 'head_coach' | 'coordinator' | 'general_manager';
  readonly hirerOrigin: PersonOrigin;
  readonly competitionId: number | null;
  readonly date: WorldDate;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export type HireResult =
  | { readonly ok: true; readonly program: ProgramState; readonly compliance: compliance.ComplianceState; readonly commits: readonly compliance.CommitResult[]; readonly warnings: readonly SeatWarning[] }
  | { readonly ok: false; readonly reason: 'no_money' | 'seats_frozen' };

/**
 * Hire into a seat. Money is the only refusal. Each seat limit the hire passes writes exactly one
 * violation row (actor: the hirer; the hired person knew). Same code for the user and for AI programs.
 */
export function hire(p: ProgramState, cs: compliance.ComplianceState, seat: StaffSeat, rules: RuleSet, sink: compliance.EventSink, c: HireContext): HireResult {
  const check = checkHire(p, seat, rules);
  if (check.money !== 'ok') return { ok: false, reason: check.money };
  let state = cs;
  const commits: compliance.CommitResult[] = [];
  for (const w of check.warnings) {
    const r = compliance.commitAct(state, {
      classId: w.classId,
      actor: { personId: c.hirerPersonId, role: c.hirerRole, teamId: p.teamId, origin: c.hirerOrigin },
      orderedBy: null,
      knew: [c.hirerPersonId, seat.personId],
      date: c.date, competitionId: c.competitionId, gain: 0, tier: c.tier, source: c.source, severity: 'minor',
    }, rules, sink);
    state = r.state;
    commits.push(r);
  }
  const warned = [...p.warnedSeats, ...check.warnings.map((w) => w.seat).filter((s) => !p.warnedSeats.includes(s))];
  return { ok: true, program: { ...p, staff: [...p.staff, seat], warnedSeats: warned }, compliance: state, commits, warnings: check.warnings };
}

export function release(p: ProgramState, jobId: number): ProgramState {
  return { ...p, staff: p.staff.filter((s) => s.jobId !== jobId) };
}

/** A new season clears the warn-once memory. */
export function newSeasonWarnings(p: ProgramState): ProgramState {
  return { ...p, warnedSeats: [] };
}

/** Change one assistant's pay inside the pool (the coach splits the staff pool, T9.2.1 rule 2). */
export function setSalary(p: ProgramState, jobId: number, salaryCents: number): { readonly ok: true; readonly program: ProgramState } | { readonly ok: false; readonly reason: 'no_seat' | 'no_money' } {
  const seat = p.staff.find((s) => s.jobId === jobId);
  if (!seat) return { ok: false, reason: 'no_seat' };
  const others = committedSalaries(p.staff, seat.pool) - seat.salaryCents;
  if (others + salaryCents > p.budget.lines[seat.pool]) return { ok: false, reason: 'no_money' };
  return { ok: true, program: { ...p, staff: p.staff.map((s) => (s.jobId === jobId ? { ...s, salaryCents } : s)) } };
}

/**
 * An AI head coach splits the staff pool (T9.2.1 AI use): each seat draws its band salary, coordinators
 * are weighted by the coach's tilt (0 to 1, a disposition), and the whole is scaled down to fit the pool.
 * Never pays more than the pool holds.
 */
export function aiSplitStaffPool(seats: readonly StaffSeat[], poolCents: number, tier: ProgramTier, year: number, coordinatorTilt: number, rng: RandomStream): StaffSeat[] {
  const drawn = seats.map((s) => {
    if (s.pool !== 'staff_pool' || s.payRole === 'support') return s;
    const base = drawSalaryCents(s.payRole, tier, year, rng);
    const w = s.payRole === 'coordinator' ? 1 + coordinatorTilt * P('staff.coordinator_pool_share') : 1;
    return { ...s, salaryCents: Math.round(base * w) };
  });
  const total = committedSalaries(drawn, 'staff_pool');
  if (total <= poolCents || total === 0) return drawn;
  const f = poolCents / total;
  return drawn.map((s) => (s.pool === 'staff_pool' ? { ...s, salaryCents: Math.floor(s.salaryCents * f) } : s));
}

/** Seat counts against every limit, for the staff chart (S1.2.1 "limited seats counted"). */
export function seatSummary(staff: readonly StaffSeat[], rules: RuleSet): readonly { readonly seat: LimitedSeat; readonly count: number; readonly limit: number | null }[] {
  return LIMITED_SEATS.map((seat) => ({ seat, count: seatCount(staff, seat), limit: seatLimit(rules, seat) }));
}
