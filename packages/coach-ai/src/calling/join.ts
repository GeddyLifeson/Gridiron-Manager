// K5 to K4 (K4.1.1 rule 5, K5.2.1 outputs, K5.4.1): what game management hands the play caller for one
// snap. The fourth-down unit itself is decided before the caller is asked (staff decider, J11.6.1), so
// here only the offense's short-yardage hint and the clock plan become a `ManagementConstraint`.
import type { ClockConstraint, ClockPlan } from '../management/index.ts';
import type { ManagementConstraint, SheetCall } from './types.ts';

/**
 * Which sheet calls fit a K5 order. These are content facts (G-68 tags a call as a kneel, a spike, a
 * sideline route, ...), so they come in from the content side. A missing test applies no filter.
 */
export interface CallFits {
  readonly kneel?: (call: SheetCall) => boolean;
  readonly spike?: (call: SheetCall) => boolean;
  readonly constraint?: Partial<Record<ClockConstraint, (call: SheetCall) => boolean>>;
}

export interface JoinInput {
  /** K5.4 clock plan for this snap, or null when none applies (defense, or no clock situation). */
  readonly clock: Pick<ClockPlan, 'mode' | 'kneel' | 'spike' | 'constraints'> | null;
  /** K5.2.1: the offense goes on fourth down and the short-yardage box should be read. */
  readonly shortYardage?: boolean;
  readonly fits?: CallFits;
}

/** Box rule id the short-yardage hint selects (G7 box rules name it, K4.1.1 rule 5). */
export const SHORT_YARDAGE_BOX = 'go.short';

/**
 * The constraint for `CallRequest.constraint`. Kneel and spike are orders: only those calls pass.
 * Clock constraints narrow further. `burn` keeps the clock running and `save` forces hurry (K4.5.2).
 * Returns undefined when K5 asks nothing of this snap.
 */
export function joinK5(i: JoinInput): ManagementConstraint | undefined {
  const tests: ((c: SheetCall) => boolean)[] = [];
  const f = i.fits ?? {};
  const c = i.clock;
  if (c?.kneel && f.kneel) tests.push(f.kneel);
  else if (c?.spike && f.spike) tests.push(f.spike);
  else for (const k of c?.constraints ?? []) { const t = f.constraint?.[k]; if (t) tests.push(t); }
  const out: { -readonly [K in keyof ManagementConstraint]: ManagementConstraint[K] } = {};
  if (i.shortYardage) out.id = SHORT_YARDAGE_BOX;
  if (c?.mode === 'burn' || c?.kneel) out.keepClockRunning = true;
  if (c?.mode === 'save' || c?.spike) out.saveClock = true;
  if (tests.length > 0) out.allows = (call) => tests.every((t) => t(call));
  return Object.keys(out).length > 0 ? out : undefined;
}
