// World contract, part 3: the person record and what others believe about a person (P3.2.2, P3.2.3,
// D1.1, E1.1.1). One record for every human: players, coaches, staff, scouts, officials, owners,
// administrators, agents, media, family, and the user. A job change is a new job row, never a new person.
//
// Rulings carried here (project memory, A3.1.1 rows 8 to 10, E9.1.2):
// - No coach points, experience points, skill trees, perks, picked traits or difficulty anywhere.
// - The user's coach holds no ability value of any kind. `coaching` outside `hidden` holds only ids,
//   dates, counts, text and references; `hidden` (the K2 behaviour block) is refused on origin user.
// - People are described by demonstrated behaviour: labels are computed from the X2 log when shown
//   (N2.8) and are never stored on the person.
import { z } from 'zod';
import { pub, own, est, truth } from '../field.ts';
import { HistoryFact } from '../entities.ts';
import { TrueTests } from '../sim/player.ts';
import {
  PersonOrigin, PositionGroup, Side3, zContentRef, zCount, zId, zIdList, zWorldDate, zYear, zTextKey,
} from './primitives.ts';
import { TraitBlock } from './traits.ts';

/** Roles a person may hold now (P3.2.2 plus `agent` from D1.1.1). A person may hold several. */
export const PersonRole = z.enum(['player', 'coach', 'staff', 'scout', 'official', 'owner', 'administrator', 'agent', 'media', 'family']);
export type PersonRole = z.infer<typeof PersonRole>;

/** Eligibility and service counters (D1.1.2). Rules that advance them live in T and C5, read by key. Counters never decrease. */
export const EligibilityCounters = z.object({
  college: pub(z.object({
    seasonsOfCompetitionUsed: zCount(),
    /** Season year the eligibility clock started, or null before enrolment (T5). */
    clockStartYear: zYear().nullable(),
    redshirtUsed: pub(z.boolean()),
  }).strict()),
  pro: pub(z.object({
    seasonsOnRoster: zCount(),
    accruedSeasons: zCount(),
    creditedSeasons: zCount(),
  }).strict()),
}).strict();
export type EligibilityCounters = z.infer<typeof EligibilityCounters>;

/** Playing component (P3.2.2 `playing`, D1 to D11). True values are class truth. */
export const PlayingBlock = z.object({
  /** Position code from the F1 position list (content). */
  position: pub(z.string().min(1)),
  /** Jersey per team is a roster-slot field (W-09); this is the number last worn, for history pages. */
  lastJersey: pub(z.number().int().min(0).max(99), 'index').nullable(),
  heightIn: pub(z.number().positive(), 'in'),
  weightLb: pub(z.number().positive(), 'lb'),
  /** True attribute values on the internal skill scale, keyed by the sim contract's ATTRIBUTE_IDS (D-08). */
  attributes: truth(z.record(z.string(), z.number().min(0).max(100)), 'iss'),
  /** True drill results on a good day (D2.1.1), the same shape the engine reads. */
  tests: truth(TrueTests),
  /** Ceilings per attribute (D7). */
  ceilings: truth(z.record(z.string(), z.number().min(0).max(100)), 'iss'),
  /** Development and aging parameters by D7/D8 parameter name (W-10). */
  hidden: truth(z.record(z.string(), z.number()), 'ratio'),
  conditioning: truth(z.number().min(0).max(100), 'iss'),
  /** Long-term load carried between games (D10.1.1). */
  freshnessLongTerm: truth(z.number().min(0).max(1), 'ratio'),
  eligibility: pub(EligibilityCounters),
}).strict();
export type PlayingBlock = z.infer<typeof PlayingBlock>;

/**
 * Coaching component (P3.2.2 `coaching`, E1.1.1 football identity, E9.1.2). Named `CoachingBlock` so it
 * does not clash with the phase 0 `CoachingComponent` of ../entities.ts, which it supersedes (W-07).
 */
export const CoachingBlock = z.object({
  side: pub(Side3).nullable(),
  positionGroupTaught: pub(PositionGroup),
  offensiveFamily: zContentRef().nullable(),
  defensiveFamily: zContentRef().nullable(),
  /** Seasons worked per system family: a history count, not a rating (E9.1.2). */
  systemFamilies: pub(z.record(z.string(), z.number().int().min(0)), 'count'),
  /** E10 philosophy row, or null before one is written. */
  philosophyId: zId().nullable(),
  /** X2 event ids grouped by evidence family. */
  demonstratedRecord: own(z.record(z.string(), z.array(z.number().int().positive())), 'id'),
  historyFacts: pub(z.array(HistoryFact)),
  /** K2 behaviour block. AI coaches only; refused on origin user (E9.5.2). */
  hidden: truth(z.record(z.string(), z.number()), 'ratio').optional(),
}).strict();
export type CoachingBlock = z.infer<typeof CoachingBlock>;

/** Scouting component (P3.2.2 `scouting`, M4). Hidden parameters exist only for AI people (A3.1.2). */
export const ScoutingBlock = z.object({
  /** Evaluation noise parameters by position group (M4). AI only. */
  evaluationSkill: truth(z.record(z.string(), z.number()), 'ratio').optional(),
  /** Systematic leanings by attribute or trait-label key (M4). AI only. */
  biases: truth(z.record(z.string(), z.number()), 'ratio').optional(),
}).strict();

/** Life component (P3.2.2 `life`): references only. Money, family and health rows live in their tables (W-11). */
export const LifeBlock = z.object({
  householdId: zId('own_team').nullable(),
  /** Home region for E1 identity and the X1 `family_and_home` value; generated place name, never a real address. */
  homeRegion: pub(z.string()),
}).strict();

/** History component (P3.2.2 `history`): plain facts; job and team history are rows in `jobHistory` (W-11). */
export const HistoryBlock = z.object({
  /** X2 event ids of honours (awards, records, championships). */
  honourEventIds: zIdList(),
  /** Real statistics of an imported person, kept apart from statistics earned in the world (P3.1.1). */
  importedStats: pub(z.record(z.string(), z.number()), 'count').optional(),
}).strict();

export const PersonName = z.object({
  first: pub(z.string().min(1)),
  last: pub(z.string().min(1)),
  suffix: pub(z.string()).nullable(),
  nickname: pub(z.string()).nullable(),
}).strict();

/** Generated-person provenance (D1.1.1): generator version and seed. Seeds are truth (W-12). */
export const Provenance = z.object({
  generatorVersion: truth(z.string()),
  seedHex: truth(z.string().regex(/^[0-9a-f]{16}$/)),
}).strict();

/** The person record (P3.2.2). Components are present when they apply. */
export const PersonRecord = z.object({
  id: zId(),
  origin: pub(PersonOrigin),
  /** Imported people keep their source key beside the world id (P3.1.2). */
  externalRef: pub(z.object({ source: pub(z.string()), key: pub(z.string()) }).strict()).nullable(),
  provenance: truth(Provenance).nullable(),
  name: pub(PersonName),
  /** Calendar date of birth (P3.1.2). Age for football is age on September 1 of the season (D1.1.1), computed. */
  birthDate: zWorldDate(),
  hometown: pub(z.string()).nullable(),
  /** Drives a generated marker portrait. There is no photograph field (P3.2.2, P7.3.2). */
  appearanceSeed: pub(z.number().int().min(0), 'id'),
  roles: pub(z.array(PersonRole)),
  /** The agent who represents this person, a person with role agent (L7, E1.1.1). */
  agentId: zId().nullable(),
  /** Death: year only, never a cause (project memory, ruling of 2026-11-25 23:06 UTC). */
  diedYear: zYear().nullable(),
  playing: pub(PlayingBlock).optional(),
  coaching: pub(CoachingBlock).optional(),
  scouting: truth(ScoutingBlock).optional(),
  life: pub(LifeBlock).optional(),
  history: pub(HistoryBlock),
  traitBlock: truth(TraitBlock),
}).strict().superRefine((p, ctx) => {
  for (const problem of personProblems(p)) ctx.addIssue({ code: 'custom', message: problem.message, path: problem.path });
});
export type PersonRecord = z.infer<typeof PersonRecord>;

/** Structural promises of P3.2.2 that zod shapes alone cannot state. Empty when valid. */
export function personProblems(p: {
  origin: PersonOrigin; coaching?: { hidden?: unknown }; scouting?: { evaluationSkill?: unknown; biases?: unknown };
  traitBlock: { source: string }; history: { importedStats?: unknown }; externalRef: unknown; provenance: unknown;
}): { message: string; path: (string | number)[] }[] {
  const out: { message: string; path: (string | number)[] }[] = [];
  if (p.origin === 'user') {
    if (p.coaching?.hidden) out.push({ message: 'origin user may not carry coaching.hidden (E9.5.2, P3.2.2)', path: ['coaching', 'hidden'] });
    if (p.scouting?.evaluationSkill || p.scouting?.biases) out.push({ message: 'origin user may not carry scouting parameters (A3.1.2)', path: ['scouting'] });
    if (p.traitBlock.source !== 'user') out.push({ message: 'origin user needs traitBlock.source user (X1.1.1)', path: ['traitBlock', 'source'] });
  } else if (p.traitBlock.source === 'user') {
    out.push({ message: 'traitBlock.source user is only for origin user (X1.1.1)', path: ['traitBlock', 'source'] });
  }
  if (p.origin === 'imported') {
    if (p.traitBlock.source !== 'imported_neutral') out.push({ message: 'imported people get neutral trait values (X14.1.1)', path: ['traitBlock', 'source'] });
    if (!p.externalRef) out.push({ message: 'imported people keep their source key (P3.1.2)', path: ['externalRef'] });
  } else if (p.history.importedStats) {
    out.push({ message: 'only imported people carry importedStats (P3.1.1)', path: ['history', 'importedStats'] });
  }
  if (p.origin === 'generated' && !p.provenance) out.push({ message: 'generated people record generator version and seed (D1.1.1)', path: ['provenance'] });
  return out;
}

/** One attribute as one organisation believes it (P3.2.3). */
export const AttributeBelief = z.object({
  estimate: est(z.number().min(0).max(100), 'iss'),
  confidence: est(z.number().min(0).max(1), 'ratio'),
  evidenceCount: est(z.number().int().min(0), 'count'),
  lastUpdated: est(zWorldDate('observer_estimate')),
}).strict();

/**
 * PersonView (P3.2.3): what one organisation, or one person after a job change (S6), believes about one
 * person. Exactly one of `observerTeamId` and `observerPersonId` is set. Holds no truth-class field.
 */
export const PersonView = z.object({
  observerTeamId: zId('own_team').nullable(),
  observerPersonId: zId('own_team').nullable(),
  personId: zId(),
  perAttribute: est(z.record(z.string(), AttributeBelief)),
  /** Results measured at a public event (combine, pro day) are public (P3.2.3 edge case). */
  publicMeasurements: pub(z.record(z.string(), z.number()), 'ratio'),
  notes: own(z.array(z.object({ date: zWorldDate('own_team'), staffId: zId('own_team'), textKey: zTextKey('own_team') }).strict())),
  sourceStaffIds: zIdList('own_team'),
}).strict().refine((v) => (v.observerTeamId === null) !== (v.observerPersonId === null), {
  message: 'exactly one observer: a team or a person (P3.2.3)',
});
export type PersonView = z.infer<typeof PersonView>;
