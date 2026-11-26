// Install sequence across the week (H1.2.2): which day each part of the plan is taught, and the
// readiness gain each new item can reach from its exposures. D9 reads the result.
import { P } from './params.ts';

export interface InstallItem {
  readonly id: string;
  /** Carry-over items are already known above the D9 threshold; only new items need exposures. */
  readonly carryOver: boolean;
  /** Days before the game it is taught (G-n). */
  readonly installGMinus: number;
  readonly meeting: boolean | 'mentioned';
  readonly walkthrough: boolean;
  readonly practiceReps: number;
}

export interface InstallMap {
  /** Gain multiplier per item, 1 = full weekly readiness gain. */
  readonly gain: Readonly<Record<string, number>>;
  readonly newItems: number;
  readonly availableReps: number;
  readonly ratio: number;
  readonly warning: boolean;
}

/** Exposure factor for one item (H1.2.2 rule 2; a "mentioned" meeting gives half the meeting factor, H4.1.2 rule 6). */
export function exposureFactor(it: InstallItem): number {
  const noMeeting = P('install_no_meeting');
  let f = 1;
  if (it.meeting === false) f *= noMeeting;
  else if (it.meeting === 'mentioned') f *= 1 - (1 - noMeeting) * P('meeting_mentioned_factor');
  if (!it.walkthrough) f *= P('install_no_walkthrough');
  if (it.practiceReps <= 0) f *= P('install_no_practice');
  return f;
}

/** The install map (H1.2.2 outputs): exposures, plan-size dilution (rule 3) and late-install retention (rule 4). */
export function installMap(items: readonly InstallItem[], availableReps: number): InstallMap {
  const fresh = items.filter((i) => !i.carryOver);
  const ratio = availableReps > 0 ? fresh.length / availableReps : fresh.length > 0 ? Number.POSITIVE_INFINITY : 0;
  const limit = P('install_ratio_warning');
  const dilution = ratio > limit ? limit / ratio : 1;
  const gain: Record<string, number> = {};
  for (const it of items) {
    if (it.carryOver) { gain[it.id] = 1; continue; }
    let g = exposureFactor(it) * dilution;
    if (it.installGMinus <= P('install_late_from_days_before')) g *= P('install_late_retention');
    gain[it.id] = g;
  }
  return { gain, newItems: fresh.length, availableReps, ratio, warning: ratio > limit };
}

/** A play added on G-1 with no exposure is callable at long-term knowledge only (H1.2.2 edge case). */
export function longTermOnly(it: InstallItem): boolean {
  return !it.carryOver && it.meeting === false && !it.walkthrough && it.practiceReps <= 0;
}
