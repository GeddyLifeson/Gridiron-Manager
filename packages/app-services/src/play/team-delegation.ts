// The seat team's delegation table from the live world (people.delegation, O4.3.2): who on the staff owns
// each delegable task by default (career positions `taskOwners`, from the club's job rows), who may take it,
// and the settings the user saved. Settings live in the world's system state so they ride in the save.
//
// ASSUMPTIONS until the week (E7) and staff load (K6) state exist in the save: the head coach's budget is his
// awake week (E7.1.1 24 h days less E7.4.1 sleep need), nothing is fixed yet, and each assistant has the same
// awake week and no other load. Who may take a task: anyone whose chair is on the task's side (or any chair for
// a task with no side), the head coach always.
import type { JobRecord } from '@gm/schema';
import { life, positions } from '@gm/career';
import type { loop } from '@gm/world';
import { buildDelegation, DELEGABLE_TASKS, presetAssignments, taskSide, type Assignment, type DelegationInputs, type DelegationView, type PresetId } from '../read-models/delegation/index.ts';

type LiveWorld = loop.LiveWorld;

/** `LiveWorld.systemState` key of the user's delegation settings, by world team id. */
export const DELEGATION_KEY = 'career.delegation';

type Stored = Readonly<Record<string, Readonly<Record<string, Assignment>>>>;

function nameOf(w: LiveWorld, id: number): string {
  const p = w.people.get(id) as { name?: { first?: string; last?: string } } | undefined;
  return [p?.name?.first, p?.name?.last].filter(Boolean).join(' ') || `#${id}`;
}

/** The positions module's chart rebuilt from the team's job rows (as the world's coach turnover does). */
function staffOf(w: LiveWorld, teamId: number, level: 'pro' | 'college'): positions.Staff | null {
  const rows = [...w.jobs.values()].filter((j: JobRecord) => j.teamId === teamId).sort((a, b) => a.id - b.id);
  if (rows.length === 0) return null;
  const seats: positions.Seat[] = rows.map((j) => {
    const row = positions.CATALOGUE.job(j.catalogueId);
    return {
      seatId: j.id, catalogueId: j.catalogueId, positionId: j.positionId, title: row.title, rung: j.rung, side: j.side,
      positionGroup: j.positionGroup, dutyIds: j.dutyIds, recruitsOffCampus: j.recruitsOffCampus, gamedaySeat: j.gamedaySeat,
      paid: j.paid, termLimitYears: j.termLimitYears, titleOnTop: row.titleOnTop, reportsToSeatId: j.reportsToJobId,
      holderPersonId: j.holderPersonId, holderSince: j.holderSince, vacantSince: j.vacantSince, namedDeputyPersonId: j.namedDeputyPersonId, holding: j.holding,
    };
  });
  const callers = positions.defaultCallers(seats);
  return { teamId, level: level as positions.Staff['level'], seats, callers };
}

/** The head coach's awake week in hours (E7.1.1, E7.4.1): the assumed budget until the week planner saves one. */
export function awakeWeekHours(): number {
  return life.weekHours() - 7 * life.param('sleepNeedHours');
}

/** Inputs of the delegation table for the seat, or null when the club has no staff chart or no head coach. */
export function seatDelegationInputs(w: LiveWorld, teamId: number, level: 'pro' | 'college', userPersonId: number | null): DelegationInputs | null {
  const staff = staffOf(w, teamId, level);
  if (!staff) return null;
  let hcHolder: number | null = null;
  try { hcHolder = positions.headCoachSeat(staff).holderPersonId; } catch { return null; }
  const headCoachId = hcHolder ?? userPersonId;
  if (headCoachId === null || headCoachId === undefined) return null;
  const budget = awakeWeekHours();
  const held = staff.seats.filter((s) => s.holderPersonId !== null && s.holderPersonId !== headCoachId);
  const people = new Map<number, positions.Seat>();
  for (const s of held) if (!people.has(s.holderPersonId!)) people.set(s.holderPersonId!, s);
  const members = [...people.entries()].sort((a, b) => a[0] - b[0]);
  const bySeat = new Map(staff.seats.map((s) => [s.seatId, s.holderPersonId] as const));
  const owners = positions.taskOwners(staff);
  const defaultOwner: Record<string, number | null> = {};
  const qualified: Record<string, readonly number[]> = {};
  for (const t of DELEGABLE_TASKS) {
    const seat = owners.get(t);
    defaultOwner[t] = seat === undefined ? null : bySeat.get(seat) ?? null;
    const side = taskSide(t);
    qualified[t] = members.filter(([, s]) => side === 'none' || s.side === side).map(([id]) => id);
  }
  const stored = (w.systemState.get(DELEGATION_KEY) as Stored | undefined)?.[String(teamId)] ?? {};
  return {
    headCoachId, userIsHeadCoach: userPersonId === null || userPersonId === headCoachId, budgetHours: budget, fixedHours: 0,
    tasks: DELEGABLE_TASKS,
    staff: members.map(([id, s]) => ({ personId: id, name: nameOf(w, id), titleKey: s.catalogueId, available: true, loadHours: 0, capacityHours: budget })),
    defaultOwner, qualified, assignments: stored,
  };
}

/** The delegation view for the seat, with an unsaved draft laid over the stored settings when given. */
export function seatDelegation(w: LiveWorld, teamId: number, level: 'pro' | 'college', userPersonId: number | null, draft?: Readonly<Record<string, Assignment>>): DelegationView | null {
  const i = seatDelegationInputs(w, teamId, level, userPersonId);
  return i ? buildDelegation(draft ? { ...i, assignments: draft } : i) : null;
}

/** Save settings (a preset or a full table) for the seat team into the world's system state. */
export function saveSeatDelegation(w: LiveWorld, teamId: number, level: 'pro' | 'college', userPersonId: number | null, what: { readonly preset: PresetId } | { readonly assignments: Readonly<Record<string, Assignment>> }): void {
  const i = seatDelegationInputs(w, teamId, level, userPersonId);
  if (!i || !i.userIsHeadCoach) return;
  const next = 'preset' in what ? presetAssignments(what.preset, i) : what.assignments;
  const all = (w.systemState.get(DELEGATION_KEY) as Stored | undefined) ?? {};
  w.systemState.set(DELEGATION_KEY, { ...all, [String(teamId)]: next });
}
