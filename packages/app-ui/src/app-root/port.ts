// What the career root needs from the season (handoff item D). The host (App.tsx) adapts the app-services
// season session to this port, so the screens never hold football logic (P1.2.2) and tests can drive the
// root with a scripted season.
import type { gameCallingCommands, newgame, presentationLive } from '@gm/app-services';
import type { RouteSources } from '../routes.ts';
import type { AdvanceTarget } from '../screens/home/view.ts';

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

/** The seat's week as the office shows it today (H1.1.1, H1.1.3): the day's blocks, done or to come. */
export interface WeekToday {
  /** Day of the season from 0 that the blocks belong to. */
  readonly dayIndex: number;
  readonly blocks: readonly {
    readonly blockId: string; readonly label: string; readonly startMinute: number; readonly minutes: number;
    /** The user leads it (H1.4.2): it is his unless he hands it to staff. */
    readonly mine: boolean; readonly done: boolean;
  }[];
  /** Minutes of blocks the user leads that are still to come this week. */
  readonly minutesLeftThisWeek: number;
  /** Blocks the user leads that "to game day" hands to staff (H1.1.3 confirmation). */
  readonly runsWithout: readonly { readonly blockId: string; readonly label: string; readonly dayIndex: number }[];
}

export interface CareerPort {
  today(): SeasonToday;
  /** The seat's week today, or null outside a game week (a bye, the season over). */
  week?(): WeekToday | null;
  /**
   * One H1.1.3 control: next block, end of the day, next decision, or game day. Like `advanceToGameDay`, a port
   * that plays the other games in workers returns a promise when the control first plays bye weeks.
   */
  advance?(target: AdvanceTarget, onProgress?: OnWeekProgress): void | Promise<void>;
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
  /**
   * The hubs' route sources from the season (lane A item 2: app-root/sources/<hub>.ts). `redraw` asks the root
   * to draw again after a screen's command changed the season's desk.
   */
  routeSources?(redraw: () => void): RouteSources;
  /** Player and team names for the play log (observed names only). */
  names(session: GameSession): { playerName(id: number): string; teamName(side: 0 | 1): string };
  /** Route sources of the hubs (app-root/sources), fed from the running season; none for a scripted season. */
  sources?(): Partial<RouteSources>;
  /** Calls `redraw` whenever a hub's state changes outside the season (an edit on a football screen); returns the unsubscribe. */
  subscribe?(redraw: () => void): () => void;
  /**
   * The generated world behind the career and the seat in it, when the career started from the new-game
   * picker; absent or null for a quick start (no world). The team screens read it through the observer.
   */
  seatWorld?(): SeatWorld | null;
}

/** The world the seat lives in, the seat's world team id, the user's person id, and the league rules file. */
export interface SeatWorld {
  readonly world: newgame.StartedWorld;
  readonly teamId: number;
  readonly userPersonId: number | null;
  readonly level: 'pro' | 'college';
  /** The league rules file the season was built from (roster limits, C5). */
  readonly leagueRules: { readonly values?: readonly { readonly key: string; readonly value: unknown; readonly factId?: string }[] } | undefined;
}
