// Mix rules from O5.3.2 (MB-8, MB-9, MB-10, MB-12): panning, rate limits and crowd ducking. Pure
// functions and small state holders, tested without any audio context.

/** MB-8: stereo width for field panning. */
export const PAN_WIDTH = 0.7;

/**
 * MB-8: pan by the event's field x relative to the view centre. `halfSpanYd` is half the visible
 * field width in yards; an event at the edge of the view pans to ±PAN_WIDTH. Mono gives 0.
 */
export function panFor(fieldX: number | undefined, viewCentreX: number, halfSpanYd: number, mono = false): number {
  if (mono || fieldX === undefined || !(halfSpanYd > 0)) return 0;
  const rel = (fieldX - viewCentreX) / halfSpanYd;
  return Math.max(-1, Math.min(1, rel)) * PAN_WIDTH;
}

/** MB-10: the crowd dips to this fraction under the mic tone, play clock warning and alerts. */
export const DUCK_LEVEL = 0.5;
/** MB-10: longest dip, seconds. */
export const DUCK_MAX_HOLD = 2.5;
/** MB-10: return time, seconds. */
export const DUCK_RELEASE = 1;
/** Dip attack, seconds (short so the alert's start is clear; not a bible number, a click guard). */
export const DUCK_ATTACK = 0.05;

/**
 * One continuous dip. Overlapping triggers extend it, but the dip never lasts more than DUCK_MAX_HOLD
 * from its first trigger (MB-10 "for up to 2.5 s"), then releases over DUCK_RELEASE.
 */
export interface DuckWindow { start: number; holdUntil: number; /** Duck gain when the dip began (below 1 if it began while returning). */ from: number }

export class Ducker {
  private win: DuckWindow | null = null;

  /** Registers a ducking sound from `start` to `end`; returns the window to schedule. */
  trigger(start: number, end: number): DuckWindow {
    const w = this.win;
    if (w && start >= w.start && start <= w.holdUntil) {
      // Still dipped: extend, capped at the first trigger plus the max hold.
      w.holdUntil = Math.min(w.start + DUCK_MAX_HOLD, Math.max(w.holdUntil, end));
      return w;
    }
    // Not dipped, or already returning: a fresh dip from here.
    const from = this.levelAt(start);
    this.win = { start, holdUntil: Math.min(start + DUCK_MAX_HOLD, Math.max(start + DUCK_ATTACK, end)), from };
    return this.win;
  }

  /** Duck gain (1 = no dip) at audio time `t`, for tests and the offline mix check. */
  levelAt(t: number): number {
    const w = this.win;
    if (!w || t < w.start) return 1;
    if (t < w.start + DUCK_ATTACK) return w.from - (w.from - DUCK_LEVEL) * ((t - w.start) / DUCK_ATTACK);
    if (t <= w.holdUntil) return DUCK_LEVEL;
    if (t < w.holdUntil + DUCK_RELEASE) return DUCK_LEVEL + (1 - DUCK_LEVEL) * ((t - w.holdUntil) / DUCK_RELEASE);
    return 1;
  }

  get window(): DuckWindow | null { return this.win; }
}

/**
 * MB-9 and MB-12: minimum gap per rate group, on the audio clock. A request inside the gap is
 * dropped (not delayed: a late hit sound would lie about when the hit happened).
 */
export class RateLimiter {
  private last = new Map<string, number>();

  /** True if a sound in `group` may start at `t` (seconds); records it when allowed. */
  allow(group: string, t: number, minGapMs: number | undefined): boolean {
    if (!minGapMs || minGapMs <= 0) { this.last.set(group, t); return true; }
    const prev = this.last.get(group);
    if (prev !== undefined && t - prev < minGapMs / 1000 && t >= prev) return false;
    this.last.set(group, t);
    return true;
  }

  reset(): void { this.last.clear(); }
}
