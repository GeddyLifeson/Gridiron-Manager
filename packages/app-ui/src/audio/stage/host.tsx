// The shell side of the sound stage: building it in a browser or the desktop web view, keeping it in
// step with the settings store and the navigation state, and the captions strip view driven by it.
// The shell mounts `<SoundStageCaptions>` once, above the routed screen, so the strip shows on every
// screen (a game, the film room, the menus) without any screen knowing about it.

import { createElement, useEffect, useState, type ReactElement } from 'react';
import type { AssetLoader, AudioContextLike } from '../engine/index.ts';
import { CaptionStripView } from '../../presentation/captions/index.ts';
import type { CaptionLine } from '../../presentation/captions/index.ts';
import type { NavState } from '../../shell/navigation.ts';
import type { ScreenRecord } from '../../shell/registry.ts';
import { SoundStage, type SettingsGetter, type StagePlace } from './stage.ts';

/** Hubs whose screens are the game itself (menu music never plays there; `menuTrackFor` also checks). */
const GAME_HUB = 'game';

/** Where the user is, from the shell's navigation state and screen registry. */
export function placeFromNav(nav: NavState, screens: readonly ScreenRecord[], offseason = false): StagePlace {
  const screen = screens.find((s) => s.id === nav.location.screenId);
  const hub = screen?.hub ?? 'title';
  return { hub, inGame: nav.mode === 'gameday' || hub === GAME_HUB, offseason };
}

/** A settings getter over a values snapshot (`SettingsStore.all()`): unknown keys read as undefined. */
export function settingsGetter(values: Readonly<Record<string, unknown>>): SettingsGetter {
  return (key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined);
}

/** Loads asset files over HTTP relative to the page (the browser shell and the desktop web view both serve `assets/`). */
export function fetchAssetLoader(base = ''): AssetLoader {
  return {
    async load(path: string): Promise<ArrayBuffer> {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
      return res.arrayBuffer();
    },
  };
}

interface AudioWindow { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown }

/**
 * Builds the stage on the platform's Web Audio context, or returns null where there is none (tests,
 * headless runs): the app then runs silent, and the captions strip has nothing to show.
 */
export function createBrowserSoundStage(settings: SettingsGetter, opts: { loader?: AssetLoader } = {}): SoundStage | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor() as unknown as AudioContextLike;
  return new SoundStage({ ctx, settings, loader: opts.loader ?? fetchAssetLoader() });
}

/** Unlocks audio on the first click, tap or key (browser autoplay rule). Returns a function that removes the listeners. */
export function unlockOnFirstInput(stage: SoundStage, target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const off = (): void => { for (const e of events) target.removeEventListener(e, on, true); };
  const on = (): void => { off(); void stage.unlock(); };
  for (const e of events) target.addEventListener(e, on, true);
  return off;
}

function sameLines(a: readonly CaptionLine[], b: readonly CaptionLine[]): boolean {
  return a.length === b.length && a.every((l, i) => l.text === b[i]!.text && l.count === b[i]!.count && l.fromMs === b[i]!.fromMs);
}

export interface SoundStageCaptionsProps {
  stage: SoundStage | null;
  /** Frame scheduler; defaults to `requestAnimationFrame`. Tests pass their own. */
  schedule?: (fn: () => void) => () => void;
}

function rafSchedule(fn: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') { const id = setTimeout(fn, 50); return () => clearTimeout(id); }
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
}

/**
 * Runs the stage's frame loop (cues on their ticks) and shows the captions strip. Re-renders only when
 * the lines change. Mount once in the shell.
 */
export function SoundStageCaptions(props: SoundStageCaptionsProps): ReactElement | null {
  const { stage } = props;
  const schedule = props.schedule ?? rafSchedule;
  const [lines, setLines] = useState<readonly CaptionLine[]>([]);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!stage) return;
    let cancel = (): void => {};
    let live = true;
    const step = (): void => {
      if (!live) return;
      stage.frame();
      const next = stage.captionLines();
      setLines((prev) => (sameLines(prev, next) ? prev : next));
      setShown(stage.captionsShown);
      cancel = schedule(step);
    };
    step();
    return () => { live = false; cancel(); };
  }, [stage, schedule]);
  if (!stage) return null;
  return createElement(CaptionStripView, { lines, visible: shown });
}

/**
 * Keeps a stage in step with the app: settings changes, screen changes, and leaving. Pass the settings
 * snapshot and the place each render; the hook applies only what changed.
 */
export function useSoundStageSync(stage: SoundStage | null, values: Readonly<Record<string, unknown>>, place: StagePlace): void {
  useEffect(() => { stage?.applySettings(settingsGetter(values)); }, [stage, values]);
  useEffect(() => { stage?.setPlace(place); }, [stage, place.hub, place.inGame, place.offseason]);
  useEffect(() => {
    if (!stage) return;
    const off = unlockOnFirstInput(stage);
    return () => { off(); stage.dispose(); };
  }, [stage]);
}
