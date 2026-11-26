// K2.6.1 and K6.1.1: who owns each duty right now. One owner per duty at all times: the assigned
// holder when he is present, else the next present person in the X8 succession order, else the head
// coach. A full, able staff leaves the head coach only his own work; every absence pushes work up.
import { DUTY, type Duty, type Owner, type StaffChart, type StaffMember } from './types.ts';
import type { DecisionType, GameSituation } from './contract.ts';

export function member(chart: StaffChart, personId: number | null): StaffMember | null {
  if (personId === null) return null;
  return chart.members.find((m) => m.personId === personId) ?? null;
}

function present(chart: StaffChart, personId: number): boolean {
  if (personId === chart.userId) return true;
  return member(chart, personId)?.available === true;
}

function successionFor(chart: StaffChart, duty: Duty): readonly number[] {
  return chart.succession[duty] ?? chart.succession['*'] ?? [];
}

/**
 * Owner of a duty. `standIn` is the K6.4.1 case: the user is not at his seat (he simulates), so a duty
 * he would do himself goes to the first present person in the succession order.
 */
export function ownerOf(chart: StaffChart, duty: Duty, opts: { readonly standIn?: boolean } = {}): Owner {
  const a = chart.assignments[duty];
  const wanted = a && a.autonomy !== 'keeps' && a.holderId !== null ? a.holderId : chart.headCoachId;
  const own = (personId: number, basis: Owner['basis'], absentId: number | null): Owner => ({ duty, personId, isUser: personId === chart.userId, basis, absentId });
  const usable = (id: number) => present(chart, id) && !(opts.standIn === true && id === chart.userId);
  if (usable(wanted)) return own(wanted, wanted === chart.headCoachId && (!a || a.holderId === null || a.autonomy === 'keeps') ? 'head_coach' : 'assigned', null);
  const absentId = wanted === chart.userId ? null : wanted;
  for (const id of successionFor(chart, duty)) {
    if (id !== wanted && usable(id)) return own(id, wanted === chart.userId ? 'stand_in' : 'succession', absentId);
  }
  if (wanted !== chart.headCoachId && usable(chart.headCoachId)) return own(chart.headCoachId, 'head_coach', absentId);
  return { duty, personId: null, isUser: false, basis: 'nobody', absentId };
}

/** The duty a decision request falls under (K2.6.1 rules 1 and 2). `ourTryIsTwo` is the side's last try choice. */
export function dutyFor(type: DecisionType, situation: GameSituation, ourTryIsTwo: boolean): Duty {
  if (type === 'snapping_call') {
    if (situation.playKind === 'scrimmage') return DUTY.callOffense;
    if (situation.playKind === 'try') return ourTryIsTwo ? DUTY.callOffense : DUTY.callSpecialTeams;
    return DUTY.callSpecialTeams;
  }
  if (type === 'opposing_call') {
    return situation.playKind === 'scrimmage' || situation.playKind === 'try' ? DUTY.callDefense : DUTY.callSpecialTeams;
  }
  return DUTY.gameManagement;
}

/** K2.6.1 output: the `decisionOwner` map, duty to owner, for every duty that has an assignment or is a game duty. */
export function decisionOwners(chart: StaffChart, opts: { readonly standIn?: boolean } = {}): ReadonlyMap<Duty, Owner> {
  const duties = new Set<Duty>([...Object.values(DUTY), ...Object.keys(chart.assignments)]);
  const out = new Map<Duty, Owner>();
  for (const d of [...duties].sort()) out.set(d, ownerOf(chart, d, opts));
  return out;
}

/** How many duties a person owns now: his workload (K6.2.1 inputs). */
export function dutyCount(chart: StaffChart, personId: number): number {
  let n = 0;
  for (const o of decisionOwners(chart).values()) if (o.personId === personId) n++;
  return n;
}

/** Problems in a chart: a holder who is not on the staff, a succession id nobody holds. */
export function chartProblems(chart: StaffChart): string[] {
  const ids = new Set(chart.members.map((m) => m.personId));
  if (chart.userId !== null) ids.add(chart.userId);
  const out: string[] = [];
  if (!ids.has(chart.headCoachId)) out.push(`head coach ${chart.headCoachId} is not on the staff`);
  for (const [duty, a] of Object.entries(chart.assignments)) {
    if (a.holderId !== null && !ids.has(a.holderId)) out.push(`duty ${duty} is held by ${a.holderId}, who is not on the staff`);
  }
  for (const [duty, list] of Object.entries(chart.succession)) {
    for (const id of list) if (!ids.has(id)) out.push(`succession for ${duty} names ${id}, who is not on the staff`);
  }
  return out;
}
