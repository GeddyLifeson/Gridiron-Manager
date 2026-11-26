// World contract, part 7: the history event log (X2.1.1 to X2.1.3) and the protection rule for
// imported real people (P3.2.2, A6.3.1, X14.1.2). Rows are append-only: a correction is a new event
// whose `causeId` points at the original (X2.1.3). Row helpers live in league/src/history (G-22).
import { z } from 'zod';
import { pub, own, truth } from '../field.ts';
import { RowSource, WorldTier, zCount, zId, zScale, zTextKey, zWorldDate, type PersonOrigin } from './primitives.ts';

export const EventFamily = z.enum(['game', 'career', 'roster', 'relationship', 'discipline', 'health', 'personal', 'media', 'honors', 'world']);
export const HarmClass = z.enum(['none', 'professional_negative', 'personal', 'harmful']);
export type HarmClass = z.infer<typeof HarmClass>;

/** Who may see an event (X2.1.2 `witness_rule`). The observer filter (G-27) applies it per row. */
export const WitnessRule = z.discriminatedUnion('kind', [
  z.object({ kind: pub(z.literal('public')) }).strict(),
  z.object({ kind: pub(z.literal('team')), teamId: zId() }).strict(),
  z.object({ kind: pub(z.literal('room')), teamId: zId(), roomKey: pub(z.string().min(1)) }).strict(),
  z.object({ kind: pub(z.literal('people')), personIds: pub(z.array(z.number().int().positive()), 'id') }).strict(),
  z.object({ kind: pub(z.literal('none')) }).strict(),
]);
export type WitnessRule = z.infer<typeof WitnessRule>;

/**
 * One event (X2.1.1). Field classes: identity, type and date are public; actors, subjects and payload
 * are `own_team`, which on an event row means "visible to its witnesses only" (W-16); tier and source are
 * internal truth. The payload is typed by the event type's `payloadSchema` (content), validated at emit.
 * No payload may hold a label id or a trait-block field (X2.1.1 acceptance).
 */
export const WorldEvent = z.object({
  id: zId(),
  type: pub(z.string().min(1)),
  when: pub(z.object({
    date: zWorldDate(),
    /** Inside a game: period and game clock in tenths (D-02). Null outside a game. */
    period: pub(z.number().int().min(1), 'index').nullable(),
    clockTenths: pub(z.number().int().min(0), 'tenths_s').nullable(),
  }).strict()),
  competitionId: zId().nullable(),
  where: pub(z.object({ teamId: zId().nullable(), venueId: zId().nullable() }).strict()),
  actors: own(z.array(z.object({ personId: zId('own_team'), role: own(z.string().min(1)) }).strict())),
  subjects: own(z.array(z.object({
    kind: own(z.enum(['team', 'game', 'play', 'record', 'position', 'person', 'contract', 'job', 'event'])),
    id: zId('own_team'),
  }).strict())),
  payload: own(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), 'ratio'),
  witnesses: pub(WitnessRule),
  causeId: zId().nullable(),
  /** X4.1.1 notability 0 to 100, written by the notability pass; null until scored. */
  notability: zScale(0, 100, 'X4.1.1 notability', 'public').nullable(),
  tier: truth(WorldTier),
  source: truth(RowSource),
}).strict();
export type WorldEvent = z.infer<typeof WorldEvent>;

/** An event type file (X2.1.2), content copied into the save. */
export const EventTypeDef = z.object({
  id: pub(z.string().min(1)),
  family: pub(EventFamily),
  /** Payload field name to scalar type; the emitter validates against it. */
  payloadSchema: pub(z.record(z.string(), z.enum(['string', 'number', 'boolean', 'id', 'date']))),
  witnessRule: pub(z.enum(['public', 'team', 'room', 'people', 'none'])),
  lineTemplate: zTextKey(),
  harmClass: pub(HarmClass),
  importedAllowed: pub(z.boolean()),
  minTier: pub(WorldTier),
  /** Module ids that read it; at least one (X2.1.2 rule 1). */
  consumers: pub(z.array(z.string().min(1)).min(1)),
  /** Whether compaction may fold it into a summary event (X2.1.3 rule 3). */
  compactable: pub(z.boolean()),
}).strict().superRefine((t, ctx) => {
  for (const m of eventTypeProblems(t)) ctx.addIssue({ code: 'custom', message: m, path: ['importedAllowed'] });
});
export type EventTypeDef = z.infer<typeof EventTypeDef>;

/** X2.1.2 rule 3: a personal or harmful type may never land on an imported person. */
export function eventTypeProblems(t: { id: string; harmClass: HarmClass; importedAllowed: boolean }): string[] {
  return (t.harmClass === 'personal' || t.harmClass === 'harmful') && t.importedAllowed
    ? [`event type ${t.id}: harm class ${t.harmClass} needs importedAllowed false (X2.1.2 rule 3)`]
    : [];
}

/** L9.1.2's two-value guard class, computed from the stored harm class so the two cannot disagree (X2.1.2 rule 2). */
export function guardClassOf(h: HarmClass): 'football' | 'personal' {
  return h === 'none' || h === 'professional_negative' ? 'football' : 'personal';
}

/**
 * The one protection check (P3.2.2, A6.3.1, X14.1.2). Every event system calls it before it emits an
 * event that lands on a person. An unknown type (a mod type the pack has not listed) is refused for
 * imported people (X2.1.2 edge case). Football events still land on everyone.
 */
export function mayReceiveEvent(person: { origin: PersonOrigin }, type: { importedAllowed: boolean } | undefined): boolean {
  if (person.origin !== 'imported') return true;
  return type?.importedAllowed === true;
}

/** Running hash of one season's log (X2.1.3 rule 4), stored in the save so N4 can detect tampering. */
export const SeasonLogHash = z.object({
  year: pub(z.number().int(), 'season_year'),
  eventCount: zCount(),
  lastEventId: zId().nullable(),
  hashHex: pub(z.string().regex(/^[0-9a-f]+$/)),
}).strict();
export type SeasonLogHash = z.infer<typeof SeasonLogHash>;
