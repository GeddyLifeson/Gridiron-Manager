// Playback settings (G-98: O5.4.1, I9.1.2, I9.2.1, I9.2.2). These choose what is SHOWN while no
// decision is the user's: which plays are drawn, how fast, and how long dead time lasts on screen.
// They never touch a simulated clock. Every function here takes the engine's finished play as input
// and returns only screen time; nothing flows back into the game. The play clock for the next snap
// starts at the simulated whistle, so time spent watching is the user's own decision time (I9.1.2).
import { settings } from '@gm/app-services';

export type WatchOption = 'every-play' | 'own-plays' | 'key-plays' | 'results-only';
export type SpeedOption = 'normal' | 'fast' | 'faster';
export type CompressionOption = 'real' | 'short' | 'instant';

/** A finished play as the presentation layer sees it (from the game read model). */
export interface PresentedPlay {
  id: string;
  /** The user's own unit was on the field (O5.4.1 "own plays"). */
  usersUnit: boolean;
  /** Live-action length of the play in simulated seconds (snap to whistle). */
  liveSeconds: number;
  /** Simulated dead time after the whistle until the next decision or snap. */
  deadSeconds: number;
  /** A decision of the user's is open during the dead time (a call, a prompt, a stoppage slot). */
  decisionOpen: boolean;
  scoring?: boolean;
  turnover?: boolean;
  gainYards?: number;
  sack?: boolean;
  foul?: boolean;
  review?: boolean;
  /** Third or fourth down, or a try after a touchdown. */
  moneyDown?: boolean;
  /** Score after the play, carried through untouched. */
  score: { home: number; away: number };
}

export interface PlaybackPrefs {
  watch: WatchOption;
  speed: SpeedOption;
  compression: CompressionOption;
  reducedMotion: boolean;
  certified: boolean;
}

/**
 * Key play rule (O5.4.1 "key plays only"). The bible names the option but not its contents, so these
 * are Assumption (design choice): scores, turnovers, sacks, fouls, reviews, gains of 20 yards or more,
 * and every third down, fourth down and try. 20 yards is the common "explosive pass" line; it is a
 * presentation threshold, not a football rule, and changes nothing simulated.
 */
export const KEY_PLAY = { gainYards: 20, basis: 'assumption' } as const;

export function isKeyPlay(p: PresentedPlay): boolean {
  return !!(p.scoring || p.turnover || p.sack || p.foul || p.review || p.moneyDown || (p.gainYards ?? 0) >= KEY_PLAY.gainYards);
}

/**
 * Playback speed multipliers. I9.2.1 offers real time and double speed only, and rules out
 * half speed in games. The G-04 schema's third option `faster` has no bible basis, so it plays at
 * double speed until the schema drops it (integrator request CR-G98-2).
 */
export const SPEED_FACTOR: Readonly<Record<SpeedOption, number>> = { normal: 1, fast: 2, faster: 2 };

/**
 * Dead time on screen when nothing needs the user, in seconds. Real shows the simulated length;
 * instant shows none. Short caps it at SHORT_DEAD_SECONDS (Assumption, design tuning, no bible
 * value). Certified careers use the fixed rule of N4 audit item U11; N4 does not yet state it, so
 * CERTIFIED_COMPRESSION stands in (open question for the N4 owner).
 */
export const SHORT_DEAD_SECONDS = 5;
export const CERTIFIED_COMPRESSION: CompressionOption = 'short';

export function deadTimeOnScreen(p: Pick<PresentedPlay, 'deadSeconds' | 'decisionOpen'>, compression: CompressionOption, certified = false): number {
  // Compression never shortens a period in which the user has a decision open (O5.4.1): that time
  // is his decision time and runs in real time.
  if (p.decisionOpen) return p.deadSeconds;
  const mode = certified ? CERTIFIED_COMPRESSION : compression;
  if (mode === 'instant') return 0;
  if (mode === 'short') return Math.min(p.deadSeconds, SHORT_DEAD_SECONDS);
  return p.deadSeconds;
}

export type ShowMode = 'playback' | 'stills' | 'result';

export interface PlayPresentation {
  id: string;
  show: ShowMode;
  /** Real seconds the play's picture is on screen. */
  playSeconds: number;
  /** Real seconds of dead time on screen after it. */
  deadSeconds: number;
  /** Score carried through from the engine, never computed here. */
  score: { home: number; away: number };
}

/** Whether the play is drawn under the watch option. */
export function watches(p: PresentedPlay, watch: WatchOption): boolean {
  switch (watch) {
    case 'every-play': return true;
    case 'own-plays': return p.usersUnit;
    case 'key-plays': return isKeyPlay(p);
    case 'results-only': return false;
  }
}

/** Seconds a still frame set is shown under reduced motion (Assumption: one second, a design choice). */
export const STILLS_SECONDS = 1;

export function presentPlay(p: PresentedPlay, prefs: PlaybackPrefs): PlayPresentation {
  const drawn = watches(p, prefs.watch);
  const show: ShowMode = !drawn ? 'result' : prefs.reducedMotion ? 'stills' : 'playback';
  const playSeconds = show === 'playback' ? p.liveSeconds / SPEED_FACTOR[prefs.speed] : show === 'stills' ? STILLS_SECONDS : 0;
  return { id: p.id, show, playSeconds, deadSeconds: deadTimeOnScreen(p, prefs.compression, prefs.certified), score: { ...p.score } };
}

export interface GamePresentation { plays: PlayPresentation[]; screenSeconds: number; finalScore: { home: number; away: number } }

/** The whole game's screen timeline. The final score is the engine's last score, whatever the options. */
export function presentGame(plays: readonly PresentedPlay[], prefs: PlaybackPrefs): GamePresentation {
  const out = plays.map((p) => presentPlay(p, prefs));
  const screenSeconds = out.reduce((s, x) => s + x.playSeconds + x.deadSeconds, 0);
  const last = plays.at(-1)?.score ?? { home: 0, away: 0 };
  return { plays: out, screenSeconds, finalScore: { ...last } };
}

/** Reads playback preferences from the settings values (the O5.3 store). */
export function playbackPrefs(values: Record<string, settings.SettingValue>): PlaybackPrefs {
  return {
    watch: (values['playback.watch'] ?? 'every-play') as WatchOption,
    speed: (values['playback.speed'] ?? 'normal') as SpeedOption,
    compression: (values['playback.stoppageCompression'] ?? 'real') as CompressionOption,
    reducedMotion: values['accessibility.reducedMotion'] === true,
    certified: values['gameplay.certified'] === true,
  };
}
