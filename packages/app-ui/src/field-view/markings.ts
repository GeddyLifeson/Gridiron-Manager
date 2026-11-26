// Field markings in field-frame yards (I9.1.1, O2.3.1). Built once per geometry and cached; the
// renderer only maps them through the camera. Field size, goal lines and hashes come from the rule
// set (FieldGeometry); the finer markings come from markings.json until rule keys exist (CR-G03-3).
import data from './markings.json' with { type: 'json' };
import type { FieldGeometryLike } from './types.ts';

const FT_PER_YD = 3;
/** Q6.3.1: fewer than three independent sources prints PROVISIONAL. */
const SOURCES_FOR_VERIFIED = 3;

export interface MarkingSet {
  readonly sources: readonly { title: string; where: string; read: string }[];
  readonly yardLineEveryYd: number;
  readonly hashEveryYd: number;
  readonly sidelineTickFromSidelineFt: number;
  readonly sidelineTickLengthFt: number;
  readonly numbersEveryYd: number;
  readonly numbersBottomFromSidelineYd: number;
  readonly numeralLengthYd: number;
  readonly tryLineFromGoalLineYd: number;
  readonly tryLineLengthYd: number;
}

export const PRO_MARKINGS = data.pro_2026 as MarkingSet;
export const INBOUNDS_HASH_LENGTH_FT = data.assumptions.inboundsHashLengthFt;

/** Computed from the sources, never typed (Q6.1.2). */
export function markingStatus(m: MarkingSet): 'PROVISIONAL' | 'Verified' {
  return m.sources.length >= SOURCES_FOR_VERIFIED ? 'Verified' : 'PROVISIONAL';
}

export interface YardNumber { readonly x: number; readonly y: number; readonly text: string; readonly bottomToward: 'south' | 'north' }

export interface FieldMarkings {
  readonly geometry: FieldGeometryLike;
  readonly endZones: readonly (readonly [number, number])[];
  /** Segments x0, y0, x1, y1: boundary lines, goal lines, yard lines. */
  readonly lines: Float64Array;
  /** Short segments: inbounds hash marks, sideline yard ticks, try lines. */
  readonly ticks: Float64Array;
  readonly numbers: readonly YardNumber[];
  /** Goal posts seen from above: the crossbar at each end line, x, ySouth, yNorth. */
  readonly posts: readonly (readonly [number, number, number])[];
  readonly numeralLengthYd: number;
}

export function buildMarkings(g: FieldGeometryLike, m: MarkingSet = PRO_MARKINGS): FieldMarkings {
  const lines: number[] = [];
  const seg = (arr: number[], x0: number, y0: number, x1: number, y1: number) => arr.push(x0, y0, x1, y1);
  const L = g.lengthYd, W = g.widthYd, gw = g.goalLineWestX, ge = g.goalLineEastX;
  // Boundary lines and goal lines.
  seg(lines, 0, 0, L, 0); seg(lines, 0, W, L, W); seg(lines, 0, 0, 0, W); seg(lines, L, 0, L, W);
  seg(lines, gw, 0, gw, W); seg(lines, ge, 0, ge, W);
  // Yard lines every 5 yd between the goal lines.
  for (let x = gw + m.yardLineEveryYd; x < ge - 1e-9; x += m.yardLineEveryYd) seg(lines, x, 0, x, W);

  const ticks: number[] = [];
  const hashHalf = INBOUNDS_HASH_LENGTH_FT / FT_PER_YD / 2;
  const sideFrom = m.sidelineTickFromSidelineFt / FT_PER_YD, sideLen = m.sidelineTickLengthFt / FT_PER_YD;
  const steps = Math.round((ge - gw) / m.hashEveryYd);
  const perLine = Math.round(m.yardLineEveryYd / m.hashEveryYd);
  for (let k = 1; k < steps; k++) {
    if (k % perLine === 0) continue; // a full yard line is drawn there
    const x = gw + k * m.hashEveryYd;
    seg(ticks, x, g.hashSouthY - hashHalf, x, g.hashSouthY + hashHalf);
    seg(ticks, x, g.hashNorthY - hashHalf, x, g.hashNorthY + hashHalf);
    seg(ticks, x, sideFrom, x, sideFrom + sideLen);
    seg(ticks, x, W - sideFrom - sideLen, x, W - sideFrom);
  }
  // Try lines: 1 yd long, 2 yd from the middle of each goal line, in the field of play.
  const tl = m.tryLineLengthYd / 2;
  seg(ticks, gw + m.tryLineFromGoalLineYd, g.centreY - tl, gw + m.tryLineFromGoalLineYd, g.centreY + tl);
  seg(ticks, ge - m.tryLineFromGoalLineYd, g.centreY - tl, ge - m.tryLineFromGoalLineYd, g.centreY + tl);

  // Yard numbers every 10 yd, named by J1.1.1's rule (west team's 0 to 50, east team's 50 to 0).
  const numbers: YardNumber[] = [];
  const mid = m.numbersBottomFromSidelineYd + m.numeralLengthYd / 2;
  for (let x = gw + m.numbersEveryYd; x < ge - 1e-9; x += m.numbersEveryYd) {
    const text = String(Math.round(Math.min(x - gw, ge - x)));
    numbers.push({ x, y: mid, text, bottomToward: 'south' });
    numbers.push({ x, y: W - mid, text, bottomToward: 'north' });
  }

  return {
    geometry: g,
    endZones: [[0, gw], [ge, L]],
    lines: Float64Array.from(lines),
    ticks: Float64Array.from(ticks),
    numbers,
    posts: [[0, g.uprightSouthY, g.uprightNorthY], [L, g.uprightSouthY, g.uprightNorthY]],
    numeralLengthYd: m.numeralLengthYd,
  };
}
