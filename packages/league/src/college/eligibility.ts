// The eligibility clock (T5.2.1), the player's say at the redshirt line (T5.2.2), and two-year college
// seasons (T6.3.2 rule 1). Two models: seasons (four seasons in five years, the redshirt line) and age
// (five years from the clock start, no season count). From the transition season, players enrolled
// before the age model's first entry year are judged by both and keep the better (T5.2.1 correction
// 2026-11-26). Declaring for the draft ends eligibility (T8.5.1 rule 5).
import { civil, dayNumber } from '../calendar/date.ts';
import type { CollegeRules } from './keys.ts';
import { clamp01, param } from './params.ts';
import { mayCarryPersonalEvent, type Day } from './types.ts';
import { possible, type PersonOrigin } from '@gm/schema';

/** One season on a player's college record. `season` is the fall year it was played. */
export interface SeasonPlayed {
  readonly season: number;
  readonly regularGames: number;
  readonly postseasonGames: number;
  /** Played at a two-year college (T6.3.2). */
  readonly juco: boolean;
}

export interface EligibilityRecord {
  readonly personId: number;
  readonly birthDay: Day;
  /** Fall year of the first term of full-time enrollment at any college, or null if not yet enrolled. */
  readonly firstEnrollYear: number | null;
  /** Fall year he first competed for a college team, which also starts the age clock. */
  readonly firstCompetedYear: number | null;
  readonly seasons: readonly SeasonPlayed[];
  /** Declared for the draft (T8.5.1). */
  readonly declared: boolean;
  /** An undrafted early entrant whom the rule set lets back (T8.5.1 rule 5). */
  readonly returnedUndrafted?: boolean;
}

export type ModelName = 'seasons' | 'age';

export interface ModelResult {
  readonly model: ModelName;
  readonly eligible: boolean;
  /** Last fall in which he could still play under this model, if every remaining season is used. */
  readonly lastSeason: number;
  /** Seasons model: seasons used before `season`. Age model: years elapsed on the clock. */
  readonly used: number;
}

export interface EligibilityStatus {
  readonly season: number;
  readonly eligible: boolean;
  /** The model that governs him this season (the better one under the transition). */
  readonly governing: ModelName;
  readonly lastSeason: number;
  /** Seasons he may still play including `season` (0 when ineligible). */
  readonly seasonsLeft: number;
  readonly reason: 'eligible' | 'declared' | 'seasons_used' | 'clock_expired' | 'not_enrolled';
  readonly results: readonly ModelResult[];
}

/** Whether a season counts as one of the four under the seasons model (the redshirt line). */
export function seasonUsed(s: SeasonPlayed, rules: CollegeRules): boolean {
  const e = rules.eligibility;
  if (s.juco && !e.jucoSeasonsCount) return false;
  const games = s.regularGames + (e.postseasonCounts ? s.postseasonGames : 0);
  return games > e.redshirtMaxGames;
}

/**
 * Fall year the age clock starts from age alone: the academic year after the trigger birthday, where
 * a birthday before the cut-off date counts for that year's fall and one on or after it for the next.
 */
export function ageClockYear(birthDay: Day, rules: CollegeRules): number {
  const e = rules.eligibility;
  const b = civil(birthDay);
  const year = b.y + e.ageTrigger;
  const birthday = safeDay(year, b.m, b.d);
  const cutoff = dayNumber({ y: year, m: e.cutoffMonth, d: e.cutoffDay });
  return birthday < cutoff ? year : year + 1;
}

/** A leap-day birthday falls on the last day of February in a common year. */
function safeDay(y: number, m: number, d: number): number {
  try { return dayNumber({ y, m, d }); } catch { return dayNumber({ y, m, d: d - 1 }); }
}

/** Fall year the age clock started: the earliest of full-time enrollment, first competition and age. */
export function ageClockStart(rec: EligibilityRecord, rules: CollegeRules): number {
  const parts = [ageClockYear(rec.birthDay, rules)];
  if (rec.firstEnrollYear !== null) parts.push(rec.firstEnrollYear);
  if (rec.firstCompetedYear !== null) parts.push(rec.firstCompetedYear);
  return Math.min(...parts);
}

export function seasonsModel(rec: EligibilityRecord, season: number, rules: CollegeRules): ModelResult {
  const e = rules.eligibility;
  const start = rec.firstEnrollYear ?? season;
  const clockEnd = start + e.seasonsClockYears - 1;
  const used = rec.seasons.filter((s) => s.season < season && seasonUsed(s, rules)).length;
  const left = e.seasonsOfCompetition - used;
  const lastSeason = Math.min(clockEnd, season + left - 1);
  return { model: 'seasons', eligible: left > 0 && season <= clockEnd && season >= start, lastSeason, used };
}

export function ageModel(rec: EligibilityRecord, season: number, rules: CollegeRules): ModelResult {
  const e = rules.eligibility;
  const start = ageClockStart(rec, rules);
  const lastSeason = start + e.ageWindowYears - 1;
  return { model: 'age', eligible: season <= lastSeason, lastSeason, used: Math.max(0, season - start) };
}

/** Which models judge this player in this rule set. */
export function modelsFor(rec: EligibilityRecord, season: number, rules: CollegeRules): readonly ModelName[] {
  const e = rules.eligibility;
  if (e.model === 'seasons') return ['seasons'];
  const entry = rec.firstEnrollYear ?? season;
  if (entry >= e.ageModelFirstEntryYear) return ['age'];
  if (season < e.transitionFirstSeason) return ['seasons'];
  // Players who used their final season before the transition get nothing more (T5.2.1).
  const atTransition = seasonsModel(rec, e.transitionFirstSeason, rules);
  const exhaustedBefore = !atTransition.eligible && atTransition.lastSeason < e.transitionFirstSeason;
  return exhaustedBefore ? ['seasons'] : ['seasons', 'age'];
}

/** The player's eligibility for one season (T5.2.1). */
export function eligibilityStatus(rec: EligibilityRecord, season: number, rules: CollegeRules): EligibilityStatus {
  const names = modelsFor(rec, season, rules);
  const results = names.map((n) => (n === 'seasons' ? seasonsModel(rec, season, rules) : ageModel(rec, season, rules)));
  // Better of both: an eligible result beats an ineligible one, then the later last season; a tie goes
  // to the age model, which has no redshirt line to watch.
  const best = [...results].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.lastSeason - a.lastSeason || (a.model === 'age' ? -1 : 1))[0]!;
  const blocked = rec.declared && !rec.returnedUndrafted;
  const eligible = best.eligible && !blocked;
  const reason: EligibilityStatus['reason'] = blocked ? 'declared'
    : eligible ? 'eligible'
    : rec.firstEnrollYear === null && rec.firstCompetedYear === null ? 'not_enrolled'
    : best.model === 'seasons' && best.used >= rules.eligibility.seasonsOfCompetition ? 'seasons_used' : 'clock_expired';
  return {
    season, eligible, governing: best.model, lastSeason: best.lastSeason,
    seasonsLeft: eligible ? best.lastSeason - season + 1 : 0, reason, results,
  };
}

export interface RedshirtWatch {
  /** Shown only for players the seasons model governs (T5.2.1 transition: the redshirt watch shows only for them). */
  readonly applies: boolean;
  readonly gamesPlayed: number;
  /** Regular-season games he can still play this season without using it. */
  readonly gamesBeforeUse: number;
  /** The warning before a game that would burn the redshirt. */
  readonly nextGameUsesSeason: boolean;
}

/** The redshirt watch on the player card for the current season (T5.2.1 "What the user sees"). */
export function redshirtWatch(rec: EligibilityRecord, season: number, regularGamesSoFar: number, rules: CollegeRules): RedshirtWatch {
  const st = eligibilityStatus(rec, season, rules);
  const max = rules.eligibility.redshirtMaxGames;
  const applies = st.eligible && st.governing === 'seasons' && regularGamesSoFar <= max;
  return { applies, gamesPlayed: regularGamesSoFar, gamesBeforeUse: Math.max(0, max - regularGamesSoFar), nextGameUsesSeason: applies && regularGamesSoFar === max };
}

export interface SatOutInput {
  readonly origin: PersonOrigin;
  readonly governing: ModelName;
  readonly regularGamesSoFar: number;
  /** D12 satisfaction, 0 to 1. */
  readonly satisfaction: number;
  /** A market elsewhere (T5.2.2 rule 2). */
  readonly hasMarket: boolean;
  /** Unpaid or broken promises (T4.4.1, T7.3.2). */
  readonly brokenPromises: number;
  /** X1 loyalty, 0 to 1. */
  readonly loyalty: number;
  /** L1 tie to the position coach, 0 to 1. */
  readonly positionCoachTie: number;
}

/**
 * T5.2.2: the hidden chance this week that a player decides he will not play past the redshirt line.
 * A player who draws it plays to the line and stops there, so he finishes the season at exactly the
 * line (acceptance: some stop at exactly four games).
 * Zero under the age model, before the game named in params, past the line, and for imported people.
 */
export function satOutChance(i: SatOutInput, rules: CollegeRules): number {
  if (!mayCarryPersonalEvent(i.origin) || i.governing !== 'seasons' || !i.hasMarket) return 0;
  if (i.regularGamesSoFar < param('satOutFromGame') - 1 || i.regularGamesSoFar > rules.eligibility.redshirtMaxGames) return 0;
  // A3.1 ruling 22: a satisfied player may still sit out, with the floor chance. The structural zeros
  // above stay: under them sitting out saves no season, and imported people are protected (A6).
  if (i.satisfaction >= param('satOutSatisfactionBelow')) return possible(0);
  return possible(param('satOutBase') + param('satOutBrokenPromise') * i.brokenPromises - param('satOutLoyalty') * i.loyalty - param('satOutCoachTie') * i.positionCoachTie);
}

/** Records a finished season on the record (pure). */
export function withSeason(rec: EligibilityRecord, s: SeasonPlayed): EligibilityRecord {
  return { ...rec, seasons: [...rec.seasons.filter((x) => x.season !== s.season), s], firstCompetedYear: rec.firstCompetedYear ?? (s.regularGames + s.postseasonGames > 0 ? s.season : null) };
}
