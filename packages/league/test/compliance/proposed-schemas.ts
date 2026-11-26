// CR-G28-1: zod twins of the compliance rows, with a visibility class per field, proposed for
// packages/schema/src/world/compliance.ts and `worldSchemas()`. Kept in the test folder because
// `league` may not import zod and this package may not edit schema (game-build-plan section 2).
// The tests parse every row the pipeline writes with these, so the shapes cannot drift apart.
import { z } from 'zod';
import { pub, own, truth, zWorldDate } from '@gm/schema';

const id = (v: 'public' | 'truth' | 'own_team' = 'public') => (v === 'truth' ? truth(z.number().int().positive(), 'id') : v === 'own_team' ? own(z.number().int().positive(), 'id') : pub(z.number().int().positive(), 'id'));
const Party = z.object({
  personId: id('truth'),
  role: truth(z.string().min(1)),
  teamId: id('truth'),
  origin: truth(z.enum(['generated', 'designed', 'imported', 'user'])),
}).strict();
const Severity = z.enum(['major', 'minor']);

/** Hidden log row (L8.2.5 outputs): truth, read only by the actor's own views and certified export. */
export const ViolationLogRowSchema = z.object({
  id: id('truth'),
  classId: truth(z.string().min(1)),
  actor: Party,
  orderedBy: Party.nullable(),
  knew: truth(z.array(z.number().int().positive()), 'id'),
  date: zWorldDate('truth'),
  competitionId: id('truth').nullable(),
  gain: truth(z.number().min(0).max(1), 'ratio'),
  severity: truth(Severity),
  certainTrace: truth(z.boolean()),
  actSourcesDrawn: truth(z.boolean()),
  caseId: id('truth').nullable(),
  eventId: id('truth'),
}).strict();

export const CaseRowSchema = z.object({
  id: id(),
  teamId: id(),
  body: pub(z.enum(['league', 'conference', 'national_body', 'settlement_body'])),
  rowIds: truth(z.array(z.number().int().positive()), 'id'),
  opened: zWorldDate(),
  resolveBy: zWorldDate('truth'),
  response: own(z.enum(['cooperate', 'self_report', 'fight'])),
  falseAccusation: truth(z.boolean()),
  status: pub(z.enum(['open', 'closed'])),
  outcome: pub(z.enum(['finding', 'no_finding'])).nullable(),
}).strict();

const PartyKey = z.object({ kind: pub(z.enum(['person', 'team'])), id: id() }).strict();

export const LeagueRecordEntrySchema = z.object({
  caseId: id(), rowId: id('truth'), party: PartyKey, classId: pub(z.string().min(1)), severity: pub(Severity), date: zWorldDate(), repeat: pub(z.boolean()),
}).strict();

const cents = pub(z.number().int().positive(), 'cents');
export const PenaltyOrderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: pub(z.literal('warning')), party: PartyKey }).strict(),
  z.object({ kind: pub(z.literal('fine')), party: PartyKey, cents: cents.nullable(), tier: pub(z.string()).nullable(), mayBeRepaidByClub: pub(z.boolean()) }).strict(),
  z.object({ kind: pub(z.literal('suspension')), personId: id(), games: pub(z.number().int().positive(), 'count').nullable() }).strict(),
  z.object({ kind: pub(z.literal('pick_forfeit')), teamId: id(), round: pub(z.number().int().positive(), 'count').nullable() }).strict(),
  z.object({ kind: pub(z.literal('practice_cancelled')), teamId: id(), what: pub(z.string().min(1)) }).strict(),
  z.object({ kind: pub(z.literal('probation')), teamId: id(), years: pub(z.number().int().positive(), 'count') }).strict(),
  z.object({ kind: pub(z.literal('show_cause')), personId: id(), years: pub(z.number().int().positive(), 'count') }).strict(),
  z.object({ kind: pub(z.literal('rules_education')), teamId: id() }).strict(),
]);

export const ComplianceStateSchema = z.object({
  log: truth(z.array(ViolationLogRowSchema)),
  cases: pub(z.array(CaseRowSchema)),
  record: pub(z.array(LeagueRecordEntrySchema)),
  orders: pub(z.array(z.object({ caseId: id(), order: PenaltyOrderSchema }).strict())),
  nextLogId: truth(z.number().int().positive(), 'id'),
  nextCaseId: truth(z.number().int().positive(), 'id'),
}).strict();
