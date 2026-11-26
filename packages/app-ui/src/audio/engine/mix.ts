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
 * One dip episode. Overlapping triggers extend it, and a trigger while the crowd is still returning dips it
 * again from where it is, but the crowd is never held down past DUCK_MAX_HOLD from the episode's first
 * trigger (MB-10 "for up to 2.5 s"). A ducking sound that starts after that, while the crowd returns,
 * gets no dip: a new episode only begins once the crowd is back at full level. So a chain of alerts can
 * never keep the crowd down longer than 2.5 s plus the 1 s return (found by the PV-17 QA suite).
 */
export interface DuckWindow { start: number; holdUntil: number; /** Duck gain when the dip began (below 1 if it began while returning). */ from: number }

/** A breakpoint of the crowd duck envelope: gain `level` at time `t`, linear between points. */
export interface DuckPoint { readonly t: number; readonly level: number }

export class Ducker {
  private win: DuckWindow | null = null;
  /** The envelope as linear breakpoints, ascending in t. Empty means no dip has happened. */
  private pts: DuckPoint[] = [];

  /** Registers a ducking sound from `start` to `end`; returns the episode's window. */
  trigger(start: number, end: number): DuckWindow {
    const w = this.win;
    if (w && start >= w.start && start < w.holdUntil + DUCK_RELEASE) {
      // Same episode: dipped or returning. Extend, capped at the episode's first trigger plus the max hold.
      const cap = w.start + DUCK_MAX_HOLD;
      const now = this.levelAt(start);
      const hold = Math.min(cap, Math.max(w.holdUntil, end));
      // Nothing to add, or the sound starts at or past the cap: no dip while the crowd returns.
      if (hold <= w.holdUntil || start >= cap) return w;
      const head = this.pts.filter((p) => p.t < start);
      if (start <= w.holdUntil) {
        this.pts = [...head, { t: start, level: now }, { t: hold, level: DUCK_LEVEL }, { t: hold + DUCK_RELEASE, level: 1 }];
      } else {
        // Re-dip from the returning level, with the same short attack, never past the cap.
        const attackEnd = Math.min(hold, start + DUCK_ATTACK * ((now - DUCK_LEVEL) / (1 - DUCK_LEVEL)));
        this.pts = [...head, { t: start, level: now }, { t: attackEnd, level: DUCK_LEVEL }, { t: hold, level: DUCK_LEVEL }, { t: hold + DUCK_RELEASE, level: 1 }];
      }
      w.holdUntil = hold;
      return w;
    }
    // Crowd at full level (or no episode yet): a fresh dip from here.
    const from = this.levelAt(start);
    const hold = Math.min(start + DUCK_MAX_HOLD, Math.max(start + DUCK_ATTACK, end));
    this.win = { start, holdUntil: hold, from };
    this.pts = [{ t: start, level: from }, { t: start + DUCK_ATTACK, level: DUCK_LEVEL }, { t: hold, level: DUCK_LEVEL }, { t: hold + DUCK_RELEASE, level: 1 }];
    return this.win;
  }

  /** Duck gain (1 = no dip) at audio time `t`, for tests and the offline mix check. */
  levelAt(t: number): number {
    const p = this.pts;
    if (!p.length || t < p[0]!.t) return 1;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!, b = p[i]!;
      if (t <= b.t) return b.t === a.t ? b.level : a.level + (b.level - a.level) * ((t - a.t) / (b.t - a.t));
    }
    return p[p.length - 1]!.level;
  }

  /** The envelope's breakpoints at or after `t`, for scheduling the gain parameter. */
  pointsFrom(t: number): DuckPoint[] { return this.pts.filter((p) => p.t >= t); }

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
