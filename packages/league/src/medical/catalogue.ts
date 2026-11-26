// The G-21 injury catalogue as this module reads it (D11.2.1). `league` may not import
// `football-content`, so the rows arrive as data through this port; the shapes match
// football-content/data/injuries/catalogue.json. The integrator ruling of 2026-11-26 holds: recovery
// time comes from THIS catalogue (games missed after the first Out), never from the G-10 listing counts.
import type { RandomStream } from '@gm/schema';
import data from './data/medical.json' with { type: 'json' };
import units from './units.json' with { type: 'json' };
import { P } from './params.ts';

export interface RecoveryRange {
  readonly unit: string;
  readonly low: number | null;
  readonly median: number | null;
  readonly mean: number | null;
  readonly high: number | null;
  readonly basis: string;
  readonly notReturnShare: number | null;
}

export interface CatalogueRow {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly bodyPart: string;
  readonly severityClass: string;
  /** Numeric grades, or richer objects for rows with per-grade studies; only numbers are read here. */
  readonly grades: readonly unknown[];
  readonly recovery: RecoveryRange;
  readonly factIds: readonly string[];
}

export type Catalogue = ReadonlyMap<string, CatalogueRow>;

export function catalogueFrom(rows: readonly CatalogueRow[]): Catalogue {
  return new Map(rows.map((r) => [r.id, r]));
}

export function row(cat: Catalogue, typeId: string): CatalogueRow {
  const r = cat.get(typeId);
  if (!r) throw new Error(`league.medical: unknown injury type ${typeId}`);
  return r;
}

const SOFT = new Set<string>(data.softTissue);
const STRUCTURAL = new Set<string>(data.structural);
const CONCUSSION = new Set<string>(data.concussion);
export const isSoftTissue = (typeId: string): boolean => SOFT.has(typeId);
export const isStructural = (typeId: string): boolean => STRUCTURAL.has(typeId);
export const isConcussion = (typeId: string): boolean => CONCUSSION.has(typeId);

export interface SurgeryOption { readonly id: string; readonly operativeMonths: number; readonly factId: string | null }
const SURGERY = new Map<string, SurgeryOption>(data.surgeryOptional.map((s) => [s.id, s]));
/** Rows with the `surgery_optional` flag (D11.6.3). The catalogue does not carry it yet (requested from G-21). */
export const surgeryOption = (typeId: string): SurgeryOption | null => SURGERY.get(typeId) ?? null;

/** Days per catalogue unit. In-game-only rows (plays) cost no days between games. */
export function daysPerUnit(unit: string): number {
  if (unit === 'games') return P('daysPerGameWeek');
  if (unit === 'days') return 1;
  if (unit === 'months') return P('daysPerMonth');
  if (unit === 'seasons') return P('daysPerMonth') * units.monthsPerYear;
  if (unit === 'plays') return 0;
  throw new Error(`league.medical: unknown recovery unit ${unit}`);
}

type Point = readonly [number, number];

/**
 * Quantile points of a row's recovery, in its own unit. Rows whose basis is the interquartile range
 * put low and high at p25 and p75 and grow tails by `recoveryTailFactor` half-IQRs; other rows give a
 * range, read as its ends. A missing centre is the mean, then the midpoint; a missing end mirrors the
 * other end around the centre.
 */
export function recoveryQuantiles(r: RecoveryRange): Point[] {
  const half = units.halves;
  const centre = r.median ?? r.mean ?? (r.low !== null && r.high !== null ? (r.low + r.high) / half : r.low ?? r.high);
  if (centre === null) throw new Error('league.medical: recovery row has no number');
  const lo = r.low ?? Math.max(0, centre - ((r.high ?? centre) - centre));
  const hi = r.high ?? centre + (centre - lo);
  const tf = P('recoveryTailFactor');
  if (/interquartile/i.test(r.basis)) {
    const q1 = P('iqrLow');
    return [[0, Math.max(0, lo - tf * (centre - lo))], [q1, lo], [P('iqrMid'), centre], [1 - q1, hi], [1, hi + tf * (hi - centre)]];
  }
  return [[0, lo], [P('iqrMid'), Math.max(lo, Math.min(hi, centre))], [1, hi]];
}

/** Piecewise-linear quantile function through sorted points. */
export function quantile(points: readonly Point[], u: number): number {
  for (let i = 1; i < points.length; i++) {
    const [u1, v1] = points[i]!;
    const [u0, v0] = points[i - 1]!;
    if (u <= u1) return u1 === u0 ? v1 : v0 + ((u - u0) / (u1 - u0)) * (v1 - v0);
  }
  return points[points.length - 1]![1];
}

export function numericGrades(r: CatalogueRow): number[] {
  return r.grades.filter((g): g is number => typeof g === 'number');
}

/**
 * True recovery days for a new injury (D11.2.1 rows; D11.1.1 "severity from the type's distribution").
 * With grades, the grade takes its equal band of the distribution (grade 1 lowest), so the row's whole
 * spread is kept across grades. In-game-only rows return 0 days.
 */
export function drawRecoveryDays(r: CatalogueRow, grade: number | null, s: RandomStream): number {
  const perUnit = daysPerUnit(r.recovery.unit);
  if (perUnit === 0) return 0;
  const grades = numericGrades(r);
  let u = s.uniform();
  const gi = grade === null ? -1 : grades.indexOf(grade);
  if (gi >= 0) u = (gi + u) / grades.length;
  const v = quantile(recoveryQuantiles(r.recovery), u) * perUnit;
  return Math.max(P('minRecoveryDays'), Math.round(v));
}
