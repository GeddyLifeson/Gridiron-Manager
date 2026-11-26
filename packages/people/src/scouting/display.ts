// Grade and measurement text (D6.1.1, D6.1.2, D6.2.1, O6.5.1; ruling MA-48). Every grade shown goes
// through here (D6 note to O4). Input is an estimate's mean and variance, never a true value.
// MA-48 (Marlon 2026-11-26): a number is shown only as a grade someone assigned after watching, with who
// graded, when, and how much was watched. Confidence shows in words by default; the numeric band is one
// tap away (`showBand`). Projections never come through here: potential is words only (projection.ts).
import type { WorldDate } from '@gm/schema';
import { halfWidth } from './estimate.ts';
import { grade, legendFor, type GradeScale, type Graded } from './scales.ts';
import { p } from './params.ts';

export type Arrow = 'rising' | 'steady' | 'falling';

/** How sure the grade is, in words (D6.1.1 "thin look", "well watched"). */
export type ConfidenceWord = 'thin look' | 'fair look' | 'well watched';

/** Confidence word for a shown variance; cut points are assumption rows in params.ts. */
export function confidenceWord(variance: number): ConfidenceWord {
  const h = halfWidth(variance);
  if (h <= p('words.wellWatchedHalfIss')) return 'well watched';
  if (h <= p('words.fairLookHalfIss')) return 'fair look';
  return 'thin look';
}

/** One kind of look a grade rests on: "214 snaps", "31 practices". */
export interface Watched {
  readonly count: number;
  readonly what: string;
}

/** Who assigned a grade, when, and what it rests on (D6.1.1, MA-48). */
export interface GradedBy {
  /** "position coach", "you", "area scout". */
  readonly grader: string;
  /** Date the grade was last updated. */
  readonly on: WorldDate;
  readonly watched: readonly Watched[];
}

export interface FormatOptions {
  /** Show the numeric band in place of the confidence word (the tap, MA-48). Default false. */
  readonly showBand?: boolean;
  /** Direction glyph on scales that carry one (a word the evaluator gave, D6.5.1). */
  readonly arrow?: Arrow | null;
  /** How a date reads on screen; the calendar module supplies "week 6". */
  readonly dateText?: (d: WorldDate) => string;
}

export interface GradeText {
  readonly mean: Graded;
  readonly low: Graded;
  readonly high: Graded;
  readonly confidence: ConfidenceWord;
  /** "6.8 to 7.4"; a band cut at the scale limit is marked with "<" or ">" (D6.2.1 edge case). Shown on tap. */
  readonly bandText: string;
  /** "position coach, graded 214 snaps and 31 practices, last updated week 6". */
  readonly sourceText: string;
  /**
   * The line a card shows: "7.1 (thin look), position coach, graded 214 snaps and 31 practices, last updated
   * week 6"; with `showBand`, the band takes the confidence word's place.
   */
  readonly text: string;
  readonly legend: string | null;
}

export function defaultDateText(d: WorldDate): string {
  return `season ${d.seasonYear}, day ${d.dayIndex + 1}`;
}

/** "214 snaps and 31 practices"; "214 snaps, 31 practices and 2 workouts". */
export function watchedText(ws: readonly Watched[]): string {
  const parts = ws.filter((w) => w.count > 0).map((w) => `${Math.round(w.count)} ${w.what}`);
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The band as text, for the tap (MA-48). */
export function formatBand(scale: GradeScale, mean: number, variance: number): { low: Graded; high: Graded; text: string } {
  const h = halfWidth(variance);
  const low = grade(scale, mean - h);
  const high = grade(scale, mean + h);
  const loText = low.cut === 'low' ? `<${low.text}` : low.text;
  const hiText = high.cut === 'high' ? `>${high.text}` : high.text;
  return { low, high, text: loText === hiText ? loText : `${loText} to ${hiText}` };
}

/** Formats an assigned grade: value, confidence (word or band), grader, date, amount watched. */
export function formatGrade(scale: GradeScale, mean: number, variance: number, by: GradedBy, opts: FormatOptions = {}): GradeText {
  const m = grade(scale, mean);
  const b = formatBand(scale, mean, variance);
  const confidence = confidenceWord(variance);
  const arrow = opts.arrow ?? null;
  const arrowText = arrow && scale.arrow ? (arrow === 'rising' ? ' ↑' : arrow === 'falling' ? ' ↓' : '') : '';
  const sourceText = `${by.grader}, graded ${watchedText(by.watched)}, last updated ${(opts.dateText ?? defaultDateText)(by.on)}`;
  const head = `${m.text}${arrowText} (${opts.showBand ? b.text : confidence})`;
  return { mean: m, low: b.low, high: b.high, confidence, bandText: b.text, sourceText, text: `${head}, ${sourceText}`, legend: legendFor(scale, mean) };
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
