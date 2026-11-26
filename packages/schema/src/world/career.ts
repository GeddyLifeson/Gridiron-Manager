// World contract, part 9: career, people dynamics, money, family and messages (P3.5.1, S11, E2, E5,
// E6, E8, E10, S4, O1.2.2, X4.2.2, X5, X6, X7, L1).
// No points, levels or purchased skills are stored anywhere here: a career is a history and
// relationships only (P3.5.1). A coaching tree is a query over relationship edges, not a stored shape.
import { z } from 'zod';
import { pub, own, truth } from '../field.ts';
import {
  zCents, zContentRef, zCount, zId, zIdList, zScale, zSignedCents, zTemplateParams, zTextKey, zWorldDate, zYear,
} from './primitives.ts';

/** One job held, as history (P3.5.1, S11). Append-only. */
export const JobHistoryRow = z.object({
  personId: zId(),
  jobId: zId(),
  teamId: zId(),
  catalogueId: zContentRef(),
  started: zWorldDate(),
  ended: zWorldDate().nullable(),
  /** Seasons in the seat and the team's results, written when the row closes. */
  seasons: zCount(),
  wins: zCount(),
  losses: zCount(),
  ties: zCount(),
  exitReason: pub(z.enum(['current', 'promoted', 'hired_away', 'fired', 'resigned', 'retired', 'contract_expired', 'position_eliminated', 'died'])),
  exitEventId: zId().nullable(),
}).strict();
export type JobHistoryRow = z.infer<typeof JobHistoryRow>;

/** Relationship edge kinds: X7.1.1's starting list plus `mentor` and `agent` from P3.5.1 (W-19). */
export const EdgeKind = z.enum(['worked_under', 'worked_with', 'teammate', 'coached', 'recruited_by', 'promise', 'rival', 'family', 'prior', 'mentor', 'agent']);

/**
 * Relationship edge (X7.1.1, P3.5.1). `a` and `b` are person ids (a team for `rival` uses `bTeamId`).
 * Strength and sign are truth: people show them through behaviour, and the user sees relationship
 * descriptions built from shared history (X7.4.1), never the number.
 */
export const RelationshipEdge = z.object({
  a: zId(),
  b: zId().nullable(),
  bTeamId: zId().nullable(),
  kind: pub(EdgeKind),
  strength: zScale(0, 100, 'X7.1.1 strength'),
  sign: truth(z.enum(['warm', 'neutral', 'cold'])),
  since: zWorldDate(),
  lastContact: zWorldDate(),
  /** Up to the five strongest event ids that built the edge (X7.1.1). */
  basisEventIds: pub(z.array(z.number().int().positive()).max(5), 'id'),
}).strict().refine((e) => (e.b === null) !== (e.bTeamId === null), { message: 'an edge ends at a person or a team (X7.1.1)' });
export type RelationshipEdge = z.infer<typeof RelationshipEdge>;

/** Snaps a pair played together in one unit (X7.3.1), per season with carryover. */
export const CohesionRow = z.object({
  teamId: zId(),
  seasonYear: zYear(),
  unitKey: pub(z.string().min(1)),
  a: zId(),
  b: zId(),
  snapsTogether: zCount(),
}).strict();
export type CohesionRow = z.infer<typeof CohesionRow>;

/** One memory (X6.1.1). Truth. Row counts per layer are tuning values of X6, checked by G-23, not by the shape. */
export const MemoryRow = z.object({
  holderId: zId('truth'),
  eventId: zId('truth'),
  aboutPersonId: zId('truth').nullable(),
  aboutTeamId: zId('truth').nullable(),
  category: truth(z.string().min(1)),
  sign: truth(z.union([z.literal(-1), z.literal(0), z.literal(1)])),
  strength: zScale(0, 100, 'X6.1.1 strength'),
  layer: truth(z.enum(['short', 'permanent'])),
  formed: zWorldDate('truth'),
  lastFelt: zWorldDate('truth'),
}).strict();
export type MemoryRow = z.infer<typeof MemoryRow>;

/** Needs, stress and coping of one person (X5.1.2, X5.2.1, X5.2.3, X5.2.4). Truth. */
export const PersonState = z.object({
  personId: zId('truth'),
  /** Need id to level 0 to 100, 0 fully met (X5.1.2). */
  needs: truth(z.record(z.string(), z.number().int().min(0).max(100)), 'index'),
  stress: zScale(0, 1000, 'X5.2.1 stress'),
  stressBand: truth(z.string().min(1)),
  lastAct: truth(z.object({ date: zWorldDate('truth'), kind: truth(z.string().min(1)) }).strict()).nullable(),
  coping: truth(z.object({ copingId: truth(z.string().min(1)), since: zWorldDate('truth') }).strict()).nullable(),
}).strict();
export type PersonState = z.infer<typeof PersonState>;

/** A promise in the L1 ledger (L1, X7.2.3). The X2 events record making, keeping and breaking it. */
export const PromiseRecord = z.object({
  id: zId(),
  fromPersonId: zId(),
  toPersonId: zId(),
  subjectKey: pub(z.string().min(1)),
  made: zWorldDate(),
  due: zWorldDate().nullable(),
  status: pub(z.enum(['open', 'kept', 'broken', 'released'])),
  madeEventId: zId(),
}).strict();
export type PromiseRecord = z.infer<typeof PromiseRecord>;

export const Audience = z.enum(['peers', 'administrators_and_owners', 'players', 'recruits', 'media', 'fans']);

/**
 * Reputation of one person with one audience (E5 outputs, P3.5.1): `regard` 0 to 100 and `known` 0 to 1.
 * E5 keys fans and media by level; the contract keys them by competition (`competitionId`, null for the
 * shared audiences) so no row carries a level (P3.1.2, W-20). Truth: shown only as computed descriptors.
 */
export const ReputationRow = z.object({
  personId: zId(),
  audience: pub(Audience),
  competitionId: zId().nullable(),
  regard: zScale(0, 100, 'E5 regard'),
  known: truth(z.number().min(0).max(1), 'ratio'),
  /** Change over the last season, signed, in regard points. */
  trend: truth(z.number(), 'index'),
  evidenceEventIds: zIdList(),
}).strict();
export type ReputationRow = z.infer<typeof ReputationRow>;

/** A job opening and its candidates (P3.5.1, E2, S6). */
export const JobOpening = z.object({
  id: zId(),
  teamId: zId(),
  jobId: zId(),
  opened: zWorldDate(),
  stage: pub(z.enum(['open', 'interviews', 'offer', 'filled', 'withdrawn'])),
  candidates: own(z.array(z.object({
    personId: zId('own_team'),
    stage: own(z.enum(['considered', 'contacted', 'interviewed', 'offered', 'declined', 'withdrew', 'hired'])),
    interviewEventIds: zIdList('own_team'),
  }).strict())),
  filledByPersonId: zId().nullable(),
}).strict();
export type JobOpening = z.infer<typeof JobOpening>;

/** One dated money movement of one person (E6.1.3). Signed: income positive, spending negative. */
export const LedgerEntry = z.object({
  personId: zId('own_team'),
  date: zWorldDate('own_team'),
  kind: own(z.string().min(1)),
  amountCents: zSignedCents('own_team'),
  /** The contract, deal or asset row it belongs to. */
  refId: zId('own_team').nullable(),
}).strict();
export type LedgerEntry = z.infer<typeof LedgerEntry>;

/** A person's balance sheet (E6 outputs `balance_sheet`), updated monthly. Private to the person. */
export const BalanceSheet = z.object({
  personId: zId('own_team'),
  asOf: zWorldDate('own_team'),
  cashCents: zSignedCents('own_team'),
  assets: own(z.array(z.object({ id: zId('own_team'), kind: own(z.string().min(1)), valueCents: zCents('own_team') }).strict())),
  liabilities: own(z.array(z.object({ id: zId('own_team'), kind: own(z.string().min(1)), balanceCents: zCents('own_team') }).strict())),
  /** E6 `lifestyle_tier` and `credit_standing`, as content keys. */
  lifestyleTier: own(z.string().min(1)),
  creditStanding: own(z.string().min(1)),
}).strict();
export type BalanceSheet = z.infer<typeof BalanceSheet>;

/** A household (E8). Members are people (role family) so relationship edges and protection apply to them. */
export const HouseholdRecord = z.object({
  id: zId('own_team'),
  headPersonId: zId('own_team'),
  homePlace: own(z.string()),
  members: own(z.array(z.object({
    personId: zId('own_team'),
    relationship: own(z.enum(['spouse', 'partner', 'child', 'parent', 'sibling', 'other'])),
    /** E8 satisfaction 0 to 100 and needs by key: truth, shown as what family members say and do. */
    satisfaction: zScale(0, 100, 'E8 satisfaction'),
    needs: truth(z.record(z.string(), z.number().int().min(0).max(100)), 'index'),
  }).strict())),
}).strict();
export type HouseholdRecord = z.infer<typeof HouseholdRecord>;

/** Inbox item (O1.2.2, P3.5.1). A passed deadline moves it to expired and applies its default by a logged command. */
export const InboxItem = z.object({
  id: zId('own_team'),
  ownerPersonId: zId('own_team'),
  kind: own(z.string().min(1)),
  senderPersonId: zId('own_team').nullable(),
  subjectKey: zTextKey('own_team'),
  bodyKey: zTextKey('own_team'),
  params: zTemplateParams('own_team'),
  received: zWorldDate('own_team'),
  deadline: zWorldDate('own_team').nullable(),
  priority: own(z.enum(['low', 'normal', 'high', 'urgent'])),
  /** Command type that answers it, or null for information only. */
  requiredCommand: own(z.string()).nullable(),
  /** Command type applied with default payload when the deadline passes. */
  defaultCommand: own(z.string()).nullable(),
  state: own(z.enum(['unread', 'read', 'done', 'expired'])),
  links: own(z.array(z.string())),
  sourceEventId: zId('own_team').nullable(),
}).strict();
export type InboxItem = z.infer<typeof InboxItem>;

/** News item (P3.5.1, C10). Generated from log rows only (G-44); public. */
export const NewsItem = z.object({
  id: zId(),
  date: zWorldDate(),
  kind: pub(z.string().min(1)),
  subjectPersonIds: zIdList(),
  subjectTeamIds: zIdList(),
  templateKey: zTextKey(),
  params: zTemplateParams(),
  audience: pub(Audience),
  sourceEventIds: zIdList(),
}).strict();
export type NewsItem = z.infer<typeof NewsItem>;

/** A boss's evaluation of a person's work (S4, E4). Grades are content keys on the S4 scale, about work done, never ability. */
export const EvaluationRecord = z.object({
  byPersonId: zId('own_team'),
  aboutPersonId: zId('own_team'),
  periodStart: zWorldDate('own_team'),
  periodEnd: zWorldDate('own_team'),
  criteria: own(z.record(z.string(), z.string())),
  textKey: zTextKey('own_team'),
  evidenceEventIds: zIdList('own_team'),
}).strict();
export type EvaluationRecord = z.infer<typeof EvaluationRecord>;

/** A coach's written philosophy (E10). Consistency is judged from logged behaviour against it (E10.4). */
export const PhilosophyRecord = z.object({
  id: zId(),
  personId: zId(),
  written: zWorldDate(),
  statements: own(z.array(z.object({ key: own(z.string().min(1)), textKey: zTextKey('own_team') }).strict())),
  teamRules: own(z.array(z.object({ ruleKey: own(z.string().min(1)), consequenceKey: own(z.string().min(1)) }).strict())),
  standards: own(z.array(z.string().min(1))),
}).strict();
export type PhilosophyRecord = z.infer<typeof PhilosophyRecord>;

/** Season rollup per subject (X4.2.2). Derived from scored events; rebuilt on demand. */
export const NotabilityRollup = z.object({
  subjectKind: pub(z.enum(['person', 'team', 'staff'])),
  subjectId: zId(),
  seasonYear: zYear(),
  topEventIds: zIdList(),
  countsByBand: pub(z.record(z.string(), z.number().int().min(0)), 'count'),
  honourCounters: pub(z.record(z.string(), z.number().int().min(0)), 'count'),
}).strict();
export type NotabilityRollup = z.infer<typeof NotabilityRollup>;
