// WP-24 distribution comparison (Q1.3.2): the shift per target row between two builds, measured with the
// calibration harness's own measures so the diff counts plays exactly the way calibration does (Q2.1.1).
// It is also the fallback when play-by-play comparison is meaningless (stream order change, two resolvers).
import { mean, observe, parseMeasure, prepare, sampleSd, type CalibrationSample } from '../calibration/measures.ts';

export interface RowShift {
  readonly filter: string;
  readonly baseN: number;
  readonly variantN: number;
  readonly baseMean: number | null;
  readonly variantMean: number | null;
  readonly delta: number | null;
  /** Welch z of the mean difference; null when either side has fewer than two observations or no spread. */
  readonly z: number | null;
  readonly shifted: boolean;
  /** Why the row could not be measured, when it could not. */
  readonly note: string | null;
}

function merge(groups: readonly CalibrationSample[]): CalibrationSample {
  return { summaries: groups.flatMap((g) => g.summaries), plays: groups.flatMap((g) => g.plays) };
}

/** Compares base and variant samples on each filter (a target row's `filter`, J15). */
export function distributionShift(
  base: readonly CalibrationSample[], variant: readonly CalibrationSample[], filters: readonly string[], shiftZ: number,
): RowShift[] {
  const pb = prepare(merge(base)), pv = prepare(merge(variant));
  const out: RowShift[] = [];
  for (const filter of [...new Set(filters)]) {
    let ob: number[] | null, ov: number[] | null;
    try {
      const m = parseMeasure(filter);
      ob = observe(m, pb); ov = observe(m, pv);
    } catch (e) {
      out.push({ filter, baseN: 0, variantN: 0, baseMean: null, variantMean: null, delta: null, z: null, shifted: false, note: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (!ob || !ov) {
      out.push({ filter, baseN: 0, variantN: 0, baseMean: null, variantMean: null, delta: null, z: null, shifted: false, note: 'not measurable from the contract yet' });
      continue;
    }
    const mb = mean(ob), mv = mean(ov);
    const sb = sampleSd(ob), sv = sampleSd(ov);
    const delta = mb !== null && mv !== null ? mv - mb : null;
    let z: number | null = null;
    if (delta !== null && sb !== null && sv !== null) {
      const se = Math.sqrt((sb * sb) / ob.length + (sv * sv) / ov.length);
      z = se > 0 ? delta / se : delta === 0 ? 0 : null;
    }
    // A difference with zero spread on both sides is a certain shift (deterministic counts differ).
    const shifted = z !== null ? Math.abs(z) > shiftZ : delta !== null && delta !== 0;
    out.push({ filter, baseN: ob.length, variantN: ov.length, baseMean: mb, variantMean: mv, delta, z, shifted, note: null });
  }
  return out;
}
