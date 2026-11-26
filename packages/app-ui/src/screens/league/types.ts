// The league pages read-model data as the screens draw it. Same shapes as the read models in
// app-services/src/read-models/league/types.ts (schemas in its test folder until they move to @gm/schema);
// app-ui imports only the app-services entry point, so the shapes are written here too. Keep the two equal.

export interface DateLike { readonly seasonYear: number; readonly dayIndex: number }
export interface WLT { readonly w: number; readonly l: number; readonly t: number }

/** A team as every league page names it (A6.2.1 generated identity). */
export interface TeamRef { readonly teamId: number; readonly name: string; readonly abbreviation: string }

// --- Standings (C3.1.2, C3.1.3, C3.3, T3.3 to T3.6) ---------------------------------------------------

export type StandingsMark = 'clinched_playoffs' | 'clinched_division' | 'clinched_top_seed' | 'eliminated' | 'champion' | 'conference_champion' | 'title_game';

export interface StandingsLine {
  readonly teamId: number;
  readonly record: WLT;
  readonly pct: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly netPoints: number;
  readonly home: WLT;
  readonly road: WLT;
  readonly division: WLT;
  readonly conference: WLT;
  readonly streakKind: 'W' | 'L' | 'T' | null;
  readonly streakLength: number;
  readonly lastFive: WLT;
  readonly strengthOfVictory: number;
  readonly strengthOfSchedule: number;
  readonly marks: readonly StandingsMark[];
  /** Playoff odds from the C3.3.3 simulation, 0 to 1, when the league side ran it; else null. */
  readonly odds: { readonly playoffs: number; readonly division: number; readonly topSeed: number } | null;
  /** College committee rank (T3.4), 1 first; null when unranked or at the pro level. */
  readonly ranking: number | null;
}

export interface StandingsGroup {
  readonly groupId: number;
  readonly name: string;
  readonly kind: 'division' | 'conference';
  readonly parentId: number | null;
  /** First to last. */
  readonly teamIds: readonly number[];
  /** True when the order is the league's tiebroken order (C3.1.3); false when sorted by percentage only. */
  readonly final: boolean;
}

export interface SeedLine {
  readonly conferenceId: number;
  readonly name: string;
  readonly seeds: readonly number[];
  readonly divisionWinners: readonly number[];
  /** Clubs not seeded, best first ("in the hunt"). */
  readonly rest: readonly number[];
}

/** One line of the tie explanation (C3.2.3, T3.3.1 rule 2). */
export interface TieNote {
  readonly listKey: string;
  readonly stepKey: string;
  readonly teamIds: readonly number[];
  readonly advanced: number | null;
}

export interface BracketLine {
  readonly key: string;
  readonly round: number;
  readonly group: number | null;
  readonly teams: readonly [number, number];
  readonly seeds: readonly [number, number];
  readonly host: number | null;
  readonly winner: number | null;
}

export interface RankingLine { readonly rank: number; readonly teamId: number; readonly record: WLT; readonly scheduleStrength: number; readonly bestWins: readonly number[] }
export interface PollLine { readonly rank: number; readonly teamId: number; readonly points: number }
export interface BowlLine { readonly bowlId: number; readonly nameKey: string; readonly teams: readonly [number, number] | null }

export interface CollegePicture {
  readonly rankings: readonly RankingLine[];
  readonly poll: readonly PollLine[];
  readonly bowls: readonly BowlLine[];
  readonly eligible: readonly number[];
  readonly shortFill: readonly number[];
  readonly titleGames: readonly { readonly conferenceId: number; readonly teams: readonly [number, number]; readonly champion: number | null }[];
}

export interface StandingsView {
  readonly competitionId: number;
  readonly seasonYear: number;
  readonly level: 'pro' | 'college';
  readonly teams: Readonly<Record<string, TeamRef>>;
  readonly lines: readonly StandingsLine[];
  readonly groups: readonly StandingsGroup[];
  readonly seeds: readonly SeedLine[];
  readonly tieNotes: readonly TieNote[];
  /** C3.3.2: the answer leaned on a made-up game. */
  readonly uncertain: boolean;
  readonly bracket: readonly BracketLine[];
  readonly champion: number | null;
  readonly college: CollegePicture | null;
  /** Final regular-season games counted. */
  readonly gamesCounted: number;
}

// --- Schedule (C2.2, C2.2.2, T3.1) ---------------------------------------------------------------------

export type WeekTag = 'illegal' | 'short' | 'short_mild' | 'normal_minus_one' | 'normal' | 'long' | 'mini_bye' | 'bye';

export interface ScheduleGame {
  readonly gameId: number;
  readonly week: number;
  readonly phase: 'preseason' | 'regular' | 'postseason';
  readonly kickoff: DateLike;
  /** Index 0 home (or first listed at a neutral site), 1 visitor. */
  readonly teamIds: readonly [number, number];
  readonly venueName: string | null;
  readonly neutralSite: boolean;
  readonly status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'cancelled';
  readonly score: readonly [number, number] | null;
  /** Both teams in the same conference (T3.1 conference flag). */
  readonly conferenceGame: boolean;
}

export interface ScheduleWeek {
  readonly week: number;
  readonly games: readonly ScheduleGame[];
  /** Clubs with no game this week, in the regular season. */
  readonly byes: readonly number[];
}

/** One row of a single team's schedule (C2.2.1 user page, T3.1 season schedule screen). */
export interface TeamScheduleRow {
  readonly week: number;
  readonly game: ScheduleGame | null;
  readonly opponentId: number | null;
  readonly site: 'home' | 'away' | 'neutral' | null;
  readonly tag: WeekTag;
  /** Days since the previous game; null for the first game and for a bye. */
  readonly restDays: number | null;
  readonly result: 'W' | 'L' | 'T' | null;
  /** Opponent's record from the games seen so far (T3.1 "each opponent's standing"). */
  readonly opponentRecord: WLT | null;
}

export interface ScheduleView {
  readonly competitionId: number;
  readonly seasonYear: number;
  readonly teams: Readonly<Record<string, TeamRef>>;
  readonly weeks: readonly ScheduleWeek[];
  readonly teamId: number | null;
  readonly teamRows: readonly TeamScheduleRow[];
}

// --- Team page (C1, X8 open chairs, X3 links) ----------------------------------------------------------

export interface StaffLine { readonly jobId: number; readonly catalogueId: string; readonly personId: number | null; readonly name: string | null; readonly holding: string | null }
export interface RosterLine { readonly personId: number; readonly name: string; readonly position: string | null; readonly jersey: number | null; readonly list: string }
export interface TendencyLine { readonly situationBucket: string; readonly callKey: string; readonly count: number; readonly share: number }

export interface TeamPageView {
  readonly teamId: number;
  readonly team: TeamRef;
  readonly nickname: string;
  readonly place: string;
  readonly competitionName: string | null;
  readonly groupNames: readonly string[];
  readonly venue: { readonly name: string; readonly place: string; readonly capacity: number; readonly roof: string; readonly surfaceType: string } | null;
  readonly resourceBand: string;
  readonly seasonYear: number;
  readonly record: WLT;
  readonly results: readonly ScheduleGame[];
  readonly upcoming: readonly ScheduleGame[];
  readonly staff: readonly StaffLine[];
  /** Chairs with no holder (X8.1.1: the open-chair count equals the open boxes). */
  readonly openChairs: number;
  readonly roster: readonly RosterLine[];
  readonly rivals: readonly number[];
  /** Tendencies seen on film this season (P3.3.2 cells), most used first in each situation. */
  readonly tendencies: readonly TendencyLine[];
  readonly teams: Readonly<Record<string, TeamRef>>;
}

// --- Transactions and news (C10.1, C10.7) -------------------------------------------------------------

export interface TransactionLine {
  readonly eventId: number;
  readonly type: string;
  readonly date: DateLike;
  readonly teamId: number | null;
  readonly personIds: readonly number[];
  readonly lineTemplate: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
  /** Filters (C10.1 default: his club, this week's opponent, his division). */
  readonly mine: boolean;
  readonly opponent: boolean;
  readonly division: boolean;
  /** About a player on the club's ready list (M3.2.1). */
  readonly readyList: boolean;
}

export interface TransactionsView {
  readonly competitionId: number | null;
  readonly lines: readonly TransactionLine[];
  readonly teams: Readonly<Record<string, TeamRef>>;
  readonly people: Readonly<Record<string, string>>;
}

export interface NewsLine {
  readonly newsId: number;
  readonly date: DateLike;
  readonly kind: string;
  readonly templateKey: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
  readonly teamIds: readonly number[];
  readonly personIds: readonly number[];
  readonly audience: string;
  readonly mine: boolean;
}

export interface NewsView {
  readonly lines: readonly NewsLine[];
  readonly kinds: readonly string[];
  readonly teams: Readonly<Record<string, TeamRef>>;
  readonly people: Readonly<Record<string, string>>;
}

// --- Awards, records and history (C9) -----------------------------------------------------------------

export interface HonourLine {
  readonly eventId: number;
  readonly type: string;
  readonly seasonYear: number;
  readonly lineTemplate: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
  readonly personIds: readonly number[];
  readonly teamId: number | null;
  readonly reversed: boolean;
}

export interface BookLine { readonly rank: number; readonly holderId: number; readonly value: number; readonly season: number; readonly gameId: number | null; readonly seasonGames: number | null; readonly imported: boolean }

export interface RecordList {
  readonly recordId: string;
  readonly statistic: string;
  readonly scope: string;
  readonly holder: 'player' | 'team';
  readonly direction: 'most' | 'fewest';
  readonly entries: readonly BookLine[];
}

export interface SeasonHistoryLine { readonly seasonYear: number; readonly champion: number | null; readonly honours: number }

export interface RecordsView {
  readonly competitionId: number;
  readonly seasonYear: number | null;
  readonly honours: readonly HonourLine[];
  readonly books: readonly RecordList[];
  readonly history: readonly SeasonHistoryLine[];
  readonly teams: Readonly<Record<string, TeamRef>>;
  readonly people: Readonly<Record<string, string>>;
}
