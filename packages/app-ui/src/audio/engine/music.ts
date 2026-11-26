// Music output for menu music (PV-11). Matches `MusicOutput` in packages/app-ui/src/audio/music/
// menu-music.ts: plays a looping rendered file on the `music` bus, loop end at whole bars
// (`loopSeconds`) so the render's tail is cut, with a short fade on stop or switch. The `music` bus
// volume and off switch apply. A missing file is silence: music carries no football information.
import { DEFAULT_FADE_SECONDS, type AudioEngine } from './engine.ts';

/** Same shape as PV-11's MenuTrack (structural, so neither package imports the other). */
export interface MusicTrackLike { id: string; title: string; file: string; loopSeconds: number }

export interface MusicOutputLike {
  play(track: MusicTrackLike): void;
  stop(): void;
}

export const MUSIC_BED_KEY = 'music';

export function createMusicOutput(engine: AudioEngine, fadeSeconds = DEFAULT_FADE_SECONDS): MusicOutputLike & { readonly current: string | null } {
  let current: string | null = null;
  return {
    get current() { return current; },
    play(track) {
      if (current === track.id) return;
      // Files load lazily: the first play of a track may be silent until the decode lands, then it starts.
      const start = (): void => {
        engine.startBed(MUSIC_BED_KEY, { bus: 'music', file: track.file, loopSeconds: track.loopSeconds }, 1, fadeSeconds);
      };
      current = track.id;
      start();
      void engine.preload([track.file]).then((r) => {
        if (current === track.id && r.loaded.includes(track.file) && engine.bed(MUSIC_BED_KEY)?.source === 'none') start();
      });
    },
    stop() {
      current = null;
      engine.bed(MUSIC_BED_KEY)?.stop(fadeSeconds);
    },
  };
}
