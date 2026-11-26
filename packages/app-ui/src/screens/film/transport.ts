// Film transport (N1.1.1, O2.6.1): the clicker. Speeds a quarter to double real time (keys 1 to 4),
// one-tick steps both ways, jumps between event markers, loop from snap to whistle, rewind to the snap,
// and moving through the plays of a cut-up. It moves a cursor over stored ticks; it never simulates.
import { FILM_MOVE_MODES, FILM_STUDY_SPEEDS, type FilmFrames } from '../../field-view/index.ts';
import type { FilmEventLike } from './types.ts';

/** One speed table with the G-03 playback (PV-12): the film transport reads `SPEEDS.film`'s source. */
export const FILM_SPEEDS = FILM_STUDY_SPEEDS;
export type FilmSpeed = (typeof FILM_SPEEDS)[number];

export type MarkerKind = 'snap' | 'contact' | 'throw' | 'catch' | 'whistle';
export interface Marker { readonly kind: MarkerKind; readonly tick: number }

const ENGAGED = FILM_MOVE_MODES.indexOf('engaged');

/**
 * Jump markers (N1.1.1): snap, first contact at the line (first engaged move mode after the snap, read
 * from film), throw or handoff, catch or first touch, whistle. Missing ones are left out.
 */
export function markers(frames: FilmFrames, events: readonly FilmEventLike[]): Marker[] {
  const out: Marker[] = [];
  const at = (k: FilmEventLike['kind']) => events.find((e) => e.kind === k)?.tick;
  const snap = at('snap');
  if (snap !== undefined) out.push({ kind: 'snap', tick: snap });
  const from = Math.max(0, (snap ?? frames.firstTick) - frames.firstTick);
  outer: for (let i = from; i < frames.tickCount; i++) {
    for (let s = 0; s < frames.slotCount; s++) if (frames.state[i * frames.slotCount + s] === ENGAGED) { out.push({ kind: 'contact', tick: frames.firstTick + i }); break outer; }
  }
  const thr = at('throw');
  if (thr !== undefined) out.push({ kind: 'throw', tick: thr });
  const touch = at('catch') ?? at('drop');
  if (touch !== undefined) out.push({ kind: 'catch', tick: touch });
  const wh = [...events].reverse().find((e) => e.kind === 'whistle')?.tick;
  if (wh !== undefined) out.push({ kind: 'whistle', tick: wh });
  return out.sort((a, b) => a.tick - b.tick);
}

export class FilmTransport {
  private cursor: number;
  private speedValue: FilmSpeed = 1;
  private running = false;
  loop = false;
  readonly markers: readonly Marker[];

  constructor(private readonly frames: FilmFrames, private readonly ticksPerSecond: number, events: readonly FilmEventLike[]) {
    this.markers = markers(frames, events);
    this.cursor = frames.firstTick;
  }

  get first(): number { return this.frames.firstTick; }
  get last(): number { return this.frames.firstTick + this.frames.tickCount - 1; }
  /** Tick time to draw (fractional while playing, whole after a step). */
  get tick(): number { return this.cursor; }
  get speed(): FilmSpeed { return this.speedValue; }
  get playing(): boolean { return this.running; }
  private get snapTick(): number { return this.markers.find((m) => m.kind === 'snap')?.tick ?? this.first; }
  private get whistleTick(): number { return this.markers.find((m) => m.kind === 'whistle')?.tick ?? this.last; }

  setSpeed(s: number): void {
    if (!(FILM_SPEEDS as readonly number[]).includes(s)) throw new Error(`film speed ${s} is not offered (${FILM_SPEEDS.join(', ')})`);
    this.speedValue = s as FilmSpeed;
  }
  /** Keys 1 to 4 (O2.6.1). */
  speedKey(n: 1 | 2 | 3 | 4): void { this.setSpeed(FILM_SPEEDS[n - 1]!); }

  toggle(): void { if (this.running) this.running = false; else { if (this.cursor >= this.last) this.cursor = this.first; this.running = true; } }
  pause(): void { this.running = false; }

  /** Moves the cursor by display seconds. Returns true when the play ended (not looping). */
  advance(dtS: number): boolean {
    if (!this.running || dtS <= 0) return false;
    this.cursor += dtS * this.ticksPerSecond * this.speedValue;
    const end = this.loop ? this.whistleTick : this.last;
    if (this.cursor >= end) {
      if (this.loop) { this.cursor = this.snapTick + (this.cursor - end); return false; }
      this.cursor = this.last; this.running = false; return true;
    }
    return false;
  }

  /** One tick at a time; pauses. Forward N then back N returns to the same frame (O2.6.1 acceptance). */
  step(ticks: number): void { this.running = false; this.cursor = clamp(Math.round(this.cursor) + ticks, this.first, this.last); }
  seek(tick: number): void { this.cursor = clamp(tick, this.first, this.last); }
  /** `R` (O2.6.1). */
  rewind(): void { this.running = false; this.cursor = clamp(this.snapTick, this.first, this.last); }

  /** Shift with an arrow: previous or next event marker. */
  jump(dir: 1 | -1): void {
    this.running = false;
    const now = Math.round(this.cursor);
    const list = dir > 0 ? this.markers.filter((m) => m.tick > now) : this.markers.filter((m) => m.tick < now).reverse();
    if (list[0]) this.cursor = clamp(list[0].tick, this.first, this.last);
  }
  jumpTo(kind: MarkerKind): void { const m = this.markers.find((x) => x.kind === kind); if (m) { this.running = false; this.cursor = clamp(m.tick, this.first, this.last); } }
}

/** Position in a cut-up (`Up` and `Down`), moving to the next clip without a menu (N1.1.1). */
export class ReelCursor {
  constructor(readonly playIds: readonly string[], private index = 0) {
    if (!playIds.length) throw new Error('an empty reel has nothing to play');
  }
  get current(): string { return this.playIds[this.index]!; }
  get position(): number { return this.index; }
  next(): boolean { if (this.index >= this.playIds.length - 1) return false; this.index++; return true; }
  previous(): boolean { if (this.index === 0) return false; this.index--; return true; }
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
