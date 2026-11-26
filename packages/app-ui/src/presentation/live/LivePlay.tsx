// Live play on the game screen (I9.1, O2.3.4): the field view plays each play as it happens, and the
// same moment hands the play's PV-00 feed to the sound stage, so the snap, the hits, the whistle, the
// crowd and the captions land on the ticks the markers show. The console mounts it in its field
// region through `gameCallingRoutes`' `field()` slot; nothing else on the console changes.
//
// The field view starts its playback at the play's first trajectory tick on its first frame after
// mounting. The stage is handed the play at that moment with tick 0 (the snap or kick) placed
// `-firstTick / ticksPerSecond / speed` seconds later on the audio clock. Film replays (R) and film
// study never reach the stage: only a new live play does, once.

import { createElement, useEffect, useRef, type ReactElement } from 'react';
import { FieldView, type FieldViewProps } from '../../field-view/FieldView.tsx';
import type { FieldContact, FilmPlay } from '../../field-view/index.ts';
import type { SoundStage, StageFeed } from '../../audio/stage/index.ts';

/** One live play: the app-services `LivePlay` fits (`presentationLive.livePlay`). */
export interface LivePlayLike {
  readonly playId: string;
  readonly film: FilmPlay;
  readonly feed: StageFeed & { readonly conditions: { readonly windDirDeg: number } };
}

interface LooseCue { readonly kind: string; readonly tick: number; readonly x?: number; readonly y?: number; readonly tier?: number; readonly slots?: readonly number[] }

/** Audio-clock time of tick 0 when playback starts now at the trajectory's first tick. */
export function tick0At(now: number, firstTick: number, ticksPerSecond: number, speed = 1): number {
  return now + Math.max(0, -firstTick) / ticksPerSecond / speed;
}

/** The feed's tiered contact cues for the field view (left out when the engine sent none). */
export function contactsOf(feed: LivePlayLike['feed']): FieldContact[] | undefined {
  if (feed.missing.includes('contactTier')) return undefined;
  return (feed.cues as readonly LooseCue[])
    .filter((c) => c.kind === 'contact' && typeof c.tier === 'number')
    .map((c) => ({ kind: 'contact' as const, tick: c.tick, x: c.x ?? 0, y: c.y ?? 0, tier: c.tier as FieldContact['tier'], slots: c.slots ?? [] }));
}

/**
 * Hands a live play to the sound stage as its playback starts now. At double speed the feed's tick
 * rate is doubled so every cue still lands on the tick the markers show.
 */
export function handOver(stage: SoundStage, play: LivePlayLike, speed = 1, draw?: () => number): ReturnType<SoundStage['play']> {
  const feed = speed === 1 ? play.feed : { ...play.feed, ticksPerSecond: play.feed.ticksPerSecond * speed };
  const at = tick0At(stage.engine.ctx.currentTime, play.film.trajectory.firstTick, play.film.ticksPerSecond, speed);
  return stage.play(feed, { tick0At: at, ...(draw ? { audioDraw: draw } : {}) });
}

export type LivePlayProps = Omit<FieldViewProps, 'play' | 'mode' | 'weather' | 'contacts'> & {
  readonly play: LivePlayLike | null;
  readonly stage: SoundStage | null;
  /** The play's `cosmetic.audio` draws (app-services `cosmeticFactory`), for pitch variety. */
  readonly audioDraw?: (playId: string) => () => number;
  /** Shown before the first play. */
  readonly waiting?: string;
};

export function LivePlay(props: LivePlayProps): ReactElement {
  const { play, stage, audioDraw, waiting, ...view } = props;
  const handed = useRef<string | null>(null);
  useEffect(() => {
    if (!play || !stage || handed.current === play.playId) return;
    handed.current = play.playId;
    handOver(stage, play, view.speed ?? 1, audioDraw?.(play.playId));
  }, [play, stage]);
  if (!play) return createElement('div', { 'data-live-play': 'waiting' }, waiting ?? '');
  const c = play.feed.conditions;
  const contacts = contactsOf(play.feed);
  return createElement(FieldView, {
    ...view,
    key: play.playId,
    play: play.film,
    mode: 'live',
    weather: { precip: c.precip, windMph: c.windMph, windDirDeg: c.windDirDeg, roof: c.roof },
    ...(contacts ? { contacts } : {}),
  });
}
