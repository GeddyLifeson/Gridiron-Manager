// Grade and measurement text (D6.1.1, D6.1.2, D6.2.1, O6.5.1). Every grade shown goes through here
// (D6 note to O4). Input is an estimate's mean and variance, never a true value.
import { halfWidth } from './estimate.ts';
import { grade, legendFor, type GradeScale, type Graded } from './scales.ts';
import { p } from './params.ts';

export type Arrow = 'rising' | 'steady' | 'falling';

export interface GradeText {
  readonly mean: Graded;
  readonly low: Graded;
  readonly high: Graded;
  /** "7.1 (6.8 to 7.4)"; a band cut at the scale limit is marked with "<" or ">" (D6.2.1 edge case). */
  readonly text: string;
  readonly legend: string | null;
}

/** Formats a mean and band on a scale: the band is never hidden (O6.5.1 rule 2). */
export function formatGrade(scale: GradeScale, mean: number, variance: number, arrow: Arrow | null = null): GradeText {
  const h = halfWidth(variance);
  const m = grade(scale, mean);
  const lo = grade(scale, mean - h);
  const hi = grade(scale, mean + h);
  const loText = lo.cut === 'low' ? `<${lo.text}` : lo.text;
  const hiText = hi.cut === 'high' ? `>${hi.text}` : hi.text;
  const arrowText = arrow && scale.arrow ? (arrow === 'rising' ? ' ↑' : arrow === 'falling' ? ' ↓' : '') : '';
  const text = loText === hiText && m.text === loText ? `${m.text}${arrowText} (${loText})` : `${m.text}${arrowText} (${loText} to ${hiText})`;
  return { mean: m, low: lo, high: hi, text, legend: legendFor(scale, mean) };
}

/** How a measurable is known (D6.1.2). */
export type MeasureKind =
  /** Height, weight, arm length, hand size, age, and tests timed by the team or at an official event. */
  | 'exact'
  /** A test reported by others, such as a school's own 40 time. */
  | 'reported';

export interface MeasureText {
  readonly text: string;
  /** No band is drawn for an exact field (D6.1.2 acceptance). */
  readonly band: { readonly low: number; readonly high: number } | null;
  readonly reported: boolean;
}

/**
 * A measurable in real units. Exact values show as plain numbers. A reported 40 shows the number reported
 * with a "reported" marker and a small band around the organisation's corrected read (D6.1.2: school times
 * run about 0.05 s fast, sd 0.05 s, starting values; the size of that bias is Unverified).
 */
export function formatForty(valueS: number, kind: MeasureKind): MeasureText {
  if (kind === 'exact') return { text: `${valueS.toFixed(2)} s`, band: null, reported: false };
  const corrected = valueS - p('reported.fortyBiasS');
  const h = p('band.z') * p('reported.fortySdS');
  return { text: `${valueS.toFixed(2)} s (reported)`, band: { low: corrected - h, high: corrected + h }, reported: true };
}

/** Plain exact measurables (D6.1.2): no band. Height in feet-inches by default (O6.5.1 rule 5). */
export function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = inches - ft * 12;
  return `${ft}-${Number.isInteger(inch) ? inch : inch.toFixed(1)}`;
}

export function formatWeight(lb: number): string {
  return `${Math.round(lb)} lb`;
}
