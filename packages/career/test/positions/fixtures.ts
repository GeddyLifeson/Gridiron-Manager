// Shared test helpers: a filled staff, people facts, and stub streams.
import type { RandomStream, WorldDate } from '@gm/schema';
import { DAYS_PER_YEAR } from '@gm/league';
import { fillSeat, generateStaff, limitsFrom, type PersonFacts, type Staff, type SuccessionContext, type ResourceBand, type CatalogueLevel } from '../../src/positions/index.ts';

export const D0: WorldDate = { seasonYear: 2026, dayIndex: 10 };
export const dayOf = (d: WorldDate) => d.seasonYear * DAYS_PER_YEAR + d.dayIndex;
export const addDays = (d: WorldDate, n: number): WorldDate => {
  const t = dayOf(d) + n;
  return { seasonYear: Math.floor(t / DAYS_PER_YEAR), dayIndex: t % DAYS_PER_YEAR };
};

export const COLLEGE_LIMITS = limitsFrom({
  'staff.grad_assistants_max': 4, 'staff.offcampus_recruiters_max': 11, 'staff.strength_staff_max': 5, 'staff.student_assistants_max': 11,
});

export function emptyStaff(level: CatalogueLevel = 'college', band: ResourceBand = 'top'): Staff {
  return generateStaff({ teamId: 7, level, band, limits: level === 'college' ? COLLEGE_LIMITS : limitsFrom({}), firstSeatId: 1, date: D0 });
}

/** Every seat held by its own person (person id = 1000 + seat id), start dates spread so seniority is distinct. */
export function filledStaff(level: CatalogueLevel = 'college'): { staff: Staff; people: Map<number, PersonFacts> } {
  let staff = emptyStaff(level);
  const people = new Map<number, PersonFacts>();
  for (const s of staff.seats) {
    const pid = 1000 + s.seatId;
    staff = fillSeat(staff, s.seatId, pid, addDays(D0, -s.seatId * 30));
    people.set(pid, { personId: pid, bornDay: dayOf(D0) - 40 * DAYS_PER_YEAR + s.seatId, employed: true, suspended: false, onLeave: false, joinedStaffDay: dayOf(D0) - s.seatId * 30, cameUpOn: null });
  }
  return { staff, people };
}

export function ctxFor(staff: Staff, people: Map<number, PersonFacts>, absent: number[] = [], extra: Partial<SuccessionContext> = {}): SuccessionContext {
  return { staff, people, today: dayOf(D0), dayOf, absent: new Set(absent), ...extra };
}

/** A stream whose chance() answers from a fixed list (then repeats the last). */
export function scripted(answers: boolean[]): RandomStream {
  let i = 0;
  const next = () => answers[Math.min(i++, answers.length - 1)] ?? false;
  return {
    name: 'test', draws: 0,
    nextU32: () => 0, uniform: () => 0.5, normal: () => 0,
    chance: () => next(), pick: () => 0, int: (lo) => lo,
  };
}

/** A stream whose chance(p) compares p with a fixed uniform. */
export function fixedUniform(u: number): RandomStream {
  return { name: 'test', draws: 0, nextU32: () => 0, uniform: () => u, normal: () => 0, chance: (p) => u < p, pick: () => 0, int: (lo) => lo };
}

export function seatOf(staff: Staff, positionId: string, side?: string): number {
  const s = staff.seats.find((x) => x.positionId === positionId && (side === undefined || x.side === side));
  if (!s) throw new Error(`no seat ${positionId}`);
  return s.seatId;
}
