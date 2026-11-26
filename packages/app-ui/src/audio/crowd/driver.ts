// Crowd driver (PV-08; J12.6.1, B11, MB-6, MB-7, O5.3.2). Turns each play's presentation feed into
// the crowd bus: the bed and at most one reaction.
//
// Bed: its level equals the engine's `noise` for the play, so the sound is the noise meter (MB-6).
// The level eases only between plays: the ramp starts when the host hands over the next play and
// ends by the play's first cue, then holds through the play. The pre-snap swell on the visitor's
// third down is the noise value itself (`situationFactor`), never a script here. When a feed has no
// noise value (CR-PV00-1 not landed) the bed holds its last level: the driver never guesses one, and
// it never uses the venue's `noiseBase` as a crowd level.
//
// Reaction: one per play, picked from the rulings on the field (`reactions.ts`), started on the
// ruling's engine tick (MB-1) through the engine's ranked queue (a higher one cuts in, a lower one
// waits or is dropped). Pitch variety draws from the play's `cosmetic.audio` stream, handed in by the
// host; nothing here reads platform random or the wall clock (plan section 6).

import { CROWD_REACTION_RANK, RankedQueue, type AudioEngine, type BedHandle, type CrowdReaction, type PlayOutcome, type QueueDecision, type SoundRecipe } from '../engine/index.ts';
import { toSoundDefs } from '../recipes/index.ts';
import { pickReaction, type ReactionPick } from './reactions.ts';
import { CROWD_FEED_FORMAT, type CrowdFeed } from './types.ts';

/** Engine bed key for the crowd. */
export const CROWD_BED_KEY = 'crowd.bed';
/** Longest ease between two plays' levels, seconds (O5.3.2: eased between plays, no rubber band). */
export const BED_EASE_SECONDS = 1.5;
/** Shortest ramp, so a level change never clicks. */
const MIN_RAMP = 0.05;

export interface CrowdDriverOptions {
  /** Bed recipe; default the PV-07 `crowd.bed` recipe with its loudness trim. */
  bedRecipe?: SoundRecipe;
  /** Reaction order, highest first; default MB-7 (`CROWD_REACTION_RANK`). */
  rank?: readonly CrowdReaction[];
  /** Fade when the bed starts and stops, seconds. */
  fadeSeconds?: number;
}

export interface PlayTiming {
  /** Audio-clock time of the play's tick 0 (the snap or kick). The host's playback clock sets it. */
  tick0At: number;
  /** Draws in [0,1) from the play's `cosmetic.audio` stream (app-services `cosmeticFactory`). */
  audioDraw?: () => number;
}

export type ReactionReport =
  | { pick: ReactionPick; at: number; decision: QueueDecision<CrowdReaction>['action']; outcome: PlayOutcome | null }
  | null;

export interface CrowdPlayReport {
  playId: string;
  /** What happened to the bed: set to the play's noise, held (no noise value), or refused (unknown feed format). */
  bed: { action: 'set'; level: number; from: number; rampEndsAt: number } | { action: 'held'; level: number } | { action: 'refused' };
  reaction: ReactionReport;
}

interface Waiting { pick: ReactionPick; draw: number | undefined }

export class CrowdDriver {
  private bed: BedHandle | null = null;
  private level = 0;
  private readonly queue: RankedQueue<CrowdReaction>;
  private readonly waiting = new Map<string, Waiting>();
  private readonly bedRecipe: SoundRecipe;
  private readonly fade: number;

  constructor(private readonly engine: AudioEngine, opts: CrowdDriverOptions = {}) {
    this.queue = new RankedQueue(opts.rank ?? CROWD_REACTION_RANK);
    this.fade = opts.fadeSeconds ?? 1;
    const recipe = opts.bedRecipe ?? toSoundDefs().find((d) => d.id === CROWD_BED_KEY)?.recipe;
    if (!recipe) throw new Error('crowd driver: no crowd.bed recipe');
    this.bedRecipe = recipe;
  }

  /** Current bed level (0 to 1): the last play's noise, or 0 before any. */
  get bedLevel(): number { return this.level; }

  /** Starts the bed for a game. Silent until the first play with a noise value. */
  startGame(): void {
    this.level = 0;
    this.queue.clear();
    this.waiting.clear();
    this.bed = this.engine.startBed(CROWD_BED_KEY, { bus: 'crowd', recipe: this.bedRecipe }, 0, this.fade);
  }

  /** Stops the bed (leaving the game). Reactions already playing finish on their own. */
  endGame(): void {
    this.bed?.stop(this.fade);
    this.bed = null;
    this.queue.clear();
    this.waiting.clear();
  }

  /**
   * Hands over the next play, before its first cue. Sets the bed for the play and schedules its one
   * reaction on the ruling's tick.
   */
  play(feed: CrowdFeed, timing: PlayTiming): CrowdPlayReport {
    if (feed.formatVersion !== CROWD_FEED_FORMAT) return { playId: feed.playId, bed: { action: 'refused' }, reaction: null };
    if (!this.bed) this.startGame();
    const now = this.engine.ctx.currentTime;
    this.pump(now);
    const tps = feed.ticksPerSecond;
    const timeOf = (tick: number) => timing.tick0At + tick / tps;
    const firstAt = feed.cues.length ? Math.min(timing.tick0At, timeOf(feed.cues[0]!.tick)) : timing.tick0At;

    let bed: CrowdPlayReport['bed'];
    const noise = feed.conditions.noise;
    if (noise === null || !Number.isFinite(noise)) {
      bed = { action: 'held', level: this.level };
    } else {
      const from = this.level;
      this.level = Math.max(0, Math.min(1, noise));
      const ramp = Math.max(MIN_RAMP, Math.min(BED_EASE_SECONDS, firstAt - now));
      this.bed!.setLevel(this.level, ramp, now);
      bed = { action: 'set', level: this.level, from, rampEndsAt: now + ramp };
    }

    const pick = pickReaction(feed);
    if (!pick) return { playId: feed.playId, bed, reaction: null };
    const at = timeOf(pick.cue.tick);
    const draw = timing.audioDraw?.();
    const d = this.queue.offer({ kind: pick.kind, play: feed.playId, at, seconds: this.engine.recipeSeconds(pick.soundId) });
    let outcome: PlayOutcome | null = null;
    if (d.action === 'play' || d.action === 'cut') {
      // A cut lets the replaced swell finish under the new one: the engine has no stop for one-shots.
      if (d.action === 'cut') this.waiting.delete(d.replaced.play);
      outcome = this.sound(pick, at, draw);
    } else if (d.action === 'wait') {
      this.waiting.set(feed.playId, { pick, draw });
    }
    return { playId: feed.playId, bed, reaction: { pick, at, decision: d.action, outcome } };
  }

  /** Call as the audio clock moves (each frame, or each play). Starts a held reaction once the current one ends. */
  pump(t: number): PlayOutcome | null {
    const item = this.queue.pump(t);
    if (!item) {
      if (!this.queue.held) this.waiting.clear();
      return null;
    }
    const w = this.waiting.get(item.play);
    this.waiting.delete(item.play);
    return w ? this.sound(w.pick, item.at, w.draw) : null;
  }

  private sound(pick: ReactionPick, at: number, draw: number | undefined): PlayOutcome {
    return this.engine.play(pick.soundId, {
      when: at,
      ...(pick.fieldX !== undefined ? { fieldX: pick.fieldX } : {}),
      ...(draw !== undefined ? { variantDraw: draw } : {}),
    });
  }
}
