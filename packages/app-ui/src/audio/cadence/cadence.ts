// Cadence and call relay audio (PV-09; plans/presentation-build-plan.md sections 4.2 and 8; J5.1.3,
// J5.6.1, I2.4.1, O5.3.2). Turns the PV-00 feed's `cadence` and `relay` cues into PV-07 recipe sounds
// on the PV-06 engine, each on the audio-clock time of its engine tick (plan rule 3, MB-1).
//
// What it does and does not decide:
//  - When: never. A cue sounds at `timeOfTick(cue.tick)`. Nothing is moved, stretched or queued for
//    drama. A cue that comes due more than the engine's late limit behind the clock is dropped by the
//    engine, never played late.
//  - A silent count makes no sound (no request at all), but it is still reported with its caption so
//    the captions strip and the console pip can name it (cue table row `cadence_silent`).
//  - Crowd masking: none here. On the road under high `noise` the crowd bed (PV-08) is loud and the
//    count is buried by the mix. This file never reads `noise`; a test holds it to that.
//  - Relay tones belong to the user's own sideline: the call reaching (or not reaching) the huddle is
//    what the caller hears on the headset. The other team's relay is not something a sideline coach
//    can hear, so it makes no sound and is reported `not-users-relay`. When the user is only watching
//    (no user side) no relay sounds.
//  - Pan: the cue table marks cadence and relay sounds `pan: false`, so they are centred.
//  - Pitch variants draw from `cosmetic.audio` (plan section 6) through the injected `draw`; one draw
//    per audible cue in cue order, whatever the bus settings, so a replayed play sounds the same.
//
// Feed types are structural copies of the PV-00 shapes (app-ui reads app-services only through its
// public entry; the feed barrel line is CR-PV00-6, the integrator's).

import type { PlayOutcome, PlayOptions } from '../engine/types.ts';
import { cadenceSoundId, relaySoundId } from '../recipes/index.ts';
import { cueRow, cueRowId } from '../../presentation/cues/cue-table.ts';

/** PV-00 feed format this driver reads. A feed of another version is refused. */
export const CADENCE_FEED_VERSION = 1;

/** How far ahead of the audio clock `update` schedules a due cue, in seconds (standard Web Audio look-ahead). */
export const DEFAULT_LOOKAHEAD_SECONDS = 0.2;

export type FeedSideLike = 0 | 1;

export interface CadenceCueLike { readonly kind: 'cadence'; readonly seq: number; readonly tick: number; readonly side: FeedSideLike; readonly count: 'voiced' | 'hard' | 'silent' }
export interface RelayCueLike { readonly kind: 'relay'; readonly seq: number; readonly tick: number; readonly side: FeedSideLike; readonly outcome: 'clean' | 'garbled' }
/** Any other cue kind in the feed; ignored here. */
export interface OtherCueLike { readonly kind: string; readonly seq: number; readonly tick: number }

/** The parts of a PV-00 `PresentationFeed` this driver reads. */
export interface CadenceFeedLike {
  readonly formatVersion: number;
  readonly visibility: 'user-visible';
  readonly playId: string;
  readonly ticksPerSecond: number;
  readonly perspective: { readonly homeSide: 0; readonly userSide: FeedSideLike | null };
  readonly cues: readonly (CadenceCueLike | RelayCueLike | OtherCueLike)[];
  readonly missing: readonly string[];
}

/** What the driver needs from the PV-06 engine. `AudioEngine` fits. */
export interface CadenceEngineLike { play(id: string, opts?: PlayOptions): PlayOutcome }

/** One cadence or relay cue, resolved to a sound (or to a reason for none). Pure data. */
export interface CadencePlanItem {
  readonly playId: string;
  readonly seq: number;
  readonly tick: number;
  readonly kind: 'cadence' | 'relay';
  /** The count (voiced, hard, silent) or the relay outcome (clean, garbled). */
  readonly detail: 'voiced' | 'hard' | 'silent' | 'clean' | 'garbled';
  readonly side: FeedSideLike;
  /** PV-07 recipe id, or null when the cue makes no sound. */
  readonly soundId: string | null;
  /** Why no sound, when `soundId` is null. */
  readonly silentReason?: 'silent-count' | 'not-users-relay';
  /** Captions strip text, from the PV-02 cue table (also for a silent count). */
  readonly caption: string;
}

export type CadenceOutcome = PlayOutcome | { played: false; reason: 'silent-count' | 'not-users-relay' };

/** A cue the driver has handled: the plan item, the audio time it was due and what happened. */
export interface CadenceEvent extends CadencePlanItem {
  /** Audio-clock seconds of the cue's engine tick. */
  readonly at: number;
  readonly outcome: CadenceOutcome;
}

/** Maps a trajectory tick to the audio-clock time it plays at (the playback layer owns this). */
export type TickClock = (tick: number) => number;

/** A clock for the usual case: tick 0 (the snap) plays at `snapAt`, ticks run at the feed's rate. */
export function linearTickClock(snapAt: number, ticksPerSecond: number): TickClock {
  if (!(ticksPerSecond > 0)) throw new Error(`ticksPerSecond must be positive, got ${ticksPerSecond}`);
  return (tick) => snapAt + tick / ticksPerSecond;
}

function captionFor(kind: 'cadence' | 'relay', detail: string): string {
  const row = cueRow(cueRowId(kind, detail));
  if (!row) throw new Error(`cue table has no row for ${kind} ${detail}`);
  const caption = row.sounds[0]?.caption ?? row.caption;
  if (!caption) throw new Error(`cue table row ${row.id} has no caption`);
  return caption;
}

function checkFeed(feed: CadenceFeedLike): void {
  if (feed.formatVersion !== CADENCE_FEED_VERSION) throw new Error(`cadence driver reads feed format ${CADENCE_FEED_VERSION}, got ${feed.formatVersion}`);
  if (feed.visibility !== 'user-visible') throw new Error('cadence driver refuses a feed that is not user-visible (I9.3.2)');
}

/**
 * The cadence and relay cues of one play, in feed order, each resolved to a sound id and caption.
 * Pure: reads only the cues and the perspective. It never reads `conditions` (so never `noise`).
 */
export function planCadence(feed: CadenceFeedLike): CadencePlanItem[] {
  checkFeed(feed);
  const out: CadencePlanItem[] = [];
  for (const cue of feed.cues) {
    const base = { playId: feed.playId, seq: cue.seq, tick: cue.tick };
    if (cue.kind === 'cadence') {
      const c = cue as CadenceCueLike;
      const soundId = cadenceSoundId(c.count);
      out.push({ ...base, kind: 'cadence', detail: c.count, side: c.side, soundId, caption: captionFor('cadence', c.count), ...(soundId === null ? { silentReason: 'silent-count' as const } : {}) });
    } else if (cue.kind === 'relay') {
      const r = cue as RelayCueLike;
      const ours = feed.perspective.userSide !== null && r.side === feed.perspective.userSide;
      out.push({ ...base, kind: 'relay', detail: r.outcome, side: r.side, soundId: ours ? relaySoundId(r.outcome) : null, caption: captionFor('relay', r.outcome), ...(ours ? {} : { silentReason: 'not-users-relay' as const }) });
    }
  }
  return out;
}

export interface CadenceDriverOptions {
  engine: CadenceEngineLike;
  /** A `cosmetic.audio` draw in [0, 1) for pitch variants. Without it the first variant plays. */
  draw?: () => number;
  /** Seconds ahead of `now` a due cue is scheduled. Default 0.2. */
  lookaheadSeconds?: number;
}

/**
 * Plays a play's cadence and relay cues on their ticks. Call `update` from the playback loop with the
 * current feed, its tick clock and the audio clock's `now`; each cue is handled once (keyed by play id
 * and seq), when its time is within the look-ahead. A new play id starts fresh.
 */
export class CadenceDriver {
  private readonly engine: CadenceEngineLike;
  private readonly draw?: () => number;
  private readonly lookahead: number;
  private playId: string | null = null;
  private plan: CadencePlanItem[] = [];
  private next = 0;

  constructor(opts: CadenceDriverOptions) {
    this.engine = opts.engine;
    this.draw = opts.draw;
    this.lookahead = opts.lookaheadSeconds ?? DEFAULT_LOOKAHEAD_SECONDS;
    if (!(this.lookahead >= 0)) throw new Error(`lookaheadSeconds must be 0 or more, got ${this.lookahead}`);
  }

  /** Sources the current feed lacks that this driver reads (`cadence`, `relay`): nothing is guessed for them. */
  missing(feed: CadenceFeedLike): string[] { return feed.missing.filter((m) => m === 'cadence' || m === 'relay'); }

  /** Handles every not-yet-handled cue due by `now + lookahead`; returns the cues handled this call. */
  update(feed: CadenceFeedLike, timeOfTick: TickClock, now: number): CadenceEvent[] {
    if (feed.playId !== this.playId) {
      this.plan = planCadence(feed).sort((a, b) => a.tick - b.tick || a.seq - b.seq);
      this.playId = feed.playId;
      this.next = 0;
    }
    const out: CadenceEvent[] = [];
    while (this.next < this.plan.length) {
      const item = this.plan[this.next]!;
      const at = timeOfTick(item.tick);
      if (at > now + this.lookahead) break;
      this.next++;
      out.push({ ...item, at, outcome: this.sound(item, at) });
    }
    return out;
  }

  /** Forget the current play (e.g. playback jumped); the next `update` replans. */
  reset(): void { this.playId = null; this.plan = []; this.next = 0; }

  private sound(item: CadencePlanItem, at: number): CadenceOutcome {
    if (item.soundId === null) return { played: false, reason: item.silentReason! };
    const variantDraw = this.draw?.();
    return this.engine.play(item.soundId, variantDraw === undefined ? { when: at } : { when: at, variantDraw });
  }
}
