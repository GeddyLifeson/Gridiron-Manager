// Event cues (I9.1.2, O2.3.4, O6.4.1). Every cue comes from one event in the play's event list, at
// that event's tick and spot; nothing else makes a cue. A cue lasts `cueSeconds` of playback at real
// speed, so it lasts the same number of ticks at any speed (double speed halves it on screen).
import { param } from './params.ts';
import type { FilmEvent, FilmEventKind } from './types.ts';

export type CueShape = 'passLine' | 'ring' | 'cross' | 'flash' | 'flag' | 'whistle' | 'boundary';

/** Event kind to the cue drawn for it. `snap` and `kickLanding` draw nothing (the snap is the motion starting; the landing spot only frames the camera). */
export const CUE_FOR: Readonly<Record<FilmEventKind, CueShape | null>> = {
  snap: null,
  throw: 'passLine',
  catch: 'ring',
  drop: 'ring',
  tackle: 'cross',
  fumble: 'flash',
  flag: 'flag',
  whistle: 'whistle',
  outOfBounds: 'boundary',
  kickLanding: null,
};

export interface Cue {
  readonly shape: CueShape;
  readonly event: FilmEvent;
  readonly fromTick: number;
  readonly toTick: number;
}

/** Builds the cue list once per play, sorted by start tick. */
export function buildCues(events: readonly FilmEvent[], ticksPerSecond: number): Cue[] {
  const len = param('cueSeconds') * ticksPerSecond;
  const out: Cue[] = [];
  for (const e of events) {
    const shape = CUE_FOR[e.kind];
    if (shape) out.push({ shape, event: e, fromTick: e.tick, toTick: e.tick + len });
  }
  return out.sort((a, b) => a.fromTick - b.fromTick);
}

/** Cues showing at tick time `t`. Writes into `out` and returns how many. */
export function activeCues(cues: readonly Cue[], t: number, out: Cue[]): number {
  let n = 0;
  for (const c of cues) {
    if (c.fromTick > t) break;
    if (t < c.toTick) out[n++] = c;
  }
  return n;
}

/** Display seconds a cue stays on screen at a playback speed. */
export function cueDisplaySeconds(speed: number): number {
  return param('cueSeconds') / speed;
}
