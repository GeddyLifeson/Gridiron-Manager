// Roster state and transactions (C5.1.1 RosterState, C5.7.1 Transaction). Ids are world ids (positive
// integers, P3). List names are keys, never limits (W-13, W-26): the limits come from RosterRules.
// Persisted rows map onto world:RosterSlot (teamId, personId, list, since) through toRosterSlots().

/** List keys (C5.1.1 table, T5.1.2). Strings so one shape serves both levels. */
export const LIST = {
  active: 'active',
  practiceSquad: 'practice_squad',
  injured: 'reserve_injured',
  pup: 'reserve_pup',
  nfi: 'reserve_nfi',
  suspended: 'reserve_suspended',
  medicalRetired: 'medical_retired',
} as const;
export type ListKey = (typeof LIST)[keyof typeof LIST];
export type ReserveList = typeof LIST.injured | typeof LIST.pup | typeof LIST.nfi;

/** League phase as the roster rules see it. C4 (G-12) owns the calendar; it moves the phase through roster events. */
export type RosterPhase = 'offseason' | 'regular' | 'postseason';

/** An instant: world day index plus hour of day (eastern, C5.7.1). */
export interface Instant { readonly dayIndex: number; readonly hour: number }

/** The player facts the rules test (C5.1.2, C5.3.1, C5.4.3, T5.1.1). Supplied by people, medical and the career record. */
export interface PlayerFacts {
  readonly personId: number;
  readonly accruedSeasons: number;
  readonly pensionCreditedSeasons: number;
  /** Games on an active list in his last accrued season (practice squad group A test, C5.3.1). */
  readonly activeGamesInLastAccruedSeason: number;
  /** Primary position is centre, guard or tackle (C5.2.1 edge case: primary position, not the week's listing). */
  readonly offensiveLineman: boolean;
  /** A bona fide quarterback (C5.2.2). */
  readonly quarterback: boolean;
  /** Took part in a practice or game this preseason (C5.4.3 rule 1). */
  readonly practicedThisPreseason: boolean;
  readonly internationalPathway: boolean;
  /** Currently hurt (D11). A healthy player placed on a reserve list is a breakable act (H6.5.1). */
  readonly injured: boolean;
  readonly nonFootballInjury: boolean;
  /** Medical staff judge he can play (T5.1.2 rule 5: a medical retirement of a player who can play is a violation). */
  readonly medicallyCleared: boolean;
  /** Exempt from the roster count (T5.1.1: players on rosters before the 2025 settlement). */
  readonly countExempt: boolean;
}

export interface ReserveState {
  /** Club games played when he went on the list. Byes are not games, so games missed = gamesPlayed - this. */
  readonly placedAtGame: number;
  readonly seasonEnding: boolean;
  /** Designated to return at the cutdown (C5.4.2 rule 4). */
  readonly designatedAtCutdown: boolean;
  readonly windowOpenedDay: number | null;
  /** Suspension length in club games (C5.4.3 rule 4); 0 on other lists. */
  readonly suspensionGames: number;
}

export interface RosterEntry {
  readonly personId: number;
  readonly list: ListKey;
  readonly sinceDay: number;
  /** Camp designation on the active list (active/PUP or active/NFI, C5.4.3). */
  readonly campFlag: 'pup' | 'nfi' | null;
  readonly reserve: ReserveState | null;
  /** Regular-season elevations used (C5.3.2 rule 2). */
  readonly elevationsThisSeason: number;
  /** Club game index he is elevated for, or null (C5.3.2). */
  readonly elevatedForGame: number | null;
  readonly elevatedAsEmergencyQb: boolean;
  /** Protected through the club game with this index (C5.3.3 rule 1). */
  readonly protectedForGame: number | null;
  /** Weeks of pay owed after a signing off another practice squad end after this club game (C5.3.3 rule 3; C6 reads it). */
  readonly payGuaranteedThroughGame: number | null;
}

export interface ClubRoster {
  readonly clubId: number;
  readonly entries: readonly RosterEntry[];
  readonly gamesPlayed: number;
  readonly designationsUsed: number;
  readonly cutdownDesignationsUsed: number;
  /** Returns from injured reserve per player this season (C5.4.2 rule 2). */
  readonly returnsByPlayer: Readonly<Record<string, number>>;
  readonly inPostseason: boolean;
  readonly nextGame: { readonly opponentId: number; readonly dayIndex: number } | null;
  readonly deadlineMet: boolean;
}

export interface WaiverClaim { readonly clubId: number; readonly linked: readonly Transaction[] }
export interface WaiverItem {
  readonly personId: number;
  readonly fromClubId: number;
  readonly deadline: Instant;
  readonly claims: readonly WaiverClaim[];
  /** Waived in the roster-deadline reduction: all such players share one claim deadline (C5.6.1 rule 3). */
  readonly atCutdown: boolean;
}

export interface LeagueRosters {
  readonly seasonYear: number;
  readonly phase: RosterPhase;
  readonly now: Instant;
  /** Regular season weeks completed (C5.5.1 priority switch, C5.5.2). */
  readonly leagueWeek: number;
  readonly tradeDeadlinePassed: boolean;
  /** Practice squads form after cutdown claims are awarded (C5.6.1 rule 4). */
  readonly practiceSquadsOpen: boolean;
  readonly clubs: readonly ClubRoster[];
  readonly players: Readonly<Record<string, PlayerFacts>>;
  readonly waivers: readonly WaiverItem[];
  /** Claim priority, best first (C5.5.1 rule 2). G-14 supplies both orders. */
  readonly priority: { readonly priorSeason: readonly number[]; readonly standings: readonly number[] };
  readonly wireSeq: number;
}

/** A club move (C5.7.1 types). `linked` moves are atomic with it: all apply or none (C5.7.1 edge case). */
export type Transaction =
  | { type: 'sign_free_agent'; clubId: number; personId: number; linked?: Transaction[] }
  | { type: 'sign_practice_squad'; clubId: number; personId: number; linked?: Transaction[] }
  | { type: 'sign_from_practice_squad'; clubId: number; personId: number; linked?: Transaction[] }
  | { type: 'elevate'; clubId: number; personId: number; emergencyQb?: boolean }
  | { type: 'release'; clubId: number; personId: number }
  | { type: 'claim'; clubId: number; personId: number; linked?: Transaction[] }
  | { type: 'place_reserve'; clubId: number; personId: number; list: ReserveList; designateToReturn?: boolean }
  | { type: 'camp_designation'; clubId: number; personId: number; flag: 'pup' | 'nfi' }
  | { type: 'open_return_window'; clubId: number; personId: number }
  | { type: 'activate'; clubId: number; personId: number; linked?: Transaction[] }
  | { type: 'protect'; clubId: number; personIds: number[] }
  | { type: 'trade'; clubId: number; otherClubId: number; give: number[]; get: number[] }
  | { type: 'medical_retirement'; clubId: number; personId: number }
  /** The reduction (C5.6.1, T5.1.2): moves applied together, then the club must be within the season limit. */
  | { type: 'cutdown'; clubId: number; moves: Transaction[] };

/** League-office and calendar events. Not club moves: K7 and the user never file these. */
export type RosterEvent =
  | { type: 'advance_time'; to: Instant }
  | { type: 'roster_deadline'; claimDeadline: Instant }
  | { type: 'game_played'; clubId: number }
  | { type: 'end_week'; leagueWeek: number }
  | { type: 'pass_trade_deadline' }
  | { type: 'begin_postseason'; clubIds: number[] }
  | { type: 'new_league_year'; seasonYear: number }
  | { type: 'suspend'; clubId: number; personId: number; games: number }
  | { type: 'set_player_facts'; facts: PlayerFacts[] }
  | { type: 'set_next_game'; clubId: number; opponentId: number; dayIndex: number }
  | { type: 'set_waiver_order'; priorSeason?: number[]; standings?: number[] };

export interface WireEntry {
  readonly seq: number;
  readonly dayIndex: number;
  readonly clubId: number | null;
  readonly personId: number | null;
  /** Wire text key (C10.1 renders it). */
  readonly kind: string;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
}

/** A filing the league office refuses (C5.7.1): the rule leaf and what would fix it. */
export interface Refusal {
  readonly ok: false;
  readonly rule: string;
  readonly code: 'unknown' | 'phase' | 'eligibility' | 'limit' | 'deadline' | 'precondition';
  readonly message: string;
  readonly fix: string;
}

/** A legal filing that breaks a rule: allowed, warned, and sent to L8.2.5 for detection (C5.7.1, C11.2.1). */
export interface BreakableAct { readonly rule: string; readonly act: string; readonly clubId: number; readonly personId: number }

export interface Accepted {
  readonly ok: true;
  readonly state: LeagueRosters;
  readonly wire: readonly WireEntry[];
  readonly breakable: readonly BreakableAct[];
}

export type TxResult = Accepted | Refusal;
