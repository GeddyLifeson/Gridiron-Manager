// Press conference question generator: the shapes it reads and writes. Everything it reads is public
// (through the observer filter, G-27) or a leak that reached a reporter; the world runner builds these views.
import type { HarmClass, PersonOrigin } from '@gm/schema';

export type Level = 'pro' | 'college';

/** Session kinds (H7.1.1, H7.1.3, H7.3, H7.4, I10.4.1, I9 halftime interview, L6.6 coach's show, E2 introduction). */
export const SESSION_KINDS = [
  'postgame', 'day_after', 'midweek', 'weekly', 'training_camp', 'end_of_season', 'pre_draft', 'introductory',
  'coordinator', 'position_coach', 'halftime_interview', 'coach_show', 'opponent_call', 'crisis',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** Who sits at the podium. Below head coach the questions narrow to the speaker's own job (H7.4.2). */
export type Speaker = 'head_coach' | 'coordinator' | 'position_coach' | 'player';

/** Outlet types (L6.1.1, L6.7.1). */
export const OUTLET_TYPES = ['local_paper', 'local_broadcast', 'team_site', 'national', 'analytics', 'student', 'radio_host'] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

/** One reporter in the room (L6.1.1). Goodwill and edge are hidden truth: they shape tone, never shown. */
export interface ReporterView {
  readonly id: number;
  readonly outlet: OutletType;
  /** L6.1.1 reach 1 to 5. */
  readonly reach: number;
  /** Interest multipliers by question code (the reporter's beat). Missing codes count 1. */
  readonly beat: Readonly<Record<string, number>>;
  /** L6 trust toward this coach, 0 to 100 (hidden). */
  readonly trust: number;
  /** K8.7.1 appetite for controversy, 0 to 1 (hidden). */
  readonly controversy: number;
}

/**
 * A public happening the press can ask about. `type` is one of TRIGGER_TYPES (catalogue.ts); the world
 * runner maps world event rows to these. `public` false means only the leak path brought it to the room.
 */
export interface PressEvent {
  readonly id: number;
  readonly type: string;
  /** Days before the session; 0 is the same day (a postgame is 0 for the game's events). */
  readonly daysAgo: number;
  /** X4.1.1 notability 0 to 100. */
  readonly notability: number;
  readonly harm: HarmClass;
  /** Persons the event is about (players, staff, the coach himself). */
  readonly personIds: readonly number[];
  /** Teams the event is about. */
  readonly teamIds: readonly number[];
  /** Witness rule was public (X2.1.2). */
  readonly public: boolean;
  /** A private fact that reached a reporter (L6.3.1, H7.2.2 rule 3). */
  readonly fromLeak: boolean;
  /** Free words for the question text: player, opponent, staff, stat, detail. Public facts only. */
  readonly words?: Readonly<Record<string, string>>;
  /** A decision the public model judged poor, or that failed (H7.2.2 inputs, K8.2.1). */
  readonly judgedPoor?: boolean;
  /** A player was seriously hurt in this game: fault questions about that game are suppressed (H7.2.1 edge). */
  readonly seriousInjury?: boolean;
}

/** Something the coach said in public earlier (H7.2.1 Statement), used for follow-ups and consistency questions. */
export interface PriorStatement {
  readonly id: number;
  readonly topicId: string;
  readonly subjectKey: string;
  readonly daysAgo: number;
  /** A later public event contradicts it (the caller decides; H7.2.1 rule 3). */
  readonly contradictedBy?: number;
}

/** Public state of the world the room knows (standings, labels, market). */
export interface PressWorld {
  readonly level: Level;
  readonly teamId: number;
  readonly coachId: number;
  /** C1 / T9 market size 1 (smallest) to 5 (largest). */
  readonly market: number;
  /** Public wins and losses this season and the current streak (+ wins, - losses). */
  readonly wins: number;
  readonly losses: number;
  readonly streak: number;
  /** Public hot-seat talk exists (E4 label, K8 media). */
  readonly hotSeat: boolean;
  /** L6 mean goodwill toward the coach, 0 to 100 (hidden). */
  readonly goodwill: number;
  /** The next opponent's team id, if a game is ahead in this cycle. */
  readonly nextOpponent: number | null;
  readonly rivalryWeek: boolean;
  /** Persons whose origin is imported (real people pack): personal and harmful topics never touch them. */
  readonly origins: Readonly<Record<number, PersonOrigin>>;
  /** Display names for persons and teams, public. */
  readonly names: Readonly<Record<number, string>>;
}

export interface SessionSettings {
  /** Allow questions about personal life drawn from public events (generated people only). Default true. */
  readonly personalTopics: boolean;
  /** Override the realistic question count (H7.2.1 bible range is shorter than real sessions; see README). */
  readonly questionCount?: number;
}

export interface PressSession {
  readonly kind: SessionKind;
  readonly speaker: Speaker;
  /** Session length in minutes, if the block states it. */
  readonly minutes?: number;
  readonly reporters: readonly ReporterView[];
  readonly events: readonly PressEvent[];
  readonly statements: readonly PriorStatement[];
  readonly world: PressWorld;
  readonly settings: SessionSettings;
}

export type Tone = 'soft' | 'neutral' | 'probing' | 'hostile';

/** One question put to the coach. */
export interface PressQuestion {
  readonly n: number;
  readonly code: string;
  readonly topicId: string;
  /** What the question is about: `event:<id>`, `person:<id>`, `team:<id>` or `general`. */
  readonly subjectKey: string;
  readonly eventId: number | null;
  readonly personId: number | null;
  readonly reporterId: number;
  readonly tone: Tone;
  /** The number of the question this presses, for a follow-up. */
  readonly followUpOf: number | null;
  /** True when it confronts the coach with something he said that later events contradict. */
  readonly gotcha: boolean;
  readonly harm: HarmClass;
  readonly textKey: string;
  readonly text: string;
}

/** How the coach answered, as far as the room is concerned (H7.2.1 stances, I10.4.1 answer styles). */
export type AnswerKind = 'direct' | 'evasive' | 'decline' | 'combative';

export interface SessionState {
  readonly session: PressSession;
  readonly target: number;
  readonly asked: readonly PressQuestion[];
  /** Subject keys already used, with the number of follow-ups on each. */
  readonly followUps: Readonly<Record<string, number>>;
  readonly done: boolean;
}
