// World contract, part 4: the world root, competitions, teams, venues, seasons and culture
// (P3.2.1, C1, T2, T9, U4, X9.1.1, X13.1.1).
// Level rule (P3.1.2, P1.3.3): only a competition carries `level`. Everything else carries a
// competition id, and its level is derived from it. No condition in code may test a level word.
import { z } from 'zod';
import { pub, own, truth } from '../field.ts';
import { Calendar, ContentManifestEntry, Level } from '../entities.ts';
import { SaveSettings } from '../save.ts';
import { Roof } from '../sim/environment.ts';
import { WorldTier, zCount, zId, zIdList, zScale, zWorldDate, zYear } from './primitives.ts';

/**
 * The world root (P3.2.1 "World"). One row per save. The save header (P5.1.1, ../save.ts) repeats the
 * fields it needs to be read without opening the world; this row is the authority (W-03).
 */
export const WorldRecord = z.object({
  formatVersion: pub(z.number().int().positive(), 'version'),
  masterSeedHex: pub(z.string().regex(/^[0-9a-f]{16}$/)),
  generatorOptions: pub(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), 'ratio'),
  calendar: pub(Calendar),
  engineVersion: pub(z.string()),
  parameterSetVersion: pub(z.string()),
  contentManifest: pub(z.array(ContentManifestEntry)),
  settings: pub(SaveSettings),
  certified: pub(z.boolean()),
  userPersonId: zId().nullable(),
  /** Next id per world table (P3.1.2): ids are issued from these counters and never reused. */
  nextIds: own(z.record(z.string(), z.number().int().positive()), 'id'),
}).strict();
export type WorldRecord = z.infer<typeof WorldRecord>;

/** A conference or division inside a competition (C1, T2). `parentId` nests divisions in conferences. */
export const ConferenceRecord = z.object({
  id: zId(),
  competitionId: zId(),
  parentId: zId().nullable(),
  name: pub(z.string().min(1)),
  kind: pub(z.enum(['conference', 'division'])),
  teamIds: zIdList(),
}).strict();
export type ConferenceRecord = z.infer<typeof ConferenceRecord>;

/**
 * A competition (P3.2.1): one pro league or one college subdivision. The season and postseason formats
 * are content ids, so their numbers come from the league-rules file (C2, C3, T3), never from code.
 */
export const CompetitionRecord = z.object({
  id: zId(),
  name: pub(z.string().min(1)),
  level: pub(Level),
  ruleSetId: pub(z.string().min(1)),
  leagueRulesId: pub(z.string().min(1)),
  conferenceIds: zIdList(),
  teamIds: zIdList(),
  seasonFormat: pub(z.string().min(1)),
  postseasonFormat: pub(z.string().min(1)),
}).strict();
export type CompetitionRecord = z.infer<typeof CompetitionRecord>;

/** A venue (P3.2.1 team venue, J12). Feeds the sim Environment at game start. */
export const VenueRecord = z.object({
  id: zId(),
  name: pub(z.string().min(1)),
  place: pub(z.string()),
  /** Content id of the surface type (J12). */
  surfaceType: pub(z.string().min(1)),
  roof: pub(Roof),
  altitudeFt: pub(z.number(), 'ft'),
  capacity: zCount(),
  /** Crowd noise base 0 to 1 in the sim Environment's terms (J12). */
  noiseBase: pub(z.number().min(0).max(1), 'ratio'),
  /** Climate rows of the generated place (G-11 data), by content id. */
  climateId: pub(z.string()).nullable(),
}).strict();
export type VenueRecord = z.infer<typeof VenueRecord>;

/** Generated team identity: no real name, logo or uniform design, and no image field (A6.2.1, P3.2.1). */
export const TeamIdentity = z.object({
  name: pub(z.string().min(1)),
  nickname: pub(z.string()),
  place: pub(z.string()),
  abbreviation: pub(z.string().min(2).max(4)),
  /** Colours are data, never a mark (A6.2.1). */
  colours: pub(z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(3)),
}).strict();

/**
 * A team: a pro club or a college program (P3.2.1). Pro clubs have an owner; college programs have an
 * athletic director and a president (L5, T9). Who has final say is the power arrangement of L5.2.1,
 * stored as flags so the default for each kind of team comes from content (T9.1.1 college default).
 */
export const TeamRecord = z.object({
  id: zId(),
  competitionId: zId(),
  conferenceId: zId().nullable(),
  identity: pub(TeamIdentity),
  homeVenueId: zId(),
  ownerPersonId: zId().nullable(),
  athleticDirectorPersonId: zId().nullable(),
  presidentPersonId: zId().nullable(),
  /** L5.2.1 power arrangement: which job holds final say for each domain. Values are job ids or null (owner decides). */
  finalSay: own(z.object({
    roster: zId('own_team').nullable(),
    contracts: zId('own_team').nullable(),
    draft: zId('own_team').nullable(),
    staffHiring: zId('own_team').nullable(),
  }).strict()),
  /** Resource band (X9.1.1 `resources`, U4): staff size and budget band. Public as a band, not as money. */
  resourceBand: pub(z.enum(['low', 'middle', 'top'])),
  /** Facility kind to a content band id (C1, T9). Bands are content, not code. */
  facilities: pub(z.record(z.string(), z.string())),
  rivalTeamIds: zIdList(),
  prestige: truth(z.number(), 'ratio'),
}).strict();
export type TeamRecord = z.infer<typeof TeamRecord>;

/** One season of one competition (P3.2.1 "Season"). Standings are a cache over games and never a source (P3.1.1). */
export const SeasonRecord = z.object({
  competitionId: zId(),
  year: zYear(),
  gameIds: zIdList(),
  awardEventIds: zIdList(),
  archive: pub(z.enum(['live', 'archived', 'thinned'])),
}).strict();
export type SeasonRecord = z.infer<typeof SeasonRecord>;

/** Culture record per program or club (X9.1.1). Truth: people learn it from behaviour and labels. */
export const CultureRecord = z.object({
  teamId: zId(),
  /** Label id to weight -1 to +1. */
  labelPreferences: truth(z.record(z.string(), z.number().min(-1).max(1)), 'ratio'),
  /** Per L3 violation class, 0 to 100. */
  conductTolerance: truth(z.record(z.string(), z.number().int().min(0).max(100)), 'index'),
  /** Seasons of grace read by E4. */
  patienceSeasons: truth(z.number().int().min(0), 'count'),
  needWeightOverrides: truth(z.record(z.string(), z.number()), 'ratio'),
  /** X9.2.1 expectation for the season: target win band and postseason target (content id). */
  expectation: own(z.object({
    year: zYear('own_team'),
    winsLow: zCount('own_team'),
    winsHigh: zCount('own_team'),
    postseasonTarget: own(z.string()),
  }).strict()),
  traditionStrength: zScale(0, 100, 'X9.1.1 tradition_strength'),
}).strict();
export type CultureRecord = z.infer<typeof CultureRecord>;

/** Fidelity tier membership (X13.1.1). Internal: never shown. */
export const TierRow = z.object({
  subjectKind: truth(z.enum(['person', 'team', 'game'])),
  subjectId: zId('truth'),
  tier: truth(WorldTier),
  since: zWorldDate('truth'),
}).strict();
export type TierRow = z.infer<typeof TierRow>;
