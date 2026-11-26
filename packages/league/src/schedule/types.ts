// Schedule module types (C2, T3.1). Ids are the world's string ids (content ids such as `club.mby`
// or `school.wrenham`); the world package maps them to its numeric row ids when it writes GameRecords.
import type { RandomStream } from '@gm/schema';
import raw from './config.json' with { type: 'json' };

export type ScheduleConfig = typeof raw;
export const DEFAULT_CONFIG: ScheduleConfig = raw;

export type TeamId = string;
export type DayCode = 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'mon';

/** The pro league layout (C1.1.1). Conference order matters: index 0 and 1 drive the alternating host rules. */
export interface ProLeague {
  readonly conferences: readonly { readonly id: string; readonly divisions: readonly { readonly id: string; readonly clubIds: readonly TeamId[] }[] }[];
}

export interface ProClubInfo {
  readonly id: TeamId;
  readonly venueId: string;
  readonly zone: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly marketTier: number;
}

/** What C2.1.1 produces: one pairing, home side fixed. */
export type PairingKind = 'division' | 'intra_rotation' | 'inter_rotation' | 'intra_place' | 'extra';
export interface Pairing {
  readonly home: TeamId;
  readonly away: TeamId;
  readonly kind: PairingKind;
}

export type ScheduleKind =
  | PairingKind
  | 'conference' | 'protected' | 'nonconference' | 'guarantee' | 'second_subdivision' | 'contract'
  | 'preseason';

/** The C2.6.2 record. `dayOffset` counts days from the Sunday that closes the week (Saturday is -1). */
export interface ScheduledGame {
  id: string;
  season: number;
  phase: 'preseason' | 'regular';
  week: number;
  home: TeamId;
  away: TeamId;
  venueId: string;
  neutral: boolean;
  international: boolean;
  region: string | null;
  kind: ScheduleKind;
  conferenceGame: boolean;
  day: DayCode;
  dayOffset: number;
  /** Absolute world day (P3 Calendar.dayIndex) when the caller gave the week-1 anchor, else null. */
  dayIndex: number | null;
  slot: string;
  /** Kickoff in minutes after midnight, eastern time (C2.3.1 slot table); null when not set (college). */
  kickoffEtMinutes: number | null;
  venueZone: string | null;
  national: boolean;
  flexEligible: boolean;
  status: 'scheduled' | 'moved' | 'played';
}

export interface ByeRecord { readonly team: TeamId; readonly week: number }

export interface ProSeasonInput {
  readonly season: number;
  readonly league: ProLeague;
  readonly clubs: readonly ProClubInfo[];
  /** Prior-year division rank 1 to 4 per club, ties already broken by C3 (C2.1.1 inputs). */
  readonly priorRank: Readonly<Record<TeamId, number>>;
  /** Prior-season wins, for the national-game weighting (C2.3.1). Missing clubs count as zero. */
  readonly priorWins?: Readonly<Record<TeamId, number>>;
  /** Star-player score 0 to 1 per club (C2.3.1 attractiveness). Missing clubs count as zero. */
  readonly stars?: Readonly<Record<TeamId, number>>;
  /** World day index of the Sunday of week 1, if known (C4). */
  readonly week1SundayDayIndex?: number;
  readonly random: RandomStream;
  readonly config?: ScheduleConfig;
}

export interface ProSchedule {
  readonly season: number;
  readonly pairings: readonly Pairing[];
  readonly games: ScheduledGame[];
  readonly byes: readonly ByeRecord[];
  readonly preseason: ScheduledGame[];
  readonly jointPracticeCandidates: readonly (readonly [TeamId, TeamId])[];
  /** Solver notes: restarts used, relaxations applied (C2.2.1 edge cases). */
  readonly log: readonly string[];
}
