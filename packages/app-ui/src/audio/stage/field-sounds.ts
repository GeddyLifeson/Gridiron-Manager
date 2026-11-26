// Field sounds for the sound stage: the PV-00 feed cues that are not the crowd's (PV-08) or the
// cadence's (PV-09) turned into PV-07 recipe ids and played on their engine ticks (MB-1). The ball,
// the snap, the whistle, contact by tier (the tier comes from the feed, never derived here) and the
// referee's mic tone when a ruling is a penalty or a review. The PV-02 cue table says which feed
// cues carry a sound; a test checks this table against it so the two cannot drift.

import type { PlayOutcome, PlayOptions } from '../engine/index.ts';
import { contactSoundId } from '../recipes/index.ts';
import type { TickClock } from '../cadence/index.ts';

/** Camera cue kind to recipe id. Kinds missing here make no sound (throw, tackle, fumble, flag, out of bounds, kick landing). */
export const CAMERA_CUE_SOUND: Readonly<Record<string, string>> = {
  snap: 'contact.snap',
  catch: 'contact.ball.catch',
  drop: 'contact.ball.drop',
  whistle: 'officials.whistle.deadBall',
  // PV-00 kinds added for the kick and the upright (cue table rows `kick` and `post_hit`).
  kick: 'contact.ball.kickFoot',
  postHit: 'contact.ball.postHit',
};

/** Rulings whose cue-table row carries the referee mic tone (the crowd half of the row is PV-08's). */
export const RULING_STINGER: Readonly<Record<string, string>> = {
  penalty: 'officials.micTone',
  review_upheld: 'officials.micTone',
  review_reversed: 'officials.micTone',
};

/** The parts of a feed cue this file reads. */
export interface FieldCueLike {
  readonly kind: string;
  readonly seq: number;
  readonly tick: number;
  readonly x?: number;
  readonly tier?: number;
  readonly ruling?: string;
}

export interface FieldFeedLike {
  readonly playId: string;
  readonly cues: readonly FieldCueLike[];
}

export interface FieldPlanItem {
  readonly playId: string;
  readonly seq: number;
  readonly tick: number;
  readonly kind: string;
  readonly soundId: string;
  /** Field x in yards for the pan; absent for the mic tone (it comes from the PA, centred). */
  readonly fieldX?: number;
}

export interface FieldEvent extends FieldPlanItem {
  readonly at: number;
  readonly outcome: PlayOutcome;
}

/** The recipe id a cue plays, or null when the cue is silent. */
export function fieldSoundFor(cue: FieldCueLike): string | null {
  if (cue.kind === 'contact') return typeof cue.tier === 'number' ? contactSoundId(cue.tier) : null;
  if (cue.kind === 'ruling') return (cue.ruling && RULING_STINGER[cue.ruling]) || null;
  if (cue.kind === 'cadence' || cue.kind === 'relay') return null; // PV-09
  return CAMERA_CUE_SOUND[cue.kind] ?? null;
}

/** Pure: the field sounds of one play, in tick order. */
export function planFieldSounds(feed: FieldFeedLike): FieldPlanItem[] {
  const out: FieldPlanItem[] = [];
  for (const cue of feed.cues) {
    const soundId = fieldSoundFor(cue);
    if (soundId === null) continue;
    const pan = cue.kind !== 'ruling' && typeof cue.x === 'number';
    out.push({ playId: feed.playId, seq: cue.seq, tick: cue.tick, kind: cue.kind, soundId, ...(pan ? { fieldX: cue.x } : {}) });
  }
  return out.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
}

export interface FieldEngineLike { play(id: string, opts?: PlayOptions): PlayOutcome }

/** Plays a play's field sounds as the audio clock reaches them (same look-ahead model as PV-09). */
export class FieldSoundDriver {
  private playId: string | null = null;
  private plan: FieldPlanItem[] = [];
  private next = 0;

  constructor(private readonly engine: FieldEngineLike, private readonly lookahead = 0.2) {}

  update(feed: FieldFeedLike, timeOfTick: TickClock, now: number, draw?: () => number): FieldEvent[] {
    if (feed.playId !== this.playId) {
      this.plan = planFieldSounds(feed);
      this.playId = feed.playId;
      this.next = 0;
    }
    const out: FieldEvent[] = [];
    while (this.next < this.plan.length) {
      const item = this.plan[this.next]!;
      const at = timeOfTick(item.tick);
      if (at > now + this.lookahead) break;
      this.next++;
      const variantDraw = draw?.();
      const opts: PlayOptions = { when: at, ...(item.fieldX !== undefined ? { fieldX: item.fieldX } : {}), ...(variantDraw !== undefined ? { variantDraw } : {}) };
      out.push({ ...item, at, outcome: this.engine.play(item.soundId, opts) });
    }
    return out;
  }

  reset(): void { this.playId = null; this.plan = []; this.next = 0; }
}
