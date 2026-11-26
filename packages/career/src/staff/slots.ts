// Off-campus recruiter slots (L4.5.1). The cap is the positions module's rule key; the head coach must
// hold a slot. Naming more recruiters than the cap, or recruiting off campus without a slot, is allowed
// with the L8.2.5 warning and writes one violation row per breach (L8.4.2, T9.5); it is never blocked.
import { headCoachSeat, limitBreaches, seat, type Staff, type StaffLimits } from '../positions/index.ts';

/** Set or clear a seat's off-campus flag. Returns the new staff and the breaches it now has. */
export function setRecruiterSlot(staff: Staff, seatId: number, on: boolean, limits: StaffLimits): { staff: Staff; overCap: boolean; headCoachMissing: boolean } {
  const s = seat(staff, seatId);
  const next: Staff = { ...staff, seats: staff.seats.map((x) => (x.seatId === seatId ? { ...s, recruitsOffCampus: on } : x)) };
  const overCap = limitBreaches(next, limits).some((b) => b.key === 'staff.offcampus_recruiters_max');
  return { staff: next, overCap, headCoachMissing: !headCoachSeat(next).recruitsOffCampus };
}

/** Recruiting off campus without a slot: true when the person holds no flagged seat on this staff. */
export function recruitsWithoutSlot(staff: Staff, personId: number): boolean {
  return !staff.seats.some((s) => s.holderPersonId === personId && s.recruitsOffCampus);
}

/** `recruiter_slots[]` handed to T4: person ids holding a flagged seat. */
export function recruiterSlots(staff: Staff): readonly number[] {
  return [...new Set(staff.seats.filter((s) => s.recruitsOffCampus && s.holderPersonId !== null).map((s) => s.holderPersonId!))].sort((a, b) => a - b);
}
