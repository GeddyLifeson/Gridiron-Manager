// World entities (P3.2). Phase 0 holds the shapes the empty world needs; later phases add components.
// Rulings carried here: no coach points, experience, skill trees, perks or difficulty in any entity
// (A3.1.1 rows 8 to 10, A3.1.2); the user's coach has no ability fields (E9.1.2); people are described
// by demonstrated behaviour (history facts, records), never by picked traits.
import { z } from 'zod';
import { pub, own, truth } from './field.ts';

export const Level = z.enum(['college', 'pro']);
export type Level = z.infer<typeof Level>;

export const Calendar = z.object({
  seasonYear: pub(z.number().int(), 'season_year'),
  dayIndex: pub(z.number().int().min(0), 'day_index'),
});
export type Calendar = z.infer<typeof Calendar>;

export const Competition = z.object({
  id: pub(z.number().int().positive(), 'id'),
  name: pub(z.string()),
  level: pub(Level),
  ruleSetId: pub(z.string()),
  leagueRulesId: pub(z.string()),
  teamIds: pub(z.array(z.number().int().positive()), 'id'),
});
export type Competition = z.infer<typeof Competition>;

export const Team = z.object({
  id: pub(z.number().int().positive(), 'id'),
  competitionId: pub(z.number().int().positive(), 'id'),
  name: pub(z.string()),
  place: pub(z.string()),
  /** Colours are data, never a mark (A6.2.1). There is no image field. */
  colours: pub(z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(3)),
  prestige: truth(z.number(), 'ratio'),
});
export type Team = z.infer<typeof Team>;

export const Origin = z.enum(['generated', 'imported', 'user']);

/** Demonstrated record: dated facts only (E9.1.2). Allowed values are ids, counts, dates and text keys. */
export const HistoryFact = z.object({
  seasonYear: pub(z.number().int(), 'season_year'),
  dayIndex: pub(z.number().int().min(0), 'day_index'),
  kind: pub(z.string()),
  refIds: pub(z.array(z.number().int()), 'id'),
});

export const CoachingComponent = z.object({
  /** Seasons worked per system family: a count, not a rating. */
  systemFamilies: pub(z.record(z.string(), z.number().int().min(0)), 'count'),
  /** Event ids grouped by evidence family. */
  demonstratedRecord: own(z.record(z.string(), z.array(z.number().int())), 'id'),
  historyFacts: pub(z.array(HistoryFact)),
  /** K2 behaviour block. AI coaches only; refused on origin user. */
  hidden: truth(z.record(z.string(), z.number()), 'ratio').optional(),
}).strict();

export const Person = z.object({
  id: pub(z.number().int().positive(), 'id'),
  origin: pub(Origin),
  externalRef: pub(z.object({ source: pub(z.string()), key: pub(z.string()) })).optional(),
  name: pub(z.object({ first: pub(z.string()), last: pub(z.string()) })),
  birthDate: pub(z.object({ year: pub(z.number().int(), 'season_year'), dayIndex: pub(z.number().int().min(0), 'day_index') })),
  appearanceSeed: pub(z.number().int().min(0), 'id'),
  roles: pub(z.array(z.enum(['player', 'coach', 'staff', 'scout', 'official', 'owner', 'administrator', 'media', 'family']))),
  coaching: pub(CoachingComponent).optional(),
}).strict().superRefine((p, ctx) => {
  if (p.origin === 'user' && p.coaching?.hidden) {
    ctx.addIssue({ code: 'custom', message: 'origin user may not carry coaching.hidden (E9.5.2, P3.2.2)', path: ['coaching', 'hidden'] });
  }
});
export type Person = z.infer<typeof Person>;

export const ContentManifestEntry = z.object({
  packId: pub(z.string()),
  version: pub(z.string()),
  hash: pub(z.string()),
});

/** World state root (P3.2.1). Everything a world holds lives under this object or its tables. */
export const WorldState = z.object({
  formatVersion: pub(z.number().int().positive(), 'version'),
  masterSeedHex: pub(z.string().regex(/^[0-9a-f]{16}$/)),
  calendar: pub(Calendar),
  competitions: pub(z.array(Competition)),
  teams: pub(z.array(Team)),
  people: pub(z.array(Person)),
  nextIds: own(z.object({
    competition: own(z.number().int().positive(), 'id'),
    team: own(z.number().int().positive(), 'id'),
    person: own(z.number().int().positive(), 'id'),
  })),
  userPersonId: pub(z.number().int().positive(), 'id').nullable(),
});
export type WorldState = z.infer<typeof WorldState>;
