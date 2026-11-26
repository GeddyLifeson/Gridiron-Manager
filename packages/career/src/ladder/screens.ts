// G-85 screen permission states and command rights by seat (O7.1.1, O7.2.2). The state of every screen
// for the user's job is computed here, in the core, and sent with the read model; the interface never
// decides permissions. Screen ids are the app registry's ids (O1.1.2), held here as data, because a core
// package cannot import the interface (P1.2.1); an interface test checks every id against the registry.
//
// Rules (O7.1.1 badge words: Yours, Assigned, Suggest, Read):
// 1. Each screen has an access row: `self` (his own day, career, money, life, school: always Yours),
//    `schedule` (set by the boss below the top band: Read; Yours at rungs 8-9), `staff` (Read from its
//    minimum band), `public` (Read at every rung). A `levels` list hides the screen at the other level.
// 2. Every duty on the seat's S3 duty list raises the screens it opens: own -> Yours when the seat is in the
//    top band or the duty is graded by outcome (he decides and results judge him), else Assigned (a task
//    from the boss with a deadline he judges); recommend -> Suggest; observe -> Read. A duty always makes
//    its screens reachable, even below the access row's minimum band.
// 3. The whole-program duty (S3.7.1) makes every visible screen Yours unless another duty on the list maps
//    it lower (the head coach without final roster say suggests on personnel screens, S3.5.7 `by_power`).
// 4. Rights: `submit:<duty>` for an owned duty, `suggest:<duty>` for a recommended one, plus the self
//    commands every seat holds (apply for a job, answer an offer, money and life choices).
import screensJson from './screens.json' with { type: 'json' };
import type { CatalogueLevel, CatalogueRow } from '../positions/index.ts';
import { BANDS, DUTIES, bandOf, type DutyCatalogue, type RungBand } from './duties.ts';
import { dutyList, weekScreen, type DutyAssignment, type DutyListInput, type WeekKind } from './ownership.ts';

export const SCREEN_STATES = ['yours', 'assigned', 'suggest', 'read'] as const;
export type ScreenState = (typeof SCREEN_STATES)[number];
export type AccessKind = 'self' | 'schedule' | 'staff' | 'public';

export interface ScreenAccess { readonly kind: AccessKind; readonly minBand?: RungBand; readonly levels?: readonly CatalogueLevel[] }

export interface ScreenTable {
  readonly access: Readonly<Record<string, ScreenAccess>>;
  /** Duty id -> registry screen ids it opens; `*` is every visible screen (S3.7.1). */
  readonly dutyScreens: Readonly<Record<string, readonly string[]>>;
  readonly selfCommands: readonly string[];
}

const KINDS: readonly AccessKind[] = ['self', 'schedule', 'staff', 'public'];

/** Validates the screen table by hand (core packages may not import zod). Throws on the first bad row. */
export function buildScreenTable(data: unknown, cat: DutyCatalogue = DUTIES): ScreenTable {
  const d = data as { access?: Record<string, ScreenAccess>; dutyScreens?: Record<string, string[]>; selfCommands?: string[] };
  if (!d || typeof d !== 'object' || !d.access || !d.dutyScreens || !Array.isArray(d.selfCommands)) throw new Error('screen table: missing access, dutyScreens or selfCommands');
  for (const [id, a] of Object.entries(d.access)) {
    if (!KINDS.includes(a.kind)) throw new Error(`screen table: ${id} has unknown kind ${String(a.kind)}`);
    if (a.minBand !== undefined && !BANDS.includes(a.minBand)) throw new Error(`screen table: ${id} has unknown band ${a.minBand}`);
  }
  for (const duty of cat.duties) if (!d.dutyScreens[duty.id]?.length) throw new Error(`screen table: duty ${duty.id} opens no screen`);
  for (const [duty, list] of Object.entries(d.dutyScreens)) {
    cat.duty(duty);
    for (const s of list) if (s !== '*' && !d.access[s]) throw new Error(`screen table: duty ${duty} opens unknown screen ${s}`);
  }
  return { access: d.access, dutyScreens: d.dutyScreens, selfCommands: d.selfCommands };
}

export const SCREEN_TABLE: ScreenTable = buildScreenTable(screensJson);

const RANK: Readonly<Record<ScreenState, number>> = { read: 0, suggest: 1, assigned: 2, yours: 3 };
const higher = (a: ScreenState | undefined, b: ScreenState): ScreenState => (a === undefined || RANK[b] > RANK[a] ? b : a);

/** The badge an owned, recommended or observed duty gives its screens (rule 2). */
export function dutyState(a: DutyAssignment, band: RungBand | null): ScreenState {
  if (a.ownership === 'recommend') return 'suggest';
  if (a.ownership === 'observe') return 'read';
  return band === '8-9' || band === null || a.duty.grader === 'outcome' ? 'yours' : 'assigned';
}

function baseState(acc: ScreenAccess, band: RungBand | null, level: CatalogueLevel): ScreenState | null {
  if (acc.levels && !acc.levels.includes(level)) return null;
  switch (acc.kind) {
    case 'self': return 'yours';
    case 'public': return 'read';
    case 'schedule': return band === '8-9' ? 'yours' : 'read';
    case 'staff': {
      if (band === null) return null;
      return acc.minBand === undefined || BANDS.indexOf(band) >= BANDS.indexOf(acc.minBand) ? 'read' : null;
    }
  }
}

export interface SeatView {
  readonly jobId: string;
  readonly rung: number | null;
  readonly band: RungBand | null;
  readonly level: CatalogueLevel;
  /** Screen id -> badge. A screen absent here is not listed for the seat (refused). */
  readonly states: Readonly<Record<string, ScreenState>>;
  readonly rights: readonly string[];
  readonly duties: readonly DutyAssignment[];
  /** Duty id -> the screens it opens for this seat. */
  readonly dutyScreens: Readonly<Record<string, readonly string[]>>;
}

/** O7.1.1: one badge per listed screen, command rights, and where each duty is done, for one seat. */
export function seatView(input: DutyListInput, table: ScreenTable = SCREEN_TABLE, cat: DutyCatalogue = DUTIES): SeatView {
  const { job, level } = input;
  const band = bandOf(job.rung);
  const duties = dutyList(input, cat);
  const states: Record<string, ScreenState> = {};
  for (const [id, acc] of Object.entries(table.access)) {
    const s = baseState(acc, band, level);
    if (s !== null) states[id] = s;
  }
  const byDuty: Record<string, ScreenState> = {};
  const opens: Record<string, readonly string[]> = {};
  let wholeProgram: ScreenState | null = null;
  for (const a of duties) {
    const st = dutyState(a, band);
    const list = table.dutyScreens[a.duty.id] ?? [];
    if (list.includes('*')) { wholeProgram = higher(wholeProgram ?? undefined, st); opens[a.duty.id] = ['office.today']; continue; }
    opens[a.duty.id] = list;
    for (const s of list) byDuty[s] = higher(byDuty[s], st);
  }
  if (wholeProgram !== null) {
    for (const id of Object.keys(states)) if (byDuty[id] === undefined) states[id] = higher(states[id], wholeProgram);
  }
  for (const [id, st] of Object.entries(byDuty)) {
    const acc = table.access[id];
    if (acc?.levels && !acc.levels.includes(level)) continue;
    states[id] = higher(states[id], st);
  }
  const rights = new Set(table.selfCommands);
  for (const a of duties) {
    if (a.ownership === 'own') rights.add(`submit:${a.duty.id}`);
    else if (a.ownership === 'recommend') rights.add(`suggest:${a.duty.id}`);
  }
  return { jobId: job.id, rung: job.rung, band, level, states, rights: [...rights].sort(), duties, dutyScreens: opens };
}

/** Ladder seats a user can hold on a staff (rungs 1 to 9), one view per catalogue job and level. */
export function ladderSeats(jobs: readonly CatalogueRow[], table: ScreenTable = SCREEN_TABLE, cat: DutyCatalogue = DUTIES): SeatView[] {
  const out: SeatView[] = [];
  for (const job of jobs) {
    if (!job.onStaff || !job.userHoldable || job.rung === null || job.rung < 1) continue;
    for (const level of job.levels) out.push(seatView({ job, level, flags: { callsPlays: job.callsPlaysEligible && job.rung >= 7, hasRosterSay: false } }, table, cat));
  }
  return out;
}

// ---------- the assignment list (O7.2.1) ----------

export type AssignmentStatus = 'open' | 'submitted' | 'graded' | 'late';

export interface AssignmentRow {
  readonly dutyId: string;
  readonly title: string;
  readonly leaf: string;
  /** Who set it: the boss below the top band, himself at rungs 8-9 (O7.2.1 edge case). */
  readonly assignedBy: 'boss' | 'self';
  readonly due: { readonly day: string; readonly time: string } | null;
  readonly hoursEst: number;
  readonly state: ScreenState;
  readonly status: AssignmentStatus;
  /** Screen the row opens. */
  readonly screenId: string;
  /** Command the row's submit control runs; null when the seat only suggests or reads. */
  readonly command: string | null;
}

export interface AssignmentInput {
  readonly view: SeatView;
  readonly week: WeekKind;
  readonly requests?: ReadonlySet<string>;
  /** Duty id -> status this week (from the work-product log). Missing = open. */
  readonly status?: Readonly<Record<string, AssignmentStatus>>;
}

/** O7.2.1: the week's duties as the Office list shows them, in H1 order, with the screen each opens. */
export function assignmentRows(x: AssignmentInput): AssignmentRow[] {
  const band = x.view.band;
  return weekScreen(x.view.duties, x.week, x.requests).map((a) => {
    const state = dutyState(a, band);
    const command = a.ownership === 'own' ? `submit:${a.duty.id}` : a.ownership === 'recommend' ? `suggest:${a.duty.id}` : null;
    return {
      dutyId: a.duty.id, title: a.duty.title, leaf: a.duty.leaf,
      assignedBy: band === '8-9' ? 'self' : 'boss',
      due: a.duty.due, hoursEst: a.duty.hoursEst, state,
      status: x.status?.[a.duty.id] ?? 'open',
      screenId: x.view.dutyScreens[a.duty.id]?.[0] ?? 'office.today',
      command,
    };
  });
}
