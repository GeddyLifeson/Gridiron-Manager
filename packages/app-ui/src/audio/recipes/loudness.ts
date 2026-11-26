// Level checks for recipes (plan section 7, "Loudness").
//
// Status: Assumption. The target values below are design choices set by PV-07, not facts. True
// LUFS (ITU-R BS.1770 K-weighting and gating) needs a library that is not installed yet, so the
// loudness measure is plain RMS over the loudest window, as section 5 of the plan allows. When a
// LUFS library is added, swap `loudestWindowRmsDb` for it and re-run the calibrate script.

import { gainToDb, SAMPLE_RATE } from './render-offline.ts';

export const LOUDNESS_TARGET = {
  /** Every recipe, at trim, sits here in its loudest window (Assumption). */
  rmsDb: -20,
  /** Allowed spread around the target across pitch variants and noise seeds (Assumption). */
  toleranceDb: 1.5,
  /** Sample peak ceiling after trim, leaving headroom for bus sums (Assumption). */
  peakDb: -1,
  /** Window for the loudness measure; shorter sounds use their own length (400 ms mirrors the
   * momentary window of BS.1770, unweighted here). */
  windowSec: 0.4,
} as const;

export function peakDb(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return gainToDb(p);
}

/** Loudest RMS over any `windowSec` stretch (or over the active part when the sound is shorter).
 * The active part is from the first to the last sample above -60 dBFS. */
export function loudestWindowRmsDb(x: Float32Array, sampleRate = SAMPLE_RATE, windowSec: number = LOUDNESS_TARGET.windowSec): number {
  const floor = 1e-3;
  let first = -1, last = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > floor) { if (first < 0) first = i; last = i; }
  if (first < 0) return -Infinity;
  const active = last - first + 1;
  const w = Math.min(active, Math.round(windowSec * sampleRate));
  let sum = 0;
  for (let i = first; i < first + w; i++) sum += x[i]! * x[i]!;
  let best = sum;
  for (let i = first + w; i <= last; i++) {
    sum += x[i]! * x[i]! - x[i - w]! * x[i - w]!;
    if (sum > best) best = sum;
  }
  return gainToDb(Math.sqrt(Math.max(best, 0) / w));
}
