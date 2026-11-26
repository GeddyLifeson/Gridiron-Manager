// Rule keys of the roster module (G-15; C5, T5.1, H6.1, H6.2). Every limit is read here by key and
// nowhere else. The league rules files and their fact rows belong to G-10; keys marked NEW in the
// comment below are requested from G-10 and the integrator (see the PR body), with the bible leaf that
// states each value.
//
// One engine serves both levels (C5 header, W-13): a feature is on when its keys are in the level's
// file (no practice squad keys, no practice squad), never by testing the level.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['league.roster'];

const k = (key: string, type: 'number' | 'boolean' | 'option', unit: string | undefined, meaning: string, ownerLeaf: string, options?: string[]) =>
  ({ key, type, ...(unit ? { unit } : {}), ...(options ? { options } : {}), meaning, ownerLeaf, readBy: READ_BY });

export const RULE_KEYS: RuleKeyManifest = [
  // Lists and limits (C5.1.1, T5.1.1).
  k('roster.offseason_limit', 'number', 'count', 'Offseason and camp roster limit (NEW: C5.1.1 table, 90, 2 of 3).', 'C5.1.1'),
  k('roster.active_inactive_limit', 'number', 'count', 'Active/Inactive List limit from the roster deadline through the last game.', 'C5.1.1'),
  k('league.roster_limit', 'number', 'count', 'Roster limit at the declaration date where the level counts one roster (T5.1.1).', 'T5.1.1'),
  k('league.preseason_roster_limit', 'number', 'count', 'Preseason camp limit before the declaration date (NEW: T5.1.1, 110, 1 of 3).', 'T5.1.1'),
  k('aid.cancel_for_athletic_reasons', 'boolean', undefined, 'Whether a cut player loses his aid (NEW: T5.1.2 rule 2, starting value false).', 'T5.1.2'),
  k('roster.medical_retirement_leaves_count', 'boolean', undefined, 'Whether a medically retired player leaves the roster count (NEW: T5.1.2 rule 5, data switch, starting true).', 'T5.1.2'),
  // Game day (C5.2.1, C5.2.2, H6.2).
  k('roster.active_limit', 'number', 'count', 'Game-day Active List limit.', 'C5.2.1'),
  k('roster.active_limit_short_line', 'number', 'count', 'Active List limit with fewer than the required linemen.', 'C5.2.1'),
  k('roster.active_min_linemen', 'number', 'count', 'Offensive linemen required for the full Active List.', 'C5.2.1'),
  k('roster.active_floor', 'number', 'count', 'Smallest legal Active List.', 'C5.1.1'),
  k('roster.inactives_due_minutes_before_kickoff', 'number', 'min', 'Inactive list locks this long before kickoff (NEW: C5.2.1 rule 3, 90, 2 of 3).', 'C5.2.1'),
  k('roster.emergency_qb_active_qbs', 'number', 'count', 'Quarterbacks the club must have on the active list to name an emergency third quarterback (NEW: C5.2.2 rule 2, 2, Verified).', 'C5.2.2'),
  k('roster.emergency_qb_from_practice_squad', 'boolean', undefined, 'A practice squad quarterback may be elevated as the emergency third quarterback (NEW: C5.2.2 rule 1, default true).', 'C5.2.2'),
  // Practice squad (C5.3).
  k('roster.practice_squad_size', 'number', 'count', 'Practice squad places, not counting the international slot.', 'C5.3.1'),
  k('roster.practice_squad_international_slot', 'number', 'count', 'International pathway practice squad places.', 'C5.3.1'),
  k('roster.practice_squad_young_min', 'number', 'count', 'Places that must go to players with at most two accrued seasons.', 'C5.3.1'),
  k('roster.practice_squad_veteran_slots', 'number', 'count', 'Practice squad places open to any veteran.', 'C5.3.1'),
  k('roster.practice_squad_group_a_max_accrued', 'number', 'seasons', 'Group A: at most this many accrued seasons (NEW: C5.3.1, 1).', 'C5.3.1'),
  k('roster.practice_squad_group_a_active_games_below', 'number', 'games', 'Group A with one accrued season: fewer than this many games on an active list in it (NEW: C5.3.1, 9).', 'C5.3.1'),
  k('roster.practice_squad_group_b_max_accrued', 'number', 'seasons', 'Group B: at most this many accrued seasons (NEW: C5.3.1, 2).', 'C5.3.1'),
  k('roster.elevations_max_per_game', 'number', 'count', 'Practice squad elevations per club per game.', 'C5.3.2'),
  k('roster.elevations_max_per_player_season', 'number', 'count', 'Elevations per player per regular season.', 'C5.3.2'),
  k('roster.elevations_postseason_unlimited', 'boolean', undefined, 'No per-player elevation limit in the postseason (NEW: C5.3.2 edge case, Verified, true).', 'C5.3.2'),
  k('roster.practice_squad_protections_per_week', 'number', 'count', 'Practice squad players a club may protect per week (NEW: C5.3.3 rule 2, 4, 2 of 3).', 'C5.3.3'),
  k('roster.practice_squad_poach_pay_weeks', 'number', 'weeks', 'Weeks of pay owed to a player signed off another practice squad (NEW: C5.3.3 rule 3, 3, 1 of 3).', 'C5.3.3'),
  k('roster.practice_squad_next_opponent_days', 'number', 'days', 'From this many days before the game a practice squad player may not sign with his club\'s next opponent (NEW: C5.3.3 rule 4, 6, 1 of 3).', 'C5.3.3'),
  // Reserve lists (C5.4).
  k('roster.ir_min_games', 'number', 'games', 'Least games missed on injured reserve.', 'C5.4.1'),
  k('roster.ir_return_designations', 'number', 'count', 'IR return designations per club in the regular season.', 'C5.4.2'),
  k('roster.ir_return_designations_postseason', 'number', 'count', 'Extra IR return designations in the postseason.', 'C5.4.2'),
  k('roster.ir_returns_per_player', 'number', 'count', 'Times one player may return from IR in a season.', 'C5.4.2'),
  k('roster.ir_practice_window_days', 'number', 'days', 'IR practice window length.', 'C5.4.2'),
  k('roster.ir_cutdown_return_designations', 'number', 'count', 'Players placed on IR at the cutdown already designated to return (NEW: C5.4.2 rule 4, 2, Verified).', 'C5.4.2'),
  k('roster.pup_min_games', 'number', 'games', 'Games missed on reserve/PUP.', 'C5.4.3'),
  k('roster.pup_practice_window_after_game', 'number', 'games', 'Club games after which a reserve/PUP practice window may open (NEW: C5.4.3 rule 2, 2 in 2026, Verified).', 'C5.4.3'),
  k('roster.nfi_min_games', 'number', 'games', 'Games missed on reserve/NFI.', 'C5.4.3'),
  k('roster.pup_nfi_practice_window_days', 'number', 'days', 'Reserve/PUP and NFI practice window length (NEW: C5.4.3 rules 2 and 3, 21).', 'C5.4.3'),
  // Waivers and trades (C5.5).
  k('waivers.claim_period_hours', 'number', 'hours', 'In-season waiver claim period.', 'C5.5.1'),
  k('waivers.offseason_claim_period_hours', 'number', 'hours', 'Offseason waiver claim period (NEW: C5.5.1, three days, 1 of 3).', 'C5.5.1'),
  k('waivers.vested_min_seasons', 'number', 'seasons', 'Seasons that make a vested veteran.', 'C5.5.1'),
  k('waivers.vested_measure', 'option', undefined, 'Which seasons count toward vested status (NEW: C5.5.1, Conflict, default pension_credited).', 'C5.5.1', ['pension_credited', 'accrued']),
  k('waivers.priority_standings_after_week', 'number', 'week', 'Claim priority follows current standings after this regular season week (NEW: C5.5.1 rule 2, 3, Verified).', 'C5.5.1'),
  k('trade.deadline_after_week', 'number', 'week', 'Trade deadline falls after this week.', 'C5.5.2'),
  // The transaction day (C5.7.1).
  k('transactions.daily_deadline_hour_et', 'number', 'hour', 'A move filed at or after this hour (eastern) counts for the next day (NEW: C5.7.1, 16, 1 of 3).', 'C5.7.1'),
];

/** The limits one league plays under, read once from its rule set. Null groups are features the level's rules leave out. */
export interface RosterRules {
  readonly offseasonLimit: number | null;
  readonly seasonLimit: number;
  readonly cuts: { readonly aidCancelledOnCut: boolean; readonly medicalRetirementLeavesCount: boolean } | null;
  readonly gameDay: {
    readonly activeLimit: number; readonly activeLimitShortLine: number; readonly minLinemen: number; readonly floor: number;
    readonly lockMinutes: number; readonly emergencyQbActiveQbs: number; readonly emergencyQbFromPracticeSquad: boolean;
  } | null;
  readonly practiceSquad: {
    readonly size: number; readonly internationalSlots: number; readonly youngMin: number; readonly veteranSlots: number;
    readonly groupAMaxAccrued: number; readonly groupAActiveGamesBelow: number; readonly groupBMaxAccrued: number;
    readonly elevationsPerGame: number; readonly elevationsPerPlayerSeason: number; readonly postseasonUnlimited: boolean;
    readonly protectionsPerWeek: number; readonly poachPayWeeks: number; readonly nextOpponentDays: number;
  } | null;
  readonly reserve: {
    readonly irMinGames: number; readonly designations: number; readonly postseasonDesignations: number; readonly returnsPerPlayer: number;
    readonly irWindowDays: number; readonly cutdownDesignations: number;
    readonly pupMinGames: number; readonly pupWindowAfterGame: number; readonly nfiMinGames: number; readonly pupNfiWindowDays: number;
  } | null;
  readonly waivers: {
    readonly claimHours: number; readonly offseasonClaimHours: number; readonly vestedMinSeasons: number;
    readonly vestedMeasure: 'pension_credited' | 'accrued'; readonly standingsAfterWeek: number;
  } | null;
  readonly tradeDeadlineAfterWeek: number | null;
  /** Null when the level's rules carry no transaction-day cut-off: every move counts on the day it is filed. */
  readonly dailyDeadlineHour: number | null;
  /** Every key read to build this object, for the "every limit read by key" check. */
  readonly keysRead: readonly string[];
}

/** Builds the roster limits from a rule set. Each group is read only when its first key is in the file. */
export function rosterRules(rs: RuleSet): RosterRules {
  const present = new Set(rs.keys());
  const read: string[] = [];
  const has = (key: string) => present.has(key);
  const num = (key: string) => { read.push(key); return rs.num(key); };
  const bool = (key: string) => { read.push(key); return rs.bool(key); };
  const opt = (key: string) => { read.push(key); return rs.opt(key); };

  const seasonKey = has('roster.active_inactive_limit') ? 'roster.active_inactive_limit' : 'league.roster_limit';
  const offseasonKey = has('roster.offseason_limit') ? 'roster.offseason_limit' : has('league.preseason_roster_limit') ? 'league.preseason_roster_limit' : null;
  const measure = has('waivers.claim_period_hours') ? opt('waivers.vested_measure') : 'pension_credited';
  const rules: Omit<RosterRules, 'keysRead'> = {
    seasonLimit: num(seasonKey),
    offseasonLimit: offseasonKey ? num(offseasonKey) : null,
    cuts: has('aid.cancel_for_athletic_reasons') ? {
      aidCancelledOnCut: bool('aid.cancel_for_athletic_reasons'),
      medicalRetirementLeavesCount: bool('roster.medical_retirement_leaves_count'),
    } : null,
    gameDay: has('roster.active_limit') ? {
      activeLimit: num('roster.active_limit'),
      activeLimitShortLine: num('roster.active_limit_short_line'),
      minLinemen: num('roster.active_min_linemen'),
      floor: num('roster.active_floor'),
      lockMinutes: num('roster.inactives_due_minutes_before_kickoff'),
      emergencyQbActiveQbs: num('roster.emergency_qb_active_qbs'),
      emergencyQbFromPracticeSquad: bool('roster.emergency_qb_from_practice_squad'),
    } : null,
    practiceSquad: has('roster.practice_squad_size') ? {
      size: num('roster.practice_squad_size'),
      internationalSlots: num('roster.practice_squad_international_slot'),
      youngMin: num('roster.practice_squad_young_min'),
      veteranSlots: num('roster.practice_squad_veteran_slots'),
      groupAMaxAccrued: num('roster.practice_squad_group_a_max_accrued'),
      groupAActiveGamesBelow: num('roster.practice_squad_group_a_active_games_below'),
      groupBMaxAccrued: num('roster.practice_squad_group_b_max_accrued'),
      elevationsPerGame: num('roster.elevations_max_per_game'),
      elevationsPerPlayerSeason: num('roster.elevations_max_per_player_season'),
      postseasonUnlimited: bool('roster.elevations_postseason_unlimited'),
      protectionsPerWeek: num('roster.practice_squad_protections_per_week'),
      poachPayWeeks: num('roster.practice_squad_poach_pay_weeks'),
      nextOpponentDays: num('roster.practice_squad_next_opponent_days'),
    } : null,
    reserve: has('roster.ir_min_games') ? {
      irMinGames: num('roster.ir_min_games'),
      designations: num('roster.ir_return_designations'),
      postseasonDesignations: num('roster.ir_return_designations_postseason'),
      returnsPerPlayer: num('roster.ir_returns_per_player'),
      irWindowDays: num('roster.ir_practice_window_days'),
      cutdownDesignations: num('roster.ir_cutdown_return_designations'),
      pupMinGames: num('roster.pup_min_games'),
      pupWindowAfterGame: num('roster.pup_practice_window_after_game'),
      nfiMinGames: num('roster.nfi_min_games'),
      pupNfiWindowDays: num('roster.pup_nfi_practice_window_days'),
    } : null,
    waivers: has('waivers.claim_period_hours') ? {
      claimHours: num('waivers.claim_period_hours'),
      offseasonClaimHours: num('waivers.offseason_claim_period_hours'),
      vestedMinSeasons: num('waivers.vested_min_seasons'),
      vestedMeasure: measure === 'accrued' ? 'accrued' : 'pension_credited',
      standingsAfterWeek: num('waivers.priority_standings_after_week'),
    } : null,
    tradeDeadlineAfterWeek: has('trade.deadline_after_week') ? num('trade.deadline_after_week') : null,
    dailyDeadlineHour: has('transactions.daily_deadline_hour_et') ? num('transactions.daily_deadline_hour_et') : null,
  };
  return Object.freeze({ ...rules, keysRead: Object.freeze([...new Set(read)].sort()) });
}
