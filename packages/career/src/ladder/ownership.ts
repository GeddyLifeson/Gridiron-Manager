// S3.1.1 ownership: which duties a seat owns, recommends or observes, and the week screen's list.
// The matrix is the authority on the mark; the seat's catalogue `dutyIds` (G-25) say which duties the seat
// performs. A seat also recommends or observes every duty its band marks R or B, and a seat that leads a side
// or the program (S3.6.2, S3.7.1) owns every family its band marks O. Short-staffed programs push duties down
// (S3.1.1 edge case). A level is a label on rows, never a branch (P1.1.2).
import type { CatalogueLevel, CatalogueRow } from '../positions/index.ts';
import { BANDS, DUTIES, WEEK_DAYS, bandOf, type DutyCatalogue, type DutyDef, type MatrixMark, type Ownership, type RungBand } from './duties.ts';
import { param } from './params.ts';

/** Seat facts that settle the two conditional cells of the matrix. */
export interface SeatFlags {
  /** S1.1.1 `calls_plays` on this seat (L4.1.2). */
  readonly callsPlays: boolean;
  /** The power arrangement gives this seat final roster say (L5.2.1). */
  readonly hasRosterSay: boolean;
}

export const DEFAULT_FLAGS: SeatFlags = { callsPlays: false, hasRosterSay: false };

export type AssignmentSource = 'seat' | 'matrix' | 'lead' | 'pushed_down' | 'off_ladder';

export interface DutyAssignment {
  readonly duty: DutyDef;
  readonly ownership: Ownership;
  readonly source: AssignmentSource;
  /** The band whose work this is when it was pushed down; otherwise the seat's own band (null off the ladder). */
  readonly fromBand: RungBand | null;
}

export function resolveMark(mark: MatrixMark, flags: SeatFlags): Ownership | null {
  switch (mark) {
    case 'O': return 'own';
    case 'R': return 'recommend';
    case 'B': return 'observe';
    case 'O_or_R': return flags.callsPlays ? 'own' : 'recommend';
    case 'by_power': return flags.hasRosterSay ? 'own' : 'recommend';
    default: return null;
  }
}

export function ownershipAt(familyId: string, rung: number | null, flags: SeatFlags = DEFAULT_FLAGS, cat: DutyCatalogue = DUTIES): Ownership | null {
  const band = bandOf(rung);
  return band === null ? null : resolveMark(cat.family(familyId).cells[band], flags);
}

export interface DutyListInput {
  readonly job: CatalogueRow;
  readonly level: CatalogueLevel;
  readonly flags?: SeatFlags;
  /** Rung bands above this seat with no one in them on this staff (S3.1.1 short staff). Bands, not rungs, so a
   *  staff with a rung 9 head coach and no rung 8 seat is not short (rungs 8 and 9 are the same work). */
  readonly emptyBands?: ReadonlySet<RungBand>;
}

const RANK: Readonly<Record<Ownership, number>> = { observe: 0, recommend: 1, own: 2 };

/** Every duty the seat owns, recommends or observes, in catalogue order. Rung 0 and empty duty sets list nothing. */
export function dutyList(input: DutyListInput, cat: DutyCatalogue = DUTIES): DutyAssignment[] {
  const { job, level } = input;
  const flags = input.flags ?? DEFAULT_FLAGS;
  if (!job.onStaff || job.dutyIds.length === 0 || !job.levels.includes(level)) return [];
  const band = bandOf(job.rung);
  const out = new Map<string, DutyAssignment>();
  const put = (a: DutyAssignment) => {
    const prev = out.get(a.duty.id);
    if (!prev || RANK[a.ownership] > RANK[prev.ownership]) out.set(a.duty.id, a);
  };
  const seatDuties = job.dutyIds.map((id) => cat.duty(id)).filter((d) => d.levels.includes(level));
  for (const d of seatDuties) {
    const mark = band === null ? null : resolveMark(cat.family(d.family).cells[band], flags);
    put({ duty: d, ownership: mark ?? 'own', source: band === null ? 'off_ladder' : 'seat', fromBand: band });
  }
  if (band !== null) {
    const leads = seatDuties.some((d) => d.leadsFamilies);
    for (const f of cat.families) {
      const own = resolveMark(f.cells[band], flags);
      if (own === null || (own === 'own' && !leads)) continue;
      for (const d of cat.dutiesOf(f.id, level)) put({ duty: d, ownership: own, source: own === 'own' ? 'lead' : 'matrix', fromBand: band });
    }
    for (const b of pushedBands(band, input.emptyBands)) {
      for (const f of cat.families) {
        if (f.cells[b] !== 'O') continue;
        for (const d of cat.dutiesOf(f.id, level)) put({ duty: d, ownership: 'own', source: 'pushed_down', fromBand: b });
      }
    }
  }
  const order = new Map(cat.duties.map((d, i) => [d.id, i] as const));
  return [...out.values()].sort((a, b) => order.get(a.duty.id)! - order.get(b.duty.id)!);
}

/** Consecutive empty bands directly above `band`, at most `pushDown.maxRungs` of them. */
export function pushedBands(band: RungBand, empty?: ReadonlySet<RungBand>): RungBand[] {
  if (!empty || empty.size === 0) return [];
  const out: RungBand[] = [];
  const max = param('pushDown.maxRungs');
  for (let i = BANDS.indexOf(band) + 1; i < BANDS.length && out.length < max; i++) {
    if (!empty.has(BANDS[i]!)) break;
    out.push(BANDS[i]!);
  }
  return out;
}

export type WeekKind = 'game' | 'bye' | 'offseason';

/** The week screen (S3.1.1): duties due this week with their slots, in H1 order. Seasonal work shows only off-season. */
export function weekScreen(list: readonly DutyAssignment[], kind: WeekKind, requests: ReadonlySet<string> = new Set()): DutyAssignment[] {
  const inWeek = (a: DutyAssignment): boolean => {
    const c = a.duty.cadence;
    if (c === 'seasonal') return kind === 'offseason';
    if (c === 'per_request') return requests.has(a.duty.id);
    if (kind === 'offseason') return false;
    if (c === 'per_game') return kind === 'game';
    return true;
  };
  const key = (a: DutyAssignment) => (a.duty.due ? WEEK_DAYS.indexOf(a.duty.due.day) * 10000 + Number(a.duty.due.time.replace(':', '')) : 1e9);
  return list.filter(inWeek).sort((a, b) => key(a) - key(b));
}

/** Hours the listed duties cost in a week (E7); observed duties cost their hours too, since he sits in. */
export function weekHours(list: readonly DutyAssignment[]): number {
  return list.reduce((s, a) => s + a.duty.hoursEst, 0);
}

export type { RungBand };
