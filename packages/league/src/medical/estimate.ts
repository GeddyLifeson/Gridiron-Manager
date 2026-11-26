// The estimate the coach gets (D11.3.2, H5.1.2): a sideline read, imaging with a range, a daily update
// that narrows, and setbacks that add time and reset the range. The true date is never shown.
import type { RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { SEVERITY_CLASSES, type MedicalStaff, type SeverityClass } from './types.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function severityClassOf(days: number): SeverityClass {
  if (days <= P('minorMaxDays')) return 'minor';
  if (days <= P('moderateMaxDays')) return 'moderate';
  if (days <= P('majorMaxDays')) return 'major';
  return 'season_ending';
}

/** Probability the sideline read names the right class: 0.6 + 0.3 x accuracy. */
export function sidelineCorrectChance(accuracy: number): number {
  return P('sidelineBase') + P('sidelineSlope') * clamp01(accuracy);
}

/** First read within a few plays: the true class, or an adjacent one (a "sprain" that is a tear). */
export function sidelineRead(trueDays: number, staff: MedicalStaff, s: RandomStream): SeverityClass {
  const truth = severityClassOf(trueDays);
  if (s.chance(sidelineCorrectChance(staff.diagnosticAccuracy))) return truth;
  const i = SEVERITY_CLASSES.indexOf(truth);
  const down = i > 0 ? SEVERITY_CLASSES[i - 1]! : null;
  const up = i < SEVERITY_CLASSES.length - 1 ? SEVERITY_CLASSES[i + 1]! : null;
  if (down && up) return s.chance(P('iqrMid')) ? down : up;
  return (down ?? up)!;
}

/** Imaging day: next day for most, same night when the sideline read is major or worse. */
export function imagingDay(injuryDay: number, read: SeverityClass): number {
  const major = read === 'major' || read === 'season_ending';
  return injuryDay + (major ? P('majorImagingDelayDays') : P('imagingDelayDays'));
}

/** The factor's range at a given accuracy, interpolated between the low and high accuracy ends. */
export function imagingRange(accuracy: number): readonly [number, number] {
  const a = clamp01(accuracy);
  return [lerp(P('imagingLowMin'), P('imagingHighMin'), a), lerp(P('imagingLowMax'), P('imagingHighMax'), a)];
}

/** Factor drawn once at imaging (and again after a setback): shown centre = true time x factor. */
export function drawImagingFactor(accuracy: number, s: RandomStream): number {
  const [lo, hi] = imagingRange(accuracy);
  return lo + s.uniform() * (hi - lo);
}

/** Half-width share: 35 percent at first, shrinking linearly to 10 percent by the last third of recovery. */
export function halfWidthShare(progressShare: number): number {
  const t = clamp01(progressShare / P('rangeNarrowedAt'));
  return lerp(P('rangeStartHalfWidth'), P('rangeEndHalfWidth'), t);
}

/**
 * Shown range of days left, from today. The daily update moves the error toward the truth as recovery
 * proceeds (H5.1.2 "narrows"): the effective factor is 1 + (f - 1) x (floor + (1 - floor) x share left).
 */
export function shownRange(totalDays: number, progressDays: number, factor: number): readonly [number, number] {
  const left = Math.max(0, totalDays - progressDays);
  const share = totalDays > 0 ? progressDays / totalDays : 1;
  const floor = P('estimateLearnFloor');
  const f = 1 + (factor - 1) * (floor + (1 - floor) * (1 - clamp01(share)));
  const centre = left * f;
  const w = halfWidthShare(share);
  return [Math.max(0, Math.floor(centre * (1 - w))), Math.ceil(centre * (1 + w))];
}

/** Setback drawn at injury time: the progress day it strikes, or null (5 to 15 percent, D11.3.2). */
export function drawSetback(totalDays: number, s: RandomStream): { at: number | null; days: number } {
  const days = Math.max(1, Math.round(totalDays * P('setbackAddedShare')));
  if (totalDays <= 1 || !s.chance(P('setbackChance'))) { s.uniform(); return { at: null, days }; }
  return { at: Math.max(1, Math.floor(s.uniform() * totalDays)), days };
}
