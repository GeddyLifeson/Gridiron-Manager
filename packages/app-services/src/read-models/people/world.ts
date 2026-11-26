// Small readers over the observed world shared by the people read models. Every reader takes the
// observer's view of the tables (G-27) and never the save tables, so a field the filter withheld is
// simply absent here and the model shows "not evaluated" or nothing, never a guess.
import type { ObservedWorld } from '../../observer/index.ts';
import type { ContractLine, ReadReason, WordRead } from './types.ts';

export interface DateLike { readonly seasonYear: number; readonly dayIndex: number }

interface NameLike { first?: string; last?: string; suffix?: string | null }

export function displayName(n: NameLike | undefined, id: number): string {
  if (!n?.last) return `#${id}`;
  return [n.first, n.last, n.suffix].filter((x) => !!x).join(' ');
}

const isDate = (d: unknown): d is DateLike =>
  !!d && typeof (d as DateLike).seasonYear === 'number' && typeof (d as DateLike).dayIndex === 'number';

/** The world date (the `world` row's public calendar), or null when the observer cannot read it. */
export function worldDate(world: ObservedWorld): DateLike | null {
  const w = world.table('world')[0] as { calendar?: unknown } | undefined;
  return isDate(w?.calendar) ? { seasonYear: w.calendar.seasonYear, dayIndex: w.calendar.dayIndex } : null;
}

/** The world's user person id, when the observer can read it. */
export function userPersonId(world: ObservedWorld): number | null {
  const w = world.table('world')[0] as { userPersonId?: unknown } | undefined;
  return typeof w?.userPersonId === 'number' ? w.userPersonId : null;
}

export function compareDate(a: DateLike, b: DateLike): number {
  return a.seasonYear - b.seasonYear || a.dayIndex - b.dayIndex;
}

/** Whole years from a birth date to a date (same calendar, day index within the season year). */
export function ageAt(birth: unknown, at: DateLike | null): number | null {
  if (!isDate(birth) || !at) return null;
  return at.seasonYear - birth.seasonYear - (at.dayIndex < birth.dayIndex ? 1 : 0);
}

export type PersonRow = Record<string, unknown> & { id?: number };

export function peopleById(world: ObservedWorld): Map<number, PersonRow> {
  const m = new Map<number, PersonRow>();
  for (const p of world.table('people') as readonly PersonRow[]) if (typeof p.id === 'number') m.set(p.id, p);
  return m;
}

export function nameOf(people: Map<number, PersonRow>, id: number | null | undefined): string | null {
  if (typeof id !== 'number') return null;
  return displayName(people.get(id)?.name as NameLike | undefined, id);
}

/** The ids of events this observer can see (witnessed or public, G-27 event visibility). */
export function visibleEventIds(world: ObservedWorld): Set<number> {
  const s = new Set<number>();
  for (const e of world.table('events') as readonly { id?: unknown }[]) if (typeof e.id === 'number') s.add(e.id);
  return s;
}

/**
 * Keeps a word read only with reasons the observer saw or heard (O4.1.5 rule, acceptance: every reason maps
 * to a real event in the save that reached this observer). A reason whose event the observer cannot see is
 * dropped, never shown.
 */
export function seenRead(read: WordRead | null | undefined, seen: Set<number>): WordRead | null {
  if (!read) return null;
  const reasons: ReadReason[] = read.reasons.filter((r) => seen.has(r.eventId)).map((r) => ({ textKey: r.textKey, eventId: r.eventId }));
  return { textKey: read.textKey, reasons, trend: read.trend };
}

interface ContractRow {
  personId?: number; teamId?: number; state?: string;
  terms?: { years?: { leagueYear?: number; baseSalary?: { amountCents?: number } }[]; salary?: { leagueYear?: number; amountCents?: number }[] };
}

/** The contract line of a person's active contract with a club, when the observer can read its terms (C6, E3). */
export function contractLine(world: ObservedWorld, personId: number, clubId: number, at: DateLike | null): ContractLine | null {
  const c = (world.table('contracts') as readonly ContractRow[]).find((r) => r.personId === personId && r.teamId === clubId && r.state === 'active');
  const years = c?.terms?.years?.map((y) => ({ year: y.leagueYear, cents: y.baseSalary?.amountCents }))
    ?? c?.terms?.salary?.map((y) => ({ year: y.leagueYear, cents: y.amountCents }));
  if (!years || years.length === 0 || years.some((y) => typeof y.year !== 'number')) return null;
  const nums = years.map((y) => y.year as number);
  const now = at ? years.find((y) => y.year === at.seasonYear) : undefined;
  return { years: years.length, throughYear: Math.max(...nums), thisYearCents: typeof now?.cents === 'number' ? now.cents : null };
}
