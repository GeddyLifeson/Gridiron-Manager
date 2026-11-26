// World contract, part 1: ids, dates, money and scale helpers (P3.1.2).
// This folder (`schema/src/world`) is the shared contract for everything outside the engine
// (plans/game-build-plan.md, G-00). Like `src/sim`, it is integrator-owned after merge: a game package
// that needs a change asks the integrator (engine-build-plan.md section 6) and never edits it.
// Decisions that settle shapes the bible leaves open are listed in ./DECISIONS.md (W-01 to W-30).
import { z } from 'zod';
import { field, type Visibility } from '../field.ts';
import { Calendar } from '../entities.ts';

/**
 * World ids are positive integers issued by a per-save counter per table and never reused (P3.1.2).
 * A person who plays has `PlayerId === PersonId` (W-02): the sim contract's PlayerId is the person id.
 */
export type PersonId = number;
export type CompetitionId = number;
export type ConferenceId = number;
export type VenueId = number;
export type JobId = number;
export type ContractId = number;
export type EventId = number;
export type InjuryId = number;
export type OpeningId = number;
export type InboxItemId = number;
export type HouseholdId = number;

/** A world id field. Class defaults to public: ids say who, never how good. */
export const zId = (vis: Visibility = 'public') => field(z.number().int().positive(), { vis, unit: 'id' });
export const zIdList = (vis: Visibility = 'public') => field(z.array(z.number().int().positive()), { vis, unit: 'id' });

/** A world date: season year and day index of the C4 calendar, never wall-clock time (P3.1.2). */
export const zWorldDate = (vis: Visibility = 'public') => field(Calendar, { vis });
export type WorldDate = z.infer<typeof Calendar>;

/** A league year (C4.1.1) or season year. Plain integer year, unit `season_year`. */
export const zYear = (vis: Visibility = 'public') => field(z.number().int(), { vis, unit: 'season_year' });

/** Money is integer cents of a generic currency unit (P3.1.2). Negative allowed only where a field says so. */
export const zCents = (vis: Visibility = 'public') => field(z.number().int().min(0), { vis, unit: 'cents' });
export const zSignedCents = (vis: Visibility = 'public') => field(z.number().int(), { vis, unit: 'cents' });

/** A count (seasons, games, snaps). */
export const zCount = (vis: Visibility = 'public') => field(z.number().int().min(0), { vis, unit: 'count' });

/**
 * A bounded design scale from the bible (X1 facets 0 to 100, X5 stress 0 to 1000, X7 edge strength
 * 0 to 100, ...). The unit field holds `index` until the integrator adds a `scale` unit (CR-G00-1);
 * the `scale` meta key names the leaf and bounds so the lints and readers can tell scales apart (W-05).
 */
export function zScale(min: number, max: number, leaf: string, vis: Visibility = 'truth') {
  return field(z.number().int().min(min).max(max), { vis, unit: 'index', scale: `${leaf} ${min}..${max}` });
}

/** Content ids are strings namespaced by pack: `core:cover3_sky`, `user:my_mesh` (P3.1.2). */
export const zContentRef = (vis: Visibility = 'public') => field(z.string().regex(/^[a-z0-9_-]+:[A-Za-z0-9_.\-/]+$/), { vis });

/** A text key resolved by the template engine on the interface side (P1.3.2, P4.6.1). */
export const zTextKey = (vis: Visibility = 'public') => field(z.string().min(1), { vis });

/** Template parameters: plain scalars only, so read models stay copyable data (P1.3.2). */
export const zTemplateParams = (vis: Visibility = 'public') =>
  field(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), { vis, unit: 'ratio' });

/** Origin of a person (P3.2.2, D1.1.1). `designed` is a player made in the player designer (D13.1). Set once. */
export const PersonOrigin = z.enum(['generated', 'designed', 'imported', 'user']);
export type PersonOrigin = z.infer<typeof PersonOrigin>;

/** Who wrote a row (X2.1.1 `source`). */
export const RowSource = z.enum(['sim', 'history_run', 'import', 'user']);

/** Fidelity tier of a person, team or game (X13.1.1). Not the per-play fidelity of P6.4.1 (W-24). */
export const WorldTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type WorldTier = z.infer<typeof WorldTier>;

export const Side3 = z.enum(['offense', 'defense', 'special_teams']);
export const JobSide = z.enum(['offense', 'defense', 'special_teams', 'whole_team', 'support']);
export const PositionGroup = z.enum(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'specialists', 'none']);

