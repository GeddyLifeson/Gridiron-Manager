// D13.1.2 plausibility checks: hard record limits, single-value z limit, and joint pair probability under
// the profile's correlation matrix. The generator redraws on any warning (D13.2.1 step 9); the player
// designer (G-92) shows the same warnings.
import type { DeterministicMath } from '@gm/schema';
import { param } from './params.ts';
import type { Profile, ProfileVar } from './profiles.ts';
import type { BodyVector } from './body.ts';

/**
 * Hard limits from combine records (D2.1.1, D13.1.2): 40 4.21 s (Verified), vertical 46 in (Verified),
 * broad 147 in (Verified), 3-cone 6.28 s (2 of 3), bench 51 reps (Conflict 49 or 51: the larger, per
 * D2.1.1's recommendation), shuttle 3.73 s (Conflict 3.75 or 3.73: the faster, same recommendation).
 */
export const RECORD_LIMITS: Readonly<Partial<Record<ProfileVar, { best: number; lowerIsBetter: boolean; status: string }>>> = {
  fortyS: { best: 4.21, lowerIsBetter: true, status: 'Verified' },
  verticalIn: { best: 46, lowerIsBetter: false, status: 'Verified' },
  broadIn: { best: 147, lowerIsBetter: false, status: 'Verified' },
  threeConeS: { best: 6.28, lowerIsBetter: true, status: '2 of 3' },
  benchReps: { best: 51, lowerIsBetter: false, status: 'Conflict' },
  shuttleS: { best: 3.73, lowerIsBetter: true, status: 'Conflict' },
};

export interface PlausibilityWarning { field: string; value: number; kind: 'record' | 'z' | 'joint'; detail: string }

/** Warnings for an adult body vector against its profile. Empty when plausible. */
export function plausibilityWarnings(prof: Profile, body: BodyVector, math: DeterministicMath): PlausibilityWarning[] {
  const out: PlausibilityWarning[] = [];
  const zs: number[] = [];
  for (const v of prof.vars) {
    const x = body[v];
    if (x === undefined) { zs.push(0); continue; }
    const lim = RECORD_LIMITS[v];
    if (lim && (lim.lowerIsBetter ? x < lim.best : x > lim.best)) out.push({ field: v, value: x, kind: 'record', detail: `beyond the combine record ${lim.best}` });
    const z = (x - prof.mean(v)) / prof.sd(v);
    zs.push(z);
    if (Math.abs(z) > param('plausibleAbsZ')) out.push({ field: v, value: x, kind: 'z', detail: `|z| ${Math.abs(z).toFixed(2)} above ${param('plausibleAbsZ')}` });
  }
  // Joint pair check: bivariate normal, P(Mahalanobis distance beyond d) = exp(-d^2 / 2).
  const d2Limit = -2 * math.log(param('plausibleJointP'));
  for (let i = 0; i < prof.vars.length; i++) {
    for (let j = i + 1; j < prof.vars.length; j++) {
      const r = prof.corr[i]![j]!;
      const zi = zs[i]!, zj = zs[j]!;
      const d2 = (zi * zi - 2 * r * zi * zj + zj * zj) / (1 - r * r);
      if (d2 > d2Limit) out.push({ field: `${prof.vars[i]}+${prof.vars[j]}`, value: d2, kind: 'joint', detail: `joint probability below ${param('plausibleJointP')}` });
    }
  }
  return out;
}
