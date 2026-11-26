// L4.1.1 delegable tasks and L4.1.2 play callers. Each task has exactly one owner at all times: the
// chair that controls it when that chair is held, else the first held chair up its reporting line, else
// the head coach. A full, able staff therefore leaves the head coach only his own work (Marlon's ruling:
// good staff means less work for the head coach); every empty chair pushes its tasks up the chart.
// Play calling is a task too: the head coach may keep a side or hand it to any staff member.
import { CATALOGUE, type Catalogue } from './catalogue.ts';
import { headCoachSeat, type Side, type Staff } from './staff.ts';

/** Tasks a staff can delegate: every `controls` entry of every position its seats instantiate. */
export function delegableTasks(staff: Staff, cat: Catalogue = CATALOGUE): readonly string[] {
  const all = new Set<string>();
  for (const s of staff.seats) for (const t of cat.position(s.positionId).controls) all.add(t);
  for (const side of Object.keys(staff.callers)) all.add(`calling.${side}`);
  return [...all].sort();
}

/** Owner seat of every delegable task. `calling.<side>` follows `staff.callers`. */
export function taskOwners(staff: Staff, cat: Catalogue = CATALOGUE): ReadonlyMap<string, number> {
  const hc = headCoachSeat(staff).seatId;
  const bySeat = new Map(staff.seats.map((s) => [s.seatId, s] as const));
  const heldUp = (seatId: number): number => {
    const seen = new Set<number>();
    for (let cur: number | null = seatId; cur !== null && !seen.has(cur); cur = bySeat.get(cur)?.reportsToSeatId ?? null) {
      seen.add(cur);
      if (bySeat.get(cur)?.holderPersonId != null) return cur;
    }
    return hc;
  };
  const owners = new Map<string, number>();
  for (const s of staff.seats) {
    for (const t of cat.position(s.positionId).controls) {
      if (t.startsWith('calling.') || owners.has(t)) continue;
      owners.set(t, heldUp(s.seatId));
    }
  }
  for (const [side, seatId] of Object.entries(staff.callers)) {
    const caller = bySeat.get(seatId);
    owners.set(`calling.${side}`, caller && caller.holderPersonId !== null ? seatId : hc);
  }
  return owners;
}

/** The head coach's own load: the tasks nobody below him owns (L4.1.1 edge case, H1 attention budget). */
export function headCoachTasks(staff: Staff, cat: Catalogue = CATALOGUE): readonly string[] {
  const hc = headCoachSeat(staff).seatId;
  return [...taskOwners(staff, cat)].filter(([, owner]) => owner === hc).map(([t]) => t).sort();
}

/** L4.1.2: who calls each side right now (seat id of a held seat, else the head coach's seat). */
export function currentCallers(staff: Staff, cat: Catalogue = CATALOGUE): Readonly<Record<Side, number>> {
  const owners = taskOwners(staff, cat);
  return {
    offense: owners.get('calling.offense')!,
    defense: owners.get('calling.defense')!,
    special_teams: owners.get('calling.special_teams')!,
  };
}
