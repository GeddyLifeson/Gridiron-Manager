// World contract, part 5: jobs, positions, rosters, depth, knowledge, injuries, prospects
// (P3.2.4, S1.1.1, X8.1.1, C5, T5, M2, G5, D9, D11, T4, M4).
// Limits (roster sizes, staff counts, list names) are never in these shapes: they come from
// league-rules keys and are checked by the owning packages (C5, T5, S1.2.2).
import { z } from 'zod';
import { pub, own, est, truth } from '../field.ts';
import { JobSide, PositionGroup, Side3, zContentRef, zCount, zId, zIdList, zScale, zWorldDate, zYear } from './primitives.ts';

/** Career rung 0 to 9 (E2.1.1, S1.1.1). */
export const RUNG_MIN = 0;
export const RUNG_MAX = 9;

/**
 * One seat on one staff (S1.1.1 plus the P3.2.4 Job row). Level is not stored: it is the level of the
 * team's competition (P3.1.2). A person may hold two job rows on one staff (S1.1.1 edge case).
 */
export const JobRecord = z.object({
  id: zId(),
  teamId: zId(),
  /** Catalogue row of S1.1.2 or S1.1.3 (content), which holds the shown title. */
  catalogueId: zContentRef(),
  /** X8.1.1 position definition this seat instantiates. */
  positionId: zContentRef(),
  rung: pub(z.number().int().min(RUNG_MIN).max(RUNG_MAX), 'index'),
  side: pub(JobSide),
  positionGroup: pub(PositionGroup),
  /** S3 duty ids this seat owns. */
  dutyIds: pub(z.array(z.string().min(1))),
  callsPlays: pub(z.boolean()),
  recruitsOffCampus: pub(z.boolean()),
  gamedaySeat: pub(z.enum(['booth', 'sideline', 'none'])),
  paid: pub(z.enum(['none', 'stipend', 'salary'])),
  /** Graduate assistant seats have a term limit in years (S1.1.1), read from content; null for none. */
  termLimitYears: zCount().nullable(),
  reportsToJobId: zId().nullable(),
  holderPersonId: zId().nullable(),
  /** The deputy named by the appointer (X8.1.1 `named_deputy`). */
  namedDeputyPersonId: zId().nullable(),
  holderSince: zWorldDate().nullable(),
  vacantSince: zWorldDate().nullable(),
  /** Interim or acting holder (X8.1.1 table). */
  holding: pub(z.enum(['permanent', 'interim', 'acting'])),
}).strict().refine((j) => (j.holderPersonId === null) === (j.holderSince === null), {
  message: 'a held seat has a start date and an open seat has none (S1.1.1)',
});
export type JobRecord = z.infer<typeof JobRecord>;

/** One step of an X8.1.1 succession rule (grammar added 2026-11-26). */
export const SuccessionStep = z.discriminatedUnion('kind', [
  z.object({ kind: pub(z.literal('named_deputy')) }).strict(),
  z.object({ kind: pub(z.literal('role')), positionId: zContentRef() }).strict(),
  z.object({
    kind: pub(z.literal('role_group')),
    group: pub(z.string().min(1)),
    side: pub(Side3).nullable(),
    order: pub(z.enum(['years_in_chair', 'years_on_staff', 'age'])),
  }).strict(),
  z.object({ kind: pub(z.literal('appointer_pick')), outsideAllowed: pub(z.boolean()) }).strict(),
]);
export type SuccessionStep = z.infer<typeof SuccessionStep>;

/** Position definition extension fields (X8.1.1), content copied into the save. */
export const PositionDefinition = z.object({
  id: zContentRef(),
  appointer: pub(z.string().min(1)),
  reportsTo: zContentRef().nullable(),
  requiredForGame: pub(z.boolean()),
  successionRule: pub(z.array(SuccessionStep)),
  interimAllowed: pub(z.enum(['yes', 'no', 'acting_only'])),
  /** From S1.2.2 by league-rules key; null when the key sets no cap. */
  maxCountKey: pub(z.string()).nullable(),
}).strict().refine((p) => !p.requiredForGame || p.successionRule.length > 0, {
  message: 'a game-required position needs a succession rule (X8.1.1)',
});
export type PositionDefinition = z.infer<typeof PositionDefinition>;

/**
 * A roster slot (P3.2.4, C5, T5). `list` is a league-rules list key (active, practice squad, reserve
 * lists, redshirt, scout team), never an enum in code, so one shape serves both levels (W-13).
 */
export const RosterSlot = z.object({
  teamId: zId(),
  personId: zId(),
  list: pub(z.string().min(1)),
  jersey: pub(z.number().int().min(0).max(99), 'index').nullable(),
  gameDayStatus: pub(z.enum(['active', 'inactive', 'not_applicable'])),
  since: zWorldDate(),
}).strict();
export type RosterSlot = z.infer<typeof RosterSlot>;

/** A depth chart for one package or unit (P3.2.4, M2). */
export const DepthChartRecord = z.object({
  teamId: zId(),
  /** Package or unit content id (F1 personnel group, special teams unit). */
  unitId: zContentRef(),
  /** Role label to ordered person ids. */
  roles: pub(z.record(z.string(), z.array(z.number().int().positive())), 'id'),
  rotation: pub(z.array(z.object({
    role: pub(z.string().min(1)),
    personIds: zIdList(),
    /** Rotation rule key (M2), for example a snap share or a series rotation. */
    ruleKey: pub(z.string().min(1)),
    /** Planned share of snaps for a share rule, 0 to 1, else null. */
    share: pub(z.number().min(0).max(1), 'ratio').nullable(),
  }).strict())),
  updated: zWorldDate(),
}).strict();
export type DepthChartRecord = z.infer<typeof DepthChartRecord>;

/** What a person knows of one football element (P3.2.4 Knowledge, D9, G5). True value; staff see estimates. */
export const KnowledgeRow = z.object({
  personId: zId(),
  elementId: zContentRef(),
  value: truth(z.number().min(0).max(100), 'iss'),
  lastPractised: zWorldDate().nullable(),
}).strict();
export type KnowledgeRow = z.infer<typeof KnowledgeRow>;

/** An injury (P3.2.4, D11, H5, J10). Truth for the real course, estimate for what the medical staff says. */
export const InjuryRecord = z.object({
  id: zId(),
  personId: zId(),
  /** D11 catalogue row (content). */
  typeId: zContentRef(),
  bodyRegion: pub(z.string().min(1)),
  occurred: zWorldDate(),
  /** The play that caused it, when it came from play (J10). */
  play: pub(z.object({ gameId: zId(), playIndex: pub(z.number().int().positive(), 'index') }).strict()).nullable(),
  mechanism: pub(z.string()),
  severity: truth(z.string().min(1)),
  /** True days to each milestone (D11 recovery record), hidden. */
  trueDaysToMilestone: truth(z.record(z.string(), z.number().int().min(0)), 'count'),
  /** The medical staff's stated range in days (shown), low and high. */
  estimatedDays: est(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'count'),
  /** Report designation, a league-rules key (D11, H5). */
  designation: pub(z.string()).nullable(),
  lastingLoss: truth(z.record(z.string(), z.number()), 'iss'),
  status: pub(z.enum(['active', 'recovered', 'career_ending'])),
}).strict();
export type InjuryRecord = z.infer<typeof InjuryRecord>;

/** One team's dealings with one prospect (T4, M4). */
export const ProspectTeamState = z.object({
  teamId: zId(),
  /** The prospect's interest in this team (T4). Truth: teams read it through contacts and visits. */
  interest: zScale(0, 100, 'T4 interest'),
  offered: own(z.boolean()),
  visits: own(z.array(zWorldDate('own_team'))),
  /** Place on this team's board, 1 is top, or null when not on it. */
  boardPosition: own(z.number().int().positive(), 'index').nullable(),
}).strict();

/** A prospect (P3.2.4): a recruit (T4) or a draft prospect (M4). True attributes are on the person. */
export const ProspectRecord = z.object({
  personId: zId(),
  kind: pub(z.enum(['recruit', 'draft'])),
  classYear: zYear(),
  /** Public rating where the world publishes one (T4 `public_rating`); its scale is set by the content that issues it. */
  publicRating: pub(z.number(), 'index').nullable(),
  committedTeamId: zId().nullable(),
  teams: own(z.array(ProspectTeamState)),
}).strict();
export type ProspectRecord = z.infer<typeof ProspectRecord>;
