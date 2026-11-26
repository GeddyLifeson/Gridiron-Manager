// The staff list and coach card (O4.3.1). The staff is the club's seats (X8 jobs) with their holders. A
// coach card shows the record, never a skill: no K2 parameter, no skill number, bar or word standing for
// one (E9.5.2, acceptance). What the user reads is the demonstrated record with its sample (the events
// behind each line), labels once the label engine has them (N2.8), and his proposals with their results.
import { positions } from '@gm/career';
import type { ObservedWorld } from '../../observer/index.ts';
import type { CoachCardView, DemonstratedLine, ProposalRow, StaffSeat, StaffView, WordRead } from './types.ts';
import { contractLine, displayName, nameOf, peopleById, seenRead, visibleEventIds, worldDate } from './world.ts';

type Row = Record<string, unknown>;

export interface StaffInputs {
  /** Cost text key of covering a vacant seat, by job id (O4.3.1 edge case). */
  readonly coverCost?: Readonly<Record<string, string>>;
}

let titles: ReadonlyMap<string, string> | null = null;

/** The catalogue title of a staff job (X8.1.2), e.g. "Offensive Coordinator"; null when the id is not a catalogue job. */
export function jobTitle(catalogueId: string): string | null {
  titles ??= new Map(positions.CATALOGUE.jobs.map((j) => [j.id, j.title]));
  return titles.get(catalogueId) ?? null;
}

export function buildStaff(world: ObservedWorld, clubId: number, input: StaffInputs = {}): StaffView {
  const people = peopleById(world);
  const seats: StaffSeat[] = (world.table('jobs') as readonly Row[])
    .filter((j) => j.teamId === clubId && typeof j.id === 'number')
    .map((j) => {
      const holder = typeof j.holderPersonId === 'number' ? j.holderPersonId : null;
      const deputy = typeof j.namedDeputyPersonId === 'number' ? j.namedDeputyPersonId : null;
      return {
        jobId: j.id as number, catalogueId: String(j.catalogueId ?? ''), rung: typeof j.rung === 'number' ? j.rung : 0, side: String(j.side ?? ''),
        positionGroup: String(j.positionGroup ?? ''), reportsToJobId: typeof j.reportsToJobId === 'number' ? j.reportsToJobId : null,
        holderPersonId: holder, holderName: nameOf(people, holder), holding: String(j.holding ?? 'permanent'),
        coveringPersonId: holder === null ? deputy : null, coverCostKey: holder === null ? input.coverCost?.[String(j.id)] ?? null : null,
      };
    })
    .sort((a, b) => b.rung - a.rung || a.jobId - b.jobId);
  return { clubId, seats };
}

/** What the world side supplies for a coach card: reads in words and the proposal record (K6, N3). */
export interface CoachReads {
  /** Label text key by record key, once the label engine has the sample (N2.8). */
  readonly labels?: Readonly<Record<string, string>>;
  readonly trust?: WordRead | null;
  readonly loyalty?: WordRead | null;
  readonly ambitionKeys?: readonly string[];
  readonly proposals?: readonly ProposalRow[];
  readonly background?: readonly string[];
}

export function buildCoachCard(world: ObservedWorld, clubId: number, personId: number, reads: CoachReads = {}): CoachCardView | null {
  const people = peopleById(world);
  const p = people.get(personId);
  if (!p) return null;
  const coaching = (p.coaching ?? {}) as { side?: string | null; positionGroupTaught?: string; systemFamilies?: Record<string, number>; demonstratedRecord?: Record<string, number[]> };
  const job = (world.table('jobs') as readonly Row[]).find((j) => j.holderPersonId === personId && typeof j.id === 'number');
  const record: DemonstratedLine[] = Object.entries(coaching.demonstratedRecord ?? {})
    .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
    .map(([key, ids]) => ({ key, eventIds: [...ids].sort((a, b) => a - b), labelKey: reads.labels?.[key] ?? null }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seen = visibleEventIds(world);
  const sameClub = job?.teamId === clubId;
  return {
    personId, name: displayName(p.name as { first?: string; last?: string } | undefined, personId),
    jobId: typeof job?.id === 'number' ? job.id : null, catalogueId: typeof job?.catalogueId === 'string' ? job.catalogueId : null,
    side: coaching.side ?? null, positionGroupTaught: coaching.positionGroupTaught ?? null,
    systems: Object.entries(coaching.systemFamilies ?? {}).map(([familyId, seasons]) => ({ familyId, seasons })).sort((a, b) => b.seasons - a.seasons || (a.familyId < b.familyId ? -1 : 1)),
    background: [...(reads.background ?? [])],
    record, noBook: record.length === 0,
    relationship: sameClub ? { trust: seenRead(reads.trust, seen), loyalty: seenRead(reads.loyalty, seen) } : null,
    ambitionKeys: [...(reads.ambitionKeys ?? [])],
    contract: sameClub ? contractLine(world, personId, clubId, worldDate(world)) : null,
    proposals: (reads.proposals ?? []).filter((r) => seen.has(r.eventId)),
  };
}
