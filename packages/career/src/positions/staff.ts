// G-25 staff made from the catalogue (S1.1.1, S1.2.1, S1.2.2, X8.1.2, L4.1.1). A staff is a list of
// seats; each seat instantiates one catalogue row. Who holds a seat is state; what a seat is, is data.
// Generation makes the seats only (all open); world generation and K7 put people in them.
import { JobRecord, type WorldDate } from '@gm/schema';
import { DAYS_PER_YEAR } from '@gm/league';
import { CATALOGUE, type Catalogue, type CatalogueLevel, type CatalogueRow, type JobSide, type PositionGroup, type PositionRow } from './catalogue.ts';
import type { StaffLimits } from './keys.ts';
import { param } from './params.ts';

export type Side = 'offense' | 'defense' | 'special_teams';
export type Holding = 'permanent' | 'interim' | 'acting';

/** One seat on one staff: a JobRecord in the making, plus fields the catalogue says. */
export interface Seat {
  readonly seatId: number;
  readonly catalogueId: string;
  readonly positionId: string;
  readonly title: string;
  readonly rung: number | null;
  readonly side: JobSide;
  readonly positionGroup: PositionGroup;
  readonly dutyIds: readonly string[];
  readonly recruitsOffCampus: boolean;
  readonly gamedaySeat: 'booth' | 'sideline' | 'none';
  readonly paid: 'none' | 'stipend' | 'salary';
  readonly termLimitYears: number | null;
  readonly titleOnTop: boolean;
  readonly reportsToSeatId: number | null;
  readonly holderPersonId: number | null;
  readonly holderSince: WorldDate | null;
  readonly vacantSince: WorldDate | null;
  readonly namedDeputyPersonId: number | null;
  readonly holding: Holding;
}

/** Who calls each side (L4.1.2): a seat id, so the head coach calling a side is his own seat. */
export type Callers = Readonly<Record<Side, number>>;

export interface Staff {
  readonly teamId: number;
  readonly level: CatalogueLevel;
  readonly seats: readonly Seat[];
  readonly callers: Callers;
}

export type ResourceBand = 'top' | 'middle' | 'low';

export interface GenerateStaffInput {
  readonly teamId: number;
  readonly level: CatalogueLevel;
  readonly band: ResourceBand;
  readonly limits: StaffLimits;
  /** First seat id; seats are numbered in catalogue order from here. */
  readonly firstSeatId: number;
  readonly date: WorldDate;
  /** Where two fixed rows share a position (college head coach at rung 8 or 9), the rung to use. Default: the highest. */
  readonly rungChoice?: Readonly<Record<string, number>>;
  readonly catalogue?: Catalogue;
}

/** Rooms in the order pooled helpers are spread over them (offense and defense alternate). */
const ROOM_ORDER: readonly { group: PositionGroup; side: Side }[] = [
  { group: 'QB', side: 'offense' }, { group: 'DL', side: 'defense' }, { group: 'RB', side: 'offense' },
  { group: 'LB', side: 'defense' }, { group: 'WR', side: 'offense' }, { group: 'DB', side: 'defense' },
  { group: 'TE', side: 'offense' }, { group: 'OL', side: 'offense' },
];
const HELPER_SIDES: readonly Side[] = ['offense', 'defense'];

const MIN_FLOOR: Readonly<Record<string, string>> = {
  'pos:graduate_assistant': 'fill.minGraduateAssistants',
  'pos:strength_head': 'fill.minStrength',
};

/** X8.1.2: how many seats of a pooled row a band fills, inside the row's range and the cap left. */
export function pooledCount(row: CatalogueRow, band: ResourceBand, capLeft: number | null): number {
  const cap = capLeft === null ? row.seats[1] : Math.min(row.seats[1], capLeft);
  const want = Math.ceil(param(`fill.${band}`) * cap);
  const floorKey = row.positionId ? MIN_FLOOR[row.positionId] : undefined;
  const floor = Math.max(row.seats[0], floorKey ? param(floorKey) : 0);
  return Math.max(0, Math.min(cap, Math.max(want, floor)));
}

/** Make every seat of a staff (all open) from the catalogue rows of its level. */
export function generateStaff(input: GenerateStaffInput): Staff {
  const cat = input.catalogue ?? CATALOGUE;
  const rows = cat.jobsAt(input.level).filter((r) => r.onStaff);
  // Pick one fixed row per shared position (head coach rung 8 or 9).
  const fixedByPos = new Map<string, CatalogueRow[]>();
  for (const r of rows) if (!r.pooled && r.positionId) fixedByPos.set(r.positionId, [...(fixedByPos.get(r.positionId) ?? []), r]);
  const chosen = rows.filter((r) => {
    if (r.pooled || !r.positionId) return true;
    const same = fixedByPos.get(r.positionId) ?? [];
    if (same.length < 2) return true;
    const want = input.rungChoice?.[r.positionId] ?? Math.max(...same.map((s) => s.rung ?? 0));
    return r.rung === want;
  });
  // Fixed seats spend their limit first; pooled rows share what is left of each cap.
  const used = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of chosen.filter((x) => !x.pooled)) {
    counts.set(r.id, r.seats[1]);
    if (r.limitKey) used.set(r.limitKey, (used.get(r.limitKey) ?? 0) + r.seats[1]);
  }
  for (const r of chosen.filter((x) => x.pooled)) {
    const lim = input.limits.get(r.limitKey);
    const left = lim === null ? null : Math.max(0, lim - (used.get(r.limitKey ?? '') ?? 0));
    const n = pooledCount(r, input.band, left);
    counts.set(r.id, n);
    if (r.limitKey) used.set(r.limitKey, (used.get(r.limitKey) ?? 0) + n);
  }
  // Seats in catalogue order; pooled helpers spread over rooms and sides.
  const drafts: Omit<Seat, 'reportsToSeatId'>[] = [];
  let id = input.firstSeatId;
  for (const r of chosen) {
    const n = counts.get(r.id) ?? 0;
    for (let i = 0; i < n; i += 1) {
      const room = ROOM_ORDER[i % ROOM_ORDER.length]!;
      const side: JobSide = r.side !== 'by_seat' ? r.side : r.positionGroup === 'by_seat' ? room.side : HELPER_SIDES[i % HELPER_SIDES.length]!;
      const group: PositionGroup = r.positionGroup !== 'by_seat' ? r.positionGroup : room.group;
      drafts.push({
        seatId: id, catalogueId: r.id, positionId: r.positionId!, title: r.title, rung: r.rung, side, positionGroup: group,
        dutyIds: r.dutyIds, recruitsOffCampus: false, gamedaySeat: r.gamedaySeat, paid: r.paid, termLimitYears: r.termLimitYears,
        titleOnTop: r.titleOnTop, holderPersonId: null, holderSince: null, vacantSince: input.date, namedDeputyPersonId: null, holding: 'permanent',
      });
      id += 1;
    }
  }
  const offCampus = assignOffCampus(drafts, cat, input.limits);
  const seats = resolveReportsTo(drafts.map((d) => ({ ...d, recruitsOffCampus: offCampus.has(d.seatId) })), cat);
  return { teamId: input.teamId, level: input.level, seats, callers: defaultCallers(seats, cat) };
}

/**
 * S1.2.2: seats flagged to recruit off campus, at most the league's limit (head coach counted). Flags go
 * by rung, highest first, then seat order, so the head coach and coordinators are flagged before rooms.
 */
function assignOffCampus(seats: readonly Omit<Seat, 'reportsToSeatId'>[], cat: Catalogue, limits: StaffLimits): Set<number> {
  const limit = limits.get('staff.offcampus_recruiters_max');
  const eligible = seats.filter((s) => cat.job(s.catalogueId).recruitsOffCampus)
    .sort((a, b) => (b.rung ?? -1) - (a.rung ?? -1) || a.seatId - b.seatId);
  return new Set((limit === null ? eligible : eligible.slice(0, limit)).map((s) => s.seatId));
}

/** The deepest boss seat (athletic director under a president, general manager under an owner). */
function bossSeat(seats: readonly { seatId: number; positionId: string }[], cat: Catalogue): number | null {
  let best: { id: number; depth: number } | null = null;
  for (const s of seats) {
    const p = cat.position(s.positionId);
    if (p.roleGroup !== 'boss') continue;
    let depth = 0;
    for (let cur = p.definition.reportsTo; cur && cat.hasPosition(cur); cur = cat.position(cur).definition.reportsTo) depth += 1;
    if (!best || depth > best.depth) best = { id: s.seatId, depth };
  }
  return best?.id ?? null;
}

function resolveReportsTo(seats: readonly Omit<Seat, 'reportsToSeatId'>[], cat: Catalogue): Seat[] {
  const first = (pred: (s: Omit<Seat, 'reportsToSeatId'>) => boolean) => seats.find(pred)?.seatId ?? null;
  const hc = first((s) => s.positionId === 'pos:head_coach');
  const coordOf = (side: JobSide) => first((s) => cat.position(s.positionId).roleGroup === 'coordinators' && s.side === side) ?? hc;
  const boss = bossSeat(seats, cat);
  return seats.map((s) => {
    const p = cat.position(s.positionId);
    const byPosition = (pid: string, fallback: number | null) => first((x) => x.positionId === pid && x.seatId !== s.seatId) ?? fallback;
    let to: number | null;
    switch (p.reportsToRule) {
      case 'boss': to = boss; break;
      case 'head_coach': to = hc; break;
      case 'coordinator_of_side': to = s.side === 'whole_team' || s.side === 'support' ? hc : coordOf(s.side); break;
      case 'position_coach_of_group':
        to = s.positionGroup === 'none' || s.positionGroup === 'specialists'
          ? coordOf(s.positionGroup === 'specialists' ? 'special_teams' : s.side)
          : first((x) => cat.position(x.positionId).roleGroup === 'position_coaches' && x.positionGroup === s.positionGroup && x.rung === 5) ?? coordOf(s.side);
        break;
      case 'graduate_assistant': to = byPosition('pos:graduate_assistant', hc); break;
      case 'recruiting_assistant': to = byPosition('pos:recruiting_assistant', hc); break;
      case 'strength_head': to = byPosition('pos:strength_head', hc); break;
      case 'general_manager': to = byPosition('pos:general_manager', boss); break;
      default: {
        // Bosses: the seat of the position their definition reports to, when that seat exists.
        const parent = p.definition.reportsTo;
        to = parent ? first((x) => x.positionId === parent) : null;
      }
    }
    return { ...s, reportsToSeatId: to === s.seatId ? null : to };
  });
}

/** L4.1.2 default: each side's coordinator calls it; with no coordinator seat, the head coach. */
export function defaultCallers(seats: readonly Seat[], cat: Catalogue = CATALOGUE): Callers {
  const hc = seats.find((s) => s.positionId === 'pos:head_coach')?.seatId ?? -1;
  const of = (side: Side) => seats.find((s) => cat.position(s.positionId).roleGroup === 'coordinators' && s.side === side)?.seatId ?? hc;
  return { offense: of('offense'), defense: of('defense'), special_teams: of('special_teams') };
}

// ---------- state changes (pure: new staff out) ----------

export function seat(staff: Staff, seatId: number): Seat {
  const s = staff.seats.find((x) => x.seatId === seatId);
  if (!s) throw new Error(`positions: no seat ${seatId} on team ${staff.teamId}`);
  return s;
}

function replace(staff: Staff, next: Seat): Staff {
  return { ...staff, seats: staff.seats.map((s) => (s.seatId === next.seatId ? next : s)) };
}

export function fillSeat(staff: Staff, seatId: number, personId: number, date: WorldDate, holding: Holding = 'permanent'): Staff {
  const s = seat(staff, seatId);
  return replace(staff, { ...s, holderPersonId: personId, holderSince: date, vacantSince: holding === 'permanent' ? null : s.vacantSince ?? date, holding });
}

export function vacateSeat(staff: Staff, seatId: number, date: WorldDate): Staff {
  const s = seat(staff, seatId);
  return replace(staff, { ...s, holderPersonId: null, holderSince: null, vacantSince: date, holding: 'permanent', namedDeputyPersonId: s.namedDeputyPersonId === s.holderPersonId ? null : s.namedDeputyPersonId });
}

export function setNamedDeputy(staff: Staff, seatId: number, personId: number | null): Staff {
  return replace(staff, { ...seat(staff, seatId), namedDeputyPersonId: personId });
}

/** L4.1.2: the head coach sets who calls a side ("me" is his own seat). */
export function setCaller(staff: Staff, side: Side, seatId: number): Staff {
  seat(staff, seatId);
  return { ...staff, callers: { ...staff.callers, [side]: seatId } };
}

export function seatsHeldBy(staff: Staff, personId: number): readonly Seat[] {
  return staff.seats.filter((s) => s.holderPersonId === personId);
}

export function headCoachSeat(staff: Staff): Seat {
  const s = staff.seats.find((x) => x.positionId === 'pos:head_coach');
  if (!s) throw new Error(`positions: team ${staff.teamId} has no head coach seat`);
  return s;
}

/** The S1.1.1 `calls_plays` flag: a seat calls if it is the caller of any side. */
export function callsPlays(staff: Staff, seatId: number): boolean {
  return Object.values(staff.callers).includes(seatId);
}

/** The JobRecord row for a seat on the coaching ladder (contract table `jobs`). */
export function toJobRecord(staff: Staff, s: Seat): JobRecord {
  if (s.rung === null) throw new Error(`positions: ${s.catalogueId} is off the ladder and has no JobRecord rung (CR-G25-1)`);
  return JobRecord.parse({
    id: s.seatId, teamId: staff.teamId, catalogueId: s.catalogueId, positionId: s.positionId, rung: s.rung, side: s.side,
    positionGroup: s.positionGroup, dutyIds: [...s.dutyIds], callsPlays: callsPlays(staff, s.seatId), recruitsOffCampus: s.recruitsOffCampus,
    gamedaySeat: s.gamedaySeat, paid: s.paid, termLimitYears: s.termLimitYears, reportsToJobId: s.reportsToSeatId,
    holderPersonId: s.holderPersonId, namedDeputyPersonId: s.namedDeputyPersonId, holderSince: s.holderSince, vacantSince: s.vacantSince, holding: s.holding,
  });
}

// ---------- checks ----------

export interface LimitBreach { readonly key: string; readonly count: number; readonly limit: number }

/** S1.2.2: limited seats over the league's limit. A breach is a warning and an L8.2.5 act, never a block. */
export function limitBreaches(staff: Staff, limits: StaffLimits, cat: Catalogue = CATALOGUE): readonly LimitBreach[] {
  const counts = new Map<string, number>();
  for (const s of staff.seats) {
    const key = cat.job(s.catalogueId).limitKey;
    if (key && s.holderPersonId !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const offCampus = new Set(staff.seats.filter((s) => s.recruitsOffCampus && s.holderPersonId !== null).map((s) => s.holderPersonId));
  counts.set('staff.offcampus_recruiters_max', offCampus.size);
  const out: LimitBreach[] = [];
  for (const [key, count] of counts) {
    const limit = limits.get(key);
    if (limit !== null && count > limit) out.push({ key, count, limit });
  }
  return out;
}

/** Structural problems (content or state error): an empty list is a valid staff. */
export function staffProblems(staff: Staff, cat: Catalogue = CATALOGUE): string[] {
  const out: string[] = [];
  const ids = new Set(staff.seats.map((s) => s.seatId));
  if (ids.size !== staff.seats.length) out.push('duplicate seat id');
  for (const s of staff.seats) {
    const row = cat.job(s.catalogueId);
    const p = cat.position(s.positionId);
    const parent = p.definition.reportsTo;
    const isTop = p.reportsToRule === 'none' && (parent === null || !staff.seats.some((x) => x.positionId === parent));
    if (!isTop && s.reportsToSeatId === null) out.push(`${s.seatId} ${s.title}: no evaluating boss (S1.2.1 acceptance)`);
    if (s.reportsToSeatId !== null && !ids.has(s.reportsToSeatId)) out.push(`${s.seatId} ${s.title}: orphan, boss seat ${s.reportsToSeatId} missing`);
    if (row.onLadder && (s.rung === null || s.dutyIds.length === 0)) out.push(`${s.seatId} ${s.title}: ladder seat lacks a rung or duty set (S1.1.1)`);
    if ((s.holderPersonId === null) !== (s.holderSince === null)) out.push(`${s.seatId}: holder and start date disagree`);
  }
  for (const [side, id] of Object.entries(staff.callers)) if (!ids.has(id)) out.push(`no caller seat for ${side} (L4.1.2: exactly one caller per side)`);
  return out;
}

// ---------- the chart (X8.1.2) ----------

export type ChartColumn = 'head' | 'offense' | 'defense' | 'special_teams' | 'strength' | 'support' | 'front_office';

export interface ChartBox {
  readonly seatId: number;
  readonly title: string;
  readonly holderPersonId: number | null;
  readonly yearsInChair: number | null;
  readonly yearsOnStaff: number | null;
  readonly reportsToSeatId: number | null;
  readonly badges: readonly string[];
}

export interface StaffChart {
  readonly columns: Readonly<Record<ChartColumn, readonly ChartBox[]>>;
  readonly openChairs: number;
  /** One edge per reporting line: [seat, boss seat]. */
  readonly edges: readonly (readonly [number, number])[];
}

export function yearsBetween(from: WorldDate, to: WorldDate): number {
  return ((to.seasonYear - from.seasonYear) * DAYS_PER_YEAR + (to.dayIndex - from.dayIndex)) / DAYS_PER_YEAR;
}

function columnOf(s: Seat, p: PositionRow): ChartColumn {
  if (s.positionId === 'pos:head_coach') return 'head';
  if (p.roleGroup === 'boss' || p.roleGroup === 'personnel') return 'front_office';
  if (p.roleGroup === 'strength') return 'strength';
  if (s.side === 'offense' || s.side === 'defense' || s.side === 'special_teams') return s.side;
  return 'support';
}

/** The staff chart query: boxes by column, open chairs marked, badges per X8.1.2. */
export function staffChart(staff: Staff, today: WorldDate, staffSince: ReadonlyMap<number, WorldDate> = new Map(), cat: Catalogue = CATALOGUE): StaffChart {
  const columns: Record<ChartColumn, ChartBox[]> = { head: [], offense: [], defense: [], special_teams: [], strength: [], support: [], front_office: [] };
  const edges: (readonly [number, number])[] = [];
  let open = 0;
  for (const s of staff.seats) {
    const badges: string[] = [];
    if (s.holding === 'interim') badges.push('Interim');
    if (s.holding === 'acting') badges.push('Acting');
    if (callsPlays(staff, s.seatId)) badges.push('Play caller');
    if (s.holderPersonId === null) { open += 1; if (s.vacantSince) badges.push(`Vacant since ${s.vacantSince.seasonYear}/${s.vacantSince.dayIndex}`); }
    const since = s.holderPersonId !== null ? staffSince.get(s.holderPersonId) : undefined;
    columns[columnOf(s, cat.position(s.positionId))].push({
      seatId: s.seatId, title: s.title, holderPersonId: s.holderPersonId,
      yearsInChair: s.holderSince ? yearsBetween(s.holderSince, today) : null,
      yearsOnStaff: since ? yearsBetween(since, today) : null,
      reportsToSeatId: s.reportsToSeatId, badges,
    });
    if (s.reportsToSeatId !== null) edges.push([s.seatId, s.reportsToSeatId]);
  }
  return { columns, openChairs: open, edges };
}
