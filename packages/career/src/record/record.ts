// The demonstrated record (E9.1.2): for each family, the ids of the events that are evidence about one
// coach, ordered by date. It holds references only. It stores no aggregate (rule 1): every number a screen
// shows is computed from these ids when shown (summary.ts) and never written back. Building it twice from
// the same log gives the same object (acceptance 2 and 3).
import type { WorldDate, WorldEvent } from '@gm/schema';
import { DUTY_EVIDENCE, FAMILIES, familiesForSeat, isDutyFamily, type FamilyId, type SeatAt } from './families.ts';
import { DEFAULT_EVIDENCE_MAP, RECORD_EVENT, indexMap, isSimulated, type EvidenceMap, type EvidenceRow } from './events.ts';
import { param } from './params.ts';
import { systemsPanel, type RecordFact } from './facts.ts';

export type FamilyIds = Readonly<Record<FamilyId, readonly number[]>>;

/** Why an event that names the coach did not enter his record. */
export type RefusalReason = 'no_seat' | 'family_not_at_rung' | 'decision_scope' | 'duty_not_held' | 'duty_family_mismatch';

export interface Refusal { readonly eventId: number; readonly family: FamilyId; readonly reason: RefusalReason }

export interface DemonstratedRecord {
  readonly personId: number;
  /** Every evidence event by family, date order (simulated ones included, E9.1.2 outputs). */
  readonly eventIds: FamilyIds;
  /** The simulated subset (S8.1.1 edge case): shown with the flag, never counted toward a label sample. */
  readonly simulatedEventIds: FamilyIds;
  /** Events that named him but that his seat could not produce (S8.1.1 rule 4, E9.5.1 rule 6). */
  readonly refused: readonly Refusal[];
}

export interface RecordContext {
  /** His seat on the event's date; null when he held no coaching seat (no evidence then). */
  seatAt(personId: number, date: WorldDate): SeatAt | null;
  readonly map?: EvidenceMap;
}

export function dayNumber(d: WorldDate): number { return d.seasonYear * param('daysPerSeasonYear') + d.dayIndex; }

function byDate(a: WorldEvent, b: WorldEvent): number {
  return dayNumber(a.when.date) - dayNumber(b.when.date) || a.id - b.id;
}

function emptyIds(): Record<FamilyId, number[]> {
  return Object.fromEntries(FAMILIES.map((f) => [f, [] as number[]])) as unknown as Record<FamilyId, number[]>;
}

function rowFor(rows: readonly EvidenceRow[] | undefined, e: WorldEvent, personId: number): EvidenceRow | null {
  if (!rows) return null;
  for (const r of rows) {
    if (r.actorRole === null ? e.actors.some((a) => a.personId === personId) : e.actors.some((a) => a.personId === personId && a.role === r.actorRole)) return r;
  }
  return null;
}

/** Whether the seat could produce this event (E9.5.1, S8.1.1 rules 2 to 4). Null means it could. */
export function seatRefusal(e: WorldEvent, family: FamilyId, seat: SeatAt | null): RefusalReason | null {
  if (seat === null) return 'no_seat';
  const allowed = familiesForSeat(seat);
  if (!allowed.families.has(family)) return 'family_not_at_rung';
  if (family === 'decisions') {
    const rec = e.payload['recommendation'] === true;
    const call = e.payload['decisionKind'] === 'play_call';
    const ok = allowed.decisions === 'all'
      || (rec && allowed.decisions !== 'none')
      || (!rec && allowed.decisions === 'play_calls' && call);
    if (!ok) return 'decision_scope';
  }
  const duty = e.payload['dutyFamily'];
  if (typeof duty === 'string' && duty !== '') {
    if (!isDutyFamily(duty)) return 'duty_family_mismatch';
    if (!DUTY_EVIDENCE[duty].some((d) => d.family === family && (d.fromRung === undefined || seat.rung >= d.fromRung))) return 'duty_family_mismatch';
    if (seat.duties !== null && !seat.duties.includes(duty)) return 'duty_not_held';
  }
  return null;
}

/** Build one coach's record from the log (any order). */
export function buildRecord(events: readonly WorldEvent[], personId: number, ctx: RecordContext): DemonstratedRecord {
  const idx = indexMap(ctx.map ?? DEFAULT_EVIDENCE_MAP);
  const ids = emptyIds();
  const sim = emptyIds();
  const refused: Refusal[] = [];
  for (const e of [...events].sort(byDate)) {
    if (e.type === RECORD_EVENT.fact) continue;
    const row = rowFor(idx.get(e.type), e, personId);
    if (!row) continue;
    const why = seatRefusal(e, row.family, ctx.seatAt(personId, e.when.date));
    if (why) { refused.push({ eventId: e.id, family: row.family, reason: why }); continue; }
    ids[row.family].push(e.id);
    if (isSimulated(e)) sim[row.family].push(e.id);
  }
  return { personId, eventIds: ids, simulatedEventIds: sim, refused };
}

/** The ids a label engine may count toward a minimum sample: everything but simulated rows (S8.1.1 edge). */
export function sampleEventIds(r: DemonstratedRecord, family: FamilyId): number[] {
  const s = new Set(r.simulatedEventIds[family]);
  return r.eventIds[family].filter((id) => !s.has(id));
}

/** Whether a family has no events at all: shown as "no record", never as a low value (E9.1.1 edge case). */
export function hasNoRecord(r: DemonstratedRecord, family: FamilyId): boolean { return r.eventIds[family].length === 0; }

/** The P3.2.2 CoachingBlock fields this module fills (`demonstratedRecord`, `systemFamilies`, `historyFacts`). */
export interface CoachingRecordFields {
  readonly demonstratedRecord: Record<string, number[]>;
  readonly systemFamilies: Record<string, number>;
  readonly historyFacts: { seasonYear: number; dayIndex: number; kind: string; refIds: number[] }[];
}

/**
 * Write the record into the contract's shape. The contract's `HistoryFact` holds kind, date and ids only,
 * so the system family, level key and role of a fact live in `systemFamilies` and in the facts list this
 * module recomputes (contract gap CR-G54-1 in the README).
 */
export function toCoachingFields(r: DemonstratedRecord, facts: readonly RecordFact[]): CoachingRecordFields {
  const demonstratedRecord: Record<string, number[]> = {};
  for (const f of FAMILIES) demonstratedRecord[f] = [...r.eventIds[f]];
  const systemFamilies: Record<string, number> = {};
  for (const l of systemsPanel(facts)) systemFamilies[l.family] = l.seasons;
  const historyFacts = facts.map((f) => ({ seasonYear: f.firstSeason, dayIndex: 0, kind: f.type, refIds: [...(f.refId === null ? [] : [f.refId]), ...f.sourceEventIds] }));
  return { demonstratedRecord, systemFamilies, historyFacts };
}
