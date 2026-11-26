// No-flashing rule (presentation plan section 7, amendment A-6, PV-14). Nothing on screen may flash
// more than three times in any one second.
//
// Status: Verified (A5: the official primary text plus two independent cross-checks, read 2026-11-26).
//  1. W3C, WCAG 2.2 Success Criterion 2.3.1 "Three Flashes or Below Threshold" (Level A) and its
//     glossary: "do not contain anything that flashes more than three times in any one second period";
//     a general flash is "a pair of opposing changes in relative luminance of 10% or more of the maximum
//     relative luminance (1.0) where the relative luminance of the darker image is below 0.80"; a red
//     flash is "any pair of opposing transitions involving a saturated red" (R/(R+G+B) >= 0.8).
//     https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
//  2. ITU-R Recommendation BT.1702-3 (11/2023), Annex 1, Guideline 1: a sequence is not permitted when
//     "there are more than three flashes (i.e. six changes in luminance ...) within any one-second
//     period" (and the concurrent area is over 25% of the screen); a transition to or from a saturated
//     red is also potentially harmful.
//     https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf
//  3. Ofcom Broadcast Code guidance, Section 2, Annex 1 "Guidance Note on Flashing Images and Regular
//     Patterns in Television", para 3.1.1: prohibited when the area is over one quarter of the screen
//     and "there are more than three flashes within any one-second period".
//     https://www.ofcom.org.uk/__data/assets/pdf_file/0023/104657/Section-2-Guidance-Notes.pdf
//
// All three agree on the count (more than three in one second fails). They differ on the area that
// may be exempt (WCAG: 25% of a 10-degree field; ITU and Ofcom: 25% of the screen) and on the
// luminance unit (WCAG relative luminance; ITU and Ofcom cd/m2). The game takes the strictest reading:
// no area exemption at all, WCAG's relative-luminance thresholds, and any change into or out of
// saturated red counts as a red transition.

/** The verified rule values. */
export const FLASH_RULE = {
  /** More than this many flashes in any one second fails (WCAG 2.3.1, ITU-R BT.1702-3, Ofcom). */
  maxFlashesPerSecond: 3,
  windowMs: 1000,
  /** A flash is a pair of opposing changes, so three flashes are six changes (ITU-R BT.1702-3). */
  changesPerFlash: 2,
  /** WCAG general flash: a change of at least 10% of maximum relative luminance... */
  minLuminanceChange: 0.1,
  /** ...where the darker image is below 0.80 relative luminance. */
  darkerBelow: 0.8,
  /** WCAG saturated red: R/(R+G+B) at or above 0.8. */
  saturatedRedRatio: 0.8,
  status: 'Verified',
  sources: [
    'W3C WCAG 2.2 SC 2.3.1 and glossary (Understanding page, read 2026-11-26)',
    'ITU-R BT.1702-3 (11/2023) Annex 1 Guideline 1',
    'Ofcom Broadcast Code Section 2 guidance, Annex 1 para 3 and 3.1.1',
  ],
} as const;

/** The most changes allowed inside any one-second window (3 flashes x 2 changes). */
export const MAX_CHANGES_PER_WINDOW = FLASH_RULE.maxFlashesPerSecond * FLASH_RULE.changesPerFlash;

/** Frame-time rounding tolerance in ms (a computing detail, not a rule value). */
const WINDOW_EPS_MS = 1e-6;

/** One sample of a screen region: time in ms, relative luminance 0..1, and whether it is saturated red. */
export interface FlashSample { readonly tMs: number; readonly lum: number; readonly red?: boolean }

export interface FlashReport {
  /** Times of general-flash luminance changes. */
  readonly changes: readonly number[];
  /** Times of changes into or out of saturated red. */
  readonly redChanges: readonly number[];
  /** Most general changes inside any one-second window. */
  readonly maxChangesPerSecond: number;
  readonly maxRedChangesPerSecond: number;
  /** Whole flashes in the worst second (changes / 2, rounded down). */
  readonly maxFlashesPerSecond: number;
  readonly ok: boolean;
}

/** WCAG saturated red test for an sRGB colour. */
export function isSaturatedRed(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  return sum > 0 && r / sum >= FLASH_RULE.saturatedRedRatio;
}

/**
 * Finds general-flash changes: a swing of at least `minLuminanceChange` from the last extreme, in the
 * opposite direction to the last change, with the darker side below `darkerBelow`. A slow ramp counts
 * like a step (the rule is about the pair of changes, not their speed).
 */
export function luminanceChanges(samples: readonly FlashSample[]): number[] {
  const R = FLASH_RULE;
  const out: number[] = [];
  if (samples.length === 0) return out;
  let dir = 0;
  let lo = samples[0]!.lum, hi = samples[0]!.lum, ext = samples[0]!.lum;
  for (const s of samples) {
    const v = s.lum;
    if (dir === 0) {
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      if (hi - lo >= R.minLuminanceChange && lo < R.darkerBelow) { dir = v === hi ? 1 : -1; ext = v; out.push(s.tMs); }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= R.minLuminanceChange && v < R.darkerBelow) { dir = -1; ext = v; out.push(s.tMs); }
    } else {
      if (v < ext) ext = v;
      else if (v - ext >= R.minLuminanceChange && ext < R.darkerBelow) { dir = 1; ext = v; out.push(s.tMs); }
    }
  }
  return out;
}

/** Times where the region goes into or out of saturated red. */
export function redChanges(samples: readonly FlashSample[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < samples.length; i++) if (!!samples[i]!.red !== !!samples[i - 1]!.red) out.push(samples[i]!.tMs);
  return out;
}

/**
 * The most event times inside any half-open window [t, t + windowMs). Times a hair under a whole window
 * apart (frame-time rounding) count as a whole window: ITU-R BT.1702-3 accepts flashes whose leading
 * edges are 334 ms apart at 60 Hz, so a steady 3 Hz flash passes.
 */
export function maxInWindow(times: readonly number[], windowMs: number = FLASH_RULE.windowMs): number {
  const t = [...times].sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i]! - t[j]! >= windowMs - WINDOW_EPS_MS) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

/** Checks one region's samples against the rule. */
export function checkFlashes(samples: readonly FlashSample[]): FlashReport {
  const changes = luminanceChanges(samples);
  const reds = redChanges(samples);
  const maxChangesPerSecond = maxInWindow(changes);
  const maxRedChangesPerSecond = maxInWindow(reds);
  return {
    changes, redChanges: reds, maxChangesPerSecond, maxRedChangesPerSecond,
    maxFlashesPerSecond: Math.floor(Math.max(maxChangesPerSecond, maxRedChangesPerSecond) / FLASH_RULE.changesPerFlash),
    ok: maxChangesPerSecond <= MAX_CHANGES_PER_WINDOW && maxRedChangesPerSecond <= MAX_CHANGES_PER_WINDOW,
  };
}

/**
 * Onset limiter for anything that appears and disappears (a cue, a banner, a caption line, a pulse).
 * Each onset is treated as one whole flash (on, then off). `allow` returns false, and records nothing,
 * when one more onset under `key` would put more than three inside any one-second window. Times are
 * whatever clock the caller draws with (display ms); the guard keeps no clock of its own.
 */
export class FlashGuard {
  private readonly onsets = new Map<string, number[]>();
  constructor(private readonly maxPerWindow: number = FLASH_RULE.maxFlashesPerSecond, private readonly windowMs: number = FLASH_RULE.windowMs) {}

  allow(key: string, tMs: number): boolean {
    const list = (this.onsets.get(key) ?? []).filter((t) => tMs - t < this.windowMs && t <= tMs);
    if (list.length >= this.maxPerWindow) { this.onsets.set(key, list); return false; }
    list.push(tMs);
    this.onsets.set(key, list);
    return true;
  }

  /** The earliest time at or after `tMs` when `allow(key, ...)` would pass. */
  nextAllowed(key: string, tMs: number): number {
    const list = (this.onsets.get(key) ?? []).filter((t) => tMs - t < this.windowMs && t <= tMs).sort((a, b) => a - b);
    if (list.length < this.maxPerWindow) return tMs;
    return list[list.length - this.maxPerWindow]! + this.windowMs;
  }

  reset(): void { this.onsets.clear(); }
}
