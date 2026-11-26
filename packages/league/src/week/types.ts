// The week as a data object (H1.1.1): one Week per team per game week, made of days, each made of
// timed blocks. Times are calendar Instants (day number plus minutes after midnight, G-12 date.ts).
import type { Instant } from '../calendar/date.ts';

export const WEEK_SHAPES = ['normal', 'short', 'long', 'bye', 'playoff'] as const;
export type WeekShape = (typeof WEEK_SHAPES)[number];

/** H1.1.1 rule 3, with the college and lower-rung additions of H1.5.3 to H1.5.5 and meals (H8.6.1). */
export const BLOCK_TYPES = [
  'staff_meeting', 'team_meeting', 'unit_meeting', 'position_meeting', 'walkthrough', 'practice',
  'lift_conditioning', 'treatment_recovery', 'film_self', 'game_planning', 'media', 'travel',
  'player_free', 'coach_personal', 'game', 'class_academic', 'study_hall', 'recruiting', 'boss_task', 'meal',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Owner category of each block type (H1.1.1 rule 5): the screen a block opens and who computes its effect. */
export const BLOCK_OWNER: Readonly<Record<BlockType, string>> = {
  staff_meeting: 'H4', team_meeting: 'H4', unit_meeting: 'H4', position_meeting: 'H4',
  walkthrough: 'H3', practice: 'H3', lift_conditioning: 'H3', treatment_recovery: 'H5',
  film_self: 'E7', game_planning: 'G6', media: 'H7', travel: 'H8', player_free: 'D12',
  coach_personal: 'E7', game: 'I', class_academic: 'T5', study_hall: 'T5', recruiting: 'T4',
  boss_task: 'S3', meal: 'H8',
};

/**
 * Attendee atoms. A block's attendee list is a set of atoms; two blocks clash when their times overlap
 * and their atom sets meet (H1.1.1 rule 4). `team` and the other groups expand to atoms (ATTENDEE_GROUPS).
 * `injured` is its own atom: injured players take treatment instead of practising.
 */
export const ATOMS = ['offense', 'defense', 'injured', 'head_coach', 'off_staff', 'def_staff', 'st_staff', 'support'] as const;
export type Atom = (typeof ATOMS)[number];

export const ATTENDEE_GROUPS = {
  team: ['offense', 'defense'],
  offense: ['offense'],
  defense: ['defense'],
  quarterbacks: ['offense'],
  leaders: ['offense', 'defense'],
  injured: ['injured'],
  head_coach: ['head_coach'],
  staff: ['off_staff', 'def_staff', 'st_staff'],
  off_staff: ['off_staff'],
  def_staff: ['def_staff'],
  st_staff: ['st_staff'],
  coordinators: ['off_staff', 'def_staff', 'st_staff'],
  support: ['support'],
} as const satisfies Record<string, readonly Atom[]>;
export type AttendeeGroup = keyof typeof ATTENDEE_GROUPS;

/** Leader roles. `user` is resolved to the user's own role by the caller; staff roles run by K6 when delegated. */
export const LEADER_ROLES = [
  'head_coach', 'off_coordinator', 'def_coordinator', 'st_coordinator', 'position_coaches', 'play_caller',
  'strength_coach', 'trainer', 'operations', 'analyst', 'quality_control', 'staff_default', 'none',
] as const;
export type LeaderRole = (typeof LEADER_ROLES)[number];

export type Equipment = 'none' | 'helmets' | 'shells' | 'pads';
export type Contact = 'none' | 'thud' | 'live' | 'tackling';

/** Media session kinds (H7.1.1, H7.1.2, H7.3, H7.4.1). */
export const SESSION_TYPES = [
  'post_game', 'day_after', 'mid_week', 'coordinator', 'locker_room', 'production_meeting',
  'conference_call', 'weekly_conference', 'opponent_media', 'coach_show',
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** H1.1.1 rule 2 block fields, plus the work-rule facts the checkers read. */
export interface Block {
  readonly id: string;
  readonly type: BlockType;
  readonly start: Instant;
  readonly minutes: number;
  readonly attendees: readonly AttendeeGroup[];
  readonly leader: LeaderRole;
  readonly location: 'facility' | 'stadium' | 'hotel' | 'transit' | 'host_site' | 'away_stadium' | 'campus';
  /** ID of the script, agenda or report that fills the block; null runs the leader's default (rule 6). */
  readonly contentRef: string | null;
  readonly mandatory: boolean;
  /** Practice and walkthrough only (C11.2.3 padded counts, field time). */
  readonly equipment?: Equipment;
  readonly contact?: Contact;
  readonly positionCoachMinutes?: number;
  /** Media only. */
  readonly session?: SessionType;
  /** Countable athletic activity in a countable-hours rule set (H1.5.2 rule 1). */
  readonly countable?: boolean;
  /** Marked voluntary by the coach (H1.5.2 rule 2). Costs no hours; staff attendance makes it a risk. */
  readonly voluntary?: boolean;
  /** Fixed by the boss below coordinator (H1.5.5 acceptance 1). */
  readonly fixed?: boolean;
  /** Template day kind the block came from, for the summary. */
  readonly kind?: string;
}

/** A day numbered by distance to the game: 0 is game day (G), 1 is G-1, and so on (H1.1.1 rule 1). */
export interface Day {
  readonly day: number;
  readonly gMinus: number;
  readonly kind: string;
  readonly blocks: readonly Block[];
}

export interface Week {
  readonly teamId: number;
  readonly weekId: string;
  readonly shape: WeekShape;
  /** Day of the previous game (null for the first week of a season). */
  readonly previousGameDay: number | null;
  readonly previousGameWeekday: number | null;
  readonly kickoff: Instant | null;
  readonly home: boolean;
  readonly days: readonly Day[];
  /** Ids of blocks already resolved; they cannot be edited (H1.1.3 rule 5). */
  readonly completed: readonly string[];
}

/** A finding about a block or a week from the work-rule checks (H1.1.2, H1.5.2) or the media count (H7.1.1). */
export interface Finding {
  readonly ruleId: string;
  /** hard: breaking it is a chosen violation through L8.2.5. soft: it charges fatigue and morale. */
  readonly hardness: 'hard' | 'soft';
  /** Compliance class (G-28 catalogue) a confirmed hard finding is logged under. */
  readonly classId: string;
  readonly plain: string;
  readonly penalty: string;
  readonly leaf: string;
  readonly blockId: string | null;
  /** A rule below Verified still applies and shows a developer warning (C11.1.1 edge case). */
  readonly developerWarning: boolean;
}

/** A clash between two blocks for one attendee: the only thing the editor refuses (H1.1.2). */
export interface Clash { readonly a: string; readonly b: string; readonly atom: Atom }
