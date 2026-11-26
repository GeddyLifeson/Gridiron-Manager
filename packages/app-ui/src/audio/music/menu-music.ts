// Menu music (PV-11, MB-11): which loop plays where, and the rule that none plays during a game or
// in the film room. Plan rule 6: "No music during play. Music plays only in menus, the week and
// career screens." Menu music is behind `audio.menuMusicOn`, off by default until Marlon decides
// (plan section 9 item 4).
import { COMPOSITIONS, loopSeconds, type MusicTrackId } from './compositions.ts';

export type { MusicTrackId } from './compositions.ts';

export interface MenuTrack {
  id: MusicTrackId;
  title: string;
  /** Audio file rendered by MuseScore Studio from `assets/music/scores/<id>.musicxml`. */
  file: string;
  /** Loop point in seconds from the start (whole bars), so the render's tail never doubles up. */
  loopSeconds: number;
}

export const MUSIC_DIR = 'assets/music';

export const MENU_TRACKS: readonly MenuTrack[] = COMPOSITIONS.map((c) => ({
  id: c.id,
  title: c.title,
  file: `${MUSIC_DIR}/${c.id}.ogg`,
  loopSeconds: loopSeconds(c),
}));

/** Hubs where music never plays: the game itself and the film room. */
export const SILENT_HUBS: ReadonlySet<string> = new Set(['game', 'film']);

/** Hubs that use the career loop; every other menu hub uses the week hub loop. */
const CAREER_HUBS: ReadonlySet<string> = new Set(['coach', 'school']);

export interface MusicContext {
  /** Hub of the open screen, or `'title'` on the title screen before the shell loads. */
  hub: string;
  /** True from kickoff to the final whistle on game day: every screen, overlays included. */
  inGame: boolean;
  /** Calendar phase is the offseason (after the last game, before camp). */
  offseason: boolean;
  /** The `audio.menuMusicOn` setting. */
  enabled: boolean;
}

/** The loop for this place, or null for silence. */
export function menuTrackFor(ctx: MusicContext): MusicTrackId | null {
  if (!ctx.enabled || ctx.inGame || SILENT_HUBS.has(ctx.hub)) return null;
  if (ctx.hub === 'title') return 'title';
  if (CAREER_HUBS.has(ctx.hub)) return 'career';
  return ctx.offseason ? 'offseason' : 'weekHub';
}

/**
 * What menu music needs from the audio engine (PV-06). The engine plays on its `music` bus, so the
 * music volume and off switch apply. `play` with the track already playing does nothing.
 */
export interface MusicOutput {
  play(track: MenuTrack): void;
  stop(): void;
}

/** Follows the user around the menus and keeps the right loop playing, or none. */
export class MenuMusic {
  private current: MusicTrackId | null = null;
  constructor(private readonly out: MusicOutput, private readonly tracks: readonly MenuTrack[] = MENU_TRACKS) {}

  /** Call on every route change, setting change and game start or end. */
  update(ctx: MusicContext): MusicTrackId | null {
    const next = menuTrackFor(ctx);
    if (next === this.current) return next;
    if (next === null) this.out.stop();
    else this.out.play(this.tracks.find((t) => t.id === next)!);
    this.current = next;
    return next;
  }

  get playing(): MusicTrackId | null { return this.current; }
}
