// Playback state of one play (I9.1.2, I9.3.1, O2.3.4). The play is fully simulated before playback
// starts; playback only moves a time cursor through the stored ticks. It never touches the game
// clock or the play clock: those follow simulated time, so watching costs the user real seconds.
// The caller supplies display time (`advance(dtS)`); this module reads no clock.
import type { FilmFrames } from './format.ts';
import type { FilmEvent, PlaybackMode } from './types.ts';
import { param } from './params.ts';

/**
 * The film room's speeds (N1.1.1: quarter, half, full and double; starting values, Assumption). The one
 * table both the G-03 playback and the G-63 film transport read (PV-12).
 */
export const FILM_STUDY_SPEEDS = [0.25, 0.5, 1, 2] as const;

/** Speeds per mode (O2.3.4, O5.4.1): real time and double in games; slow speeds only in film and practice; the sideline replay at real speed only (I9.3.1). */
export const SPEEDS: Readonly<Record<PlaybackMode, readonly number[]>> = {
  live: [1, 2],
  replay: [1],
  film: FILM_STUDY_SPEEDS,
  practice: [0.5, 1, 2],
};

export class PlaybackRuleError extends Error {}

export interface PlaybackStill { readonly label: 'snap' | 'decisive' | 'whistle'; readonly tick: number }

/**
 * Time cursor in ticks. Each stored tick is shown for one tick period: positions run linearly from
 * one tick to the next, and the last tick holds for its period. So a play of N ticks plays for
 * N / ticksPerSecond / speed seconds (I9.1.2 acceptance).
 */
export class Playback {
  readonly mode: PlaybackMode;
  private cursor: number;
  private speedValue: number;
  private running: boolean;
  private done = false;
  private finishedListeners: (() => void)[] = [];

  constructor(private readonly frames: FilmFrames, private readonly ticksPerSecond: number, mode: PlaybackMode, speed = 1) {
    this.mode = mode;
    this.cursor = frames.firstTick;
    this.speedValue = 1;
    this.running = true;
    this.setSpeed(speed);
  }

  /** The tick time to draw: the cursor, held at the last tick during its final period. */
  get tick(): number { return Math.min(this.cursor, this.frames.firstTick + this.frames.tickCount - 1); }
  get speed(): number { return this.speedValue; }
  get playing(): boolean { return this.running && !this.done; }
  get finished(): boolean { return this.done; }
  /** Display seconds the whole play takes at the current speed. */
  get durationS(): number { return this.frames.tickCount / this.ticksPerSecond / this.speedValue; }
  private get endCursor(): number { return this.frames.firstTick + this.frames.tickCount; }

  onFinished(fn: () => void): void { this.finishedListeners.push(fn); }

  setSpeed(s: number): void {
    if (!SPEEDS[this.mode].includes(s)) throw new PlaybackRuleError(`speed ${s} is not offered in ${this.mode} playback (allowed: ${SPEEDS[this.mode].join(', ')})`);
    this.speedValue = s;
  }

  /** Moves the cursor by `dtS` display seconds. */
  advance(dtS: number): void {
    if (!this.playing || dtS <= 0) return;
    this.cursor += dtS * this.ticksPerSecond * this.speedValue;
    if (this.cursor >= this.endCursor) this.finish();
  }

  /** Pausing exists only where stepping does: film and practice (O2.3.4). */
  pause(): void { this.requireStudy('pause'); this.running = false; }
  play(): void {
    this.requireStudy('play');
    if (this.done) { this.done = false; this.cursor = this.frames.firstTick; }
    this.running = true;
  }

  /** Frame stepping, one tick at a time, film and practice only. */
  step(ticks: number): void {
    this.requireStudy('step');
    this.running = false;
    this.done = false;
    this.cursor = clamp(Math.round(this.tick) + ticks, this.frames.firstTick, this.endCursor - 1);
  }

  /** Scrubbing to any tick, film and practice only. */
  seek(tick: number): void {
    this.requireStudy('seek');
    this.done = false;
    this.cursor = clamp(tick, this.frames.firstTick, this.endCursor - 1);
  }

  /** Skip to the result (`S`): jumps to the whistle. Offered everywhere (I9.1.2). */
  skipToResult(): void { this.finish(); }

  /** Stops the sideline replay early with one key (I9.3.1). */
  stop(): void {
    if (this.mode !== 'replay') throw new PlaybackRuleError('only the sideline replay can be stopped early');
    this.finish();
  }

  private finish(): void {
    this.cursor = this.endCursor;
    if (this.done) return;
    this.done = true;
    for (const fn of this.finishedListeners) fn();
  }

  private requireStudy(what: string): void {
    if (this.mode !== 'film' && this.mode !== 'practice') throw new PlaybackRuleError(`${what} exists only in film and practice tools (O2.3.4: the play clock always runs in games)`);
  }
}

/**
 * The single sideline replay of the last play (I9.3.1): one per play, plus one more during a booth
 * review or a coach's challenge stoppage. Earlier plays are never replayable in the game.
 */
export class ReplayAllowance {
  private playId: string | null = null;
  private left = 0;

  /** Called when a new play finishes; earlier plays lose their replay. */
  newPlay(playId: string): void { this.playId = playId; this.left = param('replaysPerPlay'); }
  /** A review or challenge stoppage offers the replay once more (I9.3.1 edge case). */
  reviewStoppage(playId: string): void { if (playId === this.playId) this.left = Math.max(this.left, 1); }
  canReplay(playId: string): boolean { return playId === this.playId && this.left > 0; }
  /** Uses the replay and returns a real-speed playback, or throws when none is left. */
  take(playId: string, frames: FilmFrames, ticksPerSecond: number): Playback {
    if (!this.canReplay(playId)) throw new PlaybackRuleError(playId === this.playId ? 'the replay of this play has been used' : 'only the last play can be replayed during the game');
    this.left--;
    return new Playback(frames, ticksPerSecond, 'replay', 1);
  }
}

const DECISIVE_ORDER: readonly FilmEvent['kind'][] = ['catch', 'drop', 'fumble', 'tackle', 'outOfBounds', 'throw', 'kickLanding'];

/**
 * Reduced motion replaces playback with three stills: snap, decisive moment, whistle (O2.3.4,
 * O6.4.1). The decisive moment is the first event in DECISIVE_ORDER that the play has (Assumption,
 * design), or the middle tick when it has none.
 */
export function stills(frames: FilmFrames, events: readonly FilmEvent[]): PlaybackStill[] {
  const first = frames.firstTick, last = frames.firstTick + frames.tickCount - 1;
  const snap = events.find((e) => e.kind === 'snap')?.tick ?? clamp(0, first, last);
  const whistle = [...events].reverse().find((e) => e.kind === 'whistle')?.tick ?? last;
  let decisive: number | undefined;
  for (const k of DECISIVE_ORDER) { decisive = events.find((e) => e.kind === k)?.tick; if (decisive !== undefined) break; }
  return [
    { label: 'snap', tick: clamp(snap, first, last) },
    { label: 'decisive', tick: clamp(decisive ?? Math.round((snap + whistle) / 2), first, last) },
    { label: 'whistle', tick: clamp(whistle, first, last) },
  ];
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
