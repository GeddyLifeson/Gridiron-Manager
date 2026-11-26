// What the career root needs from the season (handoff item D). The host (App.tsx) adapts the app-services
// season session to this port, so the screens never hold football logic (P1.2.2) and tests can drive the
// root with a scripted season.
import type { gameCallingCommands } from '@gm/app-services';

export type GameSession = gameCallingCommands.GameCallingSession;

export interface StandingRow { readonly teamId: number; readonly name: string; readonly w: number; readonly l: number; readonly t: number; readonly seat: boolean }

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
}

export interface CareerPort {
  today(): SeasonToday;
  /** Plays every other game up to the seat's next game day (byes included). */
  advanceToGameDay(): void;
  /** Opens the seat's game on game day; the opponent calls through the coach AI. */
  startGame(): GameSession;
  /** Records the finished game in the season and the world. */
  finishGame(session: GameSession): void;
  /** Player and team names for the play log (observed names only). */
  names(session: GameSession): { playerName(id: number): string; teamName(side: 0 | 1): string };
}
