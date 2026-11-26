// What the career root needs from the season (handoff item D). The host (App.tsx) adapts the app-services
// season session to this port, so the screens never hold football logic (P1.2.2) and tests can drive the
// root with a scripted season.
import type { gameCallingCommands, presentationLive } from '@gm/app-services';

export type GameSession = gameCallingCommands.GameCallingSession;

export interface StandingRow { readonly teamId: number; readonly name: string; readonly w: number; readonly l: number; readonly t: number; readonly pf: number; readonly pa: number; readonly seat: boolean }

/** The season as the office shows it today: plain facts, no true ratings (MA-48). */
export interface SeasonToday {
  readonly teamName: string;
  readonly level: 'pro' | 'college';
  readonly seasonYear: number;
  /** Day of the season from 0, for the date line. */
  readonly dayIndex: number;
  /** "Week 3", "Wild card round"; a text key or plain words from the season session. */
  readonly stageLabel: string;
  readonly record: { readonly w: number; readonly l: number; readonly t: number };
  /** The seat's next game; null when the season is over for the seat. */
  readonly nextGame: { readonly opponentId: number; readonly opponent: string; readonly home: boolean; readonly daysToGame: number } | null;
  /** The seat's last result as a line ("W 24-17 vs Harbor City"), or null before the first game. */
  readonly lastResult: string | null;
  /** The seat's league or conference table. */
  readonly standings: readonly StandingRow[];
  readonly seasonOver: boolean;
  readonly champion: string | null;
}

/** The live field of the open game: the plays the resolver drew, for the field view and the sound stage. */
export interface LiveField {
  /** New plays since the last call, oldest first; a play with no trajectory (reference resolver) never appears. */
  take(): readonly presentationLive.LivePlay[];
  readonly geometry: GameSession['geometry'];
  readonly userSide: 0 | 1;
  readonly level: 'pro' | 'college';
  readonly colours: readonly [{ readonly primary: string; readonly alternate: string }, { readonly primary: string; readonly alternate: string }];
}

/** Games of the current batch played so far (the week's other games, off the main thread). */
export interface WeekProgress { readonly done: number; readonly total: number }
export type OnWeekProgress = (p: WeekProgress) => void;

export interface CareerPort {
  today(): SeasonToday;
  /**
   * Plays every other game up to the seat's next game day (byes included). A port that plays them in workers
   * returns a promise and reports each batch through `onProgress`; a port that plays them in place returns nothing.
   */
  advanceToGameDay(onProgress?: OnWeekProgress): void | Promise<void>;
  /** Opens the seat's game on game day; the opponent calls through the coach AI. */
  startGame(): GameSession;
  /** Records the finished game in the season and the world. */
  finishGame(session: GameSession, onProgress?: OnWeekProgress): void | Promise<void>;
  /** The staff coaches the seat's game (K6); the season moves on. */
  delegateGame(onProgress?: OnWeekProgress): void | Promise<void>;
  /** The live field of the open game, or null when none is open. */
  liveField(session: GameSession): LiveField | null;
  /** Player and team names for the play log (observed names only). */
  names(session: GameSession): { playerName(id: number): string; teamName(side: 0 | 1): string };
}
