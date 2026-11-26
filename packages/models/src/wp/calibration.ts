// Calibration check of N2.2.2 acceptance: states predicted in a band are won at that band's rate.
import { param } from './params.ts';

export interface CalibrationBand {
  readonly lo: number;
  readonly hi: number;
  readonly n: number;
  readonly meanPredicted: number;
  readonly observed: number;
}

/** Bands of width `width` (starting 0.05) over [0, 1]; empty bands are kept with n = 0. */
export function calibrationBands(predicted: readonly number[], result: readonly number[], width = param('calibration.bandWidth')): CalibrationBand[] {
  if (predicted.length !== result.length) throw new Error('predicted and result lengths differ');
  const nb = Math.round(1 / width);
  const n = new Array<number>(nb).fill(0), sp = new Array<number>(nb).fill(0), sr = new Array<number>(nb).fill(0);
  for (let i = 0; i < predicted.length; i++) {
    const p = predicted[i]!;
    let b = Math.floor(p / width);
    if (b >= nb) b = nb - 1;
    if (b < 0) b = 0;
    n[b]! += 1; sp[b]! += p; sr[b]! += result[i]!;
  }
  return n.map((c, b) => ({ lo: b * width, hi: (b + 1) * width, n: c, meanPredicted: c ? sp[b]! / c : 0, observed: c ? sr[b]! / c : 0 }));
}
